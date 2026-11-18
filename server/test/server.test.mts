// End to end against local stand-ins for Anthropic and Stripe: no network, no money spent.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';
import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';
import type { User } from '../src/db.mts';
import type { RefundClaim } from '../src/plans.mts';

const listen = (server: http.Server) => new Promise<number>((r) => server.listen(0, '127.0.0.1', () => r((server.address() as AddressInfo).port)));
const seen: { anthropic: http.IncomingHttpHeaders[]; bodies: any[] } = { anthropic: [], bodies: [] };

// Anthropic stand-in: streams one message costing 1,000 input and 500 output tokens.
const anthropic = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const body = JSON.parse(raw);
  seen.anthropic.push(req.headers);
  seen.bodies.push(body);
  const message = { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1 } };
  if (body.stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    send('message_start', { message });
    send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Hello' } });
    send('content_block_stop', { index: 0 });
    send('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 500 } });
    send('message_stop', {});
    return res.end();
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ...message, content: [{ type: 'text', text: 'Hi' }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 500 } }));
});

// Stripe stand-in: just enough of the API for Checkout and the subscription sync.
const subscription = { id: 'sub_123', object: 'subscription', customer: 'cus_123', status: 'active', items: { object: 'list', data: [{ id: 'si_1', current_period_start: 1_800_000_000, current_period_end: 1_802_592_000 }] } };
const stripeApi = http.createServer(async (req, res) => {
  for await (const _ of req) void _;
  res.writeHead(200, { 'content-type': 'application/json' });
  if (req.url === '/v1/customers') return res.end(JSON.stringify({ id: 'cus_123', object: 'customer' }));
  if (req.url === '/v1/checkout/sessions') return res.end(JSON.stringify({ id: 'cs_1', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_1' }));
  if (req.url?.startsWith('/v1/subscriptions/sub_123')) return res.end(JSON.stringify(subscription));
  res.writeHead(404).end('{}');
});

// Resend stand-in: records each email, and answers with whatever status a test sets.
const mail: { status: number; sent: Array<{ authorization: string | undefined; body: any }> } = { status: 200, sent: [] };
const resend = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  mail.sent.push({ authorization: req.headers.authorization, body: JSON.parse(raw) });
  res.writeHead(mail.status, { 'content-type': 'application/json' }).end(mail.status === 200 ? '{"id":"em_1"}' : '{"message":"refused"}');
});

let base = '';
let server: http.Server;
const logs: string[] = [];
const WHSEC = 'whsec_test_secret';

before(async () => {
  const aPort = await listen(anthropic);
  const sPort = await listen(stripeApi);
  const rPort = await listen(resend);
  Object.assign(process.env, {
    ANTHROPIC_API_KEY: 'server-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${aPort}`,
    CODE_SECRET: 'x'.repeat(40), MAIL_LOG_CODES: '1', TRIAL_MICROS: '30000', PRO_MICROS: '100000',
    RESEND_API_KEY: 're_test_fake', RESEND_API_BASE: `http://127.0.0.1:${rPort}`, OWNER_EMAIL: 'owner@example.com',
    PMP_ADMIN_TOKEN: 'a'.repeat(40),
    STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_PRICE_ID: 'price_123', STRIPE_API_BASE: `http://127.0.0.1:${sPort}`,
  });
  const log = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.join(' ')); if (process.env.VERBOSE) log(...a); };
  const { openDb } = await import('../src/db.mts');
  const { createServer } = await import('../src/server.mts');
  openDb(':memory:');
  server = createServer();
  base = `http://127.0.0.1:${await listen(server)}/api`;
});
after(() => { server.close(); anthropic.close(); stripeApi.close(); resend.close(); });

const post = (path: string, body: unknown, token?: string) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const account = async (token: string) => (await (await fetch(`${base}/account`, { headers: { authorization: `Bearer ${token}` } })).json()).account;

let token = '';
test('sign-in with an emailed code', async () => {
  assert.equal((await post('/auth/code', { email: 'nope' })).status, 400);
  assert.equal((await post('/auth/code', { email: 'Ada@Example.com ' })).status, 200);
  const code = logs.map((l) => l.match(/code for ada@example\.com: (\d{6})/)?.[1]).filter(Boolean).pop()!;
  assert.match(code, /^\d{6}$/);
  const wrong = await post('/auth/verify', { email: 'ada@example.com', code: code === '000000' ? '111111' : '000000' });
  assert.equal(wrong.status, 400);
  const ok = await post('/auth/verify', { email: 'ada@example.com', code });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  token = body.token;
  assert.match(token, /^pmp_/);
  assert.equal(body.account.plan, 'trial');
  assert.equal(body.account.periodStart, null, 'a trial has no billing period');
  assert.equal((await post('/auth/verify', { email: 'ada@example.com', code })).status, 400, 'a code works once');
});

