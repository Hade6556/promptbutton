import type { HistoryMessage } from '../messaging';

export interface SiteAdapter {
  /** Short id used in logs and prompts, e.g. "chatgpt". */
  id: string;
  /** Whether this adapter handles the given hostname. */
  matches(hostname: string): boolean;
  /** The element the user types into, or null if not on screen. */
  composerEl(): HTMLElement | null;
  /** Current draft text in the composer. */
  readDraft(): string;
  /** Visible conversation so far, oldest first. */
  readHistory(): HistoryMessage[];
  /** Replace the composer contents. Must update the host app's editor state. */
  writeDraft(text: string): boolean;
}
