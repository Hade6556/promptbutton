import type { HistoryMessage } from '../messaging';
import type { SiteAdapter } from './types';
import { readEditable, writeEditable } from './editable';

// Selectors to verify in devtools — claude.ai ships UI changes often.
const COMPOSER_CANDIDATES = [
  'div.ProseMirror[contenteditable="true"]',
  'fieldset div[contenteditable="true"]',
  'div[contenteditable="true"][data-placeholder]',
];
const USER_MESSAGE = '[data-testid="user-message"]';
const ASSISTANT_MESSAGE = '[data-is-streaming], .font-claude-message, .font-claude-response';

function composer(): HTMLElement | null {
  for (const selector of COMPOSER_CANDIDATES) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  return null;
}

export const claudeAdapter: SiteAdapter = {
  id: 'claude',
  matches: (host) => /(^|\.)claude\.ai$/.test(host),
  composerEl: composer,
  readDraft: () => readEditable(composer()),
  readHistory: (): HistoryMessage[] => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(`${USER_MESSAGE}, ${ASSISTANT_MESSAGE}`));
    const seen = new Set<HTMLElement>();
    const messages: HistoryMessage[] = [];
    for (const el of nodes) {
      // Assistant selectors can match nested wrappers; keep the outermost only.
      if (Array.from(seen).some((s) => s.contains(el))) continue;
      seen.add(el);
      const text = el.innerText.trim();
      if (!text) continue;
      messages.push({ role: el.matches(USER_MESSAGE) ? 'user' : 'assistant', text });
    }
    return messages;
  },
  writeDraft: (text) => writeEditable(composer(), text),
};
