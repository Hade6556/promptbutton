// Results: a record, kept on this Mac only, of what First Try did with each press of the shortcut and
// how it ended. It is what the Results pane in Settings counts from, so a person can see for themselves
// how often they used, undid or closed a rewrite, and how often they said it got them a better answer.
//
// What a line holds is fixed by the types below and nothing else gets in: the time, the app's name and
// kind, what First Try produced, how many questions it asked and changes it made, how the press ended,
// and the ids of the knowledge-base techniques used. Never the draft, the prompt, the answers to its
// questions or a screenshot. The file is never sent anywhere.
//
// The file is append-only JSON lines: one 'run' line when a press ends, then an 'undo', 'rate' or 'blind'
// line that names the run's id. Appending keeps a crash from corrupting earlier lines; a bad line is skipped.
import fs from 'node:fs';
import path from 'node:path';

/** What the box ended up showing for a press. */
export type Produced =
  /** A full prompt, written from the draft. */
  | 'prompt'
  /** A short rewrite: the draft tightened, or a follow-up made clear. */
  | 'tightened'
  /** The draft was already a finished prompt, so it was left alone. */
  | 'already-good'
  /** An empty field: suggested replies to the chat on screen. */
  | 'replies'
  /** It asked its questions and the box was closed before a prompt was written. */
  | 'questions'
  /** Nothing was produced: closed while it worked, an error, or nothing to work with. */
  | 'nothing';

/** How a press ended. */
export type Ended =
  /** Put into the app's text box, and read back to check it landed. */
  | 'inserted'
  /** Pasted into the app, which does not let the text be read back to check. */
  | 'pasted'
  /** Left on the clipboard: copied on purpose, or the paste did not land. */
  | 'copied'
  /** Shown, then closed without being used. */
  | 'dismissed'
  /** Closed before anything was shown. */
  | 'cancelled'
  /** It ended on an error. */
  | 'error';

/**
 * The kind of app, from a fixed list. It is also what the shared outcome report carries (when the user
 * has switched sharing on), so an unusual app's own name never leaves the Mac.
 */
export const APP_KINDS = [
  'chatgpt', 'claude', 'gemini', 'perplexity', 'copilot', 'cursor', 'vscode', 'windsurf', 'zed', 'jetbrains', 'xcode',
  'terminal', 'slack', 'discord', 'teams', 'notion', 'linear', 'mail', 'notes', 'browser', 'other',
] as const;
export type AppKind = (typeof APP_KINDS)[number];

// First match wins, so specific apps come before the browser that may host them.
const KIND_RULES: [AppKind, RegExp][] = [
  ['chatgpt', /^com\.openai\.chat|^chatgpt\b/i],
  ['claude', /^com\.anthropic\.claude|^claude$/i],
  ['gemini', /gemini/i],
  ['perplexity', /perplexity/i],
  ['copilot', /copilot/i],
  ['cursor', /todesktop\.230313mzl4w4u92|^cursor$/i],
  ['windsurf', /windsurf|codeium/i],
  ['vscode', /^com\.microsoft\.vscode|^code$|visual studio code|vscodium/i],
  ['zed', /^dev\.zed\.|^zed$/i],
  ['jetbrains', /^com\.jetbrains\.|intellij|pycharm|webstorm|goland|rider|clion|phpstorm|rubymine/i],
  ['xcode', /^com\.apple\.dt\.xcode|^xcode$/i],
  ['terminal', /^com\.apple\.terminal|iterm|warp|ghostty|kitty|alacritty|wezterm|hyper|^terminal$/i],
  ['slack', /slack/i],
  ['discord', /discord/i],
  ['teams', /teams/i],
  ['notion', /notion/i],
  ['linear', /linear/i],
  ['mail', /^com\.apple\.mail|^mail$|outlook|spark|superhuman|mimestream/i],
  ['notes', /^com\.apple\.notes|^notes$|obsidian|bear|craft/i],
  ['browser', /chrome|chromium|brave|edgemac|thebrowser|arc$|vivaldi|opera|firefox|safari|comet|atlas|orion|zen/i],
];

/** The kind of app, from its bundle id and name (bundle id first: names are localised and can be renamed). */
export function appKind(appName: string, bundleId: string): AppKind {
  for (const [kind, rule] of KIND_RULES) if (rule.test(bundleId)) return kind;
  for (const [kind, rule] of KIND_RULES) if (rule.test(appName)) return kind;
  return 'other';
}

