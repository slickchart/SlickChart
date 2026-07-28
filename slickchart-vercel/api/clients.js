// Provider-authed: sync the provider's client list + per-client data blobs up to
// the server (POST), and read them back with link tokens & invite status (GET).
import { verifyToken } from '../lib/auth.js';
import { dbEnabled } from '../lib/db.js';
import { ensureClientTables, upsertClient, listClients, listEvents, markClientDeleted } from '../lib/clients.js';

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
      // Soft-delete any clients the provider removed/merged-away, so the server row is tombstoned
      // and can't resurrect as a blank zombie on the next re-sync. Runs before the upsert.
      const del = Array.isArray(body.deletedIds) ? body.deletedIds : [];
      if (del.length) { try { await Promise.all(del.slice(0, 500).map(id => markClientDeleted(provider, String(id)))); } catch (e) { /* best-effort */ } }
      const list = Array.isArray(body.clients) ? body.clients : [];
      // Isolate per-client failures: one client whose blob makes the DB throw must NOT 500 the whole
      // batch and block every other client's sync (that stalls form delivery account-wide). Save each
      // independently; return the ones that saved, and report the ones that didn't.
      const settled = await Promise.allSettled(list.slice(0, 2000).map(c => upsertClient(provider, c)));
      const out = [], failed = [];
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') { out.push(r.value); }
        else {
          const c = list[i] || {};
          failed.push({ id: c.id || null });
          console.error('[clients] upsert failed for', c && c.id, r.reason && (r.reason.stack || r.reason.message) || r.reason);
        }
      });
      res.status(200).json({ ok: true, saved: out.length, clients: out, failed });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { console.error('[clients] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
