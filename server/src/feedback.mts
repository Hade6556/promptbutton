// What the app reports back so the knowledge base can learn: which techniques a rewrite used and how it
// fared. Outcomes carry no text and are stored without a user id. Before/after pairs carry text, so
// they are accepted only with explicit consent, scrubbed here before storing, and also stored without a user id,
// with the day they came and not the time.
import { handle as db } from './db.mts';

// dismissed: a rewrite that carried techniques was shown and the box closed without inserting it.
// blind_*: the user compared two unlabelled answers, one to their own draft and one to First Try's prompt, and picked
// the answer to First Try's prompt (blind_rewrite), the answer to their draft (blind_original), or neither (blind_same).
export const SIGNALS = ['inserted', 'undone', 'rated_up', 'rated_down', 'dismissed', 'blind_rewrite', 'blind_original', 'blind_same'] as const;
export type Signal = (typeof SIGNALS)[number];

/** The kinds of app someone was typing in. A fixed list, so an app's own name is never stored: anything else becomes 'other'. */
export const APP_KINDS = ['chatgpt', 'claude', 'gemini', 'perplexity', 'copilot', 'cursor', 'vscode', 'windsurf', 'zed', 'jetbrains', 'xcode', 'terminal', 'slack', 'discord', 'teams', 'notion', 'linear', 'mail', 'notes', 'browser', 'other'] as const;
export type AppKind = (typeof APP_KINDS)[number];

const SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;
const WORD = /^[a-z_*]{1,32}$/;
/** A random id the device makes for one press of the shortcut (crypto.randomUUID()). It joins that press's reports and nothing else. */
const RUN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Outcome {
  signal: Signal;
  techniques: string[];
  heldOut: string | null;
  domain: string;
  scale: string;
  family: string;
  kb: string;
  /** Null when the app did not send one, or sent something that is not a lower-case UUID. */
  run: string | null;
  /** Null when the app did not send one. */
  app: AppKind | null;
}

/** The outcome if the body is one, otherwise null. Nothing free-form gets through: every field is a slug, a keyword, a date, a random id or a word from a fixed list. */
export function parseOutcome(body: unknown): Outcome | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const techniques = Array.isArray(b.techniques) ? b.techniques : null;
  if (!SIGNALS.includes(b.signal as Signal) || !techniques || techniques.length > 12) return null;
  if (!techniques.every((t) => typeof t === 'string' && SLUG.test(t))) return null;
  const heldOut = b.heldOut == null ? null : typeof b.heldOut === 'string' && SLUG.test(b.heldOut) ? b.heldOut : undefined;
  if (heldOut === undefined) return null;
  const word = (v: unknown) => (typeof v === 'string' && WORD.test(v) ? v : null);
  const domain = word(b.domain), scale = word(b.scale), family = word(b.family);
  const kb = typeof b.kb === 'string' && /^[0-9a-z-]{1,16}$/.test(b.kb) ? b.kb : null;
  if (!domain || !scale || !family || !kb) return null;
  // Optional, and older apps send neither: a bad value is dropped or generalised, never a reason to refuse the report.
  const run = typeof b.run === 'string' && RUN.test(b.run) ? b.run : null;
  const app = b.app == null ? null : APP_KINDS.includes(b.app as AppKind) ? (b.app as AppKind) : 'other';
  return { signal: b.signal as Signal, techniques: techniques as string[], heldOut, domain, scale, family, kb, run, app };
}

/** Removes what most often identifies someone: email addresses, links, phone-like and long numbers, @handles. Names can remain, which the app says before anyone opts in. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, '[link]')
    .replace(/(?<![\w@])@[\w.-]{2,}/g, '[handle]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]')
    .replace(/\b\d{4,}\b/g, '[number]');
}

export const MAX_PAIR_CHARS = 8000;

/** The most rows of each kind one export sends; the next export carries on from its cursor. Pairs carry text, so fewer of them. */
export const EXPORT_LIMITS = { outcomes: 50_000, pairs: 5_000 };

/** A stored row as the export sends it: its id, then its columns. */
export type ExportRow = Record<string, unknown> & { id: number };

