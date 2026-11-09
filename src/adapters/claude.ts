import type { HistoryMessage } from '../messaging';
import type { SiteAdapter } from './types';
import { readEditable, writeEditable } from './editable';

// Composer verified 2026-11-09: <div class="tiptap ProseMirror" contenteditable data-testid="chat-input" role="textbox">.
const COMPOSER_CANDIDATES = [
  '[data-testid="chat-input"][contenteditable="true"]',
  'div.ProseMirror[contenteditable="true"]',
  'fieldset div[contenteditable="true"]',
  'div[role="textbox"][contenteditable="true"]',
];

// Message markup changes often. Strategy: known selectors first, then a row-based
// heuristic (each turn is wrapped in a [data-test-render-count] row; a row holding a
// user-message node is the user's, anything else is the assistant's).
const USER_MESSAGE = '[data-testid="user-message"]';
const ASSISTANT_MESSAGE = '.font-claude-response, .font-claude-message, [data-is-streaming]';
const ROW = '[data-test-render-count]';
const CHROME_TEXT = /^(Copy|Retry|Edit|Share|Good response|Bad response|Thumbs up|Thumbs down|Claude can make mistakes.*)$/i;

function composer(): HTMLElement | null {
  for (const selector of COMPOSER_CANDIDATES) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  return null;
}

function cleanText(el: HTMLElement): string {
  return el.innerText
    .split('\n')
    .filter((line) => !CHROME_TEXT.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fromKnownSelectors(): HistoryMessage[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(`${USER_MESSAGE}, ${ASSISTANT_MESSAGE}`));
  const kept: HTMLElement[] = [];
  for (const el of nodes) {
    if (kept.some((k) => k.contains(el))) continue; // outermost match only
    kept.push(el);
  }
  const composerEl = composer();
  return kept
    .filter((el) => !composerEl || !el.contains(composerEl))
    .map((el) => ({ role: el.matches(USER_MESSAGE) ? ('user' as const) : ('assistant' as const), text: cleanText(el) }))
    .filter((m) => m.text.length > 0);
}

function fromRows(): HistoryMessage[] {
  const composerEl = composer();
  return Array.from(document.querySelectorAll<HTMLElement>(ROW))
    .filter((row) => !composerEl || !row.contains(composerEl))
    .map((row) => {
      const user = row.querySelector<HTMLElement>(USER_MESSAGE);
      return user
        ? { role: 'user' as const, text: cleanText(user) }
        : { role: 'assistant' as const, text: cleanText(row) };
    })
    .filter((m) => m.text.length > 0);
}

export const claudeAdapter: SiteAdapter = {
  id: 'claude',
  matches: (host) => /(^|\.)claude\.ai$/.test(host),
  composerEl: composer,
  readDraft: () => readEditable(composer()),
  readHistory: (): HistoryMessage[] => {
    const known = fromKnownSelectors();
    // If only one role matched, the assistant selector is stale; fall back to rows.
    const roles = new Set(known.map((m) => m.role));
    if (known.length > 0 && roles.size === 2) return known;
    const rows = fromRows();
    return rows.length >= known.length ? rows : known;
  },
  writeDraft: (text) => writeEditable(composer(), text),
};
