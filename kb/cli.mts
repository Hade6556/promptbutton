/// <reference types="node" />
// The knowledge-base tool.
//
//   npm run kb -- init                 create kb/kb.db and load the seed rows
//   npm run kb -- fetch [source-id]    download allowlisted pages (robots.txt and crawl-delay respected)
//   npm run kb -- extract [source-id]  read fetched pages into claims (calls the Claude API)
//   npm run kb -- verify               re-check stored quotes against the fetched pages
//   npm run kb -- review               list candidates and quarantined claims
//   npm run kb -- approve <slug…>      make candidates active (a person does this)
//   npm run kb -- retire <slug> <why>  retire a technique, keeping the reason
//   npm run kb -- lift <slug> <points> record a measured change in win rate for a technique
//   npm run kb -- pull                 download outcomes the app reported (needs PMP_ADMIN_TOKEN)
//   npm run kb -- learn                measured lift per technique from the holdout; retires what hurts
//   npm run kb -- stale <family>       send one model family's techniques back to review
//   npm run kb -- compile              write src/llm/kb.generated.ts and site/sources.html
//   npm run kb -- refresh              fetch, extract what changed, verify, pull and learn, retire, compile
//   npm run kb -- status
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DOMAINS } from '../src/llm/domains';
import { extractClaims } from './extract.mts';
import {
  CACHE_DIR, INJECT_FLOOR, KB_DIR, MIN_SAMPLE, htmlToText, liftFromOutcomes, ingestClaims, loadSources, openKb, parseRobots, quoteHolds, recompute, robotsAllow, today,
  type Robots, type Source,
} from './lib.mts';
import { EXTRA_REFS, SEED } from './seed-data.mts';

const ROOT = path.join(KB_DIR, '..');
const db = openKb();
const { userAgent, sources } = loadSources();
const [command = 'status', ...args] = process.argv.slice(2);
const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = (value: unknown) => JSON.stringify(value);
const pick = (id?: string) => {
  const list = id ? sources.filter((s) => s.id === id) : sources;
  if (list.length === 0) throw new Error(`No source "${id}" in kb/sources.json`);
  return list;
};

// ── init ──────────────────────────────────────────────────────────────────────────────────────
function init() {
  const insertTechnique = db.prepare(
    `INSERT OR IGNORE INTO technique (slug, instruction, domains, scales, models, avoid_when, applied_in, status, reviewed_by, reviewed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'seed: docs/master-prompt-playbook.md', ?, ?)`,
  );
  const idOf = db.prepare('SELECT id FROM technique WHERE slug = ?');
  const insertEvidence = db.prepare(
    `INSERT OR IGNORE INTO evidence (technique_id, source_id, source_url, source_title, publisher, source_type, quote, effect, stance, verified, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'hand_entered', ?)`,
  );
  let added = 0;
  for (const t of SEED) {
    added += Number(insertTechnique.run(t.slug, t.instruction, json(t.domains ?? ['*']), json(t.scales ?? ['*']), json(t.models ?? ['*']), t.avoidWhen ?? null, t.appliedIn ?? 'injected', now(), now()).changes);
    const { id } = idOf.get(t.slug) as { id: number };
    for (const e of t.evidence) {
      const listed = sources.find((s) => s.id === e.ref);
      const ref = listed ? { url: listed.url, title: listed.title, publisher: listed.publisher, type: listed.type, published: listed.published } : EXTRA_REFS[e.ref];
      if (!ref) throw new Error(`Seed "${t.slug}" cites unknown source "${e.ref}"`);
      insertEvidence.run(id, e.ref, ref.url, ref.title, ref.publisher, ref.type, e.quote ?? null, e.effect ?? null, e.stance ?? 'supports', ref.published);
    }
  }
  recompute(db);
  console.log(`Seeded ${added} new techniques (${SEED.length} in the seed file).`);
}

// ── fetch ─────────────────────────────────────────────────────────────────────────────────────
const robotsCache = new Map<string, Robots>();
const lastHit = new Map<string, number>();

