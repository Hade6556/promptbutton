// Stripe: Checkout for the subscription, the Customer Portal for changes, webhooks as the source of truth.
import Stripe from 'stripe';
import { config } from './config.mts';
import { stripeEvents, users, type User } from './db.mts';

let client: Stripe | null = null;
export function stripe(): Stripe | null {
  if (!config.stripe.key) return null;
  // STRIPE_API_BASE is for tests only: it points the SDK at a local stand-in for api.stripe.com.
  const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
  client ??= new Stripe(config.stripe.key, {
    apiVersion: config.stripe.apiVersion as Stripe.StripeConfig['apiVersion'],
    ...(base ? { host: base.hostname, port: Number(base.port), protocol: base.protocol.replace(':', '') as 'http' | 'https' } : {}),
  });
  return client;
}

/** Fixed label so Checkout sessions from the app can be compared in the Dashboard. */
const INTEGRATION_ID = 'pmp_mac_subscription_qzkvhtra';

async function ensureCustomer(s: Stripe, user: User): Promise<string> {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const customer = await s.customers.create({ email: user.email, metadata: { user_id: String(user.id) } }, { idempotencyKey: `customer-${user.id}` });
  users.setCustomer(user.id, customer.id);
  return customer.id;
}

export async function checkoutUrl(user: User): Promise<string> {
  const s = stripe();
  if (!s || !config.stripe.priceId) throw new Error('Billing is not configured.');
  const customer = await ensureCustomer(s, user);
  const params: Stripe.Checkout.SessionCreateParams & { integration_identifier?: string } = {
    mode: 'subscription',
    customer,
    client_reference_id: String(user.id),
    line_items: [{ price: config.stripe.priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${config.siteUrl}/billing/success.html`,
    cancel_url: `${config.siteUrl}/billing/cancel.html`,
    integration_identifier: INTEGRATION_ID,
    ...(config.stripe.automaticTax ? { automatic_tax: { enabled: true }, customer_update: { address: 'auto' as const } } : {}),
  };
  const session = await s.checkout.sessions.create(params);
  if (!session.url) throw new Error('Stripe returned no Checkout URL.');
  return session.url;
}

export async function portalUrl(user: User): Promise<string> {
  const s = stripe();
  if (!s || !user.stripe_customer_id) throw new Error('There is no subscription to manage yet.');
  const session = await s.billingPortal.sessions.create({ customer: user.stripe_customer_id, return_url: `${config.siteUrl}/billing/return.html` });
  return session.url;
}

/** Re-reads the subscription from Stripe, so out-of-order events cannot leave stale state. */
async function syncSubscription(s: Stripe, subscriptionId: string): Promise<string> {
  const sub = await s.subscriptions.retrieve(subscriptionId);
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const user = users.byCustomer(customer);
  if (!user) return `no user for customer ${customer}`;
  const item = sub.items.data[0];
  users.setSubscription(user.id, { subscription: sub.id, status: sub.status, start: item?.current_period_start ?? null, end: item?.current_period_end ?? null });
  return `user ${user.id} → ${sub.status}`;
}

async function customerOfCharge(s: Stripe, charge: string | Stripe.Charge): Promise<string | null> {
  const c = typeof charge === 'string' ? await s.charges.retrieve(charge) : charge;
  return typeof c.customer === 'string' ? c.customer : (c.customer?.id ?? null);
}

async function setHoldForCharge(s: Stripe, charge: string | Stripe.Charge, hold: boolean): Promise<string> {
  const customer = await customerOfCharge(s, charge);
  const user = customer ? users.byCustomer(customer) : undefined;
  if (!user) return 'no matching user';
  users.setHold(user.id, hold);
  return `user ${user.id} hold=${hold}`;
}

export type WebhookResult = { status: number; body: string };

export async function handleWebhook(raw: Buffer, signature: string | undefined): Promise<WebhookResult> {
  const s = stripe();
  if (!s || !config.stripe.webhookSecret) return { status: 503, body: 'not configured' };
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(raw, signature ?? '', config.stripe.webhookSecret);
  } catch {
    return { status: 400, body: 'bad signature' };
  }
  if (!stripeEvents.claim(event.id, event.type)) return { status: 200, body: 'duplicate' };
  try {
    let note = 'ignored';
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          note = await syncSubscription(s, typeof session.subscription === 'string' ? session.subscription : session.subscription.id);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        note = await syncSubscription(s, event.data.object.id);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const ref = invoice.parent?.subscription_details?.subscription;
        if (ref) note = await syncSubscription(s, typeof ref === 'string' ? ref : ref.id);
        break;
      }
      case 'charge.dispute.created':
        note = await setHoldForCharge(s, event.data.object.charge, true);
        break;
      case 'charge.dispute.closed':
        note = event.data.object.status === 'won' ? await setHoldForCharge(s, event.data.object.charge, false) : 'dispute lost, hold stays';
        break;
      case 'radar.early_fraud_warning.created':
        note = await setHoldForCharge(s, event.data.object.charge, true);
        break;
      case 'charge.refunded':
        note = `refunded charge ${event.data.object.id}`;
        break;
    }
    stripeEvents.note(event.id, note);
    console.log(`[stripe] ${event.type} ${event.id}: ${note}`);
    return { status: 200, body: 'ok' };
  } catch (error) {
    stripeEvents.release(event.id); // let Stripe retry
    console.error(`[stripe] ${event.type} ${event.id} failed:`, error instanceof Error ? error.message : error);
    return { status: 500, body: 'retry' };
  }
}
