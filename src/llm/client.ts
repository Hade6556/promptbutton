import Anthropic from '@anthropic-ai/sdk';
import { apiBaseUrlItem, apiKeyItem } from '../settings';
import { PromptButtonError } from './config';

export { toResult } from './errors';

export async function getClient(): Promise<Anthropic> {
  const [apiKey, baseURL] = await Promise.all([apiKeyItem.getValue(), apiBaseUrlItem.getValue()]);
  const viaProxy = baseURL.trim().length > 0;
  if (!apiKey && !viaProxy) {
    throw new PromptButtonError('no_api_key', 'Add your Anthropic API key in the PromptButton popup.');
  }
  // The key never leaves the service worker; the browser flag is required because the SDK runs
  // outside Node here. With a proxy that holds the key, any placeholder satisfies the SDK.
  return new Anthropic({
    apiKey: apiKey ?? 'proxy',
    baseURL: viaProxy ? baseURL.trim().replace(/\/+$/, '') : undefined,
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    timeout: 60_000,
  });
}