export interface RunReceipt {
  v: 1;
  t: 'run';
  id: string;
  /** When the shortcut was pressed (ISO time). */
  at: string;
  /** The app's own name, as macOS shows it. Kept on this Mac only. */
  app: string;
  kind: AppKind;
  produced: Produced;
  /** How many questions it asked before writing. */
  asked: number;
  /** How many changes were asked for and made after the first version. */
  changes: number;
  ended: Ended;
  /** Pressed again on unchanged input: the last result was shown again, with no new rewrite. */
  reopened?: boolean;
  /** The ids of the knowledge-base techniques this prompt used, and the one left out to measure it. */
  techniques?: string[];
  heldOut?: string | null;
}
export interface UndoReceipt {
  v: 1;
  t: 'undo';
  id: string;
  at: string;
}
export interface RateReceipt {
  v: 1;
  t: 'rate';
  id: string;
  at: string;
  better: boolean;
}
/** Which answer was picked in a blind comparison: the one to First Try's prompt, the one to the user's own draft, or neither. */
export type BlindPick = 'rewrite' | 'original' | 'same';
export interface BlindReceipt {
  v: 1;
  t: 'blind';
  id: string;
  at: string;
  pick: BlindPick;
}
export type Receipt = RunReceipt | UndoReceipt | RateReceipt | BlindReceipt;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;
const PRODUCED: readonly Produced[] = ['prompt', 'tightened', 'already-good', 'replies', 'questions', 'nothing'];
const ENDED: readonly Ended[] = ['inserted', 'pasted', 'copied', 'dismissed', 'cancelled', 'error'];
/** Only a strict ISO time gets in, stored in one normal form, so no other text can travel in this field. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const iso = (v: unknown): v is string => typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v));
const count = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1000 ? v : 0);

/**
 * The line exactly as stored: only the fields above, each checked. Anything else in the input is
 * dropped, so a mistake elsewhere in the app cannot write prompt text into the file.
 */
export function clean(input: unknown): Receipt | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  if (r.v !== 1 || typeof r.id !== 'string' || !ID.test(r.id) || !iso(r.at)) return null;
  const base = { v: 1 as const, id: r.id, at: new Date(r.at as string).toISOString() };
  if (r.t === 'undo') return { ...base, t: 'undo' };
  if (r.t === 'rate') return typeof r.better === 'boolean' ? { ...base, t: 'rate', better: r.better } : null;
  if (r.t === 'blind') return r.pick === 'rewrite' || r.pick === 'original' || r.pick === 'same' ? { ...base, t: 'blind', pick: r.pick } : null;
  if (r.t !== 'run') return null;
  if (!PRODUCED.includes(r.produced as Produced) || !ENDED.includes(r.ended as Ended)) return null;
  const run: RunReceipt = {
    ...base,
    t: 'run',
    app: typeof r.app === 'string' ? r.app.replace(/[\u0000-\u001f]/g, '').slice(0, 60) : '',
    kind: APP_KINDS.includes(r.kind as AppKind) ? (r.kind as AppKind) : 'other',
    produced: r.produced as Produced,
    asked: count(r.asked),
    changes: count(r.changes),
    ended: r.ended as Ended,
  };
  if (r.reopened === true) run.reopened = true;
  if (Array.isArray(r.techniques)) {
    const ids = r.techniques.filter((t): t is string => typeof t === 'string' && SLUG.test(t)).slice(0, 12);
    if (ids.length) run.techniques = ids;
  }
  if (typeof r.heldOut === 'string' && SLUG.test(r.heldOut)) run.heldOut = r.heldOut;
  return run;
}

/** Older than this and a run is dropped when the file is tidied. */
const KEEP_DAYS = 400;
/** The file is tidied when it grows past this. */
const TIDY_AT_BYTES = 2 * 1024 * 1024;