export const outcomes = {
  add: (o: Outcome) =>
    db().prepare('INSERT INTO outcomes (signal, techniques, held_out, domain, scale, family, kb, run, app) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(o.signal, JSON.stringify(o.techniques), o.heldOut, o.domain, o.scale, o.family, o.kb, o.run, o.app),
  /** Rows after this id, oldest first. */
  after: (id: number, limit = EXPORT_LIMITS.outcomes) =>
    db().prepare('SELECT id, signal, techniques, held_out, domain, scale, family, kb, run, app, at FROM outcomes WHERE id > ? ORDER BY id LIMIT ?').all(id, limit) as ExportRow[],
};

export const pairs = {
  /** The day is set here as well as in the table, because a database made before keeps its old default, the second. */
  add: (p: { draft: string; rewritten: string; domain: string; techniques: string[] }) =>
    db().prepare("INSERT INTO pairs (draft, rewritten, domain, techniques, at) VALUES (?, ?, ?, ?, strftime('%Y-%m-%d', 'now'))").run(scrub(p.draft).slice(0, MAX_PAIR_CHARS), scrub(p.rewritten).slice(0, MAX_PAIR_CHARS), p.domain, JSON.stringify(p.techniques)),
  /** Rows after this id, oldest first. */
  after: (id: number, limit = EXPORT_LIMITS.pairs) =>
    db().prepare('SELECT id, draft, rewritten, domain, techniques, at FROM pairs WHERE id > ? ORDER BY id LIMIT ?').all(id, limit) as ExportRow[],
};

// The knowledge-base tool downloads what has come in by id, not by time: outcomes keep the second and many arrive in
// the same one, so a time cursor skips the rest of that second, and pairs keep only the day.

/** Where an export starts: for each kind, the largest id the knowledge-base tool already has. */
export interface Cursors {
  outcomes_after: number;
  pairs_after: number;
}

/**
 * The cursors an export request asks for: outcomes_after and pairs_after, whole numbers, 0 when one is missing. A
 * knowledge-base tool from before them sends since=<date> instead, accepted for one release and only when neither
 * cursor is sent. Null when a cursor is not a whole number.
 */
export function parseCursors(params: URLSearchParams): Cursors | null {
  const outcomesAfter = params.get('outcomes_after'), pairsAfter = params.get('pairs_after');
  if (outcomesAfter === null && pairsAfter === null) {
    const since = params.get('since') ?? '';
    return cursorsSince(/^\d{4}-\d{2}-\d{2}/.test(since) ? since : '1970-01-01');
  }
  const id = (v: string | null) => (v === null ? 0 : /^\d{1,15}$/.test(v) ? Number(v) : null);
  const cursors = { outcomes_after: id(outcomesAfter), pairs_after: id(pairsAfter) };
  return cursors.outcomes_after === null || cursors.pairs_after === null ? null : (cursors as Cursors);
}

/** What an old since=<date> stands for: outcomes stored after that time, and pairs from that day on (a pair from that day may come again). */
export function cursorsSince(iso: string): Cursors {
  const last = (sql: string) => Number((db().prepare(sql).get(iso) as { id: number | null }).id ?? 0);
  return { outcomes_after: last('SELECT MAX(id) AS id FROM outcomes WHERE at <= ?'), pairs_after: last('SELECT MAX(id) AS id FROM pairs WHERE at < substr(?, 1, 10)') };
}

/**
 * Each kind's rows after its cursor, oldest first, with the cursors for the next export: the largest id sent, or the
 * one given when none was. Ids are never reused, so a row is neither skipped nor sent twice.
 */
export function exportFeedback(after: Cursors, limits = EXPORT_LIMITS) {
  const o = outcomes.after(after.outcomes_after, limits.outcomes), p = pairs.after(after.pairs_after, limits.pairs);
  return { outcomes: o, pairs: p, next: { outcomes_after: o.at(-1)?.id ?? after.outcomes_after, pairs_after: p.at(-1)?.id ?? after.pairs_after } satisfies Cursors };
}

// Public results: what the reports say, for the method page. Only reports with a run id count (apps from 0.6.0 on
// send one), because the figures are per press and older reports cannot be joined to theirs.

/** Below this many, a share and its interval are too loose to print, so they are null and only the counts show. */
export const MIN_N = 30;
const Z95 = 1.959964;
const RESULTS_TTL_MS = 5 * 60_000;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

export interface Share {
  share: number | null;
  low: number | null;
  high: number | null;
}

/** k out of n as a fraction with its 95% Wilson score interval, rounded to 3 decimals; all null when n is under MIN_N. */
export function wilson(k: number, n: number): Share {
  if (n < MIN_N) return { share: null, low: null, high: null };
  const p = k / n, z2 = Z95 * Z95;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (Z95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { share: round3(p), low: round3(Math.max(0, centre - half)), high: round3(Math.min(1, centre + half)) };
}

export interface PublicResults {
  asOf: string;
  since: string | null;
  blind: { n: number; rewrite: number; original: number; same: number } & Share;
  kept: { n: number; kept: number } & Share;
  rated: { n: number; better: number } & Share;
}

/** The figures straight from the database, every time. Use publicResults for the cached copy. */
export function computeResults(now = Date.now()): PublicResults {
  const one = (sql: string) => db().prepare(sql).get() as Record<string, number | string | null>;
  // Blind: each blind report is one comparison. share = picks of the answer to First Try's prompt over all
  // comparisons, so "about the same" counts against First Try.
  const blind = one(`SELECT COUNT(*) AS n, COALESCE(SUM(signal = 'blind_rewrite'), 0) AS rewrite,
      COALESCE(SUM(signal = 'blind_original'), 0) AS original, COALESCE(SUM(signal = 'blind_same'), 0) AS same
    FROM outcomes WHERE run IS NOT NULL AND signal IN ('blind_rewrite', 'blind_original', 'blind_same')`);
  // Kept: of the presses whose prompt was put into an app (an inserted report), those with no undone and no
  // rated_down report. A rating changed from down to up still counts as not kept, so this figure errs low.
  const kept = one(`SELECT COUNT(*) AS n, COALESCE(SUM(spoiled = 0), 0) AS kept FROM (
      SELECT MAX(signal IN ('undone', 'rated_down')) AS spoiled FROM outcomes
      WHERE run IS NOT NULL GROUP BY run HAVING MAX(signal = 'inserted') = 1)`);
  // Rated: of the presses the user rated, those whose last rating (the latest report, by arrival) was rated_up.
  const rated = one(`SELECT COUNT(*) AS n, COALESCE(SUM(o.signal = 'rated_up'), 0) AS better FROM outcomes o
    JOIN (SELECT MAX(id) AS id FROM outcomes WHERE run IS NOT NULL AND signal IN ('rated_up', 'rated_down') GROUP BY run) last ON o.id = last.id`);
  // Since: the earliest report that can feed a figure above.
  const since = one(`SELECT MIN(at) AS at FROM outcomes WHERE run IS NOT NULL
    AND signal IN ('inserted', 'rated_up', 'rated_down', 'blind_rewrite', 'blind_original', 'blind_same')`);
  const n = (v: unknown) => Number(v ?? 0);
  return {
    asOf: new Date(now).toISOString(),
    since: typeof since.at === 'string' ? since.at : null,
    blind: { n: n(blind.n), rewrite: n(blind.rewrite), original: n(blind.original), same: n(blind.same), ...wilson(n(blind.rewrite), n(blind.n)) },
    kept: { n: n(kept.n), kept: n(kept.kept), ...wilson(n(kept.kept), n(kept.n)) },
    rated: { n: n(rated.n), better: n(rated.better), ...wilson(n(rated.better), n(rated.n)) },
  };
}

let cached: { at: number; results: PublicResults } | null = null;

/** The figures, worked out at most once every 5 minutes (or again if the clock went back): the route needs no sign-in, so it must stay cheap. */
export function publicResults(now = Date.now()): PublicResults {
  if (!cached || now - cached.at >= RESULTS_TTL_MS || now < cached.at) cached = { at: now, results: computeResults(now) };
  return cached.results;
}
