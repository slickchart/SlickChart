// What happened to every free trial (2026-11-11, Ashley: "track when a provider cancels after their
// trial ends and put that into my daily ops monitoring").
//
// One row per Stripe subscription that had a trial. The outcome is worked out from Stripe's own fields:
//   trialing             still in the free trial
//   cancel_scheduled     still in the trial, but she has already pressed cancel (ends at trial end)
//   canceled_in_trial    the trial ended because she canceled it, before any payment
//   trial_unpaid         the trial ended and the first bill never went through (card failed, gone)
//   payment_failing      the trial ended and the first bill is failing right now (Stripe is retrying)
//   converted            paying after the trial
//   canceled_after_paying  paid at least once, then canceled
//
// Two ways in, so a missed webhook can't hide one: the Stripe webhook calls recordTrialFromSubscription /
// recordTrialPayment as events land, and syncTrialsFromStripe (run by GET /api/admin/trials) re-reads
// recent trials straight from Stripe. Founder-only data: no provider ever reads this table.
import { stripeApi } from './referral.js';

export async function ensureTrialTable(q) {
  await q`CREATE TABLE IF NOT EXISTS trial_outcomes (
    sub_id TEXT PRIMARY KEY,
    email TEXT,
    customer TEXT,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    status TEXT,
    outcome TEXT,
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    first_paid_at TIMESTAMPTZ,
    paid_invoices INT DEFAULT 0,
    plan_amount INT,
    plan_interval TEXT,
    reason TEXT,
    feedback TEXT,
    comment TEXT,
    outcome_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
  )`;
  await q`CREATE INDEX IF NOT EXISTS trial_outcomes_end_idx ON trial_outcomes (trial_end)`;
}

const ts = s => (s ? new Date(s * 1000).toISOString() : null);

// Pure: Stripe subscription + what we know about payments -> outcome.
export function trialOutcome(sub, paidInvoices, nowMs) {
  const now = nowMs || Date.now();
  const st = String(sub.status || '');
  const trialEnd = sub.trial_end ? sub.trial_end * 1000 : 0;
  const paid = Number(paidInvoices || 0) > 0;
  if (st === 'trialing') return sub.cancel_at_period_end || sub.cancel_at ? 'cancel_scheduled' : 'trialing';
  if (st === 'active') return paid || (trialEnd && now > trialEnd) ? 'converted' : 'trialing';
  if (st === 'past_due' || st === 'unpaid' || st === 'incomplete') return paid ? 'converted' : 'payment_failing';
  if (st === 'canceled' || st === 'incomplete_expired') {
    if (paid) return 'canceled_after_paying';
    const when = (sub.canceled_at || sub.ended_at || 0) * 1000;
    const reason = sub.cancellation_details && sub.cancellation_details.reason;
    // Stripe's own reason wins: payment_failed means the card, cancellation_requested means she chose.
    if (reason === 'payment_failed') return 'trial_unpaid';
    if (reason === 'cancellation_requested') return 'canceled_in_trial';
    return trialEnd && when && when < trialEnd - 60000 ? 'canceled_in_trial' : 'trial_unpaid';
  }
  return 'trialing';
}

export const OUTCOME_LABELS = {
  trialing: 'On the free trial',
  cancel_scheduled: 'On the trial, already canceled (ends at trial end)',
  canceled_in_trial: 'Canceled the trial, never paid',
  trial_unpaid: 'Trial ended, first bill never went through',
  payment_failing: 'Trial ended, first bill failing (Stripe retrying)',
  converted: 'Paying after the trial',
  canceled_after_paying: 'Paid, then canceled'
};

// Did she leave (or is she leaving)? These are the ones Ashley wants to hear about.
export const LEFT = ['cancel_scheduled', 'canceled_in_trial', 'trial_unpaid', 'payment_failing', 'canceled_after_paying'];