async function robotsFor(origin: string): Promise<Robots> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;
  let robots: Robots = { disallow: [], allow: [], crawlDelay: 0 };
  try {
    const response = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': userAgent }, redirect: 'follow' });
    if (response.ok) robots = parseRobots(await response.text());
  } catch { /* no robots file reachable: nothing is disallowed, and the delay below still applies */ }
  robotsCache.set(origin, robots);
  return robots;
}

const cacheFile = (id: string) => path.join(CACHE_DIR, `${id}.txt`);

async function fetchSource(source: Source): Promise<'changed' | 'same' | 'skipped'> {
  const url = new URL(source.fetch ?? source.url);
  const robots = await robotsFor(url.origin);
  if (!robotsAllow(robots, url.pathname)) {
    console.log(`  ${source.id}: robots.txt disallows ${url.pathname}; skipped`);
    return 'skipped';
  }
  const wait = Math.max(robots.crawlDelay, 2) * 1000 - (Date.now() - (lastHit.get(url.origin) ?? 0));
  if (wait > 0) await sleep(wait);
  lastHit.set(url.origin, Date.now());
  const response = await fetch(url, { headers: { 'user-agent': userAgent, accept: 'text/markdown, text/plain, text/html' }, redirect: 'follow' });
  if (!response.ok) {
    console.log(`  ${source.id}: HTTP ${response.status}; skipped`);
    return 'skipped';
  }
  const body = await response.text();
  const text = /html/i.test(response.headers.get('content-type') ?? '') ? htmlToText(body) : body;
  const hash = createHash('sha256').update(text).digest('hex');
  const before = db.prepare('SELECT content_hash FROM fetch_log WHERE source_id = ?').get(source.id) as { content_hash: string } | undefined;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile(source.id), text);
  db.prepare(
    `INSERT INTO fetch_log (source_id, url, fetched_at, content_hash, chars) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET url = excluded.url, fetched_at = excluded.fetched_at, content_hash = excluded.content_hash, chars = excluded.chars`,
  ).run(source.id, url.href, now(), hash, text.length);
  const changed = before?.content_hash !== hash;
  console.log(`  ${source.id}: ${text.length.toLocaleString('en-US')} characters${changed ? '' : ' (unchanged)'}`);
  return changed ? 'changed' : 'same';
}

async function fetchAll(id?: string) {
  for (const source of pick(id)) await fetchSource(source);
}

// ── extract ───────────────────────────────────────────────────────────────────────────────────
async function extractAll(id?: string, onlyChanged = false) {
  const client = new Anthropic();
  for (const source of pick(id)) {
    const log = db.prepare('SELECT content_hash, extracted_hash FROM fetch_log WHERE source_id = ?').get(source.id) as { content_hash: string; extracted_hash: string | null } | undefined;
    if (!log || !fs.existsSync(cacheFile(source.id))) { console.log(`  ${source.id}: not fetched yet`); continue; }
    if (onlyChanged && log.extracted_hash === log.content_hash) continue;
    const page = fs.readFileSync(cacheFile(source.id), 'utf8');
    const known = db.prepare("SELECT slug, instruction FROM technique WHERE status != 'retired'").all() as Array<{ slug: string; instruction: string }>;
    const claims = await extractClaims(client, source, page, known);
    const result = ingestClaims(db, source, page, log.content_hash, claims, DOMAINS);
    db.prepare('UPDATE fetch_log SET extracted_hash = ? WHERE source_id = ?').run(log.content_hash, source.id);
    console.log(`  ${source.id}: ${claims.length} claims → ${result.added.length} new candidates, ${result.supported.length} added to existing, ${result.quarantined.length} quarantined`);
    for (const q of result.quarantined) console.log(`      quarantined: "${q.claim}" (${q.reason})`);
  }
  recompute(db);
}

