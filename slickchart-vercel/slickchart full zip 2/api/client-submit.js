// Token-authed (the client's link token): a client submits a form, a booking
// request, or a message. Logged as an event for the provider to review.
import { dbEnabled } from '../lib/db.js';
import { ensureClientTables, getClientByToken, logEvent } from '../lib/clients.js';

const KINDS = ['form', 'booking', 'message', 'checkin', 'vc_submit'];

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false }); return; }
  await ensureClientTables();
  const body = req.body || {};
  const token = String(body.t || '');
  const kind = String(body.kind || '');
  const payload = body.payload || {};
  if (!token || KINDS.indexOf(kind) < 0) { res.status(400).json({ error: 'Bad request' }); return; }
  try {
    const c = await getClientByToken(token);
    if (!c) { res.status(404).json({ error: 'Invalid link' }); return; }
    const id = await logEvent(c.provider_id, c.id, kind, payload);
    res.status(200).json({ ok: true, id });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}
