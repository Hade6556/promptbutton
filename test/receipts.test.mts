import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { appKind, clean, createReceipts, periodCounts, qualifies, summarize, weekStart, type Receipt } from '../desktop/receipts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const run = (n: number, at: string, extra: Record<string, unknown> = {}) =>
  ({ v: 1, t: 'run', id: id(n), at, app: 'Claude', kind: 'claude', produced: 'prompt', asked: 0, changes: 0, ended: 'inserted', ...extra }) as Receipt;

test('a line keeps only the fixed fields: prompt text cannot get into the file', () => {
  const stored = clean({ ...run(1, '2026-11-18T10:00:00Z'), draft: 'my secret draft', text: 'the prompt', screenshot: 'data:image/png' });
  assert.ok(stored);
  const json = JSON.stringify(stored);
  for (const leak of ['secret draft', 'the prompt', 'data:image']) assert.ok(!json.includes(leak), leak);
  assert.deepEqual(Object.keys(stored).sort(), ['app', 'asked', 'at', 'changes', 'ended', 'id', 'kind', 'produced', 't', 'v']);
});

test('bad lines are refused: wrong kinds, a malformed id, unknown values', () => {
  assert.equal(clean({ ...run(1, '2026-11-18T10:00:00Z'), id: 'not-an-id' }), null);
  assert.equal(clean({ ...run(1, '2026-11-18T10:00:00Z'), produced: 'novel' }), null);
  assert.equal(clean({ ...run(1, 'yesterday') }), null);
  assert.equal(clean({ v: 1, t: 'rate', id: id(1), at: '2026-11-18T10:00:00Z' }), null);
  assert.equal((clean({ ...run(1, '2026-11-18T10:00:00Z'), kind: 'my-company-app' }) as { kind: string }).kind, 'other');
  const techniques = (clean({ ...run(1, '2026-11-18T10:00:00Z'), techniques: ['ok-slug', 'Not A Slug', 42] }) as { techniques: string[] }).techniques;
  assert.deepEqual(techniques, ['ok-slug']);
});

test('the app kind comes from the bundle id first, then the name, else "other"', () => {
  assert.equal(appKind('Claude', 'com.anthropic.claudefordesktop'), 'claude');
  assert.equal(appKind('ChatGPT', 'com.openai.chat'), 'chatgpt');
  assert.equal(appKind('Cursor', 'com.todesktop.230313mzl4w4u92'), 'cursor');
  assert.equal(appKind('Code', 'com.microsoft.VSCode'), 'vscode');
  assert.equal(appKind('iTerm2', 'com.googlecode.iterm2'), 'terminal');
  assert.equal(appKind('Google Chrome', 'com.google.Chrome'), 'browser');
  assert.equal(appKind('Acme Internal Tool', 'com.acme.tool'), 'other');
});

