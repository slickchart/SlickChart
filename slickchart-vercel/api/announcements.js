// GET  /api/announcements            → { items, canPost, you, ownerSet }
// POST /api/announcements {title,body} → owner-only (provider email === OWNER_EMAIL) publish
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken } from '../lib/auth.js';

// Resolve the logged-in provider's email. Prefer the token's email claim, but
// fall back to a DB lookup by provider id so older tokens (minted before the
// email claim existed) still work.
async function resolveEmail(req, q) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const p = secret && t ? verifyToken(t, secret) : null;
  if (!p || !p.u) return null;
  if (p.e) return String(p.e).toLowerCase();
  try {
    const r = await q`SELECT email FROM providers WHERE id = ${p.u}`;
    return (r[0] && r[0].email) ? String(r[0].email).toLowerCase() : null;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(200).json({ items: [], canPost: false, you: null, ownerSet: false }); return; }
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  try {
    await ensureProvidersTable();
    const q = sql();
    const you = await resolveEmail(req, q);
    const isOwner = !!owner && you === owner;
    if (req.method === 'POST') {
      if (!isOwner) { res.status(403).json({ error: 'Only the owner can post updates.' }); return; }
      const b = req.body || {};
      const title = String(b.title || '').slice(0, 140).trim();
      const body = String(b.body || '').slice(0, 4000).trim();
      if (!title) { res.status(400).json({ error: 'Add a title.' }); return; }
      await q`INSERT INTO announcements (title, body) VALUES (${title}, ${body})`;
      res.status(200).json({ ok: true });
      return;
    }
    const rows = await q`SELECT id, title, body, extract(epoch from ts) * 1000 AS ts FROM announcements ORDER BY ts DESC LIMIT 50`;
    res.status(200).json({
      items: rows.map(r => ({ id: Number(r.id), title: r.title, body: r.body, ts: Math.round(Number(r.ts)) })),
      canPost: isOwner, you: you || null, ownerSet: !!owner
    });
  } catch (e) { res.status(200).json({ items: [], canPost: false, you: null, ownerSet: false }); }
}
