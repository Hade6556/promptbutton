import { storage } from 'wxt/utils/storage';

export type AskMode = 'auto' | 'always' | 'never';

/** Only in `local:` — never `sync:` — so the key stays on this machine. */
export const apiKeyItem = storage.defineItem<string | null>('local:apiKey', { fallback: null });
export const askModeItem = storage.defineItem<AskMode>('local:askMode', { fallback: 'auto' });

/** Gap-analysis ambiguity at or above this asks questions in 'auto' mode. Tuned by eval. */
export const ASK_THRESHOLD = 0.6;
