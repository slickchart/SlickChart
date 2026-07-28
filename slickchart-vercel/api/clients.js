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
      const items = (Array.isArray(body.clients) ? body.clients : []).slice(0, 2000);
      // Cap DB concurrency. Neon's HTTP driver opens a fresh connection PER query, and upsertClient
      // runs ~3 queries each. Firing every client at once (Promise.all over the whole list) opened
      // 400-520 simultaneous connections per request and exhausted the function's file descriptors
      // (EMFILE), 500-ing the route account-wide. A small worker pool keeps only a few connections
      // open at a time; per-client try/catch also isolates a bad record from the rest of the batch.
      const out = [], failed = [];
      const CONCURRENCY = 4;
      let _i = 0;
      async function _worker() {
        while (_i < items.length) {
          const c = items[_i++] || {};
          try { out.push(await upsertClient(provider, c)); }
          catch (e) { failed.push({ id: c.id || null }); console.error('[clients] upsert failed for', c && c.id, e && (e.stack || e.message) || e); }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => _worker()));
      res.status(200).json({ ok: true, saved: out.length, clients: out, failed });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { console.error('[clients] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
