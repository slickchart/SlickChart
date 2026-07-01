// /api/store  — the app's saved data, per logged-in owner.
//   GET  -> { data: { key: value, ... } }            (everything, for hydration)
//   PUT  -> body { items: { key: value, ... } }       (upsert many)
//        -> body { key, value }                        (upsert one)
import { sql, ensureTable, dbEnabled } from '../lib/db.js';
import { verifyToken } from '../lib/auth.js';

function requireLogin(req, res) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret ? verifyToken(token, secret) : null;
  if (!payload) { res.status(401).json({ error: 'Not logged in.' }); return null; }
  return payload.u || 'owner';
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured.' }); return; }
  const owner = requireLogin(req, res);
  if (!owner) return;

  try {
    await ensureTable();
    const q = sql();

    if (req.method === 'GET') {
      const rows = await q`SELECT k, v FROM kv WHERE owner = ${owner}`;
      const data = {};
      rows.forEach(r => { data[r.k] = r.v; });
      res.status(200).json({ data, count: rows.length });
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = req.body || {};
      let items = body.items;
      if (!items && body.key !== undefined) items = { [body.key]: body.value };
      if (!items || typeof items !== 'object') { res.status(400).json({ error: 'Nothing to save.' }); return; }

      const entries = Object.entries(items);
      for (const [k, v] of entries) {
        const val = v == null ? null : String(v);
        await q`INSERT INTO kv (owner, k, v, updated_at)
                VALUES (${owner}, ${k}, ${val}, now())
                ON CONFLICT (owner, k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
      }
      res.status(200).json({ ok: true, saved: entries.length });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
}