test('the file is append-only, survives a torn line, and is written for this user only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-'));
  const file = path.join(dir, 'receipts.jsonl');
  const store = createReceipts(() => file);
  assert.ok(store.add(run(1, '2026-11-18T10:00:00Z')));
  fs.appendFileSync(file, '{"v":1,"t":"run","id":"00000000');
  fs.appendFileSync(file, '\n');
  assert.ok(store.add({ v: 1, t: 'undo', id: id(1), at: '2026-11-18T10:01:00Z' }));
  assert.equal(store.read().length, 2);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  store.clear();
  assert.deepEqual(store.read(), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('weeks start on Monday', () => {
  const monday = weekStart(new Date(2026, 10, 18, 15, 0)); // Wednesday 18 November 2026
  assert.equal(monday.getDay(), 1);
  assert.equal(monday.getDate(), 16);
  assert.equal(weekStart(new Date(2026, 10, 22, 23, 0)).getDate(), 16); // Sunday stays in the same week
});

test('the summary counts presses, outcomes, undos and ratings per period and per app', () => {
  const now = new Date(2026, 10, 18, 12, 0);
  const local = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();
  const receipts: Receipt[] = [
    run(1, local(17)), // this week: inserted, rated better
    { v: 1, t: 'rate', id: id(1), at: local(17, 11), better: true },
    run(2, local(16), { ended: 'dismissed' }), // this week: closed
    run(3, local(12), { produced: 'already-good', ended: 'dismissed' }), // last week
    run(4, local(11), { app: 'Cursor', kind: 'cursor', ended: 'pasted', asked: 2 }), // last week: undone, so its rating does not count
    { v: 1, t: 'undo', id: id(4), at: local(11, 11) },
    { v: 1, t: 'rate', id: id(4), at: local(11, 12), better: false },
    run(5, local(1), { produced: 'tightened', ended: 'copied' }), // three weeks ago
    run(6, local(17), { reopened: true }), // shown again: a press, not a new prompt
    run(7, new Date(2026, 5, 1).toISOString(), { ended: 'error', produced: 'nothing' }), // months ago
  ];
  const s = summarize(receipts, now);
  const by = Object.fromEntries(s.periods.map((p) => [p.key, p.counts]));
  assert.equal(by.week!.presses, 3);
  assert.equal(by.week!.written, 2); // run 2 was written, then closed without being used
  assert.equal(by.week!.inserted, 2);
  assert.equal(by.week!.closed, 1);
  assert.deepEqual([by.week!.rated, by.week!.better], [1, 1]);
  assert.equal(by.lastWeek!.presses, 2);
  assert.equal(by.lastWeek!.alreadyGood, 1);
  assert.equal(by.lastWeek!.asked, 1);
  assert.equal(by.lastWeek!.undone, 1);
  assert.equal(by.lastWeek!.rated, 0);
  assert.equal(by.fourWeeks!.presses, 6);
  assert.equal(by.fourWeeks!.copied, 1);
  assert.equal(by.all!.presses, 7);
  assert.equal(by.all!.errors, 1);
  assert.deepEqual(s.apps.map((a) => [a.app, a.counts.presses]), [['Claude', 5], ['Cursor', 1]]);
  assert.equal(s.since, new Date(2026, 5, 1).toISOString());
});

test('apps beyond the first seven are added up as one row', () => {
  const now = new Date(2026, 10, 18, 12, 0);
  const receipts = Array.from({ length: 10 }, (_, i) => run(i + 1, new Date(2026, 10, 17, 10, i).toISOString(), { app: `App ${i}` }));
  const s = summarize(receipts, now);
  assert.equal(s.apps.length, 8);
  assert.equal(s.apps.at(-1)!.app, '3 other apps');
  assert.equal(s.apps.at(-1)!.counts.presses, 3);
});

test('blind picks are stored, counted per period, and an unknown pick is refused', () => {
  assert.equal(clean({ v: 1, t: 'blind', id: id(1), at: '2026-11-18T10:00:00Z', pick: 'maybe' }), null);
  const now = new Date(2026, 10, 18, 12, 0);
  const at = new Date(2026, 10, 17, 10).toISOString();
  const s = summarize([
    run(1, at), { v: 1, t: 'blind', id: id(1), at, pick: 'rewrite' },
    run(2, at), { v: 1, t: 'blind', id: id(2), at, pick: 'original' },
    run(3, at), { v: 1, t: 'blind', id: id(3), at, pick: 'same' },
  ], now);
  const week = s.periods[0]!.counts;
  assert.deepEqual([week.blind, week.blindRewrite, week.blindOriginal, week.blindSame], [3, 1, 1, 1]);
});

test('money back: kept, judged and better for a billing period, and the rule', () => {
  const t = (day: number) => new Date(Date.UTC(2026, 10, day, 12)).toISOString();
  const from = Date.UTC(2026, 10, 10) / 1000, to = Date.UTC(2026, 11, 10) / 1000;
  const receipts: Receipt[] = [
    run(1, t(12)), // kept, rated better
    { v: 1, t: 'rate', id: id(1), at: t(12), better: true },
    run(2, t(13)), // kept, then undone: neither kept nor judged
    { v: 1, t: 'undo', id: id(2), at: t(13) },
    { v: 1, t: 'rate', id: id(2), at: t(13), better: false },
    run(3, t(14), { ended: 'pasted' }), // kept (pasted counts), blind pick for the draft
    { v: 1, t: 'blind', id: id(3), at: t(14), pick: 'original' },
    run(4, t(15), { produced: 'replies' }), // a suggested reply is not a prompt First Try wrote
    run(5, t(15), { ended: 'dismissed' }), // shown and closed: not kept, but judged blind
    { v: 1, t: 'blind', id: id(5), at: t(15), pick: 'same' },
    run(6, t(5)), // before the period
  ];
  const c = periodCounts(receipts, from, to);
  assert.deepEqual(c, { kept: 2, judged: 3, better: 1 });
  assert.equal(qualifies(c), true); // 1 of 3 judged better: fewer than half
  assert.equal(qualifies({ kept: 2, judged: 2, better: 0 }), false); // too few judged
  assert.equal(qualifies({ kept: 0, judged: 0, better: 0 }), true); // nothing kept
  assert.equal(qualifies({ kept: 5, judged: 4, better: 2 }), false); // exactly half is not fewer than half
});

test('only a strict ISO time is accepted, so no text can travel in the time field', () => {
  assert.equal(clean({ v: 1, t: 'undo', id: id(1), at: 'Call Dr Smith on 5 May 2024' }), null);
  assert.equal(clean({ v: 1, t: 'undo', id: id(1), at: 'secret 1' }), null);
  assert.equal((clean({ v: 1, t: 'undo', id: id(1), at: '2026-11-18T10:00:00Z' }) as { at: string }).at, '2026-11-18T10:00:00.000Z');
});

test('week boundaries hold across a clock change', () => {
  // The clocks went back on Sunday 25 October 2026 in Europe; a press early on Monday 19 October is "Last week" seen on Wednesday 28th.
  const now = new Date(2026, 9, 28, 12, 0);
  const s = summarize([run(1, new Date(2026, 9, 19, 0, 30).toISOString())], now);
  assert.equal(s.periods[1]!.counts.presses, 1);
});
