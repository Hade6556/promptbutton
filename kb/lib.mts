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
      at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  // Databases made before the holdout existed lack the column.
  const columns = db.prepare('PRAGMA table_info(outcome)').all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === 'held_out')) db.exec('ALTER TABLE outcome ADD COLUMN held_out TEXT');
  return db;
}

// ── Confidence ────────────────────────────────────────────────────────────────────────────────
// A formula, so two people looking at the same evidence get the same number.

export const BASE: Record<SourceType, number> = { own_eval: 0.9, paper: 0.7, vendor_doc: 0.6, own_playbook: 0.45, community: 0.3 };
/** Below this a technique is not injected. */
export const INJECT_FLOOR = 0.4;
/** A measured drop in win rate (percentage points) at or beyond this retires a technique whatever its sources say. */
export const HARM_POINTS = -5;

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

export function recompute(db: DatabaseSync, now = new Date()): { retired: string[] } {
  const retired: string[] = [];
  const techniques = db.prepare('SELECT id, slug, models, measured_lift, status FROM technique').all() as Array<{ id: number; slug: string; models: string; measured_lift: number | null; status: Status }>;
  const evidenceOf = db.prepare('SELECT source_type, publisher, stance, published_at FROM evidence WHERE technique_id = ?');
  const setConfidence = db.prepare('UPDATE technique SET confidence = ? WHERE id = ?');
  const retire = db.prepare("UPDATE technique SET status = 'retired', retired_reason = ? WHERE id = ?");
  for (const t of techniques) {
    const evidence = evidenceOf.all(t.id) as unknown as EvidenceRow[];
    const confidence = computeConfidence(evidence, { modelSpecific: !t.models.includes('"*"'), measuredLift: t.measured_lift, now });
    setConfidence.run(confidence, t.id);
    if (t.status !== 'active') continue;
    if (typeof t.measured_lift === 'number' && t.measured_lift <= HARM_POINTS) {
      retire.run(`Measured lift ${t.measured_lift} points in our own eval`, t.id);
      retired.push(t.slug);
    } else if (confidence < INJECT_FLOOR) {
      retire.run(`Confidence fell to ${confidence}: contradicted or out of date`, t.id);
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
}

/** Fewer rewrites than this on either side and the comparison is noise, so no lift is recorded. */
export const MIN_SAMPLE = 30;

export interface Lift {
  slug: string;
  /** Rewrites that carried the technique, and how many of those were undone or rated down. */
  withIt: { n: number; bad: number };
  /** Rewrites where it was deliberately left out. */
  without: { n: number; bad: number };
  /** Percentage points of rewrites kept with the technique, minus without it. Null until both sides have MIN_SAMPLE. */
  points: number | null;
}

/**
 * The effect of each technique on whether a rewrite is kept, from the app's random holdout: the same
 * kind of rewrite with the technique and with it left out. "Bad" is an Undo or a thumbs-down.
 */
export function liftFromOutcomes(rows: OutcomeRow[], minSample = MIN_SAMPLE): Lift[] {
  const stats = new Map<string, Lift>();
  const entry = (slug: string) => {
    let lift = stats.get(slug);
    if (!lift) stats.set(slug, (lift = { slug, withIt: { n: 0, bad: 0 }, without: { n: 0, bad: 0 }, points: null }));
    return lift;
  };
  for (const row of rows) {
    const field = row.signal === 'inserted' ? 'n' : row.signal === 'undone' || row.signal === 'rated_down' ? 'bad' : null;
    if (!field) continue;
    for (const slug of row.techniques) entry(slug).withIt[field]++;
    if (row.heldOut) entry(row.heldOut).without[field]++;
  }
  const kept = (side: { n: number; bad: number }) => 1 - Math.min(side.bad, side.n) / side.n;
  for (const lift of stats.values()) {
    if (lift.withIt.n >= minSample && lift.without.n >= minSample) lift.points = Math.round((kept(lift.withIt) - kept(lift.without)) * 1000) / 10;
  }
  return [...stats.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
