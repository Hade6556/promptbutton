import Anthropic from '@anthropic-ai/sdk';
import type { Result } from '../messaging';
import { apiKeyItem } from '../settings';
import { PromptButtonError } from './config';

export async function getClient(): Promise<Anthropic> {
  const apiKey = await apiKeyItem.getValue();
  if (!apiKey) {
    throw new PromptButtonError('no_api_key', 'Add your Anthropic API key in the PromptButton popup.');
  }
  // The key never leaves the service worker; the browser flag is required because
  // the SDK runs outside Node here.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 60_000 });
}

export function toResult<T>(error: unknown): Result<T> {
  if (error instanceof PromptButtonError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return { ok: false, error: 'The API key was rejected. Check it in the popup.', code: 'auth' };
  }
  if (error instanceof Anthropic.RateLimitError) {
    const retryAfter = error.headers?.get('retry-after');
    const hint = retryAfter ? ` Retry in ${retryAfter}s.` : '';
    return { ok: false, error: `Rate limited by the API.${hint}`, code: 'rate_limit' };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { ok: false, error: 'Could not reach the Anthropic API. Check your connection.', code: 'network' };
  }
  if (error instanceof Anthropic.APIError) {
    return { ok: false, error: `API error ${error.status ?? ''}: ${error.message}`.trim(), code: 'unknown' };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message, code: 'unknown' };
}
