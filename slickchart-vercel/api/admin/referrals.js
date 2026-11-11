// /api/admin/referrals — FOUNDER-ONLY. The referral program's numbers and settings.
//   GET                          every metric (lib/referral.js referralMetrics) + settings + labels
//   POST {settings...}           save any of REFERRAL_SETTINGS and `message`
//   POST {action:'setup'}        one tap: friend reward in Stripe, codes allowed on both sign-up links,
//                                webhook hears invoice.paid. Reports what it did.
//   POST {action:'retry'}        re-try every sharer credit Stripe refused
//   GET ?check=stripe            read-only: do both links accept codes, does the webhook hear payments
//
// Gated to FOUNDER_EMAILS via the verified session token's email (CLAUDE.md §0.5). GET also accepts the
// Monitor key (Authorization: Monitor <key>, as /api/admin/push-state does) so the Monday brief can read
// the numbers without anyone opening the app. The Monitor key can only READ here.
import { dbEnabled, sql } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { monitorKeyOk } from '../feedback.js';
import { NEW_MONTHLY_LINK, NEW_YEARLY_LINK } from '../../lib/pricing.js';
import { REFERRAL_SETTINGS, getReferralSettings, setReferralSetting, referralMetrics, setupStripeForReferrals, retryFailedRewards, checkStripeForReferrals } from '../../lib/referral.js';

function signupLinks() {
  return [{ label: '$17 monthly link', url: process.env.STRIPE_PAYMENT_LINK_17 || NEW_MONTHLY_LINK },
    { label: '$170 yearly link', url: process.env.STRIPE_PAYMENT_LINK_YEARLY_170 || NEW_YEARLY_LINK }];
}
function norm(s) { return String(s || '').trim().toLowerCase(); }

async function founderFromBearer(req, q) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const p = secret && tok ? verifyToken(tok, secret) : null;
  if (!p) return null;
  try { if (p.sid && !(await isSessionValid(q, p.sid))) return null; } catch (e) {}
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const email = norm(p.e);
  return email && founders.includes(email) ? email : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(503).json({ error: 'database not configured' }); return; }
  const q = sql();
  const founder = await founderFromBearer(req, q);
  let viaMonitor = false;
  if (!founder && req.method === 'GET' && String(req.headers['authorization'] || '').startsWith('Monitor ')) {
    try { viaMonitor = await monitorKeyOk(req, q, norm(process.env.OWNER_EMAIL)); } catch (e) { viaMonitor = false; }
  }
  if (!founder && !viaMonitor) { res.status(403).json({ error: 'Owner-only.', code: 'notowner' }); return; }

  try {
    if (req.method === 'POST') {
      let b = req.body || {};
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
      if (b.action === 'setup') {
        const r = await setupStripeForReferrals(q, signupLinks());
        res.status(200).json({ ok: true, setup: r }); return;
      }
      if (b.action === 'retry') { res.status(200).json({ ok: true, retried: await retryFailedRewards(q) }); return; }
      const saved = {};
      for (const k of Object.keys(REFERRAL_SETTINGS)) if (b[k] != null && b[k] !== '') { const v = await setReferralSetting(q, k, b[k]); if (v != null) saved[k] = v; }
      if (typeof b.message === 'string' && b.message.trim()) { const v = await setReferralSetting(q, 'message', b.message); if (v != null) saved.message = v; }
      res.status(200).json({ ok: true, saved, settings: await getReferralSettings(q) }); return;
    }
    if (String((req.query && req.query.check) || '') === 'stripe') {
      res.status(200).json({ ok: true, stripe: await checkStripeForReferrals(signupLinks()) }); return;
    }
    const labels = {};
    for (const k of Object.keys(REFERRAL_SETTINGS)) { const d = REFERRAL_SETTINGS[k]; labels[k] = { label: d.label, min: d.min, max: d.max, def: d.def, unit: d.unit }; }
    res.status(200).json({ ok: true, settings: await getReferralSettings(q), labels, metrics: await referralMetrics(q) });
  } catch (e) {
    console.error('[admin/referrals]', e && e.message || e);
    res.status(500).json({ error: 'Could not load referrals. Try again.' });
  }
}
