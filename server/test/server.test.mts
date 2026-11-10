// End to end against local stand-ins for Anthropic and Stripe: no network, no money spent.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';

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

let base = '';
let server: http.Server;
const logs: string[] = [];
const WHSEC = 'whsec_test_secret';

before(async () => {
  const aPort = await listen(anthropic);
  const sPort = await listen(stripeApi);
  Object.assign(process.env, {
    ANTHROPIC_API_KEY: 'server-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${aPort}`,
    CODE_SECRET: 'x'.repeat(40), MAIL_LOG_CODES: '1', TRIAL_MICROS: '30000', PRO_MICROS: '100000',
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
after(() => { server.close(); anthropic.close(); stripeApi.close(); });

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
  assert.equal(a.canManage, true);
  const client = new Anthropic({ apiKey: null, authToken: token, baseURL: base, maxRetries: 0 });
  await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] });
});

test('signing out revokes the token', async () => {
  assert.equal((await post('/auth/signout', {}, token)).status, 200);
  assert.equal((await fetch(`${base}/account`, { headers: { authorization: `Bearer ${token}` } })).status, 401);
});
