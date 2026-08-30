// /api/admin/square-merchant — FOUNDER-ONLY. Diagnose + repair cross-account Square merchant sharing.
//
// The original incident: more than one SlickChart provider account ends up connected to the SAME Square
// merchant, so every account's Square operations (customer creates, bookings, invoices) write into the
// SAME customer directory — and each account then imports the others' customers. This endpoint lets the
// founder SEE every account connected to their own Square merchant and CUT OFF the foreign ones.
//
//   GET                                  -> list every connection on the FOUNDER's own merchant
//                                           (providerId, email, name, connectedAt, lastUsedAt, isSelf)
//   POST { action:'sever', providerIds } -> revoke at Square + delete those connections. Never the
//                                           founder's own row, and only rows actually on the founder's
//                                           merchant — so it can only ever remove foreign access to the
//                                           founder's OWN Square, nothing else.
import { dbEnabled, sql } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { revokeToken } from '../../lib/square.js';
import { decrypt } from '../../lib/crypto.js';

function norm(s) { return String(s || '').trim().toLowerCase(); }

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database configured.' }); return; }
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && tok ? verifyToken(tok, secret) : null;
  if (!payload || !payload.u) { res.status(401).json({ error: 'Not logged in.' }); return; }
  try { if (payload.sid && !(await isSessionValid(sql(), payload.sid))) { res.status(401).json({ error: 'Session expired.' }); return; } } catch (e) {}
  const email = norm(payload.e);
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!email || !founders.includes(email)) { res.status(403).json({ error: 'Owner-only.', code: 'notowner' }); return; }
  const me = String(payload.u);

  try {
    const q = sql();
    const meRows = await q`SELECT merchant_id FROM square_connections WHERE provider_id=${me}`;
    const mid = meRows[0] && meRows[0].merchant_id;
    if (!mid) { res.status(200).json({ ok: true, merchantId: null, connections: [], note: 'Your own account has no Square merchant connected.' }); return; }

    // ── Sever foreign connections on MY merchant ──────────────────────────────
    if (req.method === 'POST' && (req.body && req.body.action) === 'sever') {
      const ids = Array.isArray(req.body.providerIds) ? req.body.providerIds.map(String) : [];
      const targets = ids.filter(id => id && id !== me);   // never sever the founder's own connection
      const severed = [];
      for (const pid of targets) {
        // Only touch a connection that is genuinely on MY merchant — never anything else.
        let rows;
        try { rows = await q`SELECT access_token FROM square_connections WHERE provider_id=${pid} AND merchant_id=${mid}`; }
        catch (e) { severed.push({ providerId: pid, ok: false, reason: 'lookup failed' }); continue; }
        if (!rows.length) { severed.push({ providerId: pid, ok: false, reason: 'not connected to your merchant' }); continue; }
        // Revoke at Square so the token is truly dead (not just removed from our DB), then delete the row.
        let revoked = false;
        try { const at = decrypt(rows[0].access_token); if (at) { await revokeToken({ accessToken: at }); revoked = true; } } catch (e) { /* revoke best-effort */ }
        try { await q`DELETE FROM square_connections WHERE provider_id=${pid} AND merchant_id=${mid}`; severed.push({ providerId: pid, ok: true, revoked }); }
        catch (e) { severed.push({ providerId: pid, ok: false, reason: 'delete failed' }); }
      }
      res.status(200).json({ ok: true, merchantId: mid, severed });
      return;
    }

    // ── GET: list all connections on my merchant ──────────────────────────────
    const conns = await q`SELECT sc.provider_id, sc.connected_at, sc.last_used_at, p.email, p.name
      FROM square_connections sc LEFT JOIN providers p ON p.id = sc.provider_id
      WHERE sc.merchant_id = ${mid}
      ORDER BY sc.connected_at ASC NULLS FIRST`;
    res.status(200).json({
      ok: true,
      merchantId: mid,
      connections: (conns || []).map(c => ({
        providerId: c.provider_id,
        email: c.email || '',
        name: c.name || '',
        connectedAt: c.connected_at ? new Date(c.connected_at).getTime() : 0,
        lastUsedAt: c.last_used_at ? new Date(c.last_used_at).getTime() : 0,
        isSelf: String(c.provider_id) === me
      }))
    });
  } catch (e) {
    console.error('[admin/square-merchant] failed:', e && e.message || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