// ── verify ────────────────────────────────────────────────────────────────────────────────────
/** Re-checks every stored quote against the page it is attributed to. A quote that no longer matches is removed, never kept on trust. */
function verify() {
  const rows = db.prepare("SELECT e.id, e.source_id, e.quote, t.slug FROM evidence e JOIN technique t ON t.id = e.technique_id WHERE e.quote IS NOT NULL").all() as Array<{ id: number; source_id: string; quote: string; slug: string }>;
  let matched = 0;
  for (const row of rows) {
    if (!fs.existsSync(cacheFile(row.source_id))) continue;
    if (quoteHolds(row.quote, fs.readFileSync(cacheFile(row.source_id), 'utf8'))) {
      db.prepare("UPDATE evidence SET verified = 'quote_matched' WHERE id = ?").run(row.id);
      matched++;
    } else {
      db.prepare("UPDATE evidence SET quote = NULL, verified = 'quote_removed' WHERE id = ?").run(row.id);
      console.log(`  ${row.slug}: quote not found on ${row.source_id}; removed the quote`);
    }
  }
  console.log(`  ${matched} of ${rows.length} quotes match their page`);
}

// ── review, approve, retire ───────────────────────────────────────────────────────────────────
function review() {
  const candidates = db.prepare("SELECT id, slug, instruction, domains, models, confidence FROM technique WHERE status = 'candidate' ORDER BY confidence DESC, slug").all() as Array<Record<string, string | number>>;
  console.log(`${candidates.length} candidates waiting for a person:\n`);
  for (const c of candidates) {
    console.log(`${c.slug}   confidence ${c.confidence}   domains ${c.domains}   models ${c.models}\n  ${c.instruction}`);
    for (const e of db.prepare('SELECT publisher, source_title, quote, effect, stance FROM evidence WHERE technique_id = ?').all(c.id as number) as Array<Record<string, string | null>>) {
      console.log(`    ${e.stance === 'contradicts' ? '✗' : '✓'} ${e.publisher}, ${e.source_title}${e.quote ? `: "${e.quote}"` : ''}${e.effect ? ` [${e.effect}]` : ''}`);
    }
    console.log('');
  }
  const held = db.prepare('SELECT source_id, reason, claim FROM quarantine ORDER BY id DESC LIMIT 20').all() as Array<Record<string, string>>;
  if (held.length) console.log(`Quarantined (latest ${held.length}):`);
  for (const q of held) console.log(`  ${q.source_id}: ${q.reason}`);
  console.log('\nApprove with: npm run kb -- approve <slug> [<slug>…]   then: npm run kb -- compile');
}

function approve(slugs: string[]) {
  if (slugs.length === 0) throw new Error('Name the slugs to approve.');
  const who = process.env.KB_REVIEWER ?? os.userInfo().username;
  const update = db.prepare("UPDATE technique SET status = 'active', reviewed_by = ?, reviewed_at = ?, retired_reason = NULL WHERE slug = ? AND status = 'candidate'");
  for (const slug of slugs) console.log(`  ${slug}: ${update.run(who, now(), slug).changes ? 'active' : 'not a candidate'}`);
  recompute(db);
}

function retire(slug?: string, reason?: string) {
  if (!slug || !reason) throw new Error('Usage: retire <slug> <reason>');
  const changes = db.prepare("UPDATE technique SET status = 'retired', retired_reason = ? WHERE slug = ?").run(reason, slug).changes;
  console.log(changes ? `  ${slug}: retired (${reason})` : `  ${slug}: not found`);
}

function lift(slug?: string, points?: string) {
  if (!slug || points === undefined || Number.isNaN(Number(points))) throw new Error('Usage: lift <slug> <percentage points>');
  db.prepare('UPDATE technique SET measured_lift = ? WHERE slug = ?').run(Number(points), slug);
  const { retired } = recompute(db);
  console.log(`  ${slug}: measured lift ${points} points${retired.includes(slug) ? '; retired' : ''}`);
}

