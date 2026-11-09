import type { HistoryMessage } from '../messaging';
import type { SiteAdapter } from './types';
import { readEditable, writeEditable } from './editable';

const COMPOSER = '#prompt-textarea';
const MESSAGE = '[data-message-author-role]';

export const chatgptAdapter: SiteAdapter = {
  id: 'chatgpt',
  matches: (host) => /(^|\.)chatgpt\.com$/.test(host) || /(^|\.)chat\.openai\.com$/.test(host),
  composerEl: () => document.querySelector<HTMLElement>(COMPOSER),
  readDraft: () => readEditable(document.querySelector<HTMLElement>(COMPOSER)),
  readHistory: (): HistoryMessage[] =>
    Array.from(document.querySelectorAll<HTMLElement>(MESSAGE))
      .map((el) => ({
        role: el.getAttribute('data-message-author-role') === 'user' ? ('user' as const) : ('assistant' as const),
        text: el.innerText.trim(),
      }))
      .filter((m) => m.text.length > 0),
  writeDraft: (text) => writeEditable(document.querySelector<HTMLElement>(COMPOSER), text),
};
