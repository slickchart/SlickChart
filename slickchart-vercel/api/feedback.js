// POST /api/feedback  { message, rating?, kind?, timeSaved? }  → logs a provider's beta feedback
//   kind:'pulse' + timeSaved come from the recurring pulse survey; the plain
//   feedback button sends neither and is stored as kind='adhoc'.
// GET  /api/feedback                          → owner-only: recent feedback { items }
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken } from '../lib/auth.js';

function claims(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (s && t ? verifyToken(t, s) : null) || {};
}
async function resolveEmail(req, q) {
  const p = claims(req);
  if (!p.u) return null;
  if (p.e) return String(p.e).toLowerCase();
  try {
    const r = await q`SELECT email FROM providers WHERE id = ${p.u}`;
    return (r[0] && r[0].email) ? String(r[0].email).toLowerCase() : null;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(200).json(req.method === 'GET' ? { items: [] } : { ok: true, skipped: true }); return; }

  if (req.method === 'GET') {
    const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
    try {
      await ensureProvidersTable();
      const q = sql();
      const you = await resolveEmail(req, q);
      if (!owner || you !== owner) { res.status(403).json({ error: 'Owner only' }); return; }
      const rows = await q`SELECT rating, message, email, kind, time_saved, extract(epoch from ts) * 1000 AS ts FROM feedback ORDER BY ts DESC LIMIT 200`;
      res.status(200).json({ items: rows.map(r => ({ rating: r.rating, message: r.message, email: r.email, kind: r.kind, timeSaved: r.time_saved, ts: Math.round(Number(r.ts)) })) });
    } catch (e) { res.status(200).json({ items: [] }); }
    return;
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    const message = String(b.message || '').slice(0, 4000).trim();
    const rating = b.rating ? parseInt(b.rating, 10) : null;
    // Pulse survey fields (from the recurring in-app prompt).
    const kind = (b.kind === 'pulse') ? 'pulse' : 'adhoc';
    const timeSaved = ['much_less', 'less', 'same', 'more'].includes(b.timeSaved) ? b.timeSaved : null;
    // A pulse response is valid even if it's only a time-saved answer (no rating/message);
    // the plain feedback button still needs at least a message or rating.
    if (!message && !rating && !timeSaved) { res.status(400).json({ error: 'Say a little about your experience.' }); return; }
    // Require a signed-in provider — this used to accept an anonymous (provider_id=null) write, so
    // anyone could POST rows and spam the feedback table.
    const p = claims(req);
    if (!p.u) { res.status(401).json({ error: 'Please sign in to send feedback.' }); return; }
    try {
      await ensureProvidersTable();
      const q = sql();
      await q`INSERT INTO feedback (provider_id, email, rating, message, kind, time_saved) VALUES (${p.u}, ${p.e || null}, ${rating}, ${message}, ${kind}, ${timeSaved})`;
      res.status(200).json({ ok: true });
    } catch (e) { res.status(200).json({ ok: false }); }
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}
