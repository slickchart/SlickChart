// Public (token-authed): a client opens their personal link; we return only THEIR
// data blob (summaries, aftercare, forms, photos, branding). No provider auth —
// the unguessable token IS the credential, and it only ever exposes one client.
import { dbEnabled } from '../lib/db.js';
import { ensureClientTables, getClientByToken, markOpened } from '../lib/clients.js';

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(404).json({ error: 'Not found' }); return; }
  await ensureClientTables();
  const token = (req.query && req.query.t) || (req.body && req.body.t) || '';
  if (!token) { res.status(400).json({ error: 'Missing link token' }); return; }
  try {
    const c = await getClientByToken(String(token));
    if (!c) { res.status(404).json({ error: 'This link is not valid or has been removed.' }); return; }
    markOpened(String(token)).catch(() => {});
    res.status(200).json({
      ok: true,
      client: { id: c.id, name: c.name || '', email: c.email || '', data: c.data || {} }
    });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}
