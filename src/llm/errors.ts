import Anthropic from '@anthropic-ai/sdk';
import type { Result } from '../messaging';
import { PromptButtonError } from './config';

/** The API's own message from an error body, if present. */
function apiMessage(error: InstanceType<typeof Anthropic.APIError>): string | null {
  const body = error.error as { error?: { message?: string } } | undefined;
  const message = body?.error?.message;
  return typeof message === 'string' && message.length > 0 ? message : null;
}

/** Maps SDK and app errors to a user-facing Result. No browser/wxt imports. */
export function toResult<T>(error: unknown): Result<T> {
  if (error instanceof PromptButtonError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof Anthropic.AuthenticationError) {
    const detail = apiMessage(error);
    const hint = detail?.includes('CORS')
      ? ' Your organisation blocks browser calls: run `npm run proxy` and set the API base URL to http://127.0.0.1:8787.'
      : ' Check the key and try again.';
    return { ok: false, error: `The API rejected the request: ${detail ?? 'invalid API key'}.${hint}`, code: 'auth' };
  }
  if (error instanceof Anthropic.RateLimitError) {
    const retryAfter = error.headers?.get('retry-after');
    const hint = retryAfter ? ` Retry in ${retryAfter}s.` : '';
    return { ok: false, error: `Rate limited by the API.${hint}`, code: 'rate_limit' };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { ok: false, error: 'Could not reach the API. Check your connection (and that the proxy is running, if you use one).', code: 'network' };
  }
  if (error instanceof Anthropic.APIError) {
    return { ok: false, error: `API error ${error.status ?? ''}: ${apiMessage(error) ?? error.message}`.trim(), code: 'unknown' };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message, code: 'unknown' };
}
