// First Try account server. Caddy forwards https://firstry.ai/api/* here.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { checkConfig, config } from './config.mts';
import { openDb, refunds, sessions, usage, type User } from './db.mts';
import { finishSignIn, normalizeEmail, startSignIn, userFromHeaders, validEmail } from './auth.mts';
import { checkoutUrl, handleWebhook, portalUrl } from './billing.mts';
import { apiError, clientIp, json, readBody, TooLarge } from './http.mts';
import { hit } from './limits.mts';
import { MailUnavailable, notifyOwner } from './mail.mts';
import { accountView, parseRefundClaim, REFUNDS_PER_YEAR, refundCountsProblem, refundPeriodProblem, type RefundClaim } from './plans.mts';
import { proxyMessages } from './proxy.mts';
import { timingSafeEqual } from 'node:crypto';
import { exportFeedback, MAX_PAIR_CHARS, outcomes, pairs, parseCursors, parseOutcome, publicResults } from './feedback.mts';

/** True when the request carries PMP_ADMIN_TOKEN. Off unless it is set (32+ characters): the admin routes then do not exist. */
function isAdmin(req: http.IncomingMessage): boolean {
  const given = Buffer.from(String(req.headers['x-admin-token'] ?? ''));
  const wanted = Buffer.from(config.adminToken);
  return wanted.length >= 32 && given.length === wanted.length && timingSafeEqual(given, wanted);
}

const day = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

