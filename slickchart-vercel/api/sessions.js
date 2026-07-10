// GET  /api/sessions          — provider-authed: list this provider's real sessions
// POST /api/sessions/revoke   — provider-authed: { id } revoke one session
//
// Note: this one file handles both, distinguished by an `action` field in the
// body for POST, so no extra routing config is needed.
import { verifyToken, isSessionValid } from '../lib/auth.js';
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';

function claims(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (s && t ? verifyToken(t, s) : null) || {};
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(200).json({ ok: false, sessions: [] }); return; }
  await ensureProvidersTable();
  const q = sql();
  const c = claims(req);
  const providerId = c && c.u;
  if (!providerId) { res.status(401).json({ error: 'Not signed in' }); return; }
  // A revoked session shouldn't even be able to view or manage sessions.
  if (c.sid) {
    try { if (!(await isSessionValid(q, c.sid))) { res.status(401).json({ error: 'This session has been signed out.' }); return; } }
    catch (e) { /* non-fatal */ }
  }

  try {
    if (req.method === 'GET') {
      const rows = await q`SELECT id, device, location, ip, created_at, last_seen_at, revoked
        FROM sessions WHERE provider_id = ${providerId} ORDER BY last_seen_at DESC LIMIT 20`;
      res.status(200).json({
        ok: true,
        currentSessionId: c.sid || null,
        sessions: rows.map(r => ({
          id: r.id, device: r.device, location: r.location,
          lastSeen: r.last_seen_at, created: r.created_at, revoked: r.revoked,
          isCurrent: !!(c.sid && r.id === c.sid)
        }))
      });
      return;
    }

    if (req.method === 'POST') {
      const b = req.body || {};

      // Revoke every OTHER session for this provider, keeping the current one signed in.
      if (b.action === 'revokeOthers') {
        if (c.sid) {
          await q`UPDATE sessions SET revoked = true WHERE provider_id = ${providerId} AND id <> ${c.sid} AND revoked = false`;
        } else {
          // No identifiable current session — revoke everything to be safe.
          await q`UPDATE sessions SET revoked = true WHERE provider_id = ${providerId} AND revoked = false`;
        }
        res.status(200).json({ ok: true });
        return;
      }

      const id = String(b.id || '');
      if (!id) { res.status(400).json({ error: 'Missing session id' }); return; }
      // Only ever allow revoking a session that actually belongs to this provider.
      const owned = await q`SELECT id FROM sessions WHERE id = ${id} AND provider_id = ${providerId}`;
      if (!owned.length) { res.status(404).json({ error: 'Session not found' }); return; }
      await q`UPDATE sessions SET revoked = true WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { console.error('[sessions] failed:', e && e.stack || e); res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
}
