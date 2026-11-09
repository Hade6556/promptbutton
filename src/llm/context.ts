import type { DraftMode, HistoryMessage, ImproveInput, RewriteOptions, UserAnswer } from '../messaging';
import { clampText } from '../adapters/editable';

export const MAX_HISTORY_MESSAGES = 12;
export const MAX_CHARS_PER_MESSAGE = 2500;
export const MAX_DRAFT_CHARS = 6000;

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function truncateHistory(history: HistoryMessage[]): HistoryMessage[] {
  const recent = history.slice(-MAX_HISTORY_MESSAGES);
  return recent.map((m) => ({ role: m.role, text: clampText(m.text, MAX_CHARS_PER_MESSAGE) }));
}

/**
 * Character budget for the rewrite. Structure helps, bulk does not (checklist prompts in the
 * 2026 comparison were the shortest and scored best), so the budget scales with the draft.
 */
export function lengthBudget(draftChars: number, mode: DraftMode | undefined): number {
  switch (mode) {
    case 'brain_dump':
      return Math.max(700, Math.round(draftChars * 2) + 200);
    case 'follow_up':
      return Math.max(160, Math.round(draftChars * 1.5) + 60);
    default:
      return Math.max(300, Math.round(draftChars * 2));
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
    parts.push(`<mode>${options.mode}</mode>`);
    // Answers are user-supplied content the rewrite must carry, so they count toward the budget's base.
    const answerChars = answers.reduce((n, a) => n + a.answer.length, 0);
    parts.push(
      `<length_budget max_chars="${lengthBudget(draft.length + answerChars, options.mode)}">Stay under this unless the user explicitly asked for copy, examples or code. Every line must change the answer.</length_budget>`,
    );
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
