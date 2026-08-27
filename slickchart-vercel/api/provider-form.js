// Provider-authed: record a form the provider captured IN PERSON (the "Sign on this device" flow) as a
// real client_event (kind 'form'), the same shape a client-submitted form produces via /api/client-submit.
//
// WHY THIS EXISTS: sign-on-device intakes used to be written ONLY to the provider's local sc_clients blob
// (no server event). That made them invisible to the self-heal reconciliation, so if a stale device or a
// Square re-sync overwrote the client record, the signed intake was gone for good with no way to recover
// it. Logging it as a client_event here means it lives in the authoritative event log and re-attaches to
// the chart on every sync, on any device — exactly like an app-submitted form.
import { verifyToken } from '../lib/auth.js';
import { dbEnabled, sql } from '../lib/db.js';
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
  const formId = String(body.formId || '');
  const title = String(body.title || 'Form').slice(0, 200);
  const answers = (body.answers && typeof body.answers === 'object') ? body.answers : {};
  const flagged = Array.isArray(body.flagged) ? body.flagged : [];
  const signed = !!body.signed;
  const qs = Array.isArray(body.qs) ? body.qs : null;
  const idem = body.idem;
  if (!clientId || !formId) { res.status(400).json({ error: 'Missing clientId or formId' }); return; }

  // Size guard, mirroring /api/client-submit and /api/provider-message.
  try {
    if (Buffer.byteLength(JSON.stringify({ answers, qs })) > 4 * 1024 * 1024) {
      res.status(413).json({ error: 'That form is too large.' }); return;
    }
  } catch (e) { res.status(400).json({ error: 'Bad request' }); return; }

  try {
    // Data isolation: confirm this client actually belongs to THIS provider before logging anything.
    const q = sql();
    const rows = await q`SELECT id FROM clients WHERE id=${clientId} AND provider_id=${provider}`;
    if (!rows.length) { res.status(404).json({ error: 'Client not found' }); return; }
    const id = await logEvent(provider, clientId, 'form', { title, formId, answers, flagged, signed, qs }, idem);
    res.status(200).json({ ok: true, id });
  } catch (e) {
    console.error('[provider-form] failed:', e && e.stack || e);
    res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' });
  }
}
