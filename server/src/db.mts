// SQLite through Node's built-in driver. One file, no daemon, backed up by copying it.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mts';

export interface User {
  id: number;
  email: string;
  created_at: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  period_start: number | null;
  period_end: number | null;
  /** 1 while a dispute or fraud warning is open: paid allowance is paused. */
  hold: number;
}

let db: DatabaseSync;

export function openDb(file = config.dbPath): DatabaseSync {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      stripe_customer_id TEXT UNIQUE,
      stripe_subscription_id TEXT,
      subscription_status TEXT,
      period_start INTEGER,
      period_end INTEGER,
      hold INTEGER NOT NULL DEFAULT 0
    );
    -- last_used is the day only: every signed-in request sets it, so a time to the second would join a session to
    -- the anonymous outcome or pair that request stored.
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used TEXT
    );
    CREATE TABLE IF NOT EXISTS codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    -- One row per user per allowance period: 'trial', or the Stripe period start.
    CREATE TABLE IF NOT EXISTS usage (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      cost_micros INTEGER NOT NULL DEFAULT 0,
      requests INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, period)
    );
    -- What a rewrite used and how it fared. No text and no user id: it cannot be traced to a person.
    -- run joins the reports of one press of the shortcut (a random id made on the device for that press only);
    -- app is a kind from a fixed list. Both are null on rows from apps that predate them.
    CREATE TABLE IF NOT EXISTS outcomes (
      id INTEGER PRIMARY KEY,
      signal TEXT NOT NULL,
      techniques TEXT NOT NULL,
      held_out TEXT,
      domain TEXT NOT NULL,
      scale TEXT NOT NULL,
      family TEXT NOT NULL,
      kb TEXT NOT NULL,
      at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      run TEXT,
      app TEXT
    );
    -- Before/after prompts from people who switched sharing on. Scrubbed, and stored without a user id.
    -- at is the day only: a pair is sent with its press's inserted outcome, and the same second would join its text to that press.
    CREATE TABLE IF NOT EXISTS pairs (
      id INTEGER PRIMARY KEY,
      draft TEXT NOT NULL,
      rewritten TEXT NOT NULL,
      domain TEXT NOT NULL,
      techniques TEXT NOT NULL,
      at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now'))
    );
    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      note TEXT
    );
    -- Money back by the user's own numbers: one request per billing period, with the counts the app sent for it.
    -- The owner refunds by hand in Stripe and records the decision here; nothing refunds automatically.
    CREATE TABLE IF NOT EXISTS refund_requests (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      period_start INTEGER NOT NULL,
      period_end INTEGER NOT NULL,
      kept INTEGER NOT NULL,
      judged INTEGER NOT NULL,
      better INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'refunded', 'declined')),
      note TEXT,
      at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      decided_at TEXT,
      UNIQUE (user_id, period_start)
    );
  `);
  // Databases made before a column existed gain it here. Safe to run on every start: a column is added only when missing.
  const outcomeColumns = new Set((db.prepare('PRAGMA table_info(outcomes)').all() as Array<{ name: string }>).map((c) => c.name));
  for (const column of ['run', 'app']) if (!outcomeColumns.has(column)) db.exec(`ALTER TABLE outcomes ADD COLUMN ${column} TEXT`);
  // After the columns exist: the public results group reports by press, and this keeps that from scanning the whole table.
  db.exec('CREATE INDEX IF NOT EXISTS outcomes_run ON outcomes (run, signal) WHERE run IS NOT NULL');
  // Rows stored before sessions and pairs kept only the day still carry the second: cut them to the day. Changes nothing once done.
  db.exec("UPDATE sessions SET last_used = substr(last_used, 1, 10) WHERE length(last_used) > 10");
  db.exec("UPDATE pairs SET at = substr(at, 1, 10) WHERE length(at) > 10");
  return db;
}

/** The open database, for modules that keep their own queries. */
export const handle = (): DatabaseSync => db;

export const users = {
  byEmail: (email: string) => db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined,
  byId: (id: number) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined,
  byCustomer: (customer: string) => db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?').get(customer) as User | undefined,
  create: (email: string) => {
    db.prepare('INSERT OR IGNORE INTO users (email) VALUES (?)').run(email);
    return users.byEmail(email)!;
  },
  setCustomer: (id: number, customer: string) => db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customer, id),
  setSubscription: (id: number, s: { subscription: string | null; status: string | null; start: number | null; end: number | null }) =>
    db.prepare('UPDATE users SET stripe_subscription_id = ?, subscription_status = ?, period_start = ?, period_end = ? WHERE id = ?').run(s.subscription, s.status, s.start, s.end, id),
  setHold: (id: number, hold: boolean) => db.prepare('UPDATE users SET hold = ? WHERE id = ?').run(hold ? 1 : 0, id),
};

export const sessions = {
  create: (tokenHash: string, userId: number) => db.prepare('INSERT INTO sessions (token_hash, user_id) VALUES (?, ?)').run(tokenHash, userId),
  user: (tokenHash: string) => {
    const row = db.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').get(tokenHash) as { user_id: number } | undefined;
    if (!row) return undefined;
    // The day only, never the time: see the sessions table.
    db.prepare("UPDATE sessions SET last_used = date('now') WHERE token_hash = ?").run(tokenHash);
    return users.byId(row.user_id);
  },
  remove: (tokenHash: string) => db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash),
};

export const codes = {
  put: (email: string, codeHash: string, expiresAt: number) =>
    db.prepare('INSERT INTO codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0) ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0').run(email, codeHash, expiresAt),
  get: (email: string) => db.prepare('SELECT * FROM codes WHERE email = ?').get(email) as { code_hash: string; expires_at: number; attempts: number } | undefined,
  attempt: (email: string) => db.prepare('UPDATE codes SET attempts = attempts + 1 WHERE email = ?').run(email),
  remove: (email: string) => db.prepare('DELETE FROM codes WHERE email = ?').run(email),
};

export const usage = {
  get: (userId: number, period: string) =>
    (db.prepare('SELECT cost_micros, requests FROM usage WHERE user_id = ? AND period = ?').get(userId, period) as { cost_micros: number; requests: number } | undefined) ?? { cost_micros: 0, requests: 0 },
  add: (userId: number, period: string, micros: number) =>
    db.prepare('INSERT INTO usage (user_id, period, cost_micros, requests) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, period) DO UPDATE SET cost_micros = cost_micros + excluded.cost_micros, requests = requests + 1').run(userId, period, Math.ceil(micros)),
};

export const stripeEvents = {
  /** False when the event was already handled (Stripe retries and may deliver twice). */
  claim: (id: string, type: string) => db.prepare('INSERT OR IGNORE INTO stripe_events (id, type) VALUES (?, ?)').run(id, type).changes === 1,
  note: (id: string, note: string) => db.prepare('UPDATE stripe_events SET note = ? WHERE id = ?').run(note, id),
  release: (id: string) => db.prepare('DELETE FROM stripe_events WHERE id = ?').run(id),
};

export type RefundStatus = 'queued' | 'refunded' | 'declined';

export interface RefundRequest {
  id: number;
  user_id: number;
  period_start: number;
  period_end: number;
  kept: number;
  judged: number;
  better: number;
  status: RefundStatus;
  note: string | null;
  at: string;
  decided_at: string | null;
}

export const refunds = {
  /** The new request's id, or null when this user already asked for a period starting then. */
  add: (userId: number, r: { periodStart: number; periodEnd: number; kept: number; judged: number; better: number }) => {
    const result = db.prepare('INSERT OR IGNORE INTO refund_requests (user_id, period_start, period_end, kept, judged, better) VALUES (?, ?, ?, ?, ?, ?)').run(userId, r.periodStart, r.periodEnd, r.kept, r.judged, r.better);
    return result.changes === 1 ? Number(result.lastInsertRowid) : null;
  },
  /** A request of this user's whose period overlaps the given one. Starts can differ by a few days for the same period, since months differ in length. */
  overlapping: (userId: number, start: number, end: number) =>
    db.prepare('SELECT * FROM refund_requests WHERE user_id = ? AND period_start < ? AND period_end > ? LIMIT 1').get(userId, end, start) as RefundRequest | undefined,
  /** Requests made in the last 365 days that were not declined: queued ones count, so the limit cannot be passed by asking before the owner acts. */
  acceptedInLastYear: (userId: number) =>
    (db.prepare("SELECT COUNT(*) AS n FROM refund_requests WHERE user_id = ? AND status != 'declined' AND at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-365 days')").get(userId) as { n: number }).n,
  byId: (id: number) => db.prepare('SELECT * FROM refund_requests WHERE id = ?').get(id) as RefundRequest | undefined,
  /**
   * Newest first, with what the owner needs to find the payment in Stripe, and period_requests: the Claude calls this
   * server made for the user in that period (null when the claimed start is not one the server billed), so a claim of
   * nothing kept after heavy use stands out before the refund is made.
   */
  list: () =>
    db.prepare(`SELECT r.*, u.email, u.stripe_customer_id, u.stripe_subscription_id, u.hold, g.requests AS period_requests
      FROM refund_requests r JOIN users u ON u.id = r.user_id
      LEFT JOIN usage g ON g.user_id = r.user_id AND g.period = 'pro:' || r.period_start
      ORDER BY r.id DESC LIMIT 1000`).all(),
  decide: (id: number, status: Exclude<RefundStatus, 'queued'>, note: string | null) =>
    db.prepare("UPDATE refund_requests SET status = ?, note = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").run(status, note, id).changes === 1,
};
