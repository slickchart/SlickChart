// PUBLIC, no auth: how many providers are paying for SlickChart right now, for the landing page line
// "Join 45+ beauty pros already using SlickChart" (2026-11-16, growth plan: show a provider count).
//
// Nothing here is account data: one aggregate number, rounded DOWN to a step of 5 so the page never
// overstates it, and 0 (the page shows nothing) until it reaches her setting grow_count_min, or when
// she has the line switched off (Admin tools, Referrals). No names, emails or rows ever leave.
import { dbEnabled, sql } from '../lib/db.js';
import { getReferralSettings } from '../lib/referral.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!dbEnabled()) { res.status(200).json({ count: 0 }); return; }
  try {
    const q = sql();
    const s = await getReferralSettings(q);
    if (!s.grow_count_on) { res.status(200).json({ count: 0 }); return; }
    // Paying now: an active plan that has actually been paid (paid_notified_at is the once-ever "started
    // paying" stamp), so a free trial is not counted. past_due is still a paying provider on grace.
    // Older rows can predate that stamp, so a plan also counts when it is not on a free trial right now.
    let r;
    try {
      r = await q`SELECT count(*)::int AS n FROM subscriptions s
        WHERE s.status IN ('active', 'past_due') AND (s.paid_notified_at IS NOT NULL OR NOT EXISTS (
          SELECT 1 FROM trial_outcomes t WHERE t.email = s.email AND t.outcome IN ('trialing', 'cancel_scheduled')))`;
    } catch (e) {
      r = await q`SELECT count(*)::int AS n FROM subscriptions WHERE status IN ('active', 'past_due') AND paid_notified_at IS NOT NULL`;
    }
    const n = (r[0] && r[0].n) || 0;
    const shown = Math.floor(n / 5) * 5;
    res.status(200).json({ count: shown >= s.grow_count_min ? shown : 0 });
  } catch (e) {
    res.status(200).json({ count: 0 });   // never break the landing page; it just shows no line
  }
}