async function upsert(q, sub, email, paidOverride) {
  if (!sub || !sub.id || !sub.trial_end) return null;
  await ensureTrialTable(q);
  const prev = (await q`SELECT paid_invoices, first_paid_at, outcome, email FROM trial_outcomes WHERE sub_id = ${sub.id}`)[0];
  const paid = Math.max(Number(prev && prev.paid_invoices || 0), Number(paidOverride || 0));
  const outcome = trialOutcome(sub, paid);
  const price = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price;
  const cd = sub.cancellation_details || {};
  const em = String(email || (prev && prev.email) || '').trim().toLowerCase() || null;
  const changed = !prev || prev.outcome !== outcome;
  await q`INSERT INTO trial_outcomes (sub_id, email, customer, trial_start, trial_end, status, outcome, cancel_at_period_end,
      canceled_at, ended_at, paid_invoices, plan_amount, plan_interval, reason, feedback, comment, outcome_at, updated_at)
    VALUES (${sub.id}, ${em}, ${typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null},
      ${ts(sub.trial_start)}, ${ts(sub.trial_end)}, ${sub.status || null}, ${outcome}, ${!!sub.cancel_at_period_end},
      ${ts(sub.canceled_at)}, ${ts(sub.ended_at)}, ${paid}, ${price ? price.unit_amount : null},
      ${price && price.recurring ? price.recurring.interval : null}, ${cd.reason || null}, ${cd.feedback || null},
      ${cd.comment ? String(cd.comment).slice(0, 500) : null}, now(), now())
    ON CONFLICT (sub_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, trial_outcomes.email), status = EXCLUDED.status,
      customer = COALESCE(EXCLUDED.customer, trial_outcomes.customer), trial_start = EXCLUDED.trial_start, trial_end = EXCLUDED.trial_end,
      outcome = EXCLUDED.outcome, cancel_at_period_end = EXCLUDED.cancel_at_period_end, canceled_at = EXCLUDED.canceled_at,
      ended_at = EXCLUDED.ended_at, paid_invoices = GREATEST(trial_outcomes.paid_invoices, EXCLUDED.paid_invoices),
      plan_amount = EXCLUDED.plan_amount, plan_interval = EXCLUDED.plan_interval, reason = EXCLUDED.reason,
      feedback = EXCLUDED.feedback, comment = EXCLUDED.comment,
      outcome_at = CASE WHEN trial_outcomes.outcome IS DISTINCT FROM EXCLUDED.outcome THEN now() ELSE trial_outcomes.outcome_at END,
      updated_at = now()`;
  return { outcome, changed, email: em };
}

// From the webhook: every customer.subscription.updated / .deleted. Never throws.
export async function recordTrialFromSubscription(q, sub, email) {
  try { return await upsert(q, sub, email); } catch (e) { console.error('[trial-outcomes]', e && e.message || e); return null; }
}

// From the webhook: invoice.paid with real money on a trial subscription. Never throws.
export async function recordTrialPayment(q, invoice) {
  try {
    if (!invoice || !(Number(invoice.amount_paid || 0) > 0)) return null;
    const subId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription && invoice.subscription.id);
    if (!subId) return null;
    await ensureTrialTable(q);
    const r = await q`UPDATE trial_outcomes SET paid_invoices = paid_invoices + 1, first_paid_at = COALESCE(first_paid_at, now()),
      outcome = CASE WHEN outcome IN ('canceled_in_trial', 'trial_unpaid', 'canceled_after_paying') THEN outcome ELSE 'converted' END,
      outcome_at = CASE WHEN outcome IN ('converted', 'canceled_in_trial', 'trial_unpaid', 'canceled_after_paying') THEN outcome_at ELSE now() END,
      updated_at = now() WHERE sub_id = ${subId} RETURNING outcome`;
    if (r[0]) return r[0];
    // The bill can land before the subscription event that opens her row. Keep the payment on a bare
    // row (no trial_end, so no report counts it) and the subscription event fills in the rest.
    await q`INSERT INTO trial_outcomes (sub_id, customer, paid_invoices, first_paid_at, updated_at)
      VALUES (${subId}, ${typeof invoice.customer === 'string' ? invoice.customer : null}, 1, now(), now())
      ON CONFLICT (sub_id) DO NOTHING`;
    return null;
  } catch (e) { console.error('[trial-outcomes] payment', e && e.message || e); return null; }
}

// Re-read recent trials from Stripe (the backstop, and the backfill for trials begun before this shipped).
export async function syncTrialsFromStripe(q, days) {
  const out = { read: 0, saved: 0, error: '' };
  try {
    await ensureTrialTable(q);
    const since = Math.floor(Date.now() / 1000) - (Math.max(1, Math.min(365, Number(days) || 60)) + 31) * 86400;
    const known = {};
    for (const r of await q`SELECT sub_id, status, paid_invoices FROM trial_outcomes WHERE updated_at > now() - interval '400 days'`) known[r.sub_id] = r;
    let after = null;
    for (let page = 0; page < 5; page++) {
      const params = { status: 'all', limit: 100, 'created[gte]': since, 'expand[]': 'data.customer' };
      if (after) params.starting_after = after;
      const r = await stripeApi('GET', '/subscriptions', params);
      if (!r.ok) { out.error = r.error || 'Stripe refused'; break; }
      const list = (r.data && r.data.data) || [];
      for (const sub of list) {
        out.read++;
        if (!sub.trial_end) continue;
        const email = sub.customer && typeof sub.customer === 'object' ? sub.customer.email : '';
        let paid = 0;
        // Only a trial that ended, and changed since we last saw it, needs a look at its bills, so the
        // daily re-read stays a handful of Stripe calls however many providers are paying.
        const prev = known[sub.id];
        if (sub.status !== 'trialing' && !(prev && (Number(prev.paid_invoices) > 0 || prev.status === sub.status))) {
          const inv = await stripeApi('GET', '/invoices', { subscription: sub.id, status: 'paid', limit: 10 });
          if (inv.ok) paid = ((inv.data && inv.data.data) || []).filter(i => Number(i.amount_paid || 0) > 0).length;
        }
        const plain = Object.assign({}, sub, { customer: sub.customer && typeof sub.customer === 'object' ? sub.customer.id : sub.customer });
        if (await upsert(q, plain, email, paid)) out.saved++;
      }
      if (!(r.data && r.data.has_more) || !list.length) break;
      after = list[list.length - 1].id;
    }
  } catch (e) { out.error = (e && e.message) || 'sync failed'; }
  return out;
}

