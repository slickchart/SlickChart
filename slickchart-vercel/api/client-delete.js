// Token-authed: a client deletes their own data from the app (App Store account-deletion
// requirement). This is a real server-side deletion, not a sign-out: it removes the client's
// preferences and push subscriptions, purges every submission they made (check-ins, form
// answers, the message thread, consult/booking/contact events), scrubs the server-held PII
// (name/email/phone + the server chart mirror), and revokes the link token so the old link is
// dead — tombstoning the row so a provider re-sync can't resurrect it. A 'delete-request' event
// still notifies the provider, who keeps their own local record for any legal retention.
// Same credential model as /api/client-data.
import { dbEnabled } from '../lib/db.js';
import {
  ensureClientTables, getClientByToken, logEvent, deleteClientPrefs, deleteClientPushSubs, deleteClientData
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
    // Purge the client's submissions + scrub server-held PII and revoke the link (must run
    // BEFORE we log the delete-request, or the purge would wipe that notification too).
    await deleteClientData(c.id);
    // Best-effort: let the provider know, so they can action their own retained record.
    try { await logEvent(c.provider_id, c.id, 'delete-request', { at: Date.now() }); } catch (e) {}
    res.status(200).json({ ok: true });
  } catch (e) { console.error('[client-delete] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
