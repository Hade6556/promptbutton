import type { SiteAdapter } from './types';
import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
import { genericAdapter } from './generic';

const ADAPTERS: SiteAdapter[] = [chatgptAdapter, claudeAdapter, genericAdapter];

export function pickAdapter(hostname: string = location.hostname): SiteAdapter {
  return ADAPTERS.find((a) => a.matches(hostname)) ?? genericAdapter;
}

export type { SiteAdapter } from './types';
