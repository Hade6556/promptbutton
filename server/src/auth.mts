// Email sign-in with a 6-digit code, then a long-lived bearer token stored on the Mac.
// Only hashes of codes and tokens are stored.
import crypto from 'node:crypto';
import { config } from './config.mts';
import { codes, sessions, users, type User } from './db.mts';
import { sendCode } from './mail.mts';

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

const hmac = (value: string) => crypto.createHmac('sha256', config.codeSecret).update(value).digest('hex');
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export async function startSignIn(email: string): Promise<void> {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  codes.put(email, hmac(`${email}:${code}`), Date.now() + CODE_TTL_MS);
  await sendCode(email, code);
}

export type VerifyResult = { ok: true; token: string; user: User } | { ok: false; reason: 'expired' | 'wrong' | 'locked' };

export function finishSignIn(email: string, code: string): VerifyResult {
  const row = codes.get(email);
  if (!row || row.expires_at < Date.now()) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' };
  codes.attempt(email);
  const expected = Buffer.from(row.code_hash, 'hex');
  const given = Buffer.from(hmac(`${email}:${code.replace(/\D/g, '')}`), 'hex');
  if (!crypto.timingSafeEqual(expected, given)) return { ok: false, reason: row.attempts + 1 >= MAX_ATTEMPTS ? 'locked' : 'wrong' };
  codes.remove(email);
  const user = users.create(email);
  const token = `pmp_${crypto.randomBytes(32).toString('base64url')}`;
  sessions.create(hashToken(token), user.id);
  return { ok: true, token, user };
}

/** The user behind an Authorization: Bearer or x-api-key header (the Anthropic SDK sends either). */
export function userFromHeaders(headers: Record<string, string | string[] | undefined>): { user: User; tokenHash: string } | undefined {
  const auth = String(headers.authorization ?? '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : String(headers['x-api-key'] ?? '').trim();
  if (!token.startsWith('pmp_')) return undefined;
  const tokenHash = hashToken(token);
  const user = sessions.user(tokenHash);
  return user ? { user, tokenHash } : undefined;
}
