// Provider-authed: sync the provider's client list + per-client data blobs up to
// the server (POST), and read them back with link tokens & invite status (GET).
import { verifyToken } from '../lib/auth.js';
import { dbEnabled } from '../lib/db.js';
import { ensureClientTables, upsertClient, listClients, listEvents } from '../lib/clients.js';

function providerId(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const c = (s && t) ? verifyToken(t, s) : null;
  return c && c.u;
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(200).json({ ok: false, clients: [] }); return; }
  const provider = providerId(req);
  if (!provider) { res.status(401).json({ error: 'Not signed in' }); return; }
  await ensureClientTables();
  try {
    if (req.method === 'GET') {
      const clients = await listClients(provider);
      const events = await listEvents(provider);
      res.status(200).json({ ok: true, clients, events });
      return;
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      const list = Array.isArray(body.clients) ? body.clients : [];
      const out = await Promise.all(list.slice(0, 2000).map(c => upsertClient(provider, c)));
      res.status(200).json({ ok: true, saved: out.length, clients: out });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { console.error('[clients] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
