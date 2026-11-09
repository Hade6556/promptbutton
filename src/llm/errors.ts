import Anthropic from '@anthropic-ai/sdk';
import type { Result } from '../messaging';
import { PromptButtonError } from './config';

/** Maps SDK and app errors to a user-facing Result. No browser/wxt imports. */
export function toResult<T>(error: unknown): Result<T> {
  if (error instanceof PromptButtonError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return { ok: false, error: 'The API key was rejected. Check it and try again.', code: 'auth' };
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
