// What a user may spend right now, and how much of it is gone.
import { config } from './config.mts';
import { usage, type User } from './db.mts';

/** past_due keeps access while Stripe retries the card; anything else falls back to the trial. */
const PAID = new Set(['active', 'trialing', 'past_due']);

export interface Entitlement {
  plan: 'trial' | 'pro';
  period: string;
  allowanceMicros: number;
  usedMicros: number;
  requests: number;
  /** Unix seconds when the allowance resets; null for the one-time trial. */
  resetsAt: number | null;
  held: boolean;
}

export function entitlement(user: User): Entitlement {
  const pro = PAID.has(user.subscription_status ?? '') && user.period_start !== null;
  const period = pro ? `pro:${user.period_start}` : 'trial';
  const used = usage.get(user.id, period);
  return {
    plan: pro ? 'pro' : 'trial',
    period,
    allowanceMicros: pro && !user.hold ? config.proMicros : pro ? 0 : config.trialMicros,
    usedMicros: used.cost_micros,
    requests: used.requests,
    resetsAt: pro ? user.period_end : null,
    held: Boolean(user.hold),
  };
}

export function accountView(user: User) {
  const e = entitlement(user);
  // Any use shows as at least 1%, so a first press never looks like it did not count.
  const raw = e.allowanceMicros > 0 ? (e.usedMicros / e.allowanceMicros) * 100 : 100;
  const percentUsed = Math.min(100, e.usedMicros > 0 ? Math.max(1, Math.round(raw)) : Math.round(raw));
  return {
    email: user.email,
    plan: e.plan,
    status: user.subscription_status,
    percentUsed,
    resetsAt: e.resetsAt,
    /** The Stripe billing period the app counts receipts for, in Unix seconds. Kept after a subscription ends, so its last period can still be claimed. */
    periodStart: user.period_start,
    periodEnd: user.period_end,
    held: e.held,
    canUpgrade: e.plan === 'trial' && Boolean(config.stripe.key && config.stripe.priceId),
    canManage: Boolean(user.stripe_customer_id && config.stripe.key),
  };
}

/** Cost of one response in millionths of a dollar ($/M tokens equals micro-dollars per token). */
export function costMicros(u: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }): number {
  const p = config.price;
  return (u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite + (u.cache_read_input_tokens ?? 0) * p.cacheRead;
}

// Money back by the user's own numbers. The app counts, for one billing period: kept (prompts put into an app and
// not undone), judged (prompts rated, plus blind comparisons) and better (judged ones that came out better).
// A period qualifies when nothing was kept, or when at least 3 were judged and fewer than half came out better.
// A period is claimed once it has ended, so money back never comes with Pro left to use in the same period.
// The server checks the rule and the period; the owner refunds by hand in Stripe.

const DAY = 86_400;
const MAX_COUNT = 100_000;
/** A period can be claimed once it has ended, and until this many days after. */
export const CLAIM_DAYS = 14;
/** At most this many requests that were not declined, per account, in any 365 days. */
export const REFUNDS_PER_YEAR = 2;
/** Months differ in length, so the previous period may be up to this much longer or shorter than the current one. */
const LENGTH_SLACK = 4 * DAY;

export interface RefundClaim {
  periodStart: number;
  periodEnd: number;
  kept: number;
  judged: number;
  better: number;
}

/** The claim if the body is one: a period as Unix seconds and three counts, all non-negative integers, the counts at most 100,000. */
export function parseRefundClaim(body: unknown): RefundClaim | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const seconds = (v: unknown) => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : null);
  const count = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_COUNT ? (v as number) : null);
  const claim = { periodStart: seconds(b.periodStart), periodEnd: seconds(b.periodEnd), kept: count(b.kept), judged: count(b.judged), better: count(b.better) };
  return Object.values(claim).every((v) => v !== null) ? (claim as RefundClaim) : null;
}

/** The rule itself: nothing kept, or fewer than half of at least 3 judged came out better. */
export const qualifiesForRefund = (c: Pick<RefundClaim, 'kept' | 'judged' | 'better'>) => c.kept === 0 || (c.judged >= 3 && c.better * 2 < c.judged);

/** Why a claim is refused: a sentence for the app to show, and a word it can act on. */
export interface RefundProblem {
  reason: 'subscription' | 'period' | 'early' | 'late' | 'counts';
  error: string;
}

/**
 * Why this user cannot claim this period, or null when they can. The period must be the subscription's current one,
 * or the one before it (ending where the current one starts, and about as long), and it must have ended, no more than
 * CLAIM_DAYS ago. The period that just ended is normally the previous one, since Stripe has started the next. The
 * current one can be claimed only once it has run out: a cancelled subscription keeps its last period.
 */
export function refundPeriodProblem(user: User, claim: RefundClaim, nowSeconds = Date.now() / 1000): RefundProblem | null {
  if (!user.stripe_subscription_id || user.period_start === null || user.period_end === null) return { reason: 'subscription', error: 'Refunds are for Pro subscriptions, and this account has none.' };
  const length = user.period_end - user.period_start;
  const current = claim.periodStart === user.period_start && claim.periodEnd === user.period_end;
  const previous = claim.periodEnd === user.period_start && claim.periodStart < claim.periodEnd && Math.abs(claim.periodEnd - claim.periodStart - length) <= LENGTH_SLACK;
  if (!current && !previous) return { reason: 'period', error: 'That is not your current or previous billing period.' };
  if (nowSeconds < claim.periodEnd) return { reason: 'early', error: `A billing period can be claimed once it has ended, until ${CLAIM_DAYS} days after.` };
  if (nowSeconds >= claim.periodEnd + CLAIM_DAYS * DAY) return { reason: 'late', error: `A billing period can be claimed until ${CLAIM_DAYS} days after it ends, and this one ended longer ago.` };
  return null;
}

/** Why these counts cannot be refunded, or null when they qualify. */
export function refundCountsProblem(claim: RefundClaim): RefundProblem | null {
  if (claim.better > claim.judged) return { reason: 'counts', error: 'The counts do not add up: more came out better than were judged.' };
  if (!qualifiesForRefund(claim)) return { reason: 'counts', error: 'Your receipts for this period show First Try helped. A period is refunded when nothing was kept, or when fewer than half of at least 3 judged answers came out better.' };
  return null;
}
