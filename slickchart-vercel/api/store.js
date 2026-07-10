// /api/store  — the app's saved data, per logged-in owner.
//   GET  -> { data: { key: value, ... } }            (everything, for hydration)
//   PUT  -> body { items: { key: value, ... } }       (upsert many)
//        -> body { key, value }                        (upsert one)
import { sql, ensureTable, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken, isSessionValid } from '../lib/auth.js';

async function requireLogin(req, res, q) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret ? verifyToken(token, secret) : null;
  if (!payload) { res.status(401).json({ error: 'Not logged in.' }); return null; }
  try {
    if (!(await isSessionValid(q, payload.sid))) {
      res.status(401).json({ error: 'This session has been signed out. Please log in again.' });
      return null;
    }
  } catch (e) { /* if the check itself fails, don't lock people out over it */ }
  return payload.u || 'owner';
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured.' }); return; }
  await ensureProvidersTable(); // makes sure the sessions table exists before we check it
  const q0 = sql();
  const owner = await requireLogin(req, res, q0);
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
    console.error('[store] failed:', e && e.stack || e); res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