// ── learn from use ────────────────────────────────────────────────────────────────────────────
/** Downloads what the app has reported since the last pull. Needs PMP_ADMIN_TOKEN (the same value as on the server). */
async function pull() {
  const token = process.env.PMP_ADMIN_TOKEN;
  if (!token) throw new Error('Set PMP_ADMIN_TOKEN (in .env) to the value configured on the server.');
  const base = (process.env.PMP_API_BASE ?? 'https://firstry.ai/api').replace(/\/$/, '');
  const since = (db.prepare("SELECT value FROM meta WHERE key = 'pulled_until'").get() as { value: string } | undefined)?.value ?? '1970-01-01';
  const response = await fetch(`${base}/admin/feedback?since=${encodeURIComponent(since)}`, { headers: { 'x-admin-token': token } });
  if (!response.ok) throw new Error(`The server answered ${response.status}. Is PMP_ADMIN_TOKEN set there too, and the server deployed?`);
  const data = (await response.json()) as { outcomes: Array<{ signal: string; techniques: string; held_out: string | null; domain: string; at: string }>; pairs: unknown[] };
  const insert = db.prepare('INSERT INTO outcome (technique_ids, held_out, domain, signal, at) VALUES (?, ?, ?, ?, ?)');
  let until = since;
  for (const o of data.outcomes) {
    insert.run(o.techniques, o.held_out, o.domain, o.signal, o.at);
    if (o.at > until) until = o.at;
  }
  db.prepare("INSERT INTO meta (key, value) VALUES ('pulled_until', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(until);
  if (data.pairs.length) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const file = path.join(CACHE_DIR, `pairs-${today()}.json`);
    fs.writeFileSync(file, JSON.stringify(data.pairs, null, 2));
    console.log(`  ${data.pairs.length} shared before/after pairs → ${path.relative(ROOT, file)} (ignored by git; turn the good ones into eval cases by adding the intent)`);
  }
  console.log(`  ${data.outcomes.length} new outcomes`);
}

/** Turns the holdout data into a measured lift per technique. A technique that costs 5 points or more is retired. */
function learn() {
  const rows = (db.prepare('SELECT signal, technique_ids, held_out FROM outcome').all() as Array<{ signal: string; technique_ids: string; held_out: string | null }>)
    .map((r) => ({ signal: r.signal, techniques: JSON.parse(r.technique_ids) as string[], heldOut: r.held_out }));
  const lifts = liftFromOutcomes(rows);
  const set = db.prepare('UPDATE technique SET measured_lift = ? WHERE slug = ?');
  for (const lift of lifts) {
    const side = (s: { n: number; bad: number }) => `${s.n - Math.min(s.bad, s.n)}/${s.n} kept`;
    console.log(`  ${lift.slug.padEnd(40)} with ${side(lift.withIt).padEnd(14)} without ${side(lift.without).padEnd(14)} ${lift.points === null ? `needs ${MIN_SAMPLE} on each side` : `${lift.points > 0 ? '+' : ''}${lift.points} points`}`);
    if (lift.points !== null) set.run(lift.points, lift.slug);
  }
  if (lifts.length === 0) console.log('  No outcomes yet. Run: npm run kb -- pull');
  const { retired } = recompute(db);
  if (retired.length) console.log(`  Retired: ${retired.join(', ')}`);
}

/** A new model in a family: advice written for the old one goes back to a person before it is used again. */
function stale(family?: string) {
  if (!family || !['claude', 'gpt', 'gemini'].includes(family)) throw new Error('Usage: stale <claude|gpt|gemini>');
  const rows = db.prepare("SELECT slug FROM technique WHERE status = 'active' AND models LIKE ?").all(`%"${family}"%`) as Array<{ slug: string }>;
  db.prepare("UPDATE technique SET status = 'candidate', reviewed_by = NULL, reviewed_at = NULL WHERE status = 'active' AND models LIKE ?").run(`%"${family}"%`);
  console.log(rows.length ? `  Back to review: ${rows.map((r) => r.slug).join(', ')}` : `  No active technique is specific to ${family}.`);
}

