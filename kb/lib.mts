/// <reference types="node" />
// The knowledge base behind the rewrite: techniques, the evidence for each, and the rules that decide
// whether a technique is trusted enough to reach a prompt. Build-time only: the app never opens this
// database. `kb compile` turns the active rows into src/llm/kb.generated.ts, which the app bundles.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.KB_DB ?? path.join(KB_DIR, 'kb.db');
export const CACHE_DIR = path.join(KB_DIR, 'cache');

export type SourceType = 'own_eval' | 'paper' | 'vendor_doc' | 'community' | 'own_playbook';
export type Stance = 'supports' | 'contradicts';
export type Status = 'candidate' | 'active' | 'retired';
/** `injected` lines go into the rewrite's user turn; `system_prompt` rules are built into the rewriter and listed for traceability. */
export type AppliedIn = 'injected' | 'system_prompt';

export interface Source {
  id: string;
  publisher: string;
  title: string;
  type: SourceType;
  models: string[];
  url: string;
  /** A plain-text or Markdown address for the same page, when the site offers one. */
  fetch?: string;
  licence: string;
  published: string;
}

export function loadSources(): { userAgent: string; sources: Source[] } {
  return JSON.parse(fs.readFileSync(path.join(KB_DIR, 'sources.json'), 'utf8'));
}

/** Columns added after the first release of each table. */
const MIGRATIONS: Record<string, Record<string, string>> = {
  outcome: { held_out: 'TEXT', run: 'TEXT', app: 'TEXT' },
  technique: {
    lab_lift: 'REAL', lift_points: 'REAL', lift_low: 'REAL', lift_high: 'REAL', lift_kept_with: 'INTEGER', lift_n_with: 'INTEGER',
    lift_kept_without: 'INTEGER', lift_n_without: 'INTEGER', lift_verdict: 'TEXT', lift_retire: 'INTEGER', lift_checked: 'INTEGER',
  },
};

