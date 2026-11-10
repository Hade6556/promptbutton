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
