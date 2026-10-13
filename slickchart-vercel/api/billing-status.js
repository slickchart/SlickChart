// GET /api/billing-status — provider-authed: returns the real Stripe
// subscription record for the logged-in provider (or null if none yet).
import { verifyToken } from '../lib/auth.js';
import { dbEnabled, getSubscription } from '../lib/db.js';
import { pastDueForEmail } from '../lib/stripe-subs.js';

function claims(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (s && t ? verifyToken(t, s) : null) || {};
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, subscription: null }); return; }
  const c = claims(req);
  const email = (c && c.e || '').toLowerCase();
  if (!email) { res.status(401).json({ error: 'Not signed in' }); return; }
  try {
    const sub = await getSubscription(email);
    // A provider who is behind is let in (api/login.js) and shown a banner instead of being locked
    // out, so the app needs somewhere to send her: her OWN open invoice, which takes a new card and
    // revives the subscription she has. Never the generic payment link — that starts a second
    // subscription on the same email (see lib/stripe-subs.js). Only ask Stripe when she is actually
    // behind, so the ordinary case stays one indexed row read. Added fields, never changed ones, so
    // a build that has not relaunched yet still reads this response (CLAUDE.md §1a).
    let payUrl = '', payLabel = '';
    if (sub && (sub.status === 'past_due' || sub.status === 'unpaid')) {
      try {
        const behind = await pastDueForEmail(email);
        if (behind && behind.url) { payUrl = behind.url; payLabel = behind.label; }
      } catch (e) { /* the banner still shows, it just points at the billing screen */ }
    }
    res.status(200).json({ ok: true, subscription: sub, payUrl, payLabel });
  } catch (e) { console.error('[billing-status] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