// ── compile ───────────────────────────────────────────────────────────────────────────────────
interface Row {
  id: number; slug: string; instruction: string; domains: string; scales: string; models: string; avoid_when: string | null;
  applied_in: string; confidence: number; status: string; retired_reason: string | null; measured_lift: number | null;
}
interface Ev { publisher: string; source_title: string; source_url: string; source_type: string; quote: string | null; effect: string | null; stance: string; verified: string }

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STRENGTH = (c: number) => (c >= 0.75 ? 'Strong' : c >= 0.55 ? 'Good' : 'Limited');
const TYPE_LABEL: Record<string, string> = { own_eval: 'our own test', paper: 'research paper', vendor_doc: 'vendor guide', community: 'community', own_playbook: 'house rule' };

function compile() {
  const rows = db.prepare('SELECT * FROM technique ORDER BY applied_in, slug').all() as unknown as Row[];
  const evidenceQuery = db.prepare('SELECT publisher, source_title, source_url, source_type, quote, effect, stance, verified FROM evidence WHERE technique_id = ? ORDER BY stance DESC, source_type');
  const evidenceOf = (id: number) => evidenceQuery.all(id) as unknown as Ev[];
  const active = rows.filter((r) => r.status === 'active' && r.confidence >= INJECT_FLOOR);

  const entries = active.map((r) => ({
    id: r.slug,
    instruction: r.instruction,
    domains: JSON.parse(r.domains) as string[],
    scales: JSON.parse(r.scales) as string[],
    models: JSON.parse(r.models) as string[],
    appliedIn: r.applied_in,
    confidence: r.confidence,
    sources: evidenceOf(r.id).filter((e) => e.stance === 'supports').map((e) => ({ title: `${e.publisher}: ${e.source_title}`, url: e.source_url })),
  }));
  const generated = `// Generated by \`npm run kb -- compile\` from kb/kb.db. Do not edit: change the knowledge base and compile again.
import type { KbTechnique } from './kb';

export const KB_VERSION = '${today()}';

export const KB: KbTechnique[] = ${JSON.stringify(entries, null, 2)};
`;
  fs.writeFileSync(path.join(ROOT, 'src/llm/kb.generated.ts'), generated);

  const item = (r: Row) => {
    const evidence = evidenceOf(r.id);
    const lines = evidence
      .map((e) => `<li>${e.stance === 'contradicts' ? '<strong>Against:</strong> ' : ''}<a href="${escapeHtml(e.source_url)}">${escapeHtml(e.publisher)}, <em>${escapeHtml(e.source_title)}</em></a> (${TYPE_LABEL[e.source_type] ?? e.source_type})${e.effect ? `. ${escapeHtml(e.effect)}` : ''}${e.quote ? ` <q>${escapeHtml(e.quote)}</q>` : ''}</li>`)
      .join('\n');
    const where = [JSON.parse(r.domains).join(', ').replace('*', 'any task'), JSON.parse(r.models).join(', ').replace('*', 'any model')].join(' · ');
    return `<article id="${r.slug}">
<h3>${escapeHtml(r.instruction)}</h3>
<p class="updated">${r.status === 'retired' ? `Retired: ${escapeHtml(r.retired_reason ?? '')}` : `Evidence: ${STRENGTH(r.confidence)} (${r.confidence.toFixed(2)})`} · ${escapeHtml(where)}${r.avoid_when ? ` · Not for: ${escapeHtml(r.avoid_when)}` : ''}${typeof r.measured_lift === 'number' ? ` · Measured in our test: ${r.measured_lift > 0 ? '+' : ''}${r.measured_lift} points` : ''}</p>
<ul>
${lines}
</ul>
</article>`;
  };
  const injected = active.filter((r) => r.applied_in === 'injected');
  const structural = active.filter((r) => r.applied_in === 'system_prompt');
  const retired = rows.filter((r) => r.status === 'retired');
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sources · First Try</title>
<meta name="description" content="Every prompting technique First Try applies, the evidence for it and where that evidence comes from." />
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/assets/doc.css" />
</head>
<body>
<header><a href="/"><img src="/assets/logo.svg" alt="" />First Try</a></header>
<main>
<h1>Sources</h1>
<p class="updated">Knowledge base of ${today()} · ${active.length} techniques in use · ${retired.length} retired</p>

<p>When First Try rewrites your draft it applies the techniques on this page and no others. Each one lists where it comes from. The score is a formula, not an opinion: it starts from the strongest source (our own tests 0.90, a research paper 0.70, a vendor's guide 0.60, a house rule 0.45, a community source 0.30), rises by 0.10 for each further independent publisher, falls by 0.20 for each source that contradicts it, and is not used below ${INJECT_FLOOR.toFixed(2)}.</p>
<p>We keep findings in our own words with a short quotation and a link. We do not copy source documents.</p>

<h2>Wording added for the kind of task</h2>
${injected.map(item).join('\n')}

<h2>Rules built into every rewrite</h2>
${structural.map(item).join('\n')}

<h2 id="house-rules">House rules</h2>
<p>Entries marked "house rule" come from our own practice and have no outside source yet. They carry the lowest score that is still used, and they are the first candidates for testing.</p>

<h2 id="our-eval">Our own test</h2>
<p>We send the same requests to an AI twice, once as typed and once rewritten, and a separate judge compares the two answers without knowing which is which. The current figures are on the <a href="/#proof">home page</a>.</p>

<h2>Retired</h2>
${retired.length ? retired.map(item).join('\n') : '<p>Nothing has been retired yet. When advice is contradicted, goes out of date or lowers results in our own test, it moves here with the reason.</p>'}
</main>
<footer><a href="/">Home</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><span>© 2026 First Try</span></footer>
</body>
</html>
`;
  fs.writeFileSync(path.join(ROOT, 'site/sources.html'), page);
  console.log(`Compiled ${entries.length} techniques (${injected.length} injected, ${structural.length} structural) → src/llm/kb.generated.ts, site/sources.html`);
}

function status() {
  const count = (where: string) => (db.prepare(`SELECT COUNT(*) AS n FROM technique WHERE ${where}`).get() as { n: number }).n;
  const evidence = (db.prepare('SELECT COUNT(*) AS n FROM evidence').get() as { n: number }).n;
  const fetched = (db.prepare('SELECT COUNT(*) AS n FROM fetch_log').get() as { n: number }).n;
  console.log(`Techniques: ${count("status = 'active'")} active, ${count("status = 'candidate'")} candidates, ${count("status = 'retired'")} retired`);
  console.log(`Evidence rows: ${evidence} · sources fetched: ${fetched} of ${sources.length} · quarantined claims: ${(db.prepare('SELECT COUNT(*) AS n FROM quarantine').get() as { n: number }).n}`);
  console.log(`Without an outside source: ${count("status = 'active' AND id NOT IN (SELECT technique_id FROM evidence WHERE source_type != 'own_playbook' AND stance = 'supports')")}`);
}

switch (command) {
  case 'init': init(); break;
  case 'fetch': await fetchAll(args[0]); break;
  case 'extract': await extractAll(args[0]); break;
  case 'verify': verify(); break;
  case 'review': review(); break;
  case 'approve': approve(args); break;
  case 'retire': retire(args[0], args.slice(1).join(' ')); break;
  case 'lift': lift(args[0], args[1]); break;
  case 'pull': await pull(); break;
  case 'learn': learn(); break;
  case 'stale': stale(args[0]); break;
  case 'compile': compile(); break;
  case 'refresh': {
    await fetchAll();
    await extractAll(undefined, true);
    verify();
    if (process.env.PMP_ADMIN_TOKEN) {
      await pull();
      learn();
    }
    const { retired } = recompute(db);
    if (retired.length) console.log(`Retired: ${retired.join(', ')}`);
    compile();
    break;
  }
  case 'status': status(); break;
  default: throw new Error(`Unknown command "${command}"`);
}
