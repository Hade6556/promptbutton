import type { Depth, DraftMode, HistoryMessage, ImproveInput, RewriteOptions, Scale, UserAnswer } from '../messaging';
import { clampText } from '../adapters/editable';
import { playbookBlock } from './domains';
import { selectTechniques } from './kb';

export const MAX_HISTORY_MESSAGES = 12;
export const MAX_CHARS_PER_MESSAGE = 2500;
export const MAX_DRAFT_CHARS = 6000;

/** A full master prompt lands in this range; the ceiling grows with long drafts (brain dumps). */
export const MASTER_MIN_CHARS = 1200;
export const MASTER_MAX_CHARS = 2500;
export const MASTER_CEILING_CHARS = 3500;

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function truncateHistory(history: HistoryMessage[]): HistoryMessage[] {
  const recent = history.slice(-MAX_HISTORY_MESSAGES);
  return recent.map((m) => ({ role: m.role, text: clampText(m.text, MAX_CHARS_PER_MESSAGE) }));
}

export interface LengthGuide {
  /** master: a full master prompt (role, goal, …, assumptions). concise: tightened, no structure. */
  kind: 'master' | 'concise';
  min: number;
  max: number;
}

/** Whether this draft gets the full master-prompt treatment. Follow-ups and quick asks never do. */
export function isMaster(options: { mode?: DraftMode; scale?: Scale; depth?: Depth }): boolean {
  return options.mode !== 'follow_up' && options.scale !== 'quick' && (options.depth ?? 'full') === 'full';
}

/**
 * Target length for the rewrite. A master prompt is a target range, not a cap: quality comes from
 * covering the domain checklist with concrete lines, and a one-line draft needs the most expansion.
 * Concise rewrites keep the v4 caps (structure helps, bulk does not).
 */
export function lengthGuide(sourceChars: number, options: { mode?: DraftMode; scale?: Scale; depth?: Depth }): LengthGuide {
  if (isMaster(options)) {
    return { kind: 'master', min: MASTER_MIN_CHARS, max: Math.min(MASTER_CEILING_CHARS, Math.max(MASTER_MAX_CHARS, sourceChars + 1200)) };
  }
  switch (options.mode) {
    case 'brain_dump':
      return { kind: 'concise', min: 0, max: Math.max(700, Math.round(sourceChars * 2) + 200) };
    case 'follow_up':
      return { kind: 'concise', min: 0, max: Math.max(160, Math.round(sourceChars * 1.5) + 60) };
    default:
      return { kind: 'concise', min: 0, max: Math.max(300, Math.round(sourceChars * 2)) };
  }
}

/** Builds the text of the user turn shared by the gap-analysis and rewrite calls. */
export function serializeInput(input: ImproveInput, answers: UserAnswer[] = [], options: RewriteOptions = {}): string {
  const history = truncateHistory(input.history);
  const parts: string[] = [];

  parts.push(`<site>${escapeXml(input.site)}</site>`);

  if (input.screenshot) {
    parts.push(
      `<screen>A screenshot of the ${escapeXml(input.site)} window is attached. It shows the conversation or document the draft belongs to; treat it as the conversation history. Ignore window chrome, and ignore the draft itself where it appears in the image.</screen>`,
    );
  }

  if (history.length === 0) {
    parts.push(
      input.screenshot
        ? '<conversation>(see the attached screenshot)</conversation>'
        : '<conversation>(empty — this is the first message)</conversation>',
    );
  } else {
    const omitted = input.history.length - history.length;
    const header = omitted > 0 ? ` earlier_messages_omitted="${omitted}"` : '';
    const body = history
      .map((m) => `<message role="${m.role}">\n${escapeXml(m.text)}\n</message>`)
      .join('\n');
    parts.push(`<conversation${header}>\n${body}\n</conversation>`);
  }

  const draft = clampText(input.draft, MAX_DRAFT_CHARS);
  parts.push(`<draft chars="${draft.length}">\n${escapeXml(draft)}\n</draft>`);

  if (options.mode) {
    // The first pass's classification. Answers are user content the rewrite must carry, so they count toward the base.
    const answerChars = answers.reduce((n, a) => n + a.answer.length, 0);
    const guide = lengthGuide(draft.length + answerChars, options);
    parts.push(`<mode>${options.mode}</mode>`);
    if (options.scale) parts.push(`<scale>${options.scale}</scale>`);
    if (options.domain) parts.push(`<domain>${options.domain}</domain>`);
    if (options.expert) parts.push(`<expert>${escapeXml(options.expert)}</expert>`);
    parts.push(`<depth>${options.depth ?? 'full'}</depth>`);
    if (guide.kind === 'master') {
      parts.push(
        `<length_guide kind="master" min_chars="${guide.min}" max_chars="${guide.max}">Write the full master prompt: aim for ${guide.min}–${guide.max} characters. Cover every item of the playbook; every line concrete. Go above the maximum only when the user asked for copy, examples or code to be included.</length_guide>`,
      );
      const domain = options.domain ?? 'other';
      const query = { mode: options.mode, scale: options.scale, site: input.site, draft: input.draft };
      const techniques = options.kb === false ? [] : selectTechniques({ domain, ...query }).filter((t) => t.id !== options.kbHoldout);
      parts.push(playbookBlock(domain, query, techniques));
    } else {
      parts.push(
        `<length_guide kind="concise" max_chars="${guide.max}">Stay under this unless the user explicitly asked for copy, examples or code. Every line must change the answer.</length_guide>`,
      );
    }
  }

  if (answers.length > 0) {
    const body = answers
      .map((a) => `<answer question="${escapeXml(a.question)}">${escapeXml(a.answer)}</answer>`)
      .join('\n');
    parts.push(`<user_answers>\n${body}\n</user_answers>`);
  }

  if (options.previous) {
    parts.push(`<previous_rewrite>\n${escapeXml(options.previous)}\n</previous_rewrite>`);
    parts.push(`<revision_request>\n${escapeXml(options.revision ?? 'Improve it.')}\n</revision_request>`);
  }

  return parts.join('\n\n');
}

export type UserContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png'; data: string } };

/** The user turn as content blocks: the screenshot first (when present), then the serialized text. */
export function buildUserContent(input: ImproveInput, answers: UserAnswer[] = [], options: RewriteOptions = {}): UserContentBlock[] {
  const blocks: UserContentBlock[] = [];
  if (input.screenshot) {
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: input.screenshot.mediaType, data: input.screenshot.data },
    });
  }
  blocks.push({ type: 'text', text: serializeInput(input, answers, options) });
  return blocks;
}