export function createReceipts(file: () => string) {
  const read = (): Receipt[] => {
    let text = '';
    try {
      text = fs.readFileSync(file(), 'utf8');
    } catch {
      return [];
    }
    const out: Receipt[] = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const receipt = clean(JSON.parse(line));
        if (receipt) out.push(receipt);
      } catch {
        // a torn line from a crash: skip it, keep the rest
      }
    }
    return out;
  };
  /** Rewrites the file without runs older than KEEP_DAYS (and their undo and rate lines). */
  const tidy = (now: Date) => {
    const cutoff = now.getTime() - KEEP_DAYS * 864e5;
    const all = read();
    const kept = new Set(all.filter((r) => r.t === 'run' && Date.parse(r.at) >= cutoff).map((r) => r.id));
    const lines = all.filter((r) => kept.has(r.id)).map((r) => JSON.stringify(r));
    const target = file();
    const temp = `${target}.tmp`;
    fs.writeFileSync(temp, lines.length ? `${lines.join('\n')}\n` : '', { mode: 0o600 });
    fs.renameSync(temp, target);
  };
  return {
    /** Appends one line. Never throws: a full disk must not break the press. */
    add(input: Receipt, now = new Date()): boolean {
      const receipt = clean(input);
      if (!receipt) return false;
      try {
        const target = file();
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.appendFileSync(target, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
        if (fs.statSync(target).size > TIDY_AT_BYTES) tidy(now);
        return true;
      } catch (error) {
        console.warn('[PromptButton] could not write to the results file:', error instanceof Error ? error.message : error);
        return false;
      }
    },
    read,
    clear() {
      fs.rmSync(file(), { force: true });
    },
    file,
  };
}

// ── What the Results pane shows ────────────────────────────────────────────────────────────────

export interface Counts {
  /** Every press of the shortcut. */
  presses: number;
  /** Prompts written: full prompts and short rewrites, not counting a result shown again. */
  written: number;
  alreadyGood: number;
  replies: number;
  /** Presses where it asked questions before writing. */
  asked: number;
  /** Put in and read back. */
  inserted: number;
  /** Pasted where the app does not let it be checked. */
  pasted: number;
  copied: number;
  /** Shown or started, then closed without being used. */
  closed: number;
  errors: number;
  undone: number;
  /** Prompts answered with "better answer?", and how many of those said yes. */
  rated: number;
  better: number;
  /** Blind comparisons, and how many picked the answer to First Try's prompt, the user's own draft, or neither. */
  blind: number;
  blindRewrite: number;
  blindOriginal: number;
  blindSame: number;
}

export interface Period {
  key: 'week' | 'lastWeek' | 'fourWeeks' | 'all';
  label: string;
  counts: Counts;
}
export interface AppRow {
  app: string;
  counts: Counts;
}
export interface Summary {
  periods: Period[];
  /** Per app over the past four weeks, busiest first. */
  apps: AppRow[];
  /** The earliest press on record, or null with none. */
  since: string | null;
}

const zero = (): Counts => ({ presses: 0, written: 0, alreadyGood: 0, replies: 0, asked: 0, inserted: 0, pasted: 0, copied: 0, closed: 0, errors: 0, undone: 0, rated: 0, better: 0, blind: 0, blindRewrite: 0, blindOriginal: 0, blindSame: 0 });

/** Monday 00:00 of the week `date` falls in, in local time. */
export function weekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

/** How many apps get their own row; the rest are added up as "Other apps". */
const APP_ROWS = 8;

/** The run lines and what was added to each later, by run id. The last answer counts when there are several. */
function index(receipts: Receipt[]) {
  const runs = new Map<string, RunReceipt>();
  const undone = new Set<string>();
  const rating = new Map<string, boolean>();
  const blind = new Map<string, BlindPick>();
  for (const r of receipts) {
    if (r.t === 'run') runs.set(r.id, r);
    else if (r.t === 'undo') undone.add(r.id);
    else if (r.t === 'rate') rating.set(r.id, r.better);
    else blind.set(r.id, r.pick);
  }
  return { runs, undone, rating, blind };
}