test('the app SDK streams through the server, and usage is charged', async () => {
  const client = new Anthropic({ apiKey: null, authToken: token, baseURL: base, maxRetries: 0 });
  const stream = client.beta.messages.stream({ model: 'claude-opus-5-5', max_tokens: 100, betas: ['server-side-fallback-2026-07-01'], messages: [{ role: 'user', content: 'hi' }] });
  const message = await stream.finalMessage();
  assert.equal(message.content[0]?.type === 'text' && message.content[0].text, 'Hello');
  const h = seen.anthropic.at(-1)!;
  assert.equal(h['x-api-key'], 'server-key', 'the server key is used');
  assert.equal(h.authorization, undefined, 'the user token never reaches Anthropic');
  assert.equal(h['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.match(seen.bodies.at(-1).metadata.user_id, /^[0-9a-f]{32}$/);
  // 1,000 in × $4/M + 500 out × $20/M = 14,000 micro-dollars of a 30,000 trial.
  assert.equal((await account(token)).percentUsed, 47);
});

test('requests outside what the app sends are refused', async () => {
  const client = new Anthropic({ apiKey: null, authToken: token, baseURL: base, maxRetries: 0 });
  const base_ = { max_tokens: 100, messages: [{ role: 'user' as const, content: 'hi' }] };
  await assert.rejects(client.messages.create({ ...base_, model: 'claude-haiku-5-5' }), (e: any) => e.status === 400);
  // Sent raw: the SDK itself refuses a non-streaming request this large before it leaves the app.
  const big = await post('/v1/messages', { ...base_, model: 'claude-opus-5-5', max_tokens: 64000 }, token);
  assert.equal(big.status, 400);
  assert.match((await big.json()).error.message, /max_tokens/);
  await assert.rejects(client.messages.create({ ...base_, model: 'claude-opus-5-5', tools: [{ name: 't', input_schema: { type: 'object' } }] }), (e: any) => e.status === 400);
  await assert.rejects(client.beta.messages.create({ ...base_, model: 'claude-opus-5-5', betas: ['some-other-beta'] }), (e: any) => e.status === 400);
  const anon = new Anthropic({ apiKey: null, authToken: 'pmp_wrong', baseURL: base, maxRetries: 0 });
  await assert.rejects(anon.messages.create({ ...base_, model: 'claude-opus-5-5' }), (e: any) => e instanceof Anthropic.AuthenticationError);
});

test('the trial stops at its allowance with a 402', async () => {
  const client = new Anthropic({ apiKey: null, authToken: token, baseURL: base, maxRetries: 0 });
  const req = { model: 'claude-opus-5-5', max_tokens: 100, messages: [{ role: 'user' as const, content: 'hi' }] };
  await client.messages.create(req); // non-streaming path is charged too: now 28,000
  await client.messages.create(req); // 42,000: over, but this one was allowed to start
  await assert.rejects(client.messages.create(req), (e: any) => e.status === 402 && /free trial/.test(e.message));
  const a = await account(token);
  assert.equal(a.percentUsed, 100);
  assert.equal(a.canUpgrade, true);
});

test('checkout, then a signed webhook turns the account into Pro', async () => {
  const res = await post('/billing/checkout', {}, token);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).url, 'https://checkout.stripe.com/c/pay/cs_1');

  const stripe = new Stripe('sk_test_fake');
  const event = (id: string, type: string, object: object) => JSON.stringify({ id, object: 'event', type, data: { object } });
  const deliver = (payload: string, signed = true) =>
    fetch(`${base}/stripe/webhook`, { method: 'POST', headers: { 'stripe-signature': signed ? stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC }) : 't=1,v1=bad' }, body: payload });

  const completed = event('evt_1', 'checkout.session.completed', { object: 'checkout.session', mode: 'subscription', subscription: 'sub_123', customer: 'cus_123' });
  assert.equal((await deliver(completed, false)).status, 400, 'unsigned events are rejected');
  assert.equal(await (await deliver(completed)).text(), 'ok');
  assert.equal(await (await deliver(completed)).text(), 'duplicate', 'replays are ignored');

  const a = await account(token);
  assert.equal(a.plan, 'pro');
  assert.equal(a.percentUsed, 0, 'a new period starts with a fresh allowance');
  assert.equal(a.resetsAt, 1_802_592_000);
  assert.deepEqual([a.periodStart, a.periodEnd], [1_800_000_000, 1_802_592_000], 'the app knows the billing period it counts receipts for');
  assert.equal(a.canManage, true);
  const client = new Anthropic({ apiKey: null, authToken: token, baseURL: base, maxRetries: 0 });
  await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] });
});

test('outcome parsing: dismissed is a signal, and the run id and app kind are optional and never refuse a report', async () => {
  const { APP_KINDS, parseOutcome } = await import('../src/feedback.mts');
  const old = { signal: 'inserted', techniques: ['writing-for-stated-reader'], heldOut: null, domain: 'writing', scale: 'deliverable', family: 'claude', kb: '2026-11-11' };
  assert.deepEqual(parseOutcome(old), { ...old, run: null, app: null }, 'a report from an app that sends neither is still accepted');
  assert.equal(parseOutcome({ ...old, signal: 'dismissed' })?.signal, 'dismissed');
  for (const signal of ['blind_rewrite', 'blind_original', 'blind_same']) assert.equal(parseOutcome({ ...old, signal })?.signal, signal, `${signal} is a signal`);
  assert.equal(parseOutcome({ ...old, signal: 'blind_maybe' }), null);

  const run = randomUUID();
  assert.equal(parseOutcome({ ...old, run })?.run, run);
  for (const bad of [run.toUpperCase(), run.replaceAll('-', ''), ` ${run}`, `${run}\n`, 'ada@example.com', 42, {}, null]) {
    const parsed = parseOutcome({ ...old, run: bad });
    assert.ok(parsed, `a malformed run id (${JSON.stringify(bad)}) does not cost the report`);
    assert.equal(parsed.run, null);
  }

  for (const app of APP_KINDS) assert.equal(parseOutcome({ ...old, app })?.app, app);
  for (const app of ['Microsoft Word', 'ChatGPT', 'com.tinyspeck.slackmacgap', '', 7, {}]) assert.equal(parseOutcome({ ...old, app })?.app, 'other', `${JSON.stringify(app)} is stored as other`);
  assert.equal(parseOutcome({ ...old, app: null })?.app, null);
  assert.equal(parseOutcome({ ...old, app: undefined })?.app, null);
});

