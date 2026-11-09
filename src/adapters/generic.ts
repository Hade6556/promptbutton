import type { SiteAdapter } from './types';
import { readEditable, writeEditable } from './editable';

// Fallback for unknown sites: whatever editable element has focus. No history.
function focusedEditable(): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return null;
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement && el.type === 'text') return el;
  if (el.isContentEditable) return el;
  return null;
}

export const genericAdapter: SiteAdapter = {
  id: 'generic',
  matches: () => true,
  composerEl: focusedEditable,
  readDraft: () => readEditable(focusedEditable()),
  readHistory: () => [],
  writeDraft: (text) => writeEditable(focusedEditable(), text),
};