export function openKb(file = DB_PATH): DatabaseSync {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS technique (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      instruction TEXT NOT NULL,
      domains TEXT NOT NULL DEFAULT '["*"]',
      modes TEXT NOT NULL DEFAULT '["*"]',
      scales TEXT NOT NULL DEFAULT '["*"]',
      models TEXT NOT NULL DEFAULT '["*"]',
      avoid_when TEXT,
      applied_in TEXT NOT NULL DEFAULT 'injected',
      confidence REAL NOT NULL DEFAULT 0,
      measured_lift REAL,
      lab_lift REAL,
      lift_points REAL,
      lift_low REAL,
      lift_high REAL,
      lift_kept_with INTEGER,
      lift_n_with INTEGER,
      lift_kept_without INTEGER,
      lift_n_without INTEGER,
      lift_verdict TEXT,
      status TEXT NOT NULL DEFAULT 'candidate',
      retired_reason TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS evidence (
      id INTEGER PRIMARY KEY,
      technique_id INTEGER NOT NULL REFERENCES technique(id) ON DELETE CASCADE,
      source_id TEXT,
      source_url TEXT NOT NULL,
      source_title TEXT NOT NULL,
      publisher TEXT NOT NULL,
      source_type TEXT NOT NULL,
      quote TEXT,
      effect TEXT,
      stance TEXT NOT NULL DEFAULT 'supports',
      verified TEXT NOT NULL,
      published_at TEXT,
      fetched_at TEXT,
      content_hash TEXT,
      UNIQUE (technique_id, source_url, stance)
    );
    CREATE TABLE IF NOT EXISTS fetch_log (
      source_id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      extracted_hash TEXT,
      chars INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quarantine (
      id INTEGER PRIMARY KEY,
      source_id TEXT NOT NULL,
      claim TEXT NOT NULL,
      reason TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS outcome (
      id INTEGER PRIMARY KEY,
      technique_ids TEXT NOT NULL,
      held_out TEXT,
      domain TEXT NOT NULL,
      signal TEXT NOT NULL,
      run TEXT,
      app TEXT,
      at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  // Databases made before these columns existed get them on open; old rows keep null in each.
  for (const [table, added] of Object.entries(MIGRATIONS)) {
    const columns = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name));
    for (const [column, type] of Object.entries(added)) {
      if (columns.has(column)) continue;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      // Before lab_lift existed, `kb lift` wrote lab results into measured_lift: keep them as lab figures.
      if (table === 'technique' && column === 'lab_lift') db.exec('UPDATE technique SET lab_lift = measured_lift WHERE measured_lift IS NOT NULL');
    }
  }
  return db;
}

// ── Confidence ────────────────────────────────────────────────────────────────────────────────
// A formula, so two people looking at the same evidence get the same number.

export const BASE: Record<SourceType, number> = { own_eval: 0.9, paper: 0.7, vendor_doc: 0.6, own_playbook: 0.45, community: 0.3 };
/** Below this a technique is not injected. */
export const INJECT_FLOOR = 0.4;

export interface EvidenceRow {
  source_type: SourceType;
  publisher: string;
  stance: Stance;
  published_at: string | null;
}

export function computeConfidence(
  evidence: EvidenceRow[],
  options: { modelSpecific?: boolean; measuredLift?: number | null; now?: Date } = {},
): number {
  const supports = evidence.filter((e) => e.stance === 'supports');
  if (supports.length === 0) return 0;
  let score = Math.max(...supports.map((e) => BASE[e.source_type] ?? 0.3));
  const publishers = new Set(supports.map((e) => e.publisher));
  score += Math.min(0.2, 0.1 * (publishers.size - 1));
  score -= 0.2 * evidence.filter((e) => e.stance === 'contradicts').length;
  if (options.modelSpecific) {
    // Advice about one model family ages with that family: after 12 months without fresh support it is worth less.
    const now = options.now ?? new Date();
    const newest = Math.max(...supports.map((e) => Date.parse((e.published_at ?? '').padEnd(7, '-01').slice(0, 7) + '-01') || 0));
    if (now.getTime() - newest > 365 * 864e5) score *= 0.8;
  }
  if (typeof options.measuredLift === 'number') score += Math.max(-0.2, Math.min(0.2, options.measuredLift / 100));
  return Math.round(Math.max(0, Math.min(0.95, score)) * 100) / 100;
}

interface TechniqueState {
  id: number;
  slug: string;
  models: string;
  measured_lift: number | null;
  status: Status;
  lift_verdict: Verdict | null;
  lift_points: number | null;
  lift_low: number | null;
  lift_high: number | null;
  lift_n_with: number | null;
  lift_n_without: number | null;
  lift_retire: number | null;
}

/**
 * Sets every confidence from its evidence and retires active techniques that are contradicted, out of
 * date or measured to hurt. A measurement retires a technique only when the whole 95% interval of its
 * effect on real prompts is below zero: a point estimate alone, from the field or the lab, never does.
 */
export function recompute(db: DatabaseSync, now = new Date()): { retired: string[] } {
  const retired: string[] = [];
  const techniques = db.prepare(
    'SELECT id, slug, models, measured_lift, status, lift_verdict, lift_points, lift_low, lift_high, lift_n_with, lift_n_without, lift_retire FROM technique',
  ).all() as unknown as TechniqueState[];
  const evidenceOf = db.prepare('SELECT source_type, publisher, stance, published_at FROM evidence WHERE technique_id = ?');
  const setConfidence = db.prepare('UPDATE technique SET confidence = ? WHERE id = ?');
  const retire = db.prepare("UPDATE technique SET status = 'retired', retired_reason = ? WHERE id = ?");
  for (const t of techniques) {
    const evidence = evidenceOf.all(t.id) as unknown as EvidenceRow[];
    const modelSpecific = !t.models.includes('"*"');
    const confidence = computeConfidence(evidence, { modelSpecific, measuredLift: t.measured_lift, now });
    setConfidence.run(confidence, t.id);
    if (t.status !== 'active') continue;
    if (t.lift_retire === 1) {
      const less = (v: number | null) => Math.abs(v ?? 0);
      retire.run(
        `Measured on real prompts: rewrites with it were kept ${less(t.lift_points)} points less often (95% interval: ${less(t.lift_high)} to ${less(t.lift_low)} points less; ${t.lift_n_with} put into an app with it, ${t.lift_n_without} without), and still below zero at 99% with at least ${RETIRE_SAMPLE} on each side`,
        t.id,
      );
      retired.push(t.slug);
      continue;
    }
    // A measurement moves the score shown on the Sources page, but whether advice is still trusted enough to
    // use is decided by its sources alone: a figure retires a technique only through the stricter test above.
    const fromSources = computeConfidence(evidence, { modelSpecific, now });
    if (fromSources < INJECT_FLOOR) {
      retire.run(`Confidence fell to ${fromSources}: contradicted or out of date`, t.id);
      retired.push(t.slug);
    }
  }
  return { retired };
}

// ── Checks on anything that came from a fetched page ───────────────────────────────────────────

export const normalise = (text: string) => text.toLowerCase().replace(/[*_`#>"“”‘’'\[\]()]/g, '').replace(/\s+/g, ' ').trim();

/** A quote counts only if it is short and appears word for word in the page it is attributed to. */
export function quoteHolds(quote: string, page: string): boolean {
  const q = normalise(quote);
  if (!q || q.split(' ').length > 25) return false;
  return normalise(page).includes(q);
}

const INJECTION = [
  /ignore (all |any |the )?(previous|prior|above|earlier)/i,
  /disregard (all |any |the )?(previous|prior|above|earlier)/i,
  /system prompt/i,
  /you are now/i,
  /<\/?[a-z_]+[^>]*>/i,
  /https?:\/\//i,
  /\b(api[ _-]?key|password|secret|token)\b/i,
  /\b(curl|wget|eval|exec)\b/i,
];

/** Why an extracted instruction may not enter the store, or null when it may. */
export function instructionProblem(instruction: string): string | null {
  const text = instruction.trim();
  if (text.length < 12) return 'too short to be advice';
  if (text.length > 320) return 'longer than 320 characters';
  if (text.split(/\s+/).length > 45) return 'longer than 45 words';
  const hit = INJECTION.find((re) => re.test(text));
  return hit ? `matches the injection filter ${hit}` : null;
}

export const slugify = (text: string) =>
  text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 7).join('-');

// ── Fetching politely ─────────────────────────────────────────────────────────────────────────

export interface Robots {
  disallow: string[];
  allow: string[];
  crawlDelay: number;
}

/** The rules for `User-agent: *` (the only group this crawler claims). */
export function parseRobots(text: string): Robots {
  const robots: Robots = { disallow: [], allow: [], crawlDelay: 0 };
  let applies = false;
  let inAgents = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (key === 'user-agent') {
      if (!inAgents) applies = false;
      inAgents = true;
      if (value === '*') applies = true;
      continue;
    }
    inAgents = false;
    if (!applies) continue;
    if (key === 'disallow' && value) robots.disallow.push(value);
    else if (key === 'allow' && value) robots.allow.push(value);
    else if (key === 'crawl-delay') robots.crawlDelay = Number(value) || 0;
  }
  return robots;
}

const ruleMatches = (rule: string, pathname: string) => {
  const pattern = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
  return new RegExp(`^${pattern}`).test(pathname);
};

/** Longest matching rule wins; allow wins a tie. */
export function robotsAllow(robots: Robots, pathname: string): boolean {
  const longest = (rules: string[]) => Math.max(-1, ...rules.filter((r) => ruleMatches(r, pathname)).map((r) => r.length));
  return longest(robots.allow) >= longest(robots.disallow);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head|nav|footer)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

export const today = () => new Date().toISOString().slice(0, 10);

// ── Storing what an extraction returned ───────────────────────────────────────────────────────

export interface IncomingClaim {
  existing_slug: string | null;
  instruction: string;
  domains: string[];
  scales: string[];
  avoid_when: string | null;
  quote: string;
  effect: string | null;
  stance: Stance;
}

export interface IngestResult {
  added: string[];
  supported: string[];
  quarantined: Array<{ claim: string; reason: string }>;
}

/** Every claim passes the same gate: safe wording, a quote that is really on the page, a known domain. New advice enters as a candidate, never as active. */
export function ingestClaims(
  db: DatabaseSync,
  source: Source,
  page: string,
  hash: string,
  claims: IncomingClaim[],
  validDomains: readonly string[],
  at = new Date().toISOString(),
): IngestResult {
  const result: IngestResult = { added: [], supported: [], quarantined: [] };
  const bySlug = db.prepare('SELECT id, slug FROM technique WHERE slug = ?');
  const insertTechnique = db.prepare(
    "INSERT INTO technique (slug, instruction, domains, scales, models, avoid_when, applied_in, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'injected', 'candidate', ?)",
  );
  const insertEvidence = db.prepare(
    `INSERT OR IGNORE INTO evidence (technique_id, source_id, source_url, source_title, publisher, source_type, quote, effect, stance, verified, published_at, fetched_at, content_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'quote_matched', ?, ?, ?)`,
  );
  const quarantine = db.prepare('INSERT INTO quarantine (source_id, claim, reason, at) VALUES (?, ?, ?, ?)');
  const reject = (claim: IncomingClaim, reason: string) => {
    quarantine.run(source.id, JSON.stringify(claim).slice(0, 2000), reason, at);
    result.quarantined.push({ claim: claim.instruction.slice(0, 80), reason });
  };

  for (const claim of claims) {
    const problem = instructionProblem(claim.instruction) ?? (claim.avoid_when ? instructionProblem(claim.avoid_when.padEnd(12, ' ')) : null);
    if (problem) { reject(claim, problem); continue; }
    if (!quoteHolds(claim.quote, page)) { reject(claim, 'the quote is not on the page, or is longer than 25 words'); continue; }
    const domains = claim.domains.filter((d) => d === '*' || validDomains.includes(d));
    if (domains.length === 0) { reject(claim, 'no known domain'); continue; }

    let row = (claim.existing_slug ? bySlug.get(claim.existing_slug) : undefined) as { id: number; slug: string } | undefined;
    const fresh = !row;
    if (!row) {
      if (claim.stance === 'contradicts') { reject(claim, 'a contradiction that names no existing technique'); continue; }
      const slug = slugify(claim.instruction);
      row = bySlug.get(slug) as { id: number; slug: string } | undefined;
      if (!row) {
        const scales = claim.scales.includes('*') || claim.scales.length === 0 ? ['*'] : claim.scales;
        const info = insertTechnique.run(slug, claim.instruction.trim(), JSON.stringify(domains.includes('*') ? ['*'] : domains), JSON.stringify(scales), JSON.stringify(source.models), claim.avoid_when, at);
        row = { id: Number(info.lastInsertRowid), slug };
        result.added.push(slug);
      }
    }
    const info = insertEvidence.run(row.id, source.id, source.url, source.title, source.publisher, source.type, claim.quote.trim(), claim.effect, claim.stance, source.published, at, hash);
    if (!fresh && info.changes > 0) result.supported.push(`${row.slug}${claim.stance === 'contradicts' ? ' (contradicted)' : ''}`);
  }
  return result;
}

// ── Learning from use ─────────────────────────────────────────────────────────────────────────

export interface OutcomeRow {
  signal: string;
  techniques: string[];
  heldOut: string | null;
  /** The press it belongs to (app 0.6.0 and later); null on older rows. */
  run?: string | null;
}

/** Fewer rewrites than this on either side and the comparison is noise, so no lift is recorded. */
export const MIN_SAMPLE = 30;

/** z for a two-sided 95% interval. */
const Z95 = 1.959963984540054;
/** z for a two-sided 99% interval: the stricter test a retirement must also pass. */
const Z99 = 2.5758293035489;
/**
 * Retirement is permanent, and the figures are looked at again at every refresh as data grows: with a 95%
 * interval and weekly looks, a technique with no effect would sooner or later be retired by chance. So the
 * retirement test is run only once at each of these numbers of rewrites without the technique (three looks
 * in all), needs at least the first of them on each side, and needs the 99% interval wholly below zero.
 */
export const RETIRE_CHECKPOINTS = [100, 400, 1600] as const;
export const RETIRE_SAMPLE = RETIRE_CHECKPOINTS[0];

/** Wilson score interval for `x` successes out of `n`, as proportions. */
export function wilson(x: number, n: number, z = Z95): [number, number] {
  if (n <= 0) return [0, 1];
  const p = x / n;
  const z2 = z * z;
  const scale = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / scale;
  const half = (z / scale) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/**
 * 95% interval for p1 − p2, two independent proportions (x1 of n1 against x2 of n2), by Newcombe's hybrid
 * score method (method 10 in Newcombe 1998, Statistics in Medicine 17:873): it combines the Wilson interval
 * of each side, so it stays inside −1..1 and behaves near 0% and 100%, where the textbook interval does not.
 */
export function differenceInterval(x1: number, n1: number, x2: number, n2: number, z = Z95): [number, number] {
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const [l1, u1] = wilson(x1, n1, z);
  const [l2, u2] = wilson(x2, n2, z);
  const d = p1 - p2;
  return [d - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), d + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)];
}

export type Verdict = 'not enough data' | 'helps' | 'hurts' | 'no clear difference';

export interface LiftSide {
  /** Rewrites put into the app. */
  n: number;
  /** Of those, undone or rated down. */
  bad: number;
  /** Rewrites shown and closed without being put into the app. Not part of n or bad. */
  dismissed: number;
}

export interface Lift {
  slug: string;
  /** Rewrites that carried the technique. */
  withIt: LiftSide;
  /** Rewrites where it was deliberately left out. */
  without: LiftSide;
  /** Percentage points of rewrites kept with the technique, minus without it. Null until both sides have MIN_SAMPLE. */
  points: number | null;
  /** 95% interval for `points`, in percentage points. Null until both sides have MIN_SAMPLE. */
  interval: [number, number] | null;
  verdict: Verdict;
  /** The stricter retirement test would pass now (see RETIRE_CHECKPOINTS; recordLifts decides whether this look counts). */
  retire: boolean;
}

/** Rewrites on one side that were put in and stayed: not undone and not rated down. */
export const keptCount = (side: LiftSide) => side.n - Math.min(side.bad, side.n);

/** A proportion as percentage points to one decimal, never −0. */
const toPoints = (proportion: number) => Math.round(proportion * 1000) / 10 + 0;

/**
 * The effect of each technique on whether a rewrite is kept, from the app's random holdout: the same
 * kind of rewrite with the technique and with it left out. "Bad" is an Undo or a thumbs-down. The verdict
 * is "helps" or "hurts" only when the whole 95% interval is on one side of zero.
 */
/**
 * One record per press. A press reports 'inserted' and later perhaps 'rated_down' and 'undone' under one
 * run id; counting rows would count it bad twice. A press that was shown, closed and later put in from the
 * cache counts as put in. Rows from older apps carry no run id and are counted one by one, as before.
 */
export function onePerPress(rows: OutcomeRow[]): OutcomeRow[] {
  const out: OutcomeRow[] = [];
  const presses = new Map<string, { row: OutcomeRow; inserted: boolean; bad: boolean; dismissed: boolean }>();
  for (const row of rows) {
    if (!row.run) {
      out.push(row);
      continue;
    }
    let press = presses.get(row.run);
    if (!press) presses.set(row.run, (press = { row, inserted: false, bad: false, dismissed: false }));
    // "Scan again" keeps the press but can change its techniques: the prompt that was put in is the one that counts.
    if (row.signal === 'inserted') {
      press.inserted = true;
      press.row = row;
    }
    else if (row.signal === 'undone' || row.signal === 'rated_down') press.bad = true;
    else if (row.signal === 'dismissed') press.dismissed = true;
  }
  for (const { row, inserted, bad, dismissed } of presses.values()) {
    const base = { techniques: row.techniques, heldOut: row.heldOut, run: row.run };
    if (inserted) {
      out.push({ ...base, signal: 'inserted' });
      if (bad) out.push({ ...base, signal: 'undone' });
    } else if (dismissed) out.push({ ...base, signal: 'dismissed' });
  }
  return out;
}

const emptySide = (): LiftSide => ({ n: 0, bad: 0, dismissed: 0 });
const addSide = (a: LiftSide, b: LiftSide) => ({ n: a.n + b.n, bad: a.bad + b.bad, dismissed: a.dismissed + b.dismissed });
interface Stratum {
  withIt: LiftSide;
  without: LiftSide;
}

/**
 * The difference in kept rate (with minus without) over strata, as a proportion with its interval. One
 * stratum: Newcombe's interval, as differenceInterval. Several: the Mantel-Haenszel weighted difference,
 * weights n1·n0/(n1+n0), with its Wald interval (each stratum's variance from counts nudged half a
 * rewrite towards 50%, so a stratum at 0% or 100% does not claim certainty).
 */
export function stratifiedDifference(strata: Stratum[], z = Z95): { difference: number; interval: [number, number] } | null {
  const usable = strata.filter((s) => s.withIt.n > 0 && s.without.n > 0);
  if (usable.length === 0) return null;
  if (usable.length === 1) {
    const { withIt, without } = usable[0]!;
    const x1 = keptCount(withIt), x0 = keptCount(without);
    return { difference: x1 / withIt.n - x0 / without.n, interval: differenceInterval(x1, withIt.n, x0, without.n, z) };
  }
  let weights = 0, sum = 0, variance = 0;
  for (const { withIt, without } of usable) {
    const n1 = withIt.n, n0 = without.n;
    const w = (n1 * n0) / (n1 + n0);
    const p1 = keptCount(withIt) / n1, p0 = keptCount(without) / n0;
    const q1 = (keptCount(withIt) + 0.5) / (n1 + 1), q0 = (keptCount(without) + 0.5) / (n0 + 1);
    weights += w;
    sum += w * (p1 - p0);
    variance += w * w * ((q1 * (1 - q1)) / n1 + (q0 * (1 - q0)) / n0);
  }
  const difference = sum / weights;
  const half = (z * Math.sqrt(variance)) / weights;
  return { difference, interval: [Math.max(-1, difference - half), Math.min(1, difference + half)] };
}

export function liftFromOutcomes(rows: OutcomeRow[], minSample = MIN_SAMPLE): Lift[] {
  // Per technique, per k: the number of techniques the rewrite could have had (those used plus the one left out).
  const strata = new Map<string, Map<number, Stratum>>();
  const stratum = (slug: string, k: number) => {
    let bySize = strata.get(slug);
    if (!bySize) strata.set(slug, (bySize = new Map()));
    let s = bySize.get(k);
    if (!s) bySize.set(k, (s = { withIt: emptySide(), without: emptySide() }));
    return s;
  };
  for (const row of onePerPress(rows)) {
    const field = row.signal === 'inserted' ? 'n' : row.signal === 'undone' || row.signal === 'rated_down' ? 'bad' : row.signal === 'dismissed' ? 'dismissed' : null;
    if (!field) continue;
    // Like is compared with like. "Without" is a rewrite where this technique was left out on purpose.
    // "With" is a rewrite that could have had one left out (two or more techniques) and had none left out:
    // a rewrite with a single technique, or with another technique left out, belongs to neither side.
    // And a technique is left out with a chance that depends on how many applied (one in five, shared among
    // them), so "with" and "without" are compared within the same number of techniques and then combined.
    const k = row.techniques.length + (row.heldOut ? 1 : 0);
    if (k < 2) continue;
    if (row.heldOut) stratum(row.heldOut, k).without[field]++;
    else for (const slug of row.techniques) stratum(slug, k).withIt[field]++;
  }
  const lifts: Lift[] = [];
  for (const [slug, bySize] of strata) {
    const all = [...bySize.values()];
    const usable = all.filter((s) => s.withIt.n > 0 && s.without.n > 0);
    // The counts shown are the ones compared: only numbers of techniques seen on both sides.
    const shown = usable.length ? usable : all;
    const withIt = shown.reduce((a, s) => addSide(a, s.withIt), emptySide());
    const without = shown.reduce((a, s) => addSide(a, s.without), emptySide());
    const lift: Lift = { slug, withIt, without, points: null, interval: null, verdict: 'not enough data', retire: false };
    lifts.push(lift);
    // Nothing to compare until both sides have the same number of techniques somewhere, and enough of them.
    if (!usable.length || withIt.n < minSample || without.n < minSample) continue;
    const result = stratifiedDifference(usable)!;
    lift.points = toPoints(result.difference);
    const [low, high] = result.interval.map(toPoints) as [number, number];
    lift.interval = [low, high];
    // Judged on the rounded figures, so the page never shows "helps" next to an interval that starts at 0.0.
    lift.verdict = low > 0 ? 'helps' : high < 0 ? 'hurts' : 'no clear difference';
    if (withIt.n >= RETIRE_SAMPLE && without.n >= RETIRE_SAMPLE) lift.retire = toPoints(stratifiedDifference(usable, Z99)!.interval[1]) < 0;
  }
  return lifts.sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Stores each technique's field result. measured_lift, which moves confidence, takes the field figure only
 * when the verdict is clear ("helps" or "hurts"); otherwise it falls back to a lab figure recorded with
 * `kb lift`, or null, so noise never moves confidence. Call recompute() afterwards to act on it.
 */
export function recordLifts(db: DatabaseSync, lifts: Lift[]): void {
  const save = db.prepare(
    `UPDATE technique SET measured_lift = COALESCE(?, lab_lift), lift_points = ?, lift_low = ?, lift_high = ?,
       lift_kept_with = ?, lift_n_with = ?, lift_kept_without = ?, lift_n_without = ?, lift_verdict = ?, lift_retire = ?, lift_checked = ? WHERE slug = ?`,
  );
  const before = db.prepare('SELECT lift_retire, lift_checked FROM technique WHERE slug = ?');
  for (const lift of lifts) {
    const clear = lift.verdict === 'helps' || lift.verdict === 'hurts';
    // The retirement test counts only the first time the "without" side reaches each checkpoint; between
    // checkpoints the last answer stands. A retirement, once decided, stays.
    const was = (before.get(lift.slug) as { lift_retire: number | null; lift_checked: number | null } | undefined) ?? { lift_retire: null, lift_checked: null };
    const reached = [...RETIRE_CHECKPOINTS].reverse().find((c) => lift.without.n >= c && lift.withIt.n >= RETIRE_SAMPLE) ?? null;
    const look = reached !== null && reached > (was.lift_checked ?? 0);
    const retire = was.lift_retire === 1 || (look && lift.retire);
    save.run(
      clear ? lift.points : null, lift.points, lift.interval?.[0] ?? null, lift.interval?.[1] ?? null,
      keptCount(lift.withIt), lift.withIt.n, keptCount(lift.without), lift.without.n, lift.verdict, retire ? 1 : 0, look ? reached : was.lift_checked, lift.slug,
    );
  }
}
