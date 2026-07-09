// Provider-authed: send a message to one specific real client. Stored as a
// client_event (kind 'provider_message') so it shows up in the client's real
// message history via /api/client-messages, on any device.
import { verifyToken } from '../lib/auth.js';
import { dbEnabled } from '../lib/db.js';
import { sql } from '../lib/db.js';
import { ensureClientTables, logEvent } from '../lib/clients.js';

function providerId(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const c = (s && t) ? verifyToken(t, s) : null;
  return c && c.u;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false }); return; }
  const provider = providerId(req);
  if (!provider) { res.status(401).json({ error: 'Not signed in' }); return; }
  await ensureClientTables();
  const body = req.body || {};
  const clientId = String(body.clientId || '');
  const text = String(body.text || '').trim();
  if (!clientId || !text) { res.status(400).json({ error: 'Missing clientId or text' }); return; }
  try {
    // Confirm this client actually belongs to this provider before logging anything.
    const q = sql();
    const rows = await q`SELECT id FROM clients WHERE id=${clientId} AND provider_id=${provider}`;
    if (!rows.length) { res.status(404).json({ error: 'Client not found' }); return; }
    const id = await logEvent(provider, clientId, 'provider_message', { text });
    res.status(200).json({ ok: true, id });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}
