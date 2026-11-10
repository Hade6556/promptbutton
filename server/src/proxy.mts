// POST /api/v1/messages: the app's Claude calls, forwarded with the server's key.
// Requests are checked against what the app actually sends, so a token cannot be used as a general
// Claude key, and each response's token usage is charged to the user's allowance.
import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import { config } from './config.mts';
import { usage, type User } from './db.mts';
import { apiError } from './http.mts';
import { acquire, hit, release } from './limits.mts';
import { costMicros, entitlement } from './plans.mts';

type Usage = { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
const FIELDS = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'] as const;

/** Streaming events repeat cumulative counts; keep the largest seen for each field. */
function mergeUsage(into: Usage, from: unknown): void {
  if (!from || typeof from !== 'object') return;
  for (const f of FIELDS) {
    const v = (from as Record<string, unknown>)[f];
    if (typeof v === 'number') into[f] = Math.max(into[f] ?? 0, v);
  }
}

/** Returns an error message when the request is outside what the app sends. */
function validate(body: Record<string, unknown>, query: string, betas: string[]): string | null {
  if (query && query !== 'beta=true') return 'Unsupported query.';
  if (!config.allowedModels.includes(String(body.model))) return `Model ${String(body.model)} is not available.`;
  const maxTokens = Number(body.max_tokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > config.maxTokensCap) return `max_tokens must be between 1 and ${config.maxTokensCap}.`;
  for (const field of ['tools', 'tool_choice', 'mcp_servers', 'container']) if (field in body) return `${field} is not available.`;
  const bad = betas.find((b) => !config.allowedBetas.includes(b));
  if (bad) return `Beta ${bad} is not available.`;
  return null;
}

export async function proxyMessages(req: IncomingMessage, res: ServerResponse, user: User, raw: Buffer, query: string): Promise<void> {
  const e = entitlement(user);
  if (e.usedMicros >= e.allowanceMicros) {
    const message = e.held
      ? 'Your subscription is paused while a payment question is open. Contact support to sort it out.'
      : e.plan === 'trial'
        ? 'You have used your free trial. Upgrade to Pro to keep going.'
        : `You have used this month's allowance. It resets on ${new Date((e.resetsAt ?? 0) * 1000).toDateString()}.`;
    return apiError(res, 402, 'billing_error', message);
  }
  const rate = hit(`user:${user.id}`, config.userPerMinute, 60_000);
  if (!rate.ok) return apiError(res, 429, 'rate_limit_error', 'Too many requests. Wait a moment and try again.', { 'retry-after': String(rate.retryAfter) });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    return apiError(res, 400, 'invalid_request_error', 'The request body is not valid JSON.');
  }
  const betas = String(req.headers['anthropic-beta'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const problem = validate(body, query, betas);
  if (problem) return apiError(res, 400, 'invalid_request_error', problem);
  // Lets Anthropic tell users apart for abuse handling without learning who they are.
  body.metadata = { user_id: crypto.createHash('sha256').update(`pmp:${user.id}`).digest('hex').slice(0, 32) };

  if (!acquire(user.id, config.userConcurrent)) return apiError(res, 429, 'rate_limit_error', 'Too many requests at once.', { 'retry-after': '2' });
  const upstreamAbort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) upstreamAbort.abort(); });
  const used: Usage = {};
  let charged = false;
  const charge = () => {
    if (charged) return;
    charged = true;
    const micros = costMicros(used);
    if (micros > 0) usage.add(user.id, e.period, micros);
  };
  try {
    const upstream = await fetch(`${config.anthropicBase}/v1/messages${query ? `?${query}` : ''}`, {
      method: 'POST',
      headers: {
        'x-api-key': config.anthropicKey,
        'anthropic-version': String(req.headers['anthropic-version'] ?? '2023-06-01'),
        ...(betas.length ? { 'anthropic-beta': betas.join(',') } : {}),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: upstreamAbort.signal,
    });
    if (upstream.status === 401 || upstream.status === 403) {
      console.error(`[proxy] Anthropic refused the server key: ${upstream.status}`);
      return apiError(res, 502, 'api_error', 'The service is temporarily unavailable.');
    }
    const headers: Record<string, string> = { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' };
    for (const h of ['request-id', 'retry-after']) {
      const v = upstream.headers.get(h);
      if (v) headers[h] = v;
    }
    res.writeHead(upstream.status, headers);
    if (!upstream.body) return void res.end();

    const sse = headers['content-type'].includes('text/event-stream');
    const decoder = new TextDecoder();
    let pending = '';
    const whole: string[] = [];
    for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
      res.write(chunk);
      const text = decoder.decode(chunk, { stream: true });
      if (!sse) { whole.push(text); continue; }
      pending += text;
      let cut: number;
      while ((cut = pending.indexOf('\n\n')) !== -1) {
        const event = pending.slice(0, cut);
        pending = pending.slice(cut + 2);
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (data.type === 'message_start') mergeUsage(used, data.message?.usage);
            else if (data.type === 'message_delta') mergeUsage(used, data.usage);
          } catch { /* keep-alive or partial line */ }
        }
      }
    }
    if (!sse) {
      try { mergeUsage(used, JSON.parse(whole.join('')).usage); } catch { /* error body */ }
    }
    res.end();
  } catch (error) {
    if (upstreamAbort.signal.aborted) return; // the app went away; what was produced is still charged below
    console.error('[proxy] upstream failed:', error instanceof Error ? error.message : error);
    if (!res.headersSent) apiError(res, 502, 'api_error', 'Could not reach the model. Try again.');
    else res.end();
  } finally {
    charge();
    release(user.id);
  }
}
