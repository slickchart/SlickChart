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
 * A subscription that is behind on payment, and where to go and fix it.
 *
 * A provider whose card failed sits in PAST_DUE while Stripe retries for a couple of weeks. Neither
 * `hasActiveSubscription` nor `liveSubForEmail` counts past_due as paying, so she used to be refused
 * at login the moment one payment bounced — shut out of her own business software while she was
 * still, by any ordinary reading, a customer. She is let in now and shown a banner instead; this is
 * what tells the caller to do that.
 *
 * `url` is her OWN open invoice, never the generic STRIPE_PAYMENT_LINK. That distinction is the
 * whole point: the generic link creates a SECOND customer and a SECOND subscription on the same
 * address — the exact double signup this file opens by warning about, where cancelling the duplicate
 * later stamps 'canceled' over the one she is paying for. Her invoice takes a new card and revives
 * the subscription she already has, and creates nothing.
 *
 * Returns { sub, url, label } when she is behind, or null when she is not — in which case a caller
 * refusing the login falls back to the ordinary checkout link, which is right for someone whose
 * subscription genuinely ended. `url` may be '' when Stripe will not give us the invoice; being
 * behind still counts, because the grace must not hinge on a second lookup succeeding.
 *
 * The grace ends by itself: once Stripe gives up retrying it moves the subscription to `canceled`,
 * this returns null, and the login is refused as before. No hand-tuned day count to get wrong.
 *
 * Never throws.
 */
export async function pastDueForEmail(email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return null;
  const customers = await stripeGet('https://api.stripe.com/v1/customers?limit=100&email=' + encodeURIComponent(em));
  for (const c of ((customers && customers.data) || [])) {
    if (!c || !c.id) continue;
    const subs = await stripeGet('https://api.stripe.com/v1/subscriptions?limit=100&status=all&customer=' + encodeURIComponent(c.id));
    for (const sub of ((subs && subs.data) || [])) {
      // past_due: Stripe is still retrying. unpaid: it has stopped, but the invoice is still payable.
      if (!sub || (sub.status !== 'past_due' && sub.status !== 'unpaid')) continue;
      const invId = typeof sub.latest_invoice === 'string' ? sub.latest_invoice
                  : (sub.latest_invoice && sub.latest_invoice.id);
      let url = '';
      if (invId) {
        const inv = await stripeGet('https://api.stripe.com/v1/invoices/' + encodeURIComponent(invId));
        // Only an OPEN invoice is payable — a paid/void/uncollectible one would dead-end her.
        if (inv && inv.status === 'open' && inv.hosted_invoice_url) url = inv.hosted_invoice_url;
      }
      return { sub, url, label: url ? 'Update card' : '' };
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
    const planInterval = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price
      && sub.items.data[0].price.recurring ? sub.items.data[0].price.recurring.interval || null : null;
    await q`INSERT INTO subscriptions (email, stripe_customer_id, stripe_subscription_id, status, current_period_end, plan_amount, plan_interval, cancel_at_period_end, updated_at)
      VALUES (${em}, ${sub.customer || null}, ${sub.id}, 'active', ${periodEnd}, ${planAmount}, ${planInterval}, ${!!sub.cancel_at_period_end}, now())
      ON CONFLICT (email) DO UPDATE SET stripe_customer_id=EXCLUDED.stripe_customer_id,
        stripe_subscription_id=EXCLUDED.stripe_subscription_id, status='active',
        current_period_end=EXCLUDED.current_period_end, plan_amount=EXCLUDED.plan_amount, plan_interval=EXCLUDED.plan_interval,
        cancel_at_period_end=EXCLUDED.cancel_at_period_end, updated_at=now()`;
    console.log('[stripe-subs] repaired ' + em + ' from Stripe — live subscription ' + sub.id);
    return true;
  } catch (e) {
    console.error('[stripe-subs] repair failed for ' + em + ':', (e && e.message) || e);
    return false;
  }
}
