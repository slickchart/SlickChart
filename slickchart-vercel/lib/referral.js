// "Give a month, get a month" — provider referral codes (2026-11-11, Ashley: "automated + use codes so
// it requires as least work for me as possible ... make sure we can track those metrics").
//
// How it works, end to end, with nobody doing anything by hand:
//   1. A provider opens Refer a friend (or the Home card). /api/referral makes her ONE code the first
//      time (JENNIE17): a real Stripe promotion code on the referral coupon, first-time customers only.
//   2. Her friend types it at Stripe checkout, or taps slickchart.app/r/JENNIE17, which opens the
//      homepage with the code already filled in (prefilled_promo_code). Stripe applies the friend's
//      reward itself (first paid month free, by default) after the 14-day trial.
//   3. api/stripe-webhook.js sees checkout.session.completed carrying that promotion code and records
//      a `referrals` row (recordReferralFromCheckout). The sharer is told.
//   4. On the friend's first real payment (invoice.paid, amount > 0 by default) rewardOnInvoice() adds
//      a month's credit to the SHARER's Stripe balance, exactly once, and tells her.
//   5. /api/admin/referrals reports every number to Ashley (Admin tools, and the Monday brief).
//
// Every amount, limit and wording is Ashley's setting (CLAUDE.md §1f), stored in founder_settings.
//
// Privacy (CLAUDE.md §0): a provider only ever reads rows where referrer_email is HER email, taken
// from her verified session by the endpoint, and only the friend's FIRST NAME and status. The webhook
// is the only writer, and it is authenticated by Stripe's signature.
import { sql } from './db.js';
import { ensureFounderSettingsTable } from './founder-settings.js';
import { safeStripeMessage } from './stripe-safe.js';

// ── Settings ─────────────────────────────────────────────────────────────────────────────────────
// Whole-number settings. key -> { def, min, max, label, unit }
export const REFERRAL_SETTINGS = {
  ref_enabled:          { def: 1,   min: 0, max: 1,    label: 'Referral program on (1) or off (0)', unit: '' },
  ref_friend_pct:       { def: 100, min: 1, max: 100,  label: 'Friend’s discount, percent off', unit: '%' },
  ref_friend_months:    { def: 1,   min: 1, max: 12,   label: 'Friend’s discount lasts this many paid months', unit: 'months' },
  ref_sharer_months:    { def: 1,   min: 0, max: 12,   label: 'Sharer’s credit, in months of her own price (0 = none)', unit: 'months' },
  ref_reward_on_payment:{ def: 1,   min: 0, max: 1,    label: 'Credit the sharer after the friend’s first real payment (1), or as soon as the trial ends (0)', unit: '' },
  ref_max_per_year:     { def: 12,  min: 0, max: 1000, label: 'Most credits one sharer can earn in a year (0 = no limit)', unit: '' },
  ref_home_days:        { def: 7,   min: 0, max: 365,  label: 'Days after joining before the Refer a friend card shows on Home', unit: 'days' },
};
export const DEFAULT_SHARE_MESSAGE = 'I use SlickChart for my charts, forms and client photos. Use my code {code} for your first month free: {link}';
const MESSAGE_KEY = 'ref_share_message';

export function cleanReferralSetting(k, v) {
  const d = REFERRAL_SETTINGS[k];
  if (!d) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(d.max, Math.max(d.min, n));
}

// All settings with defaults filled in, plus `message`. Never throws.
export async function getReferralSettings(q) {
  const out = {};
  for (const k of Object.keys(REFERRAL_SETTINGS)) out[k] = REFERRAL_SETTINGS[k].def;
  out.message = DEFAULT_SHARE_MESSAGE;
  try {
    q = q || sql();
    await ensureFounderSettingsTable(q);
    const rows = await q`SELECT k, v FROM founder_settings WHERE k LIKE 'ref_%'`;
    for (const r of rows) {
      if (r.k === MESSAGE_KEY) { const m = cleanMessage(r.v); if (m) out.message = m; continue; }
      const c = cleanReferralSetting(r.k, r.v); if (c != null) out[r.k] = c;
    }
  } catch (e) {}
  return out;
}

export function cleanMessage(v) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 400);
  return s;
}

