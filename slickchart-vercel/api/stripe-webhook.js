// POST /api/stripe-webhook — Stripe calls this directly whenever a checkout
// completes or a subscription changes. This is the ONLY place that ever marks
// an email as "paid" — the app itself never decides that on its own.
//
// Setup required in Stripe's dashboard (Developers → Webhooks → Add endpoint):
//   URL:    https://slickchart.app/api/stripe-webhook
//   Events: checkout.session.completed, customer.subscription.updated,
//           customer.subscription.deleted
// Copy the "Signing secret" it gives you into Vercel as STRIPE_WEBHOOK_SECRET.
//
// Vercel-specific: signature verification needs the exact raw request bytes,
// so automatic body parsing is turned off below and the body is read by hand.
import crypto from 'crypto';
import { sql, ensureProvidersTable } from '../lib/db.js';

export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Reject a signature whose timestamp is older than this (seconds). Matches Stripe's own
// default tolerance and blocks replay of a captured-but-stale signed payload.
const SIG_TOLERANCE_SEC = 300;
function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  sigHeader.split(',').forEach((p) => { const [k, v] = p.split('='); parts[k] = v; });
  if (!parts.t || !parts.v1) return false;
  // Replay guard: the timestamp must be recent (and a valid number).
  const ts = parseInt(parts.t, 10);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > SIG_TOLERANCE_SEC) return false;
  const signedPayload = parts.t + '.' + rawBody;
  const computed = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(parts.v1));
  } catch (e) { return false; }
}

// Stripe subscription events reference the customer by ID, not email — this
// looks the email up via Stripe's own API when we don't already have it stored.
async function lookupCustomerEmail(customerId) {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key || !customerId) return '';
  try {
    const r = await fetch('https://api.stripe.com/v1/customers/' + customerId, {
      headers: { Authorization: 'Bearer ' + key }
    });
    if (!r.ok) return '';
    const j = await r.json();
    return (j && j.email || '').toLowerCase();
  } catch (e) { return ''; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret) { res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET is not configured.' }); return; }

  const rawBody = await readRawBody(req);
  const sig = req.headers['stripe-signature'];
  if (!verifyStripeSignature(rawBody, sig, secret)) {
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  let event;
  try { event = JSON.parse(rawBody); } catch (e) { res.status(400).json({ error: 'Bad payload' }); return; }

  try {
    await ensureProvidersTable();
    const q = sql();

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = ((session.customer_details && session.customer_details.email) || session.customer_email || '').trim().toLowerCase();
      const customerId = session.customer || null;
      const subscriptionId = session.subscription || null;
      if (email) {
        await q`INSERT INTO subscriptions (email, stripe_customer_id, stripe_subscription_id, status, updated_at)
          VALUES (${email}, ${customerId}, ${subscriptionId}, 'active', now())
          ON CONFLICT (email) DO UPDATE SET
            stripe_customer_id=EXCLUDED.stripe_customer_id,
            stripe_subscription_id=EXCLUDED.stripe_subscription_id,
            status='active', updated_at=now()`;
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const customerId = sub.customer;
      const rawStatus = sub.status || 'canceled';
      const status = (rawStatus === 'active' || rawStatus === 'trialing') ? 'active'
        : (rawStatus === 'past_due' || rawStatus === 'unpaid') ? 'past_due' : 'canceled';
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
      const planAmount = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price
        ? sub.items.data[0].price.unit_amount : null;
      const existing = await q`SELECT email FROM subscriptions WHERE stripe_customer_id=${customerId}`;
      if (existing[0]) {
        await q`UPDATE subscriptions SET status=${status}, stripe_subscription_id=${sub.id},
          current_period_end=${periodEnd}, plan_amount=${planAmount}, updated_at=now()
          WHERE stripe_customer_id=${customerId}`;
      } else {
        const email = await lookupCustomerEmail(customerId);
        if (email) {
          await q`INSERT INTO subscriptions (email, stripe_customer_id, stripe_subscription_id, status, current_period_end, plan_amount, updated_at)
            VALUES (${email}, ${customerId}, ${sub.id}, ${status}, ${periodEnd}, ${planAmount}, now())
            ON CONFLICT (email) DO UPDATE SET status=EXCLUDED.status, stripe_subscription_id=EXCLUDED.stripe_subscription_id,
              current_period_end=EXCLUDED.current_period_end, plan_amount=EXCLUDED.plan_amount, updated_at=now()`;
        }
      }
    }
    res.status(200).json({ received: true });
  } catch (e) {
    console.error('[stripe-webhook]', e && e.message || e);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
