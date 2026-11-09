import { storage } from 'wxt/utils/storage';
import type { AskMode } from './llm/config';

export { ASK_THRESHOLD, type AskMode } from './llm/config';

/** Only in `local:` — never `sync:` — so the key stays on this machine. */
export const apiKeyItem = storage.defineItem<string | null>('local:apiKey', { fallback: null });
export const askModeItem = storage.defineItem<AskMode>('local:askMode', { fallback: 'auto' });
