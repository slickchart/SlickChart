// GET  /api/referral          — the signed-in provider's own referral code, link, share message and
//                               what has come of it (friends' FIRST names and status only).
// POST /api/referral {how}    — she copied or sent her code (counts only, for the founder's metrics).
//
// Identity comes ONLY from the verified session (CLAUDE.md §0.1): her email is read from the providers
// row for the session's provider id, never from the request. See lib/referral.js for the program.
import { dbEnabled, sql, ensureProvidersTable } from '../lib/db.js';
import { sessionFromReq } from '../lib/auth.js';
import { trustedOrigin } from '../lib/email.js';
import { getReferralSettings, getOrCreateCode, referralSummaryFor, recordShare, shareLink, fillMessage } from '../lib/referral.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: true, enabled: false }); return; }
  const q = sql();
  const p = await sessionFromReq(req, q);
  if (!p) { res.status(401).json({ error: 'Not logged in.' }); return; }
  try {
    await ensureProvidersTable();
    const me = (await q`SELECT email, name, created_at FROM providers WHERE id = ${p.u}`)[0];
    if (!me || !me.email) { res.status(401).json({ error: 'Not logged in.' }); return; }
    const email = String(me.email).trim().toLowerCase();
    const s = await getReferralSettings(q);

    if (req.method === 'POST') {
      let b = req.body || {};
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
      const counted = await recordShare(q, email, b.how);
      res.status(200).json({ ok: true, counted });
      return;
    }

    if (!s.ref_enabled) { res.status(200).json({ ok: true, enabled: false }); return; }
    // Only a provider with a SlickChart subscription of her own has anything to be credited.
    const sub = (await q`SELECT status FROM subscriptions WHERE lower(email) = ${email} LIMIT 1`)[0];
    const c = await getOrCreateCode(q, email, me.name, s);
    if (!c.ok) { res.status(200).json({ ok: false, enabled: true, error: c.error }); return; }
    const link = shareLink(trustedOrigin(), c.code);
    const summary = await referralSummaryFor(q, email);
    const days = me.created_at ? Math.floor((Date.now() - new Date(me.created_at).getTime()) / 86400000) : 0;
    res.status(200).json({
      ok: true, enabled: true, code: c.code, link, ready: c.stripeReady,
      message: fillMessage(s.message, c.code, link),
      friendReward: { pct: s.ref_friend_pct, months: s.ref_friend_months },
      sharerMonths: s.ref_sharer_months,
      rewardOnPayment: !!s.ref_reward_on_payment,
      maxPerYear: s.ref_max_per_year,
      showOnHome: days >= s.ref_home_days && !!(sub && sub.status === 'active'),
      hasBilling: !!sub,
      ...summary
    });
  } catch (e) {
    console.error('[referral]', e && e.message || e);
    res.status(500).json({ error: 'Could not load your referral code. Try again.' });
  }
}
