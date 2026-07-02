// POST /api/feedback  { message, rating? }   → logs a provider's beta feedback
// GET  /api/feedback                          → owner-only: recent feedback { items }
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken } from '../lib/auth.js';

function who(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (s && t ? verifyToken(t, s) : null) || {};
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(200).json(req.method === 'GET' ? { items: [] } : { ok: true, skipped: true }); return; }

  if (req.method === 'GET') {
    const owner = (process.env.OWNER_EMAIL || '').toLowerCase();
    const p = who(req);
    if (!owner || String(p.e || '').toLowerCase() !== owner) { res.status(403).json({ error: 'Owner only' }); return; }
    try {
      await ensureProvidersTable();
      const q = sql();
      const rows = await q`SELECT rating, message, email, extract(epoch from ts) * 1000 AS ts FROM feedback ORDER BY ts DESC LIMIT 200`;
      res.status(200).json({ items: rows.map(r => ({ rating: r.rating, message: r.message, email: r.email, ts: Math.round(Number(r.ts)) })) });
    } catch (e) { res.status(200).json({ items: [] }); }
    return;
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    const message = String(b.message || '').slice(0, 4000).trim();
    const rating = b.rating ? parseInt(b.rating, 10) : null;
    if (!message && !rating) { res.status(400).json({ error: 'Say a little about your experience.' }); return; }
    try {
      await ensureProvidersTable();
      const q = sql(); const p = who(req);
      await q`INSERT INTO feedback (provider_id, email, rating, message) VALUES (${p.u || null}, ${p.e || null}, ${rating}, ${message})`;
      res.status(200).json({ ok: true });
    } catch (e) { res.status(200).json({ ok: false }); }
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}