// Stripe's cancellation feedback codes, in words.
const FEEDBACK = { too_expensive: 'too expensive', missing_features: 'missing features', switched_service: 'switched to another app',
  unused: 'not using it', customer_service: 'customer service', too_complex: 'too complicated', low_quality: 'quality', other: 'other' };
function firstName(n) { return n ? String(n).trim().split(/\s+/)[0] : ''; }

// The founder's numbers. `days` is the look-back window for "recent", her choice per call.
export async function trialReport(q, days) {
  await ensureTrialTable(q);
  const d = Math.max(1, Math.min(365, Number(days) || 30));
  const rows = await q`SELECT t.*, p.name FROM trial_outcomes t LEFT JOIN providers p ON lower(p.email) = t.email
    WHERE t.trial_end IS NOT NULL ORDER BY COALESCE(t.outcome_at, t.updated_at) DESC LIMIT 500`;
  const counts = {}; for (const k of Object.keys(OUTCOME_LABELS)) counts[k] = 0;
  for (const r of rows) counts[r.outcome] = (counts[r.outcome] || 0) + 1;
  const ended = rows.filter(r => r.trial_end && new Date(r.trial_end).getTime() < Date.now());
  const endedConverted = ended.filter(r => r.outcome === 'converted' || r.outcome === 'canceled_after_paying').length;
  const cutoff = Date.now() - d * 86400000;
  const recentLeft = rows.filter(r => LEFT.includes(r.outcome) && r.outcome_at && new Date(r.outcome_at).getTime() >= cutoff)
    .map(r => ({
      name: r.name || '', firstName: firstName(r.name), email: r.email || '', outcome: r.outcome, label: OUTCOME_LABELS[r.outcome] || r.outcome,
      at: r.outcome_at, trialEnd: r.trial_end, plan: r.plan_amount ? '$' + (r.plan_amount / 100) + '/' + (r.plan_interval || 'month') : '',
      reason: r.reason || '', feedback: r.feedback ? (FEEDBACK[r.feedback] || String(r.feedback).replace(/_/g, ' ')) : '', comment: r.comment || ''
    }));
  const last24 = recentLeft.filter(r => new Date(r.at).getTime() >= Date.now() - 86400000);
  const endingSoon = rows.filter(r => r.outcome === 'trialing' && r.trial_end && new Date(r.trial_end).getTime() - Date.now() < 3 * 86400000
    && new Date(r.trial_end).getTime() > Date.now()).map(r => ({ firstName: firstName(r.name), email: r.email || '', trialEnd: r.trial_end }));
  const lines = [];
  if (last24.length) for (const r of last24) lines.push((r.name || r.email || 'A provider') + ': ' + r.label + (r.feedback || r.comment ? ' (said: ' + [r.feedback, r.comment].filter(Boolean).join(', ') + ')' : ''));
  return {
    days: d,
    counts, labels: OUTCOME_LABELS,
    trialsEnded: ended.length,
    conversionPct: ended.length ? Math.round(endedConverted * 100 / ended.length) : null,
    last24h: last24, recentLeft, endingSoon,
    summary: (last24.length ? last24.length + ' left in the last 24 hours. ' : 'Nobody left in the last 24 hours. ')
      + counts.trialing + ' on a trial now' + (endingSoon.length ? ', ' + endingSoon.length + ' ending in the next 3 days' : '') + '. '
      + (ended.length ? conversionText(endedConverted, ended.length) : 'No trial has ended yet.'),
    lines
  };
}
function conversionText(n, of) { return n + ' of ' + of + ' ended trials became paying (' + Math.round(n * 100 / of) + '%).'; }
