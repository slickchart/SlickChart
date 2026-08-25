// GET /api/admin/signups?since=<ms>  — FOUNDER-ONLY.
// Returns the most recent PAID providers (active subscription), newest first, plus the running paid
// total, so the founder's own app can pop a celebratory "new paid provider" notification in-app.
// `since` (epoch ms) narrows to signups newer than that, which is how the app polls for just the NEW
// ones. Gated to FOUNDER_EMAILS / OWNER_EMAIL via the verified session token's email — a non-founder
// gets 403 and the app quietly disables the feature. Names/emails are shown because this is the founder
// seeing their OWN business's signups (the same info already emailed to them); no other account's
// client or provider data is ever exposed here.
import { dbEnabled, sql } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';

function norm(s) { return String(s || '').trim().toLowerCase(); }

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: true, signups: [], paidTotal: 0 }); return; }
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && tok ? verifyToken(tok, secret) : null;
  if (!payload) { res.status(401).json({ error: 'Not logged in.' }); return; }
  try { if (payload.sid && !(await isSessionValid(sql(), payload.sid))) { res.status(401).json({ error: 'Session expired.' }); return; } } catch (e) { /* don't lock out on a check hiccup */ }

  const email = norm(payload.e);
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '')
    .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!email || !founders.includes(email)) { res.status(403).json({ error: 'Owner-only.', code: 'notowner' }); return; }

  try {
    const q = sql();
    const sinceMs = parseInt(req.query.since || '0', 10) || 0;
    // Active subscriptions joined to the provider record for a display name. updated_at is when the
    // subscription last went active (i.e. when they paid), which is what we sort/notify on.
    const rows = await q`SELECT s.email, s.updated_at, s.plan_amount, p.name
      FROM subscriptions s
      LEFT JOIN providers p ON lower(p.email) = lower(s.email)
      WHERE s.status = 'active'
      ORDER BY s.updated_at DESC NULLS LAST
      LIMIT 50`;
    const all = (rows || []).map(r => ({
      name: r.name || '',
      email: r.email || '',
      ts: r.updated_at ? (new Date(r.updated_at).getTime() || 0) : 0,
      amount: r.plan_amount || 0
    }));
    const signups = sinceMs ? all.filter(x => x.ts > sinceMs) : all;
    let paidTotal = 0;
    try { const c = await q`SELECT count(*)::int AS n FROM subscriptions WHERE status = 'active'`; paidTotal = (c[0] && c[0].n) || 0; } catch (e) {}
    res.status(200).json({ ok: true, signups, paidTotal });
  } catch (e) {
    console.error('[admin/signups] failed:', e && e.message || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