test('outcomes: ids and a signal are stored, free text is refused, and nothing ties them to the user', async () => {
  const good = { signal: 'inserted', techniques: ['writing-for-stated-reader', 'writing-match-users-voice'], heldOut: 'mkt-state-audience', domain: 'writing', scale: 'deliverable', family: 'claude', kb: '2026-11-11' };
  const run = randomUUID();
  assert.equal((await post('/outcome', good)).status, 401, 'signed-in users only');
  assert.equal((await post('/outcome', good, token)).status, 200, 'an old app sends neither run nor app');
  assert.equal((await post('/outcome', { ...good, signal: 'undone', heldOut: null }, token)).status, 200);
  assert.equal((await post('/outcome', { ...good, signal: 'dismissed', run, app: 'slack' }, token)).status, 200);
  assert.equal((await post('/outcome', { ...good, signal: 'rated_up', run: 'not-a-run-id', app: 'Microsoft Word' }, token)).status, 200, 'a bad run id or app is dropped, not refused');
  for (const bad of [{ ...good, signal: 'liked it a lot' }, { ...good, techniques: ['my email is ada@example.com'] }, { ...good, domain: 'a long sentence about me' }, { ...good, techniques: Array(13).fill('x-y') }, { ...good, heldOut: 'Not A Slug' }])
    assert.equal((await post('/outcome', bad, token)).status, 400);

  const pair = { ...good, consent: true, draft: 'email ada@example.com about invoice 4471993, call +370 612 34567, see https://example.com/x', rewritten: 'Write to @ada_l about the invoice.' };
  assert.equal((await post('/pair', { ...pair, consent: false }, token)).status, 400, 'no consent, no pair');
  assert.equal((await post('/pair', { ...pair, run, app: 'notion' }, token)).status, 200, 'a run id and app kind do not break a pair');

  const get = (headers: Record<string, string>) => fetch(`${base}/admin/feedback?since=2020-01-01`, { headers });
  assert.equal((await get({})).status, 404);
  assert.equal((await get({ 'x-admin-token': 'b'.repeat(40) })).status, 404);
  const data = await (await get({ 'x-admin-token': 'a'.repeat(40) })).json();
  assert.equal(data.outcomes.length, 4);
  for (const o of data.outcomes) assert.deepEqual(Object.keys(o).sort(), ['app', 'at', 'domain', 'family', 'held_out', 'id', 'kb', 'run', 'scale', 'signal', 'techniques']);
  const bySignal = (signal: string) => data.outcomes.find((o: { signal: string }) => o.signal === signal);
  assert.equal(bySignal('inserted').held_out, 'mkt-state-audience');
  assert.deepEqual([bySignal('inserted').run, bySignal('inserted').app], [null, null]);
  assert.deepEqual([bySignal('dismissed').run, bySignal('dismissed').app], [run, 'slack']);
  assert.deepEqual([bySignal('rated_up').run, bySignal('rated_up').app], [null, 'other']);
  assert.equal(data.pairs.length, 1);
  assert.deepEqual(Object.keys(data.pairs[0]).sort(), ['at', 'domain', 'draft', 'id', 'rewritten', 'techniques'], 'a pair is never joined to a press');
  assert.equal(data.pairs[0].draft, 'email [email] about invoice [number], call [number], see [link]');
  assert.equal(data.pairs[0].rewritten, 'Write to [handle] about the invoice.');
});

test('a signed-in request and a shared pair keep only the day, so neither can be joined to an anonymous report by its time', async () => {
  const { handle } = await import('../src/db.mts');
  const { hashToken } = await import('../src/auth.mts');
  const press = { signal: 'inserted', techniques: ['writing-for-stated-reader'], heldOut: null, domain: 'writing', scale: 'deliverable', family: 'claude', kb: '2026-11-18', run: randomUUID(), app: 'claude' };
  assert.equal((await post('/outcome', press, token)).status, 200);
  assert.equal((await post('/pair', { ...press, consent: true, draft: 'Make this shorter.', rewritten: 'Cut this to three sentences.' }, token)).status, 200);
  const session = handle().prepare('SELECT last_used FROM sessions WHERE token_hash = ?').get(hashToken(token)) as { last_used: string };
  assert.match(session.last_used, /^\d{4}-\d{2}-\d{2}$/, 'the session that sent them keeps the day it was used, not the second');
  const data = await (await fetch(`${base}/admin/feedback?outcomes_after=0&pairs_after=0`, { headers: { 'x-admin-token': 'a'.repeat(40) } })).json();
  assert.equal(data.pairs.at(-1).draft, 'Make this shorter.');
  assert.match(data.pairs.at(-1).at, /^\d{4}-\d{2}-\d{2}$/, 'a pair keeps the day it came, not the second');
  assert.match(data.outcomes.at(-1).at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, 'an outcome, which carries no text, keeps the second');
});

test('signing out revokes the token', async () => {
  assert.equal((await post('/auth/signout', {}, token)).status, 200);
  assert.equal((await fetch(`${base}/account`, { headers: { authorization: `Bearer ${token}` } })).status, 401);
});

