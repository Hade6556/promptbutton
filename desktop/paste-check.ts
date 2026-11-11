// The parts of inserting that need no app or system access: comparing text and naming failures.
// Kept apart from insert.ts so they can be unit-tested without Electron.

export type InsertOutcome = 'replaced' | 'pasted' | 'unverified' | 'copied';
/** Why the prompt ended up on the clipboard instead of in the app. */
export type InsertReason = 'no_target' | 'app_gone' | 'not_frontmost' | 'secure_input' | 'field_changed' | 'not_changed' | 'no_field' | 'no_permission' | 'failed';
export interface InsertResult {
  outcome: InsertOutcome;
  reason?: InsertReason;
  detail?: string;
}

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Whitespace differs between what we send and what a chat box stores (line breaks, nbsp, trailing newline). */
export const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The field now shows the prompt: its text contains the prompt's opening (apps may re-wrap the rest). */
export function landed(fieldNow: string, text: string): boolean {
  const want = squash(text);
  const have = squash(fieldNow);
  if (!want) return have === '';
  return have.includes(want.slice(0, Math.min(60, want.length)));
}

/** Maps a helper error to the reason shown to the user. */
export function reasonFor(error: unknown): InsertReason {
  const text = errorText(error);
  if (/app_not_running/.test(text)) return 'app_gone';
  if (/target_not_frontmost/.test(text)) return 'not_frontmost';
  if (/secure_input/.test(text)) return 'secure_input';
  if (/accessibility_not_trusted|not allowed assistive access|\(-25211\)/.test(text)) return 'no_permission';
  return 'failed';
}
