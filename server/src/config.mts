// Settings come from the environment (on the VPS: /etc/pimpmyprompt/env, readable by root only).
const env = process.env;
const num = (name: string, fallback: number) => (env[name] ? Number(env[name]) : fallback);

export const config = {
  port: num('PORT', 8787),
  host: env.HOST ?? '127.0.0.1',
  /** Public address of the site, for Stripe return pages and emails. */
  siteUrl: (env.SITE_URL ?? 'https://firstry.ai').replace(/\/$/, ''),
  dbPath: env.DB_PATH ?? '/var/lib/pimpmyprompt/app.db',
  /** HMAC secret for sign-in codes. Required in production. */
  codeSecret: env.CODE_SECRET ?? '',

  anthropicKey: env.ANTHROPIC_API_KEY ?? '',
  anthropicBase: (env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, ''),
  /** Only what the app sends. Anything else is refused, so the endpoint is not a general Claude proxy. */
  allowedModels: (env.ALLOWED_MODELS ?? 'claude-opus-5-5').split(',').map((s) => s.trim()),
  allowedBetas: (env.ALLOWED_BETAS ?? 'server-side-fallback-2026-07-01').split(',').map((s) => s.trim()),
  maxTokensCap: num('MAX_TOKENS_CAP', 8192),
  maxBodyBytes: num('MAX_BODY_BYTES', 8 * 1024 * 1024),

  /** Model usage each plan may spend, in millionths of a dollar. */
  trialMicros: num('TRIAL_MICROS', 1_000_000), // $1.00 once, roughly 25 presses
  proMicros: num('PRO_MICROS', 8_000_000), // $8.00 per billing period, roughly 200 presses
  /** $ per million tokens, from the claude-opus-5-5 rate card (eval/cost.mts). */
  price: {
    input: num('PRICE_INPUT', 4),
    output: num('PRICE_OUTPUT', 20),
    cacheWrite: num('PRICE_CACHE_WRITE', 5),
    cacheRead: num('PRICE_CACHE_READ', 0.2),
  },

  /** Requests per user per minute, and at most this many in flight at once. */
  userPerMinute: num('USER_PER_MINUTE', 30),
  userConcurrent: num('USER_CONCURRENT', 4),

  /** Lets the knowledge-base tool download outcomes. Unset = the export route does not exist. */
  adminToken: env.PMP_ADMIN_TOKEN ?? '',

  mail: {
    resendKey: env.RESEND_API_KEY ?? '',
    from: env.MAIL_FROM ?? 'First Try <signin@firstry.ai>',
    /** Development only: write sign-in codes to the log instead of sending them. */
    logCodes: env.MAIL_LOG_CODES === '1',
  },

  stripe: {
    /** A restricted key (rk_…) with: Checkout Sessions, Customers, Customer portal write; Subscriptions, Invoices, Charges read. */
    key: env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
    priceId: env.STRIPE_PRICE_ID ?? '',
    /** Leave off until Stripe Tax has an active registration; otherwise Stripe silently collects nothing. */
    automaticTax: env.STRIPE_AUTOMATIC_TAX === '1',
    apiVersion: '2026-10-28.endive',
  },
};

export function checkConfig(): string[] {
  const problems: string[] = [];
  if (!config.anthropicKey) problems.push('ANTHROPIC_API_KEY is not set: Claude calls will fail.');
  if (config.codeSecret.length < 32) problems.push('CODE_SECRET is missing or shorter than 32 characters.');
  if (!config.mail.resendKey && !config.mail.logCodes) problems.push('No RESEND_API_KEY: sign-in emails cannot be sent.');
  if (!config.stripe.key || !config.stripe.priceId) problems.push('Stripe is not configured: upgrading is disabled.');
  if (config.stripe.key && !config.stripe.webhookSecret) problems.push('STRIPE_WEBHOOK_SECRET is missing: subscription changes will not sync.');
  return problems;
}
