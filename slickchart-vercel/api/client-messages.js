// Public (token-authed): a client fetches their own real message history —
// everything they've sent plus everything their provider has sent back. The
// unguessable token is the credential, same pattern as /api/client-data.
import { dbEnabled } from '../lib/db.js';
import { ensureClientTables, getClientByToken, listClientMessages } from '../lib/clients.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, messages: [] }); return; }
  const token = (req.query && req.query.t) || '';
  if (!token) { res.status(400).json({ error: 'Missing link token' }); return; }
  try {
    await ensureClientTables();
    const c = await getClientByToken(String(token));
    if (!c) { res.status(404).json({ error: 'This link is not valid or has been removed.' }); return; }
    const rows = await listClientMessages(c.id, c.provider_id);
    const messages = rows.map(r => ({
      id: r.id,
      from: r.kind === 'provider_message' ? 'provider' : 'me',
      text: (r.payload && r.payload.text) || '',
      photos: (r.payload && Array.isArray(r.payload.photos)) ? r.payload.photos : [],
      ts: Number(r.created_at) || 0
    }));
    res.status(200).json({ ok: true, messages });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}
