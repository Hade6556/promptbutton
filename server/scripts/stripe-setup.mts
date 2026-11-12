// One-time Stripe setup: the Pro product, its monthly price and the webhook endpoint.
// Safe to re-run: it finds what already exists by lookup key and URL.
//
//   STRIPE_SECRET_KEY=sk_... PRO_PRICE_CENTS=1200 node server/scripts/stripe-setup.mts
//
// Prints the env lines for the server (STRIPE_PRICE_ID, and STRIPE_WEBHOOK_SECRET when the endpoint is new).
// Use a sandbox key first. Creating products and webhooks needs a secret key or a restricted key with
// Products, Prices and Webhook Endpoints write access; the running server then only needs the narrower
// restricted key described in server/src/config.mts.
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error('Set STRIPE_SECRET_KEY.');
const cents = Number(process.env.PRO_PRICE_CENTS ?? 1200);
const currency = (process.env.PRO_CURRENCY ?? 'usd').toLowerCase();
const webhookUrl = process.env.WEBHOOK_URL ?? 'https://firstry.ai/api/stripe/webhook';
const stripe = new Stripe(key, { apiVersion: '2026-10-28.endive' as Stripe.StripeConfig['apiVersion'] });
const LOOKUP = `pmp_pro_monthly_${currency}_${cents}`;

const existing = (await stripe.prices.list({ lookup_keys: [LOOKUP], active: true, limit: 1 })).data[0];
let price = existing;
if (!price) {
  const product = await stripe.products.create({ name: 'Firstry Pro', description: 'Monthly allowance of prompt rewrites in the Firstry Mac app.' });
  price = await stripe.prices.create({ product: product.id, currency, unit_amount: cents, recurring: { interval: 'month' }, lookup_key: LOOKUP });
  console.error(`created ${product.id} and ${price.id}`);
} else console.error(`found existing price ${price.id}`);

const events: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'invoice.paid', 'invoice.payment_failed',
  'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed', 'radar.early_fraud_warning.created',
];
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const found = endpoints.data.find((e) => e.url === webhookUrl);
console.log(`STRIPE_PRICE_ID=${price.id}`);
if (found) {
  await stripe.webhookEndpoints.update(found.id, { enabled_events: events });
  console.error(`webhook ${found.id} already exists; its signing secret is in the Dashboard (Developers, Webhooks).`);
} else {
  const endpoint = await stripe.webhookEndpoints.create({ url: webhookUrl, enabled_events: events, api_version: '2026-10-28.endive' as Stripe.WebhookEndpointCreateParams['api_version'] });
  console.log(`STRIPE_WEBHOOK_SECRET=${endpoint.secret}`);
}
