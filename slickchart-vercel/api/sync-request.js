// POST /api/sync-request { app }  → logs a provider's interest in live-sync for a booking app.
// GET  /api/sync-request          → { counts: { "Booksy": 3, ... } } (distinct providers per app)
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken } from '../lib/auth.js';

function providerId(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const p = s && t ? verifyToken(t, s) : null;
  return (p && p.u) ? p.u : 'anon';
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(200).json({ counts: {}, ok: true }); return; }
  try {
    await ensureProvidersTable();
    const q = sql();
    if (req.method === 'POST') {
      // Require a signed-in provider — this used to accept an anonymous ('anon') write from anyone on
      // the internet, appending an unbounded row per call.
      const pid = providerId(req);
      if (pid === 'anon') { res.status(401).json({ error: 'Please sign in.' }); return; }
      const app = String((req.body && req.body.app) || '').slice(0, 60).trim();
      if (!app) { res.status(400).json({ error: 'Missing app' }); return; }
      await q`INSERT INTO sync_requests (app, provider_id) VALUES (${app}, ${pid})`;
      res.status(200).json({ ok: true });
      return;
    }
    const rows = await q`SELECT app, count(distinct provider_id)::int AS n FROM sync_requests GROUP BY app`;
    const counts = {}; rows.forEach(r => { counts[r.app] = r.n; });
    res.status(200).json({ counts });
  } catch (e) { res.status(200).json({ counts: {}, ok: false }); }
}
