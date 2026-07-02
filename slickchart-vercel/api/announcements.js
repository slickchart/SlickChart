// GET  /api/announcements            → { items:[{id,title,body,ts}], canPost }
// POST /api/announcements {title,body} → owner-only (provider email === OWNER_EMAIL) publish
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken } from '../lib/auth.js';

function emailOf(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const p = s && t ? verifyToken(t, s) : null;
  return (p && p.e) ? String(p.e).toLowerCase() : null;
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(200).json({ items: [], canPost: false }); return; }
  const owner = (process.env.OWNER_EMAIL || '').toLowerCase();
  try {
    await ensureProvidersTable();
    const q = sql();
    const isOwner = !!owner && emailOf(req) === owner;
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
    res.status(200).json({ items: rows.map(r => ({ id: Number(r.id), title: r.title, body: r.body, ts: Math.round(Number(r.ts)) })), canPost: isOwner });
  } catch (e) { res.status(200).json({ items: [], canPost: false }); }
}