/** Tells the owner a refund is due. A failed or unconfigured email is logged, never the user's problem: the request is stored and listed at /api/admin/refunds. */
async function tellOwnerAboutRefund(id: number, user: User, claim: RefundClaim): Promise<void> {
  const text = [
    `${user.email} asked for their money back for one billing period, and their receipts qualify.`,
    '',
    `Request: ${id}`,
    `Stripe customer: ${user.stripe_customer_id ?? 'none'}, subscription: ${user.stripe_subscription_id}${user.hold ? ' (a dispute or fraud warning is open: check before refunding)' : ''}`,
    `Period: ${day(claim.periodStart)} to ${day(claim.periodEnd)}`,
    `Receipts: kept ${claim.kept}, judged ${claim.judged}, better ${claim.better}`,
    `Claude calls this server made for them in that period so far: ${usage.get(user.id, `pro:${claim.periodStart}`).requests} (0 also when the start differs from the one Stripe billed)`,
    '',
    'Refund that period\'s payment in Stripe to the original payment method within 5 working days, then record it:',
    `POST ${config.siteUrl}/api/admin/refunds/${id} with {"status":"refunded"}, or {"status":"declined","note":"why"}.`,
  ].join('\n');
  try {
    await notifyOwner(`Refund request ${id}: ${user.email}`, text);
  } catch (error) {
    console.error(`[refund] request ${id} is stored, but the owner was not emailed: ${error instanceof Error ? error.message : error}`);
  }
}

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

  // The field numbers for the method page: counts with a 95% interval, no sign-in, worked out at most every 5 minutes.
  if (method === 'GET' && path === '/api/public/results') {
    return json(res, 200, publicResults(), { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' });
  }

  // Admin routes need PMP_ADMIN_TOKEN; without it they answer as if they did not exist.
  if (path.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return json(res, 404, { error: 'Not found.' });
    // The knowledge-base tool reads what has come in: each kind's rows after the id it last got, and the ids to send next time.
    if (method === 'GET' && path === '/api/admin/feedback') {
      const after = parseCursors(url.searchParams);
      if (!after) return json(res, 400, { error: 'outcomes_after and pairs_after must be whole numbers.' });
      return json(res, 200, exportFeedback(after));
    }
    // Refund requests, newest first, with what the owner needs to find the payment in Stripe.
    if (method === 'GET' && path === '/api/admin/refunds') return json(res, 200, { refunds: refunds.list() });
    // The owner records a decision once the refund is done in Stripe, or declines it with a note.
    const decide = method === 'POST' ? /^\/api\/admin\/refunds\/(\d{1,12})$/.exec(path) : null;
    if (decide) {
      const { status, note } = JSON.parse((await readBody(req, 4096)).toString() || '{}');
      if (status !== 'refunded' && status !== 'declined') return json(res, 400, { error: 'status must be refunded or declined.' });
      const text = typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null;
      const id = Number(decide[1]);
      if (!refunds.decide(id, status, text)) return json(res, 404, { error: 'No such refund request.' });
      return json(res, 200, { refund: refunds.byId(id) });
    }
    return json(res, 404, { error: 'Not found.' });
  }

  // Everything below needs a signed-in user.
  const auth = userFromHeaders(req.headers);
  if (path === '/api/v1/messages' && method === 'POST') {
    if (!auth) {
      hit(`anon:${ip}`, 60, 60_000);
      return apiError(res, 401, 'authentication_error', 'Sign in again to keep using First Try.');
    }
    return proxyMessages(req, res, auth.user, await readBody(req, config.maxBodyBytes), url.search.slice(1));
  }
  if (!auth) return json(res, 401, { error: 'Sign in again.' });

  // How a rewrite fared: technique ids and a signal, never text. Stored without the user. The optional run id
  // (one press, made on the device) and app kind (a fixed list) are checked in parseOutcome; a bad one is dropped, not refused.
  if (method === 'POST' && path === '/api/outcome') {
    if (!hit(`outcome:${auth.user.id}`, 240, 60 * 60_000).ok) return json(res, 429, { error: 'Too many reports.' });
    const outcome = parseOutcome(JSON.parse((await readBody(req, 4096)).toString() || '{}'));
    if (!outcome) return json(res, 400, { error: 'Not an outcome.' });
    outcomes.add(outcome);
    return json(res, 200, { ok: true });
  }
  // A before/after pair, only from people who switched sharing on in the app.
  if (method === 'POST' && path === '/api/pair') {
    if (!hit(`pair:${auth.user.id}`, 40, 24 * 60 * 60_000).ok) return json(res, 429, { error: 'Too many reports.' });
    const body = JSON.parse((await readBody(req, 64 * 1024)).toString() || '{}');
    // Only the technique ids, the domain and the day are kept with a pair: its run id and app kind, if sent, are dropped,
    // and it keeps no time of day, so its text never joins a press.
    const outcome = parseOutcome({ ...body, signal: 'inserted' });
    const text = (v: unknown) => (typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_PAIR_CHARS * 2 ? v : null);
    const draft = text(body.draft), rewritten = text(body.rewritten);
    if (body.consent !== true || !outcome || !draft || !rewritten) return json(res, 400, { error: 'Not a pair, or sharing is not switched on.' });
    pairs.add({ draft, rewritten, domain: outcome.domain, techniques: outcome.techniques });
    return json(res, 200, { ok: true });
  }

  // Money back for a billing period whose receipts show First Try did not help. The app sends that period's counts;
  // the rule and the period are checked here, and the owner refunds by hand in Stripe within 5 working days.
  if (method === 'POST' && path === '/api/refund') {
    if (!hit(`refund:${auth.user.id}`, 10, 24 * 60 * 60_000).ok) return json(res, 429, { error: 'Too many refund requests today. Try again tomorrow.' });
    const claim = parseRefundClaim(JSON.parse((await readBody(req, 4096)).toString() || '{}'));
    if (!claim) return json(res, 400, { error: 'Not a refund request: send the period and the counts as whole numbers.', reason: 'invalid' });
    const user = auth.user;
    const problem = refundPeriodProblem(user, claim) ?? refundCountsProblem(claim);
    if (problem) return json(res, 400, problem);
    if (refunds.overlapping(user.id, claim.periodStart, claim.periodEnd)) return json(res, 409, { error: 'You already asked for a refund for this billing period.', reason: 'duplicate' });
    if (refunds.acceptedInLastYear(user.id) >= REFUNDS_PER_YEAR) return json(res, 403, { error: `Refunds are limited to ${REFUNDS_PER_YEAR} billing periods in any 365 days, and this account has reached that.`, reason: 'limit' });
    const id = refunds.add(user.id, claim);
    if (id === null) return json(res, 409, { error: 'You already asked for a refund for this billing period.', reason: 'duplicate' });
    console.log(`[refund] request ${id} queued for user ${user.id}`);
    await tellOwnerAboutRefund(id, user, claim);
    return json(res, 200, { status: 'queued', message: 'We will refund this period to your original payment method within 5 working days.' });
  }

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
