// Pimp My Prompt account server. Caddy forwards https://pimpmypromt.ai/api/* here.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { checkConfig, config } from './config.mts';
import { openDb, sessions } from './db.mts';
import { finishSignIn, normalizeEmail, startSignIn, userFromHeaders, validEmail } from './auth.mts';
import { checkoutUrl, handleWebhook, portalUrl } from './billing.mts';
import { apiError, clientIp, json, readBody, TooLarge } from './http.mts';
import { hit } from './limits.mts';
import { MailUnavailable } from './mail.mts';
import { accountView } from './plans.mts';
import { proxyMessages } from './proxy.mts';

async function route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://local');
  const path = url.pathname.replace(/\/+$/, '');
  const ip = clientIp(req);
  const method = req.method ?? 'GET';

  if (method === 'GET' && path === '/api/health') return json(res, 200, { ok: true, ready: checkConfig().length === 0 });

  if (method === 'POST' && path === '/api/stripe/webhook') {
    const result = await handleWebhook(await readBody(req, 1024 * 1024), req.headers['stripe-signature'] as string | undefined);
    res.writeHead(result.status, { 'content-type': 'text/plain' });
    return void res.end(result.body);
  }

  if (method === 'POST' && path === '/api/auth/code') {
    const { email: rawEmail } = JSON.parse((await readBody(req, 4096)).toString() || '{}');
    const email = normalizeEmail(String(rawEmail ?? ''));
    if (!validEmail(email)) return json(res, 400, { error: 'Enter a valid email address.' });
    const byIp = hit(`code-ip:${ip}`, 10, 60 * 60_000), byEmail = hit(`code-email:${email}`, 3, 15 * 60_000);
    if (!byIp.ok || !byEmail.ok) return json(res, 429, { error: 'Too many codes requested. Wait a few minutes and try again.' }, { 'retry-after': String(Math.max(byIp.retryAfter, byEmail.retryAfter)) });
    try {
      await startSignIn(email);
    } catch (error) {
      if (error instanceof MailUnavailable) return json(res, 503, { error: error.message });
      console.error('[auth] sending the code failed:', error instanceof Error ? error.message : error);
      return json(res, 502, { error: 'The email could not be sent. Try again in a minute.' });
    }
    return json(res, 200, { ok: true });
  }

  if (method === 'POST' && path === '/api/auth/verify') {
    if (!hit(`verify-ip:${ip}`, 30, 15 * 60_000).ok) return json(res, 429, { error: 'Too many attempts. Wait a few minutes.' });
    const { email: rawEmail, code } = JSON.parse((await readBody(req, 4096)).toString() || '{}');
    const result = finishSignIn(normalizeEmail(String(rawEmail ?? '')), String(code ?? ''));
    if (!result.ok) {
      const error = { expired: 'That code has expired. Ask for a new one.', wrong: 'That code is not right. Check the email and try again.', locked: 'Too many wrong tries. Ask for a new code.' }[result.reason];
      return json(res, 400, { error, reason: result.reason });
    }
    return json(res, 200, { token: result.token, account: accountView(result.user) });
  }

  // Everything below needs a signed-in user.
  const auth = userFromHeaders(req.headers);
  if (path === '/api/v1/messages' && method === 'POST') {
    if (!auth) {
      hit(`anon:${ip}`, 60, 60_000);
      return apiError(res, 401, 'authentication_error', 'Sign in again to keep using Pimp My Prompt.');
    }
    return proxyMessages(req, res, auth.user, await readBody(req, config.maxBodyBytes), url.search.slice(1));
  }
  if (!auth) return json(res, 401, { error: 'Sign in again.' });

  if (method === 'GET' && path === '/api/account') return json(res, 200, { account: accountView(auth.user) });
  if (method === 'POST' && path === '/api/auth/signout') {
    sessions.remove(auth.tokenHash);
    return json(res, 200, { ok: true });
  }
  if (method === 'POST' && (path === '/api/billing/checkout' || path === '/api/billing/portal')) {
    try {
      const url = path.endsWith('checkout') ? await checkoutUrl(auth.user) : await portalUrl(auth.user);
      return json(res, 200, { url });
    } catch (error) {
      console.error('[billing]', error instanceof Error ? error.message : error);
      return json(res, 503, { error: error instanceof Error ? error.message : 'Billing is unavailable.' });
    }
  }
  return json(res, 404, { error: 'Not found.' });
}

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    const started = Date.now();
    res.on('finish', () => console.log(`${req.method} ${(req.url ?? '').split('?')[0]} ${res.statusCode} ${Date.now() - started}ms`));
    route(req, res).catch((error) => {
      if (error instanceof TooLarge) return apiError(res, 413, 'request_too_large', 'The request is too large.');
      if (error instanceof SyntaxError) return json(res, 400, { error: 'The request body is not valid JSON.' });
      console.error('[server] unhandled:', error);
      if (!res.headersSent) json(res, 500, { error: 'Something went wrong.' });
      else res.end();
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  openDb();
  for (const problem of checkConfig()) console.warn(`[config] ${problem}`);
  const server = createServer();
  server.listen(config.port, config.host, () => console.log(`[server] listening on ${config.host}:${config.port}`));
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => server.close(() => process.exit(0)));
}
