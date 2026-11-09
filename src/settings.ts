import { storage } from 'wxt/utils/storage';
import type { AskMode } from './llm/config';
import type { Depth } from './messaging';

export { ASK_THRESHOLD, type AskMode } from './llm/config';
export type { Depth } from './messaging';

/** Only in `local:` — never `sync:` — so the key stays on this machine. */
export const apiKeyItem = storage.defineItem<string | null>('local:apiKey', { fallback: null });
export const askModeItem = storage.defineItem<AskMode>('local:askMode', { fallback: 'auto' });
/** full: task-like drafts become a full master prompt; concise: tighten only. */
export const depthItem = storage.defineItem<Depth>('local:depth', { fallback: 'full' });
/** Empty = https://api.anthropic.com. Set to http://127.0.0.1:8787 to go through `npm run proxy`. */
export const apiBaseUrlItem = storage.defineItem<string>('local:apiBaseUrl', { fallback: '' });

export const PROXY_URL = 'http://127.0.0.1:8787';