// Refunds. Users are made straight in the database, so these tests do not spend the sign-in rate limit.
const DAY = 86_400;
const nowSeconds = () => Math.floor(Date.now() / 1000);
async function newUser(email: string, period?: { start: number; end: number; status?: string }) {
  const { sessions, users } = await import('../src/db.mts');
  const { hashToken } = await import('../src/auth.mts');
  const user = users.create(email);
  if (period) {
    users.setCustomer(user.id, `cus_${user.id}`);
    users.setSubscription(user.id, { subscription: `sub_${user.id}`, status: period.status ?? 'active', start: period.start, end: period.end });
  }
  const t = `pmp_${randomUUID()}`;
  sessions.create(hashToken(t), user.id);
  return { id: user.id, token: t };
}
const adminGet = (path: string, adminToken = 'a'.repeat(40)) => fetch(`${base}/admin${path}`, { headers: { 'x-admin-token': adminToken } });
const adminPost = (path: string, body: unknown, adminToken = 'a'.repeat(40)) =>
  fetch(`${base}/admin${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': adminToken }, body: JSON.stringify(body) });

test('refund: the rule, whole-number counts that add up, and a plain sentence when they do not qualify', async () => {
  const { qualifiesForRefund } = await import('../src/plans.mts');
  assert.equal(qualifiesForRefund({ kept: 0, judged: 0, better: 0 }), true, 'nothing kept');
  assert.equal(qualifiesForRefund({ kept: 9, judged: 3, better: 1 }), true, 'fewer than half of 3 judged came out better');
  assert.equal(qualifiesForRefund({ kept: 9, judged: 4, better: 2 }), false, 'exactly half is not fewer than half');
  assert.equal(qualifiesForRefund({ kept: 9, judged: 2, better: 0 }), false, 'fewer than 3 judged');

  // Stripe renewed 10 days ago: the period that ended then is the one claimed.
  const start = nowSeconds() - 10 * DAY, end = start + 30 * DAY;
  const q = await newUser('q@example.com', { start, end });
  const period = { periodStart: start - 30 * DAY, periodEnd: start };
  assert.equal((await post('/refund', { ...period, kept: 0, judged: 0, better: 0 })).status, 401, 'signed-in users only');
  for (const bad of [{ ...period, kept: -1, judged: 0, better: 0 }, { ...period, kept: 1.5, judged: 3, better: 0 }, { ...period, kept: 1, judged: 100_001, better: 0 }, { ...period, kept: '0', judged: 0, better: 0 }, { kept: 0, judged: 0, better: 0 }]) {
    const res = await post('/refund', bad, q.token);
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal((await res.json()).reason, 'invalid');
  }
  const more = await post('/refund', { ...period, kept: 3, judged: 3, better: 4 }, q.token);
  assert.equal(more.status, 400, 'better cannot be more than judged');
  assert.deepEqual(await more.json(), { reason: 'counts', error: 'The counts do not add up: more came out better than were judged.' });
  for (const helped of [{ kept: 5, judged: 4, better: 2 }, { kept: 5, judged: 2, better: 0 }]) {
    const res = await post('/refund', { ...period, ...helped }, q.token);
    assert.equal(res.status, 400, JSON.stringify(helped));
    const body = await res.json();
    assert.equal(body.reason, 'counts');
    assert.match(body.error, /^Your receipts for this period show First Try helped\./);
  }

  mail.sent.length = 0;
  const ok = await post('/refund', { ...period, kept: 5, judged: 4, better: 1 }, q.token);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { status: 'queued', message: 'We will refund this period to your original payment method within 5 working days.' });
  assert.equal(mail.sent.length, 1, 'the owner is emailed');
  const email = mail.sent[0]!;
  assert.equal(email.authorization, 'Bearer re_test_fake');
  assert.deepEqual(email.body.to, ['owner@example.com']);
  assert.match(email.body.subject, /^Refund request \d+: q@example\.com$/);
  assert.match(email.body.text, new RegExp(`Stripe customer: cus_${q.id}, subscription: sub_${q.id}`));
  assert.match(email.body.text, /Receipts: kept 5, judged 4, better 1\nClaude calls this server made for them in that period so far: 0 /);
  assert.ok(email.body.text.includes(`Period: ${new Date((start - 30 * DAY) * 1000).toISOString().slice(0, 10)} to ${new Date(start * 1000).toISOString().slice(0, 10)}`));

  // 10 requests a day per user: q has made 9 above, so the 10th is still answered and the 11th is not.
  assert.equal((await post('/refund', { ...period, kept: 0, judged: 0, better: 0 }, q.token)).status, 409);
  assert.equal((await post('/refund', { ...period, kept: 0, judged: 0, better: 0 }, q.token)).status, 429);
});

test('refund: the current or the previous billing period, once it has ended and until 14 days after', async () => {
  const claim = (periodStart: number, periodEnd: number) => ({ periodStart, periodEnd, kept: 0, judged: 0, better: 0 });
  const reason = async (res: Response) => [res.status, (await res.json()).reason];

  const trial = await newUser('trial@example.com');
  assert.deepEqual(await reason(await post('/refund', claim(nowSeconds() - 31 * DAY, nowSeconds() - DAY), trial.token)), [400, 'subscription'], 'no subscription, nothing to refund');

  // Stripe renewed 10 days ago: the previous period has ended, and the current one runs for 20 more days.
  const start = nowSeconds() - 10 * DAY, end = start + 30 * DAY;
  const p = await newUser('p@example.com', { start, end });
  assert.deepEqual(await reason(await post('/refund', claim(start + 1, end), p.token)), [400, 'period']);
  assert.deepEqual(await reason(await post('/refund', claim(start, end + DAY), p.token)), [400, 'period']);
  assert.deepEqual(await reason(await post('/refund', claim(start - 60 * DAY, start - 30 * DAY), p.token)), [400, 'period'], 'two periods back');
  const running = await post('/refund', claim(start, end), p.token);
  assert.equal(running.status, 400, 'the current period is still running');
  assert.deepEqual(await running.json(), { reason: 'early', error: 'A billing period can be claimed once it has ended, until 14 days after.' });
  assert.deepEqual(await reason(await post('/refund', claim(start - 30 * DAY, start), p.token)), [200, undefined], 'the previous period ended 10 days ago');

  // Renewed a minute ago: the period that just ended can be claimed straight away, the new one not yet.
  const renewed = nowSeconds() - 60;
  const just = await newUser('just@example.com', { start: renewed, end: renewed + 30 * DAY });
  assert.deepEqual(await reason(await post('/refund', claim(renewed, renewed + 30 * DAY), just.token)), [400, 'early']);
  assert.deepEqual(await reason(await post('/refund', claim(renewed - 30 * DAY, renewed), just.token)), [200, undefined], 'the period that ended a minute ago');

  // A 28-day February after a 31-day January: the previous period may differ in length by a few days.
  const feb = nowSeconds() - 3 * DAY;
  const m = await newUser('months@example.com', { start: feb, end: feb + 28 * DAY });
  assert.deepEqual(await reason(await post('/refund', claim(feb - 31 * DAY, feb), m.token)), [200, undefined]);

  const lateStart = nowSeconds() - 15 * DAY;
  const late = await newUser('late@example.com', { start: lateStart, end: lateStart + 30 * DAY });
  assert.deepEqual(await reason(await post('/refund', claim(lateStart - 30 * DAY, lateStart), late.token)), [400, 'late'], 'the previous period ended 15 days ago');
  assert.deepEqual(await reason(await post('/refund', claim(lateStart, lateStart + 30 * DAY), late.token)), [400, 'early'], 'and the current one has not ended');

  // A cancelled subscription keeps its last period: it is the current one, has ended, and can be claimed for 14 days after.
  const gone = await newUser('gone@example.com', { start: nowSeconds() - 40 * DAY, end: nowSeconds() - 10 * DAY, status: 'canceled' });
  assert.equal((await account(gone.token)).periodStart, nowSeconds() - 40 * DAY);
  assert.deepEqual(await reason(await post('/refund', claim(nowSeconds() - 40 * DAY, nowSeconds() - 10 * DAY), gone.token)), [200, undefined]);
  const goneLong = await newUser('gone-long@example.com', { start: nowSeconds() - 45 * DAY, end: nowSeconds() - 15 * DAY, status: 'canceled' });
  assert.deepEqual(await reason(await post('/refund', claim(nowSeconds() - 45 * DAY, nowSeconds() - 15 * DAY), goneLong.token)), [400, 'late'], 'its last period ended 15 days ago');
});

test('refund: the period rule to the second, from the moment a period ends until 14 days after', async () => {
  const { CLAIM_DAYS, refundPeriodProblem } = await import('../src/plans.mts');
  const T = 1_800_000_000;
  const user = (start: number, end: number, status = 'active'): User =>
    ({ id: 1, email: 'edge@example.com', created_at: '2026-01-01 00:00:00', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', subscription_status: status, period_start: start, period_end: end, hold: 0 });
  const claim = (periodStart: number, periodEnd: number): RefundClaim => ({ periodStart, periodEnd, kept: 0, judged: 0, better: 0 });
  const at = (u: User, c: RefundClaim, nows: number[]) => nows.map((now) => refundPeriodProblem(u, c, now)?.reason ?? 'ok');
  assert.equal(CLAIM_DAYS, 14);

  // Renewed at T: the previous period ended then.
  assert.deepEqual(at(user(T, T + 30 * DAY), claim(T - 30 * DAY, T), [T, T + 14 * DAY - 1, T + 14 * DAY]), ['ok', 'ok', 'late']);
  // The current period: refused while it runs, then claimable for 14 days once it has run out, as a cancelled subscription's last one.
  const current = claim(T, T + 30 * DAY);
  assert.deepEqual(at(user(T, T + 30 * DAY, 'canceled'), current, [T, T + 30 * DAY - 1, T + 30 * DAY, T + 44 * DAY - 1, T + 44 * DAY]), ['early', 'early', 'ok', 'ok', 'late']);
  assert.deepEqual(refundPeriodProblem(user(T, T + 30 * DAY), current, T + DAY), { reason: 'early', error: 'A billing period can be claimed once it has ended, until 14 days after.' });
});

test('refund: one request per period, and at most two that were not declined in any 365 days', async () => {
  const { handle, refunds, users } = await import('../src/db.mts');
  const claim = (periodStart: number, periodEnd: number) => ({ periodStart, periodEnd, kept: 0, judged: 0, better: 0 });
  // The period ended an hour ago and Stripe's renewal has not reached the server yet, so it is still the current one.
  const end = nowSeconds() - 3600, start = end - 30 * DAY;
  const r = await newUser('r@example.com', { start, end });

  // Two earlier periods were asked for at the time, three days after each ended, and neither was declined.
  for (const months of [2, 5]) {
    const id = refunds.add(r.id, claim(start - months * 30 * DAY, start - (months - 1) * 30 * DAY))!;
    handle().prepare("UPDATE refund_requests SET at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?) WHERE id = ?").run(`-${months * 30 - 3} days`, id);
  }
  const third = await post('/refund', claim(start, end), r.token);
  assert.equal(third.status, 403, 'a third accepted request within a year');
  assert.equal((await third.json()).reason, 'limit');

  // A declined request does not count toward the two.
  const mine = (await (await adminGet('/refunds')).json()).refunds.filter((x: { user_id: number }) => x.user_id === r.id);
  assert.equal(mine.length, 2);
  assert.equal((await adminPost(`/refunds/${mine[0].id}`, { status: 'declined', note: 'Heavy use that period.' })).status, 200);
  assert.equal((await post('/refund', claim(start, end), r.token)).status, 200);
  const again = await post('/refund', { ...claim(start, end), kept: 7, judged: 9, better: 1 }, r.token);
  assert.equal(again.status, 409, 'one request per period');
  assert.deepEqual(await again.json(), { error: 'You already asked for a refund for this billing period.', reason: 'duplicate' });

  // Stripe's renewal arrives: the period claimed is now the previous one, and still the same period.
  users.setSubscription(r.id, { subscription: `sub_${r.id}`, status: 'active', start: end, end: end + 30 * DAY });
  assert.equal((await post('/refund', claim(start, end), r.token)).status, 409, 'asked for while it was the current one');
  assert.equal((await post('/refund', claim(end - 31 * DAY, end), r.token)).status, 409, 'the same period with a start a day off is still the same period');
});

test('refund: a failed or missing owner email is logged and the request still goes through', async () => {
  const { config } = await import('../src/config.mts');
  // Stripe renewed 5 days ago for both: each claims the period that ended then.
  const start = nowSeconds() - 5 * DAY, end = start + 30 * DAY;
  const f = await newUser('f@example.com', { start, end });
  const f2 = await newUser('f2@example.com', { start, end });
  const errors: string[] = [];
  const error = console.error;
  console.error = (...a: unknown[]) => void errors.push(a.join(' '));
  const owner = config.ownerEmail;
  try {
    mail.status = 500;
    const res = await post('/refund', { periodStart: start - 30 * DAY, periodEnd: start, kept: 0, judged: 0, better: 0 }, f.token);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'queued');
    assert.equal(errors.length, 1, 'one line in the log');
    assert.match(errors[0]!, /^\[refund\] request \d+ is stored, but the owner was not emailed: Resend refused the email: 500/);

    mail.status = 200;
    config.ownerEmail = '';
    assert.equal((await post('/refund', { periodStart: start - 30 * DAY, periodEnd: start, kept: 0, judged: 0, better: 0 }, f2.token)).status, 200);
    assert.match(errors[1]!, /owner was not emailed: Owner email is not configured\./);
  } finally {
    console.error = error;
    config.ownerEmail = owner;
    mail.status = 200;
  }
});

test('admin: refund requests are listed with the email and Stripe customer, and decided by hand', async () => {
  assert.equal((await adminGet('/refunds', '')).status, 404);
  assert.equal((await adminGet('/refunds', 'b'.repeat(40))).status, 404);
  const { users, usage } = await import('../src/db.mts');
  const qUser = users.byEmail('q@example.com')!;
  usage.add(qUser.id, `pro:${qUser.period_start! - 30 * DAY}`, 14_000); // one Claude call in the period q claimed, the one before the current
  const { refunds } = await (await adminGet('/refunds')).json();
  const q = refunds.find((x: { email: string }) => x.email === 'q@example.com');
  assert.ok(q, 'the request from the first refund test');
  assert.equal(q.stripe_customer_id, `cus_${q.user_id}`);
  assert.equal(q.stripe_subscription_id, `sub_${q.user_id}`);
  assert.deepEqual([q.kept, q.judged, q.better, q.status, q.note, q.decided_at], [5, 4, 1, 'queued', null, null]);
  assert.equal(q.period_requests, 1, 'the owner sees use of the claimed period');
  assert.match(q.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(refunds.every((x: { id: number }, i: number) => i === 0 || refunds[i - 1].id > x.id), 'newest first');

  assert.equal((await adminPost(`/refunds/${q.id}`, { status: 'refunded' }, 'b'.repeat(40))).status, 404);
  assert.equal((await adminPost(`/refunds/${q.id}`, { status: 'maybe' })).status, 400);
  assert.equal((await adminPost('/refunds/999999', { status: 'refunded' })).status, 404);
  const done = await adminPost(`/refunds/${q.id}`, { status: 'refunded', note: '  Refunded in Stripe: re_123  ' });
  assert.equal(done.status, 200);
  const { refund } = await done.json();
  assert.deepEqual([refund.id, refund.status, refund.note], [q.id, 'refunded', 'Refunded in Stripe: re_123']);
  assert.match(refund.decided_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test('admin feedback: exported by id, so rows from the same second all arrive across pages, and none twice', async () => {
  const { exportFeedback, outcomes, pairs, parseOutcome } = await import('../src/feedback.mts');
  const { handle } = await import('../src/db.mts');
  const feedback = async (query: string) => {
    const res = await adminGet(`/feedback?${query}`);
    assert.equal(res.status, 200, query);
    return res.json();
  };
  const ids = (rows: Array<{ id: number }>) => rows.map((row) => row.id);
  const everything = await feedback('outcomes_after=0&pairs_after=0');
  assert.ok(ids(everything.outcomes).every((id, i, all) => i === 0 || all[i - 1]! < id), 'oldest first, by id');
  const start = everything.next;
  assert.deepEqual(start, { outcomes_after: everything.outcomes.at(-1).id, pairs_after: everything.pairs.at(-1).id }, 'the cursors are the last ids sent');
  assert.deepEqual(await feedback('since=2020-01-01'), everything, 'a kb tool from before the cursors still gets everything with since=<date>');

  // Five reports in one second and two pairs, more than one page holds.
  for (let i = 0; i < 5; i++) outcomes.add(parseOutcome({ signal: 'inserted', techniques: ['writing-for-stated-reader'], heldOut: null, domain: 'writing', scale: 'deliverable', family: 'claude', kb: '2026-11-18' })!);
  for (let i = 0; i < 2; i++) pairs.add({ draft: `Draft ${i}`, rewritten: `Rewrite ${i}`, domain: 'writing', techniques: [] });
  handle().prepare("UPDATE outcomes SET at = '2026-11-18T10:00:00Z' WHERE id > ?").run(start.outcomes_after);
  const added = Array.from({ length: 5 }, (_, i) => start.outcomes_after + i + 1);

  const limits = { outcomes: 3, pairs: 1 };
  const first = exportFeedback(start, limits);
  assert.deepEqual([first.outcomes.length, first.pairs.length], [3, 1]);
  assert.deepEqual(first.next, { outcomes_after: first.outcomes[2]!.id, pairs_after: first.pairs[0]!.id }, 'the cursor advances to the last row sent');
  const second = exportFeedback(first.next, limits);
  assert.deepEqual([second.outcomes.length, second.pairs.length], [2, 1]);
  const sent = [...first.outcomes, ...second.outcomes];
  assert.deepEqual(ids(sent), added, 'every row of that second, each once');
  assert.ok(sent.every((o) => o.at === '2026-11-18T10:00:00Z'));
  assert.deepEqual(exportFeedback(second.next, limits), { outcomes: [], pairs: [], next: second.next }, 'nothing new: the cursors stay');

  const page = await feedback(`outcomes_after=${start.outcomes_after}&pairs_after=${start.pairs_after}`);
  assert.deepEqual(ids(page.outcomes), added);
  assert.deepEqual(page.pairs.map((p: { draft: string }) => p.draft), ['Draft 0', 'Draft 1']);
  assert.deepEqual(page.next, { outcomes_after: added.at(-1), pairs_after: second.pairs[0]!.id });
  assert.ok(page.next.outcomes_after > start.outcomes_after && page.next.pairs_after > start.pairs_after, 'the cursor advances');
  assert.deepEqual(await feedback(`outcomes_after=${page.next.outcomes_after}&pairs_after=${page.next.pairs_after}`), { outcomes: [], pairs: [], next: page.next });
  const noPairCursor = await feedback(`outcomes_after=${page.next.outcomes_after}`);
  assert.equal(noPairCursor.pairs.length, everything.pairs.length + 2, 'a missing cursor starts from the first row');
  // Pairs keep only the day, so an old since=<time> sends that whole day's pairs again rather than skipping some.
  const sameDay = await feedback(`since=${page.pairs[0].at}T23:59:59Z`);
  assert.ok(ids(page.pairs).every((id) => ids(sameDay.pairs).includes(id)));

  for (const bad of ['outcomes_after=-1', 'outcomes_after=1.5', 'pairs_after=abc', 'outcomes_after=&pairs_after=0', 'outcomes_after=1e3']) {
    const res = await adminGet(`/feedback?${bad}`);
    assert.equal(res.status, 400, bad);
    assert.deepEqual(await res.json(), { error: 'outcomes_after and pairs_after must be whole numbers.' });
  }
});

// Public results. Each press gets its own run id; reports without one (apps before 0.6.0) never count.
const pressFields = { techniques: ['writing-for-stated-reader'], heldOut: null, domain: 'writing', scale: 'deliverable', family: 'claude', kb: '2026-11-18' };
async function report(signal: string, run: string | null = randomUUID()) {
  const { outcomes, parseOutcome } = await import('../src/feedback.mts');
  outcomes.add(parseOutcome({ ...pressFields, signal, run })!);
  return run;
}

test('public results: counts only below 30 comparisons, a share with a 95% interval from 30, and ties count against First Try', async () => {
  const { computeResults, wilson } = await import('../src/feedback.mts');
  assert.deepEqual(wilson(15, 29), { share: null, low: null, high: null });
  assert.deepEqual(wilson(15, 30), { share: 0.5, low: 0.332, high: 0.668 });
  assert.deepEqual(wilson(0, 30), { share: 0, low: 0, high: 0.114 });

  assert.deepEqual(computeResults().blind, { n: 0, rewrite: 0, original: 0, same: 0, share: null, low: null, high: null }, 'no earlier test reports a blind pick');
  const b = await newUser('blind@example.com');
  assert.equal((await post('/outcome', { ...pressFields, signal: 'blind_rewrite', run: randomUUID(), app: 'chatgpt' }, b.token)).status, 200, 'the app reports a pick');
  assert.equal((await post('/outcome', { ...pressFields, signal: 'blind_rewrite' }, b.token)).status, 200);
  await report('blind_same', null); // neither of these two has a run id, so neither counts
  for (let i = 0; i < 14; i++) await report('blind_rewrite');
  for (let i = 0; i < 9; i++) await report('blind_original');
  for (let i = 0; i < 5; i++) await report('blind_same');
  assert.deepEqual(computeResults().blind, { n: 29, rewrite: 15, original: 9, same: 5, share: null, low: null, high: null });
  await report('blind_same');
  assert.deepEqual(computeResults().blind, { n: 30, rewrite: 15, original: 9, same: 6, share: 0.5, low: 0.332, high: 0.668 }, 'about the same counts as not picked');
});

test('public results: kept and rated join the reports of one press by its run id', async () => {
  const { computeResults } = await import('../src/feedback.mts');
  const before = computeResults();
  const kept = await report('inserted');
  const undone = await report('inserted');
  await report('undone', undone);
  const changedUp = await report('inserted');
  await report('rated_down', changedUp);
  await report('rated_up', changedUp);
  const changedDown = await report('rated_up');
  await report('rated_down', changedDown);
  const twice = await report('inserted');
  await report('inserted', twice);
  await report('undone'); // undone with no inserted report is not a press that was put in
  await report('dismissed');
  await report('inserted', null);
  await report('rated_up', null);
  void kept;

  const after = computeResults();
  assert.equal(after.kept.n - before.kept.n, 4, 'four presses were put into an app, one of them reported twice');
  assert.equal(after.kept.kept - before.kept.kept, 2, 'undone, and rated down then up, are not kept');
  assert.equal(after.rated.n - before.rated.n, 2, 'two presses were rated, each counted once');
  assert.equal(after.rated.better - before.rated.better, 1, 'the later rating counts');
  assert.ok(after.kept.n < 30 && after.kept.share === null && after.rated.share === null, 'too few to print a share');
  assert.match(after.since!, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test('public results: no sign-in, and the database is asked at most once every 5 minutes', async () => {
  const { publicResults } = await import('../src/feedback.mts');
  const first = await fetch(`${base}/public/results`);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'public, max-age=300');
  assert.equal(first.headers.get('access-control-allow-origin'), '*');
  const a = await first.json();
  assert.deepEqual(Object.keys(a), ['asOf', 'since', 'blind', 'kept', 'rated']);
  assert.deepEqual(Object.keys(a.kept), ['n', 'kept', 'share', 'low', 'high']);
  assert.deepEqual(Object.keys(a.rated), ['n', 'better', 'share', 'low', 'high']);
  assert.equal(a.blind.share, 0.5);

  await report('blind_rewrite');
  assert.deepEqual(await (await fetch(`${base}/public/results`)).json(), a, 'a new report waits for the next 5 minutes');
  const later = publicResults(Date.now() + 5 * 60_000);
  assert.equal(later.blind.n, a.blind.n + 1);
  assert.notEqual(later.asOf, a.asOf);
});

// Keep this last: opening another database replaces the one the server above runs on.
test('a database from before run and app gains both columns when opened, keeps its rows, and cuts older session and pair times to the day', async () => {
  const { openDb } = await import('../src/db.mts');
  const { outcomes, parseOutcome } = await import('../src/feedback.mts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'firstry-db-'));
  const file = path.join(dir, 'app.db');
  try {
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE outcomes (
      id INTEGER PRIMARY KEY,
      signal TEXT NOT NULL,
      techniques TEXT NOT NULL,
      held_out TEXT,
      domain TEXT NOT NULL,
      scale TEXT NOT NULL,
      family TEXT NOT NULL,
      kb TEXT NOT NULL,
      at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )`);
    old.prepare('INSERT INTO outcomes (signal, techniques, held_out, domain, scale, family, kb, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('inserted', '["writing-for-stated-reader"]', 'mkt-state-audience', 'writing', 'deliverable', 'claude', '2026-11-11', '2026-01-02T03:04:05Z');
    old.close();

    // Rows stored before sessions and pairs kept only the day still carry the second.
    const first = openDb(file);
    first.prepare("INSERT INTO users (id, email) VALUES (1, 'old@example.com')").run();
    first.prepare("INSERT INTO sessions (token_hash, user_id, last_used) VALUES ('old', 1, '2026-01-02 03:04:05')").run();
    first.prepare("INSERT INTO pairs (draft, rewritten, domain, techniques, at) VALUES ('a', 'b', 'writing', '[]', '2026-01-02T03:04:05Z')").run();
    first.close();
    const db = openDb(file); // opening again finds both columns and adds nothing
    const columns = (db.prepare('PRAGMA table_info(outcomes)').all() as Array<{ name: string }>).map((c) => c.name);
    assert.deepEqual(columns, ['id', 'signal', 'techniques', 'held_out', 'domain', 'scale', 'family', 'kb', 'at', 'run', 'app']);
    const kept = (sql: string) => Object.values(db.prepare(sql).get()!)[0];
    assert.deepEqual([kept('SELECT last_used FROM sessions'), kept('SELECT at FROM pairs')], ['2026-01-02', '2026-01-02'], 'opening cuts them to the day');

    const run = randomUUID();
    outcomes.add(parseOutcome({ signal: 'dismissed', techniques: ['writing-for-stated-reader'], heldOut: null, domain: 'writing', scale: 'deliverable', family: 'claude', kb: '2026-11-18', run, app: 'cursor' })!);
    const rows = outcomes.after(0).map((r) => ({ ...r }));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { id: 1, signal: 'inserted', techniques: '["writing-for-stated-reader"]', held_out: 'mkt-state-audience', domain: 'writing', scale: 'deliverable', family: 'claude', kb: '2026-11-11', run: null, app: null, at: '2026-01-02T03:04:05Z' }, 'the old row is kept, with null run and app');
    assert.deepEqual([rows[1]?.signal, rows[1]?.run, rows[1]?.app], ['dismissed', run, 'cursor']);
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
