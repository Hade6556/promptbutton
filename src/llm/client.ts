import Anthropic from '@anthropic-ai/sdk';
import { apiKeyItem } from '../settings';
import { PromptButtonError } from './config';

export { toResult } from './errors';

export async function getClient(): Promise<Anthropic> {
  const apiKey = await apiKeyItem.getValue();
  if (!apiKey) {
    throw new PromptButtonError('no_api_key', 'Add your Anthropic API key in the PromptButton popup.');
  }
  // The key never leaves the service worker; the browser flag is required because
  // the SDK runs outside Node here.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 60_000 });
}
