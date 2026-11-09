import type { HistoryMessage, ImproveInput, UserAnswer } from '../messaging';
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

/** Builds the user turn shared by the gap-analysis and rewrite calls. */
export function serializeInput(input: ImproveInput, answers: UserAnswer[] = []): string {
  const history = truncateHistory(input.history);
  const parts: string[] = [];

  parts.push(`<site>${escapeXml(input.site)}</site>`);

  if (history.length === 0) {
    parts.push('<conversation>(empty — this is the first message)</conversation>');
  } else {
    const omitted = input.history.length - history.length;
    const header = omitted > 0 ? ` earlier_messages_omitted="${omitted}"` : '';
    const body = history
      .map((m) => `<message role="${m.role}">\n${escapeXml(m.text)}\n</message>`)
      .join('\n');
    parts.push(`<conversation${header}>\n${body}\n</conversation>`);
  }

  parts.push(`<draft>\n${escapeXml(clampText(input.draft, MAX_DRAFT_CHARS))}\n</draft>`);

  if (answers.length > 0) {
    const body = answers
      .map((a) => `<answer question="${escapeXml(a.question)}">${escapeXml(a.answer)}</answer>`)
      .join('\n');
    parts.push(`<user_answers>\n${body}\n</user_answers>`);
  }

  return parts.join('\n\n');
}
