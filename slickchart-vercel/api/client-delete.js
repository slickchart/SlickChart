// Token-authed: a client deletes their own data from the app (App Store account-deletion
// requirement). Removes the data the client controls — their saved preferences and every
// device push subscription — and logs a 'delete-request' event so the provider is notified
// to remove the clinical record per their own retention obligations. Same credential model
// as /api/client-data.
import { dbEnabled } from '../lib/db.js';
import {
  ensureClientTables, getClientByToken, logEvent, deleteClientPrefs, deleteClientPushSubs
} from '../lib/clients.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false }); return; }
  const token = (req.query && req.query.t) || (req.body && req.body.t) || '';
  if (!token) { res.status(400).json({ error: 'Missing link token' }); return; }
  try {
    await ensureClientTables();
    const c = await getClientByToken(String(token));
    if (!c) { res.status(404).json({ error: 'This link is not valid or has been removed.' }); return; }
    await deleteClientPushSubs(c.id);
    await deleteClientPrefs(c.id);
    // Best-effort: let the provider know so they can action the clinical record.
    try { await logEvent(c.provider_id, c.id, 'delete-request', { at: Date.now() }); } catch (e) {}
    res.status(200).json({ ok: true });
  } catch (e) { console.error('[client-delete] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
