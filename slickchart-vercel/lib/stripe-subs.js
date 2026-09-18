// Asking Stripe directly whether an email is really paying, and repairing our row when it is not.
//
// `subscriptions` stores ONE row per email (email is the primary key), but Stripe happily creates a
// second CUSTOMER for the same address — which is exactly what an accidental double signup produces.
// Both customers then write to that one row, so cancelling the duplicate stamps status='canceled'
// over the subscription the provider is still paying for, and they are locked out of their own
// account. Stripe is the source of truth for who is paying, so when our row disagrees, ask it.
import { sql } from './db.js';

async function stripeGet(url) {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) return null;
  try {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

/**
 * The live (active or trialing) subscription for this email in Stripe, across EVERY customer that
 * shares the address. `excludeSubId` skips the one a webhook is currently processing.
 * Returns the subscription object, or null. Never throws.
 */
export async function liveSubForEmail(email, excludeSubId) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return null;
  const customers = await stripeGet('https://api.stripe.com/v1/customers?limit=100&email=' + encodeURIComponent(em));
  for (const c of ((customers && customers.data) || [])) {
    if (!c || !c.id) continue;
    // status=all then filter, so a trialing subscription counts too.
    const subs = await stripeGet('https://api.stripe.com/v1/subscriptions?limit=100&status=all&customer=' + encodeURIComponent(c.id));
    for (const sub of ((subs && subs.data) || [])) {
      if (!sub || !sub.id || (excludeSubId && sub.id === excludeSubId)) continue;
      if (sub.status === 'active' || sub.status === 'trialing') return sub;
    }
  }
  return null;
}

/**
 * Point this email's row at the subscription Stripe says is live. Best-effort: a repair that fails
 * must never be the reason someone can't sign in, since the caller has already established from
 * Stripe that they are paying.
 */
export async function repairSubscriptionRow(email, sub) {
  const em = String(email || '').trim().toLowerCase();
  if (!em || !sub || !sub.id) return false;
  try {
    const q = sql();
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
    const planAmount = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price
      ? sub.items.data[0].price.unit_amount : null;
    await q`INSERT INTO subscriptions (email, stripe_customer_id, stripe_subscription_id, status, current_period_end, plan_amount, cancel_at_period_end, updated_at)
      VALUES (${em}, ${sub.customer || null}, ${sub.id}, 'active', ${periodEnd}, ${planAmount}, ${!!sub.cancel_at_period_end}, now())
      ON CONFLICT (email) DO UPDATE SET stripe_customer_id=EXCLUDED.stripe_customer_id,
        stripe_subscription_id=EXCLUDED.stripe_subscription_id, status='active',
        current_period_end=EXCLUDED.current_period_end, plan_amount=EXCLUDED.plan_amount,
        cancel_at_period_end=EXCLUDED.cancel_at_period_end, updated_at=now()`;
    console.log('[stripe-subs] repaired ' + em + ' from Stripe — live subscription ' + sub.id);
    return true;
  } catch (e) {
    console.error('[stripe-subs] repair failed for ' + em + ':', (e && e.message) || e);
    return false;
  }
}
