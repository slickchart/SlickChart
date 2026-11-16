// Keeping providers (2026-11-16). Ashley: "ask monthly payers to switch to yearly in months 2 to 5, and
// offer a pause when someone cancels".
//
//   subscriptionOffer  what the billing screen and Home may offer THIS provider: the yearly card (monthly
//                      payers in her chosen months of paying) and a pause in place of cancelling.
//   pauseSubscription  skips her next N monthly bills with Stripe's pause_collection (behavior 'void').
//                      She keeps the time she already paid for; from the end of it (pause_starts_at)
//                      until billing starts again SlickChart is LOCKED, her data kept safe. Ashley,
//                      2026-11-15: "i dont like that if people pause they can keep using the app - that
//                      means they are using it for free".
//   unpauseSubscription  "Resume now". Before the lock starts: just cancels the pause, nothing charged.
//                      While locked: bills today (new billing date = today) and opens the app.
//
// Every number is a founder setting (lib/referral.js REFERRAL_SETTINGS, grow_*), CLAUDE.md §1f.
// Identity: callers pass the email read from the verified session's own provider row (accountEmail), and
// the subscription row read by that email. Nothing here takes an email, id or subscription from a request.
import { getReferralSettings, stripeApi } from './referral.js';

const DAY = 86400000;

let _pauseReady = false;
export async function ensurePauseTable(q) {
  if (_pauseReady) return;
  await q`CREATE TABLE IF NOT EXISTS subscription_pauses (
    id serial PRIMARY KEY,
    email text NOT NULL,
    sub_id text,
    months int,
    resumes_at timestamptz,
    at timestamptz DEFAULT now()
  )`;
  await q`CREATE INDEX IF NOT EXISTS subscription_pauses_email_idx ON subscription_pauses (email)`;
  _pauseReady = true;
}

// Calendar months added to a date (Jan 31 + 1 month = Feb 28/29, never Mar 3).
export function addMonths(ms, n) {
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}

const ms = v => (v ? new Date(v).getTime() || 0 : 0);

// Pure: everything the offer depends on, so it can be tested without a database.
//   sub        her subscriptions row (status, plan_interval, cancel_at_period_end, paused_until, plan_amount)
//   s          founder settings
//   facts      { onTrial, firstPaidMs, pausesThisYear, nowMs }
export function offerFor(sub, s, facts) {
  const now = facts.nowMs || Date.now();
  const out = {
    pauseOn: !!s.grow_pause_on, pauseMax: s.grow_pause_max, pausesPerYear: s.grow_pause_per_year,
    canPause: false, pauseWhy: '',
    paused: false, pausedUntil: null, pauseStartsAt: null, locked: false,
    yearlyFrom: s.grow_yearly_from, yearlyTo: s.grow_yearly_to,
    monthOfPaying: null, showYearly: false,
    onTrial: !!facts.onTrial
  };
  if (!sub) { out.pauseWhy = 'no subscription'; return out; }
  const pu = ms(sub.paused_until);
  if (pu && pu > now) {
    out.paused = true; out.pausedUntil = new Date(pu).toISOString();
    const ps = ms(sub.pause_starts_at);
    if (ps) out.pauseStartsAt = new Date(ps).toISOString();
    // No start on record (paused some other way): treat it as started, never as free use.
    out.locked = !ps || now >= ps;
  }
  const active = sub.status === 'active';
  const monthly = sub.plan_interval !== 'year';
  const ending = !!sub.cancel_at_period_end;
  if (facts.firstPaidMs && !facts.onTrial) out.monthOfPaying = Math.floor((now - facts.firstPaidMs) / (30.44 * DAY)) + 1;

  if (!active) out.pauseWhy = 'not active';
  else if (!s.grow_pause_on) out.pauseWhy = 'pauses are off';
  else if (facts.onTrial) out.pauseWhy = 'on the free trial';
  else if (!monthly) out.pauseWhy = 'yearly plan';
  else if (ending) out.pauseWhy = 'already cancelled';
  else if (out.paused) out.pauseWhy = 'already paused';
  else if ((facts.pausesThisYear || 0) >= s.grow_pause_per_year) out.pauseWhy = 'used this year';
  else out.canPause = true;

  out.showYearly = !!(active && monthly && !ending && !out.paused && !facts.onTrial && out.monthOfPaying
    && out.monthOfPaying >= s.grow_yearly_from && out.monthOfPaying <= s.grow_yearly_to);
  return out;
}