export async function setReferralSetting(q, k, v) {
  await ensureFounderSettingsTable(q);
  let val;
  if (k === MESSAGE_KEY || k === 'message') {
    val = cleanMessage(v); if (!val) return null;
    k = MESSAGE_KEY;
  } else {
    const c = cleanReferralSetting(k, v); if (c == null) return null; val = String(c);
  }
  await q`INSERT INTO founder_settings (k, v, updated_at) VALUES (${k}, ${val}, now())
    ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
  return k === MESSAGE_KEY ? val : Number(val);
}

// ── Tables ───────────────────────────────────────────────────────────────────────────────────────
let _ready = false;
export async function ensureReferralTables(q) {
  if (_ready) return;
  q = q || sql();
  // One code per provider (by email, the key subscriptions also uses).
  await q`CREATE TABLE IF NOT EXISTS referral_codes (
    email text PRIMARY KEY,
    code text UNIQUE NOT NULL,
    promo_id text,
    coupon_id text,
    created_at timestamptz DEFAULT now()
  )`;
  // Every Stripe promotion code ever made for a provider. A settings change makes a new one with the
  // same code, so a friend who used an older one is still traced to the right sharer.
  await q`CREATE TABLE IF NOT EXISTS referral_promos (
    promo_id text PRIMARY KEY,
    email text NOT NULL,
    code text NOT NULL,
    coupon_id text,
    created_at timestamptz DEFAULT now()
  )`;
  // One row per referred friend (a friend can only ever be referred once).
  await q`CREATE TABLE IF NOT EXISTS referrals (
    id bigserial PRIMARY KEY,
    code text NOT NULL,
    referrer_email text NOT NULL,
    friend_email text UNIQUE NOT NULL,
    friend_customer text,
    friend_first_name text,
    status text NOT NULL DEFAULT 'trial',
    note text,
    signed_up_at timestamptz DEFAULT now(),
    paid_at timestamptz,
    rewarded_at timestamptz,
    reward_cents int,
    reward_txn text
  )`;
  await q`CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals(referrer_email)`;
  await q`CREATE INDEX IF NOT EXISTS referrals_customer_idx ON referrals(friend_customer)`;
  // Each time a provider copies or sends her code. Counts only, nothing about who she sent it to.
  await q`CREATE TABLE IF NOT EXISTS referral_shares (
    id bigserial PRIMARY KEY,
    email text NOT NULL,
    how text,
    at timestamptz DEFAULT now()
  )`;
  await q`CREATE INDEX IF NOT EXISTS referral_shares_email_idx ON referral_shares(email)`;
  // Where each new subscriber came from: a referral code, an ad link (utm values carried to Stripe as
  // client_reference_id by the landing page), or neither. ONE record for every source, so referrals,
  // ads and everything else are counted from the same place.
  await q`CREATE TABLE IF NOT EXISTS signup_sources (
    email text PRIMARY KEY,
    source text,
    campaign text,
    content text,
    ref_code text,
    created_at timestamptz DEFAULT now()
  )`;
  _ready = true;
}

// ── Stripe ───────────────────────────────────────────────────────────────────────────────────────
// Pinned so the shapes below (promotion_codes.coupon, invoice.amount_paid) cannot move under us when
// the account's default API version changes.
const STRIPE_VERSION = '2024-06-20';

export function formEncode(obj, prefix, out) {
  out = out || [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? prefix + '[' + k + ']' : k;
    if (Array.isArray(v)) v.forEach((x, i) => {
      if (x && typeof x === 'object') formEncode(x, key + '[' + i + ']', out);
      else out.push(encodeURIComponent(key + '[' + i + ']') + '=' + encodeURIComponent(String(x)));
    });
    else if (typeof v === 'object') formEncode(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out.join('&');
}

export async function stripeApi(method, path, params, idemKey) {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) return { ok: false, status: 0, error: 'Stripe is not configured.' };
  const headers = { Authorization: 'Bearer ' + key, 'Stripe-Version': STRIPE_VERSION };
  let url = 'https://api.stripe.com/v1' + path, body;
  if (method === 'GET') { const qs = formEncode(params); if (qs) url += '?' + qs; }
  else { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = formEncode(params); }
  if (idemKey) headers['Idempotency-Key'] = idemKey;
  try {
    const r = await fetch(url, { method, headers, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, code: (j.error && j.error.code) || '', error: safeStripeMessage((j.error && j.error.message) || ('Stripe said ' + r.status)) };
    return { ok: true, status: r.status, data: j };
  } catch (e) { return { ok: false, status: 0, error: 'Could not reach Stripe.' }; }
}

export function couponIdFor(s) { return 'screferral-' + s.ref_friend_pct + 'pct-' + s.ref_friend_months + 'm'; }

// The friend's reward, made once per settings combination. Safe to call every time.
export async function ensureCoupon(s) {
  const id = couponIdFor(s);
  const got = await stripeApi('GET', '/coupons/' + id);
  if (got.ok && got.data && got.data.valid !== false) return { ok: true, id };
  const months = s.ref_friend_months;
  const label = (s.ref_friend_pct === 100 ? 'Free' : s.ref_friend_pct + '% off') + ' ' + (months === 1 ? 'first month' : 'first ' + months + ' months') + ' (friend referral)';
  const params = { id, percent_off: s.ref_friend_pct, name: label.slice(0, 40), duration: months === 1 ? 'once' : 'repeating' };
  if (months > 1) params.duration_in_months = months;
  const made = await stripeApi('POST', '/coupons', params, 'scref-coupon-' + id);
  if (made.ok || made.code === 'resource_already_exists') return { ok: true, id };
  return { ok: false, error: made.error };
}

// A code a person can say out loud: first name (letters only, up to 10) + two digits.
export function codeBase(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const letters = first.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 10);
  return letters.length >= 2 ? letters : 'SLICK';
}
export function validCode(c) { return /^[A-Z]{2,10}[0-9]{2,3}$/.test(String(c || '')); }

function twoDigits() { return String(10 + Math.floor(Math.random() * 90)); }

// Make (or refresh) the Stripe promotion code for an existing referral_codes row.
async function makePromo(q, email, code, couponId) {
  // A code string can only be ACTIVE once in Stripe. Switch off any older one with this code first.
  const old = await q`SELECT promo_id FROM referral_promos WHERE email = ${email} AND code = ${code}`;
  for (const o of old) await stripeApi('POST', '/promotion_codes/' + o.promo_id, { active: false });
  const made = await stripeApi('POST', '/promotion_codes', {
    coupon: couponId, code,
    restrictions: { first_time_transaction: true },
    metadata: { sc_referrer: email, sc_kind: 'referral' }
  });
  if (!made.ok) return made;
  const pid = made.data.id;
  await q`INSERT INTO referral_promos (promo_id, email, code, coupon_id) VALUES (${pid}, ${email}, ${code}, ${couponId})
    ON CONFLICT (promo_id) DO NOTHING`;
  await q`UPDATE referral_codes SET promo_id = ${pid}, coupon_id = ${couponId} WHERE email = ${email}`;
  return { ok: true, promoId: pid };
}

// The provider's one code, made the first time it is asked for. `email` MUST come from the caller's
// verified session (api/referral.js), never from a request field.
export async function getOrCreateCode(q, email, name, s) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'No account.' };
  await ensureReferralTables(q);
  s = s || await getReferralSettings(q);
  const coupon = await ensureCoupon(s);
  let row = (await q`SELECT code, promo_id, coupon_id FROM referral_codes WHERE email = ${email}`)[0];
  if (!row) {
    const base = codeBase(name);
    for (let i = 0; i < 12 && !row; i++) {
      const code = base + (i < 10 ? twoDigits() : String(100 + Math.floor(Math.random() * 900)));
      try {
        const ins = await q`INSERT INTO referral_codes (email, code) VALUES (${email}, ${code})
          ON CONFLICT DO NOTHING RETURNING code, promo_id, coupon_id`;
        if (ins[0]) row = ins[0];
        else { const again = (await q`SELECT code, promo_id, coupon_id FROM referral_codes WHERE email = ${email}`)[0]; if (again) row = again; }
      } catch (e) { /* code taken: try another */ }
    }
    if (!row) return { ok: false, error: 'Could not make a code. Try again.' };
  }
  // Stripe side: make the promotion code if there is none yet, or the reward settings changed.
  if (coupon.ok && (!row.promo_id || row.coupon_id !== coupon.id)) {
    let made = await makePromo(q, email, row.code, coupon.id);
    // The code string is already active in Stripe for something else: pick a new one.
    if (!made.ok && /already|exists|in use/i.test(made.error || '')) {
      const code = codeBase(name) + String(100 + Math.floor(Math.random() * 900));
      try { await q`UPDATE referral_codes SET code = ${code} WHERE email = ${email}`; row.code = code; made = await makePromo(q, email, code, coupon.id); } catch (e) {}
    }
    if (made.ok) { row.promo_id = made.promoId; row.coupon_id = coupon.id; }
    else return { ok: true, code: row.code, stripeReady: false, stripeError: made.error };
  }
  return { ok: true, code: row.code, stripeReady: !!(coupon.ok && row.promo_id), stripeError: coupon.ok ? '' : coupon.error };
}

export function shareLink(origin, code) { return String(origin || 'https://slickchart.app').replace(/\/+$/, '') + '/r/' + encodeURIComponent(code); }
export function fillMessage(msg, code, link) { return String(msg || DEFAULT_SHARE_MESSAGE).split('{code}').join(code).split('{link}').join(link); }

export function statusLabel(st) {
  return ({ trial: 'On her free trial', paid: 'Paying', rewarded: 'Paying, your free month is on', capped: 'Paying (you reached this year’s limit)',
    canceled: 'Cancelled before paying', blocked: 'Not counted', reward_failed: 'Paying, your credit is being sorted out', rewarding: 'Paying' })[st] || 'Signed up';
}

// What the provider herself sees. Scoped to HER email only.
export async function referralSummaryFor(q, email) {
  await ensureReferralTables(q);
  const rows = await q`SELECT friend_first_name, status, signed_up_at, rewarded_at, reward_cents FROM referrals
    WHERE referrer_email = ${email} ORDER BY signed_up_at DESC LIMIT 100`;
  const friends = rows.map(r => ({ firstName: r.friend_first_name || 'A friend', status: r.status, label: statusLabel(r.status),
    joined: r.signed_up_at, rewarded: r.rewarded_at || null }));
  const earnedCents = rows.reduce((a, r) => a + (r.status === 'rewarded' ? (r.reward_cents || 0) : 0), 0);
  return {
    joined: rows.filter(r => r.status !== 'blocked').length,
    paying: rows.filter(r => ['paid', 'rewarded', 'capped', 'reward_failed', 'rewarding'].includes(r.status)).length,
    rewarded: rows.filter(r => r.status === 'rewarded').length,
    earnedCents, friends
  };
}

export async function recordShare(q, email, how) {
  await ensureReferralTables(q);
  const h = String(how || 'copy').replace(/[^a-z]/g, '').slice(0, 12) || 'copy';
  // At most one row per provider per kind per 10 minutes, so a busy tap does not inflate the count.
  const recent = await q`SELECT 1 FROM referral_shares WHERE email = ${email} AND how = ${h} AND at > now() - interval '10 minutes' LIMIT 1`;
  if (recent.length) return false;
  await q`INSERT INTO referral_shares (email, how) VALUES (${email}, ${h})`;
  return true;
}

// ── Webhook side ─────────────────────────────────────────────────────────────────────────────────
// checkout.session.completed: was a referral code used? Returns the referral row it made, or null.
// Runs BEFORE the subscriptions upsert so a returning customer can be told apart from a new one.
export async function recordReferralFromCheckout(q, session) {
  try {
    if (!session || String(session.mode || '') !== 'subscription') return null;
    const promoIds = [];
    for (const d of (session.discounts || [])) { const p = d && (typeof d.promotion_code === 'string' ? d.promotion_code : (d.promotion_code && d.promotion_code.id)); if (p) promoIds.push(p); }
    if (!promoIds.length) return null;
    await ensureReferralTables(q);
    const hit = (await q`SELECT email, code FROM referral_promos WHERE promo_id = ANY(${promoIds}) LIMIT 1`)[0];
    if (!hit) return null;
    const friend = String((session.customer_details && session.customer_details.email) || session.customer_email || '').trim().toLowerCase();
    if (!friend) return null;
    const first = String((session.customer_details && session.customer_details.name) || '').trim().split(/\s+/)[0].slice(0, 30);
    let status = 'trial', note = null;
    if (friend === hit.email) { status = 'blocked'; note = 'used her own code'; }
    else {
      const prior = await q`SELECT status FROM subscriptions WHERE lower(email) = ${friend} LIMIT 1`;
      if (prior[0]) { status = 'blocked'; note = 'already had a SlickChart subscription'; }
    }
    const ins = await q`INSERT INTO referrals (code, referrer_email, friend_email, friend_customer, friend_first_name, status, note)
      VALUES (${hit.code}, ${hit.email}, ${friend}, ${session.customer || null}, ${first || null}, ${status}, ${note})
      ON CONFLICT (friend_email) DO NOTHING RETURNING id, code, referrer_email, friend_first_name, status`;
    return ins[0] || null;
  } catch (e) { console.error('[referral] record failed:', e && e.message || e); return null; }
}

// subscription.updated/deleted: a friend who cancels before paying is marked, so nobody waits on her.
export async function markReferralCanceled(q, customerId) {
  try {
    if (!customerId) return;
    await ensureReferralTables(q);
    await q`UPDATE referrals SET status = 'canceled' WHERE friend_customer = ${customerId} AND status = 'trial'`;
  } catch (e) {}
}

// invoice.paid: the friend is paying. Credit the sharer, exactly once.
// Returns { rewarded, row, cents } or null when this invoice means nothing to the program.
export async function rewardOnInvoice(q, invoice) {
  try {
    if (!invoice) return null;
    await ensureReferralTables(q);
    const s = await getReferralSettings(q);
    const cus = invoice.customer || null;
    const em = String(invoice.customer_email || '').trim().toLowerCase();
    const row = (await q`SELECT * FROM referrals WHERE status = 'trial'
      AND ((${cus}::text IS NOT NULL AND friend_customer = ${cus}) OR (${em} <> '' AND friend_email = ${em})) LIMIT 1`)[0];
    if (!row) return null;
    const amount = Number(invoice.amount_paid || 0);
    const reason = String(invoice.billing_reason || '');
    const qualifies = s.ref_reward_on_payment ? amount > 0 : (amount > 0 || reason === 'subscription_cycle');
    if (!qualifies) return null;
    return await payReward(q, row, s);
  } catch (e) { console.error('[referral] reward failed:', e && e.message || e); return null; }
}

// Credit the sharer for one referral row. Claimed atomically, so a retried webhook can never pay twice.
export async function payReward(q, row, s) {
  s = s || await getReferralSettings(q);
  const claim = await q`UPDATE referrals SET status = 'rewarding', paid_at = COALESCE(paid_at, now())
    WHERE id = ${row.id} AND status IN ('trial', 'reward_failed') RETURNING id`;
  if (!claim.length) return null;
  const done = async (status, note, cents, txn) => {
    await q`UPDATE referrals SET status = ${status}, note = ${note || null}, reward_cents = ${cents || null}, reward_txn = ${txn || null},
      rewarded_at = ${status === 'rewarded' ? new Date().toISOString() : null} WHERE id = ${row.id}`;
    return { rewarded: status === 'rewarded', status, row, cents: cents || 0, note };
  };
  if (!s.ref_sharer_months) return done('paid', 'sharer credit is set to none');
  if (s.ref_max_per_year) {
    const n = await q`SELECT count(*)::int AS n FROM referrals WHERE referrer_email = ${row.referrer_email} AND status = 'rewarded' AND rewarded_at > now() - interval '365 days'`;
    if ((n[0] && n[0].n) >= s.ref_max_per_year) return done('capped', 'reached ' + s.ref_max_per_year + ' credits this year');
  }
  const sub = (await q`SELECT stripe_customer_id, plan_amount, plan_interval, status FROM subscriptions WHERE lower(email) = ${row.referrer_email} LIMIT 1`)[0];
  if (!sub || !sub.stripe_customer_id) return done('reward_failed', 'the sharer has no Stripe billing to credit');
  const amount = Number(sub.plan_amount || 0) || 1700;
  const monthly = sub.plan_interval === 'year' ? Math.round(amount / 12) : amount;
  const cents = monthly * s.ref_sharer_months;
  const r = await stripeApi('POST', '/customers/' + sub.stripe_customer_id + '/balance_transactions', {
    amount: -cents, currency: 'usd',
    description: 'SlickChart referral: ' + s.ref_sharer_months + ' month' + (s.ref_sharer_months === 1 ? '' : 's') + ' free for referring ' + (row.friend_first_name || 'a friend'),
    metadata: { sc_kind: 'referral', sc_referral_id: String(row.id) }
  }, 'scref-reward-' + row.id + '-' + Math.floor(Date.now() / 3600000));
  if (!r.ok) return done('reward_failed', r.error || 'Stripe refused the credit');
  return done('rewarded', null, cents, r.data && r.data.id);
}

// ── Founder side ─────────────────────────────────────────────────────────────────────────────────
// One-tap setup: allow promotion codes on the two sign-up links and make sure the webhook hears
// invoice.paid. Reports exactly what it did and did not do.
export async function setupStripeForReferrals(q, links) {
  const out = { coupon: '', links: [], webhook: '' };
  const s = await getReferralSettings(q);
  const c = await ensureCoupon(s);
  out.coupon = c.ok ? 'Friend’s reward is ready in Stripe.' : ('Could not make the friend’s reward: ' + c.error);
  const list = await stripeApi('GET', '/payment_links', { limit: 100, active: true });
  if (!list.ok) out.links.push('Could not read your payment links: ' + list.error);
  else {
    for (const want of links) {
      const pl = (list.data.data || []).find(x => x.url === want.url);
      if (!pl) { out.links.push(want.label + ': not found in Stripe'); continue; }
      if (pl.allow_promotion_codes) { out.links.push(want.label + ': already accepts codes'); continue; }
      const u = await stripeApi('POST', '/payment_links/' + pl.id, { allow_promotion_codes: true });
      out.links.push(want.label + ': ' + (u.ok ? 'now accepts codes' : ('could not change, ' + u.error)));
    }
  }
  const wh = await stripeApi('GET', '/webhook_endpoints', { limit: 100 });
  if (!wh.ok) out.webhook = 'Could not read your webhook: ' + wh.error;
  else {
    const ep = (wh.data.data || []).find(x => /\/api\/stripe-webhook\b/.test(String(x.url || '')) && /slickchart\.app/.test(String(x.url || '')))
      || (wh.data.data || []).find(x => /\/api\/stripe-webhook\b/.test(String(x.url || '')));
    if (!ep) out.webhook = 'No SlickChart webhook found in Stripe';
    else {
      const ev = ep.enabled_events || [];
      if (ev.includes('*') || ev.includes('invoice.paid')) out.webhook = 'Webhook already hears payments';
      else {
        const u = await stripeApi('POST', '/webhook_endpoints/' + ep.id, { enabled_events: ev.concat(['invoice.paid']) });
        out.webhook = u.ok ? 'Webhook now hears payments' : ('Could not update the webhook: ' + u.error);
      }
    }
  }
  return out;
}

// Read-only: is Stripe ready for codes? Changes nothing (the Monitor key may call it).
export async function checkStripeForReferrals(links) {
  const out = { ready: false, links: [], webhookHearsPayments: false, error: '' };
  const list = await stripeApi('GET', '/payment_links', { limit: 100, active: true });
  if (!list.ok) { out.error = 'Could not read payment links: ' + list.error; return out; }
  for (const want of links) {
    const pl = (list.data.data || []).find(x => x.url === want.url);
    out.links.push({ label: want.label, found: !!pl, acceptsCodes: !!(pl && pl.allow_promotion_codes) });
  }
  const wh = await stripeApi('GET', '/webhook_endpoints', { limit: 100 });
  if (!wh.ok) { out.error = 'Could not read webhooks: ' + wh.error; return out; }
  const ep = (wh.data.data || []).find(x => /\/api\/stripe-webhook\b/.test(String(x.url || '')) && /slickchart\.app/.test(String(x.url || '')))
    || (wh.data.data || []).find(x => /\/api\/stripe-webhook\b/.test(String(x.url || '')));
  const ev = (ep && ep.enabled_events) || [];
  out.webhookHearsPayments = ev.includes('*') || ev.includes('invoice.paid');
  out.ready = out.links.length > 0 && out.links.every(l => l.acceptsCodes) && out.webhookHearsPayments;
  return out;
}

// Ashley's numbers. Founder-only (api/admin/referrals.js gates it).
export async function referralMetrics(q) {
  await ensureReferralTables(q);
  const one = async (p) => { try { const r = await p; return (r[0] && r[0].n) || 0; } catch (e) { return 0; } };
  const codes = await one(q`SELECT count(*)::int AS n FROM referral_codes`);
  const sharers = await one(q`SELECT count(DISTINCT email)::int AS n FROM referral_shares`);
  const shares = await one(q`SELECT count(*)::int AS n FROM referral_shares`);
  const sharers30 = await one(q`SELECT count(DISTINCT email)::int AS n FROM referral_shares WHERE at > now() - interval '30 days'`);
  const signups = await one(q`SELECT count(*)::int AS n FROM referrals WHERE status <> 'blocked'`);
  const signups30 = await one(q`SELECT count(*)::int AS n FROM referrals WHERE status <> 'blocked' AND signed_up_at > now() - interval '30 days'`);
  const paying = await one(q`SELECT count(*)::int AS n FROM referrals WHERE status IN ('paid','rewarded','capped','reward_failed','rewarding')`);
  const onTrial = await one(q`SELECT count(*)::int AS n FROM referrals WHERE status = 'trial'`);
  const canceled = await one(q`SELECT count(*)::int AS n FROM referrals WHERE status = 'canceled'`);
  const blocked = await one(q`SELECT count(*)::int AS n FROM referrals WHERE status = 'blocked'`);
  const failed = await one(q`SELECT count(*)::int AS n FROM referrals WHERE status = 'reward_failed'`);
  const rewardCents = await one(q`SELECT COALESCE(sum(reward_cents),0)::int AS n FROM referrals WHERE status = 'rewarded'`);
  const stillPaying90 = await one(q`SELECT count(*)::int AS n FROM referrals r JOIN subscriptions s ON lower(s.email) = r.friend_email
    WHERE r.status IN ('paid','rewarded','capped','reward_failed') AND r.signed_up_at < now() - interval '90 days' AND s.status = 'active'`);
  const eligible90 = await one(q`SELECT count(*)::int AS n FROM referrals WHERE status IN ('paid','rewarded','capped','reward_failed','canceled') AND signed_up_at < now() - interval '90 days'`);
  const stillPaying180 = await one(q`SELECT count(*)::int AS n FROM referrals r JOIN subscriptions s ON lower(s.email) = r.friend_email
    WHERE r.status IN ('paid','rewarded','capped','reward_failed') AND r.signed_up_at < now() - interval '180 days' AND s.status = 'active'`);
  const eligible180 = await one(q`SELECT count(*)::int AS n FROM referrals WHERE status IN ('paid','rewarded','capped','reward_failed','canceled') AND signed_up_at < now() - interval '180 days'`);
  let top = [];
  try {
    top = (await q`SELECT r.referrer_email AS email, max(p.name) AS name, count(*)::int AS joined,
        sum(CASE WHEN r.status IN ('paid','rewarded','capped','reward_failed','rewarding') THEN 1 ELSE 0 END)::int AS paying
      FROM referrals r LEFT JOIN providers p ON lower(p.email) = r.referrer_email
      WHERE r.status <> 'blocked' GROUP BY r.referrer_email ORDER BY paying DESC, joined DESC LIMIT 10`)
      .map(x => ({ name: x.name || '', email: x.email, joined: x.joined, paying: x.paying }));
  } catch (e) {}
  let recent = [];
  try {
    recent = (await q`SELECT r.friend_first_name, r.status, r.note, r.signed_up_at, r.code, p.name AS referrer_name
      FROM referrals r LEFT JOIN providers p ON lower(p.email) = r.referrer_email ORDER BY r.signed_up_at DESC LIMIT 20`)
      .map(x => ({ friend: x.friend_first_name || 'A friend', referrer: x.referrer_name || '', code: x.code, status: x.status, label: statusLabel(x.status), note: x.note || '', at: x.signed_up_at }));
  } catch (e) {}
  // Progress to her goal: every live subscription, its monthly value, and how many came by referral.
  let live = null; let paidTotal = 0, mrrCents = 0, fromReferral = 0, fromAds = 0, adSources = [], onTrialNow = 0, mrrUnknown = 0, freeNow = 0; const freeByCode = {};
  try {
    let subs = await q`SELECT lower(email) AS email, plan_amount, plan_interval, stripe_subscription_id FROM subscriptions WHERE status = 'active'`;
    // Older rows were saved before the price was recorded, so they read as $0 and MRR came out low.
    // Fill a missing price from Stripe (only ever fills a blank, a few per read).
    const blank = subs.filter(x => x.plan_amount == null && x.stripe_subscription_id).slice(0, 40);
    for (const x of blank) {
      const r = await stripeApi('GET', '/subscriptions/' + x.stripe_subscription_id);
      const it = r.ok && r.data && r.data.items && r.data.items.data && r.data.items.data[0];
      const price = it && it.price;
      if (price && price.unit_amount != null) {
        // Monthly value after any lasting discount is not attempted here: list price, as Stripe bills it.
        const amt = Number(price.unit_amount) * Number(it.quantity || 1), iv = (price.recurring && price.recurring.interval) || null;
        try { await q`UPDATE subscriptions SET plan_amount = ${amt}, plan_interval = COALESCE(plan_interval, ${iv}) WHERE lower(email) = ${x.email} AND plan_amount IS NULL`; } catch (e) {}
        x.plan_amount = amt; x.plan_interval = x.plan_interval || iv;
      }
    }
    // 'active' here includes a free trial (the webhook maps trialing to active so she can use the app).
    // A provider still on her trial is not paying yet, so she is counted apart, not in paid or MRR.
    let trialing = new Set();
    try { (await q`SELECT DISTINCT email FROM trial_outcomes WHERE outcome IN ('trialing', 'cancel_scheduled') AND email IS NOT NULL`).forEach(r => trialing.add(String(r.email).toLowerCase())); } catch (e) {}
    onTrialNow = subs.filter(x => trialing.has(x.email)).length;
    subs = subs.filter(x => !trialing.has(x.email));
    // Ashley 2026-11-12: "some of the signups being counted were given the freebetatester codes".
    // A 100%-off code means $0 a month: not paying, not in MRR, counted apart by code. A partial
    // code counts at what she is actually charged. Read live from Stripe (one list call per 100);
    // if Stripe can't be read, fall back to the list price as before.
    live = await stripeLiveSubs();
    if (live) {
      const keep = [];
      for (const x of subs) {
        const l = live.get(x.stripe_subscription_id);
        if (!l) { keep.push(x); continue; }
        if (l.status === 'trialing') { onTrialNow++; continue; }
        if (l.free) { freeNow++; const k = l.code || 'a 100% off code'; freeByCode[k] = (freeByCode[k] || 0) + 1; continue; }
        x.live_monthly = l.monthlyCents; keep.push(x);
      }
      subs = keep;
    }
    paidTotal = subs.length;
    mrrUnknown = subs.filter(x => x.live_monthly == null && x.plan_amount == null).length;
    for (const x of subs) {
      if (x.live_monthly != null) { mrrCents += x.live_monthly; continue; }
      const a = Number(x.plan_amount || 0); mrrCents += x.plan_interval === 'year' ? Math.round(a / 12) : a;
    }
    fromReferral = await one(q`SELECT count(*)::int AS n FROM referrals r JOIN subscriptions s ON lower(s.email) = r.friend_email WHERE s.status = 'active' AND r.status <> 'blocked'`);
    fromAds = await one(q`SELECT count(*)::int AS n FROM signup_sources x JOIN subscriptions s ON lower(s.email) = x.email
      WHERE s.status = 'active' AND x.ref_code IS NULL AND COALESCE(x.source,'') <> ''`);
    const bySrc = await q`SELECT x.source, count(*)::int AS n FROM signup_sources x JOIN subscriptions s ON lower(s.email) = x.email
      WHERE s.status = 'active' AND x.ref_code IS NULL AND COALESCE(x.source,'') <> '' GROUP BY x.source ORDER BY n DESC LIMIT 10`;
    adSources = bySrc.map(x => ({ source: x.source, paying: x.n }));
  } catch (e) {}
  return {
    codes, sharers, sharers30, shares, signups, signups30, onTrial, paying, canceled, blocked, failed, rewardCents,
    retention: { day90: { paying: stillPaying90, of: eligible90 }, day180: { paying: stillPaying180, of: eligible180 } },
    top, recent, progress: { paidTotal, mrrCents, onTrialNow, mrrUnknown, freeNow, freeCodes: Object.entries(freeByCode).map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n), mrrSource: live ? 'stripe' : 'list price', fromReferral, fromAds, other: Math.max(0, paidTotal - fromReferral - fromAds), adSources, goalProviders: 588, goalMrrCents: 1000000 }
  };
}

// Every live (active or trialing) subscription in Stripe with what it really bills a month: item
// prices times quantity, yearly divided by 12, after the discounts attached to it. free = a code takes
// it to $0. null when Stripe can't be read, so callers fall back rather than report zero.
export async function stripeLiveSubs() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const out = new Map();
  for (const status of ['active', 'trialing', 'past_due']) {
    let after = '';
    for (let page = 0; page < 10; page++) {
      const r = await stripeApi('GET', '/subscriptions', { status, limit: 100, expand: ['data.discounts'], starting_after: after || undefined });
      if (!r.ok || !r.data || !Array.isArray(r.data.data)) return null;
      for (const sub of r.data.data) {
        let gross = 0, interval = 'month', count = 1;
        for (const it of ((sub.items && sub.items.data) || [])) {
          const pr = it.price || {}; gross += Number(pr.unit_amount || 0) * Number(it.quantity || 1);
          if (pr.recurring) { interval = pr.recurring.interval || 'month'; count = Number(pr.recurring.interval_count || 1) || 1; }
        }
        const coupons = new Map();
        if (sub.discount && sub.discount.coupon) coupons.set(sub.discount.coupon.id, { c: sub.discount.coupon, code: sub.discount.promotion_code });
        for (const d of (Array.isArray(sub.discounts) ? sub.discounts : [])) if (d && typeof d === 'object' && d.coupon) coupons.set(d.coupon.id, { c: d.coupon, code: d.promotion_code });
        let net = gross, name = '';
        for (const { c } of coupons.values()) {
          if (c.percent_off != null) net = net * (1 - Number(c.percent_off) / 100);
          else if (c.amount_off != null) net = net - Number(c.amount_off);
          if (!name) name = c.name || c.id || '';
        }
        net = Math.max(0, Math.round(net));
        const perMonth = interval === 'year' ? net / (12 * count) : interval === 'week' ? net * 52 / 12 / count : interval === 'day' ? net * 365 / 12 / count : net / count;
        out.set(sub.id, { status: sub.status, monthlyCents: Math.round(perMonth), free: gross > 0 && net === 0, code: name });
      }
      if (!r.data.has_more || !r.data.data.length) break;
      after = r.data.data[r.data.data.length - 1].id;
    }
  }
  return out;
}

// Re-try every reward that Stripe refused (e.g. the sharer's billing was missing that day).
export async function retryFailedRewards(q) {
  await ensureReferralTables(q);
  const s = await getReferralSettings(q);
  const rows = await q`SELECT * FROM referrals WHERE status = 'reward_failed' ORDER BY id LIMIT 50`;
  const out = [];
  for (const r of rows) { const x = await payReward(q, r, s); out.push({ friend: r.friend_first_name || 'A friend', status: x ? x.status : 'skipped', note: x ? (x.note || '') : '' }); }
  return out;
}

// ── Sign-up source (referral code + ad utm values) ──────────────────────────────────────────────
// The landing page appends client_reference_id=utm__{source}__{campaign}__{content} to the Stripe
// links (each value a-z 0-9 dash, at most 50, empty when missing). Anything else there is ignored.
export function parseClientRef(v) {
  const s = String(v || '');
  if (!/^utm__/.test(s) || s.length > 200) return null;
  const parts = s.split('__').slice(1, 4).map(x => String(x || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 50));
  const [source, campaign, content] = [parts[0] || '', parts[1] || '', parts[2] || ''];
  return source || campaign || content ? { source, campaign, content } : null;
}

export async function recordSignupSource(q, session, refRow) {
  try {
    if (!session || String(session.mode || '') !== 'subscription') return null;
    const email = String((session.customer_details && session.customer_details.email) || session.customer_email || '').trim().toLowerCase();
    if (!email) return null;
    const utm = parseClientRef(session.client_reference_id);
    const code = refRow && refRow.status !== 'blocked' ? refRow.code : null;
    if (!utm && !code) return null;
    await ensureReferralTables(q);
    await q`INSERT INTO signup_sources (email, source, campaign, content, ref_code)
      VALUES (${email}, ${utm ? utm.source : null}, ${utm ? utm.campaign : null}, ${utm ? utm.content : null}, ${code})
      ON CONFLICT (email) DO NOTHING`;
    return { utm, code };
  } catch (e) { console.error('[referral] source record failed:', e && e.message || e); return null; }
}

export function sourceLine(row) {
  if (!row) return '';
  const bits = [];
  if (row.source) bits.push(row.source + (row.campaign ? ' / ' + row.campaign : '') + (row.content ? ' / ' + row.content : ''));
  if (row.ref_code) bits.push('referral code ' + row.ref_code);
  return bits.length ? 'Source: ' + bits.join(', ') : '';
}
