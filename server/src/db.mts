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
    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      note TEXT
    );
  `);
  return db;
}

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
    db.prepare("UPDATE sessions SET last_used = datetime('now') WHERE token_hash = ?").run(tokenHash);
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