async function factsFor(q, email, sub) {
  const f = { onTrial: false, firstPaidMs: 0, pausesThisYear: 0, nowMs: Date.now() };
  try {
    const t = (await q`SELECT outcome, first_paid_at FROM trial_outcomes WHERE email = ${email}
      ORDER BY trial_start DESC NULLS LAST LIMIT 1`)[0];
    if (t) {
      f.onTrial = t.outcome === 'trialing' || t.outcome === 'cancel_scheduled';
      f.firstPaidMs = ms(t.first_paid_at);
    }
  } catch (e) { /* no trial table yet: not on a trial */ }
  // A provider who never had a trial (or whose trial row has no payment yet): the once-ever "started
  // paying" stamp on her subscription row.
  if (!f.firstPaidMs && sub) f.firstPaidMs = ms(sub.paid_notified_at);
  try {
    await ensurePauseTable(q);
    const r = await q`SELECT count(*)::int AS n FROM subscription_pauses WHERE email = ${email} AND at > now() - interval '365 days'`;
    f.pausesThisYear = (r[0] && r[0].n) || 0;
  } catch (e) {}
  return f;
}

export async function subscriptionOffer(q, email, sub) {
  if (!sub) return null;   // nothing to offer, and no reason to read anything
  const s = await getReferralSettings(q);
  return offerFor(sub, s, await factsFor(q, email, sub));
}

// Pause her next `months` bills. Re-checks everything against the live Stripe subscription, so a stale
// row can never pause the wrong plan or a plan in its trial.
export async function pauseSubscription(q, email, sub, months) {
  const s = await getReferralSettings(q);
  const offer = offerFor(sub, s, await factsFor(q, email, sub));
  if (!offer.canPause) return { ok: false, error: 'A pause is not available on this plan right now.', why: offer.pauseWhy };
  const n = Math.round(Number(months));
  if (!(n >= 1 && n <= s.grow_pause_max)) return { ok: false, error: 'Pick 1 to ' + s.grow_pause_max + ' months.' };
  if (!sub.stripe_subscription_id) return { ok: false, error: 'No subscription found.' };
  const live = await stripeApi('GET', '/subscriptions/' + encodeURIComponent(sub.stripe_subscription_id));
  if (!live.ok || !live.data) return { ok: false, error: 'Could not reach billing. Try again.' };
  const L = live.data;
  const price = L.items && L.items.data && L.items.data[0] && L.items.data[0].price;
  if (L.status !== 'active' || L.cancel_at_period_end || L.pause_collection
      || !(price && price.recurring && price.recurring.interval === 'month')) {
    return { ok: false, error: 'A pause is not available on this plan right now.' };
  }
  // She has already paid up to the end of this period. Skipping N bills = billing starts again N months
  // after that.
  const periodEnd = (L.current_period_end || 0) * 1000 || Date.now();
  const resumes = addMonths(periodEnd, n);
  const r = await stripeApi('POST', '/subscriptions/' + encodeURIComponent(L.id),
    { pause_collection: { behavior: 'void', resumes_at: Math.floor(resumes / 1000) } },
    'pause-' + L.id + '-' + n + '-' + Math.floor(Date.now() / 600000));   // a double tap is one pause
  if (!r.ok) return { ok: false, error: 'Billing would not pause it. Try again, or email support@slickchart.app.' };
  const until = new Date(resumes).toISOString();
  const starts = new Date(periodEnd).toISOString();
  try { await q`UPDATE subscriptions SET paused_until = ${until}, pause_starts_at = ${starts} WHERE email = ${email}`; } catch (e) {}
  try {
    await ensurePauseTable(q);
    await q`INSERT INTO subscription_pauses (email, sub_id, months, resumes_at) VALUES (${email}, ${L.id}, ${n}, ${until})`;
  } catch (e) {}
  return { ok: true, pausedUntil: until, pauseStartsAt: starts, months: n };
}

export async function unpauseSubscription(q, email, sub) {
  if (!sub || !sub.stripe_subscription_id) return { ok: false, error: 'No subscription found.' };
  const now = Date.now();
  const ps = ms(sub.pause_starts_at), pu = ms(sub.paused_until);
  // Already into the paused months: coming back early means paying again from today, so the app is
  // never open without a paid month behind it. Before the lock starts she is still in time she paid for.
  const charge = !!(pu && pu > now && (!ps || now >= ps));
  const body = charge
    ? { pause_collection: '', billing_cycle_anchor: 'now', proration_behavior: 'none' }
    : { pause_collection: '' };
  const r = await stripeApi('POST', '/subscriptions/' + encodeURIComponent(sub.stripe_subscription_id), body,
    'unpause-' + sub.stripe_subscription_id + '-' + Math.floor(now / 600000));
  if (!r.ok) return { ok: false, error: 'Could not resume it. Try again, or email support@slickchart.app.' };
  try { await q`UPDATE subscriptions SET paused_until = NULL, pause_starts_at = NULL WHERE email = ${email}`; } catch (e) {}
  return { ok: true, charged: charge };
}