export function summarize(receipts: Receipt[], now = new Date()): Summary {
  const { runs, undone, rating, blind } = index(receipts);
  // Calendar weeks in local time, counted in days rather than hours so a clock change cannot shift a boundary.
  const monday = weekStart(now);
  const thisWeek = monday.getTime();
  const lastWeek = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7).getTime();
  // "Past 4 weeks" is the last 28 days, up to now.
  const fourWeeks = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 27).getTime();
  const periods: Period[] = [
    { key: 'week', label: 'This week', counts: zero() },
    { key: 'lastWeek', label: 'Last week', counts: zero() },
    { key: 'fourWeeks', label: 'Past 4 weeks', counts: zero() },
    { key: 'all', label: 'All time', counts: zero() },
  ];
  const apps = new Map<string, Counts>();
  const add = (c: Counts, run: RunReceipt) => {
    c.presses++;
    if ((run.produced === 'prompt' || run.produced === 'tightened') && !run.reopened) c.written++;
    if (run.produced === 'already-good') c.alreadyGood++;
    if (run.produced === 'replies') c.replies++;
    if (run.asked > 0) c.asked++;
    if (run.ended === 'inserted') c.inserted++;
    else if (run.ended === 'pasted') c.pasted++;
    else if (run.ended === 'copied') c.copied++;
    else if (run.ended === 'dismissed' || run.ended === 'cancelled') c.closed++;
    else if (run.ended === 'error') c.errors++;
    if (undone.has(run.id)) c.undone++;
    const better = rating.get(run.id);
    if (better !== undefined && !undone.has(run.id)) {
      c.rated++;
      if (better) c.better++;
    }
    const pick = blind.get(run.id);
    if (pick) {
      c.blind++;
      if (pick === 'rewrite') c.blindRewrite++;
      else if (pick === 'original') c.blindOriginal++;
      else c.blindSame++;
    }
  };
  let since: string | null = null;
  for (const run of runs.values()) {
    const at = Date.parse(run.at);
    if (!since || run.at < since) since = run.at;
    add(periods[3]!.counts, run);
    if (at >= fourWeeks) {
      add(periods[2]!.counts, run);
      const name = run.app || 'Unknown app';
      let c = apps.get(name);
      if (!c) apps.set(name, (c = zero()));
      add(c, run);
    }
    if (at >= thisWeek) add(periods[0]!.counts, run);
    else if (at >= lastWeek) add(periods[1]!.counts, run);
  }
  const rows = [...apps.entries()].map(([app, counts]) => ({ app, counts })).sort((a, b) => b.counts.presses - a.counts.presses || a.app.localeCompare(b.app));
  if (rows.length > APP_ROWS) {
    const rest = rows.splice(APP_ROWS - 1);
    const other = zero();
    for (const row of rest) for (const key of Object.keys(other) as (keyof Counts)[]) other[key] += row.counts[key];
    rows.push({ app: `${rest.length} other apps`, counts: other });
  }
  return { periods, apps: rows, since };
}

// ── Money back by your own numbers ────────────────────────────────────────────────────────────
// The rule (site/terms.html#money-back, checked again by the server): a paid period is refunded when
// no prompt First Try wrote was kept, or when at least MIN_JUDGED prompts were judged and fewer than
// half of them came out better.

/** Fewer judged prompts than this and a "fewer than half" share means little, so only "none kept" can apply. */
export const MIN_JUDGED = 3;

export interface PeriodCounts {
  /** Prompts First Try wrote that were put into an app (checked or not) and not undone. */
  kept: number;
  /** Prompts rated "did it get you a better answer?", plus blind comparisons made. */
  judged: number;
  /** Rated yes, or the blind pick was the answer to First Try's prompt. */
  better: number;
}

/** The counts for presses from `from` up to (not including) `to`, both Unix seconds. */
export function periodCounts(receipts: Receipt[], from: number, to: number): PeriodCounts {
  const { runs, undone, rating, blind } = index(receipts);
  const counts: PeriodCounts = { kept: 0, judged: 0, better: 0 };
  for (const run of runs.values()) {
    const at = Date.parse(run.at) / 1000;
    if (at < from || at >= to) continue;
    const prompt = run.produced === 'prompt' || run.produced === 'tightened';
    const used = run.ended === 'inserted' || run.ended === 'pasted';
    if (prompt && used && !undone.has(run.id)) counts.kept++;
    const rated = rating.get(run.id);
    if (rated !== undefined && !undone.has(run.id)) {
      counts.judged++;
      if (rated) counts.better++;
    }
    const pick = blind.get(run.id);
    if (pick) {
      counts.judged++;
      if (pick === 'rewrite') counts.better++;
    }
  }
  return counts;
}

/** Whether a period qualifies for money back under the rule above. */
export function qualifies(c: PeriodCounts): boolean {
  return c.kept === 0 || (c.judged >= MIN_JUDGED && c.better * 2 < c.judged);
}
