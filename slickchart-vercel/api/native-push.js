// POST/DELETE /api/native-push  — stores (or removes) a native device's push token from the Capacitor
// app so the server can send it via FCM (Android) / APNs-through-FCM (iOS) later.
//   Provider app:  Authorization: Bearer <session token>   body { platform, token }
//   Client app:    ?t=<client link token>                   body { platform, token }
//
// This ONLY stores the token. Actually sending native push requires a Firebase project (FCM) and an
// APNs key uploaded to it — see PUSH-NATIVE-SETUP.md. The sender reads these tokens from
// native_push_tokens once those credentials are configured.
import { dbEnabled, sql } from '../lib/db.js';
import { verifyToken, sessionOk } from '../lib/auth.js';
import { ensureClientTables, getClientByToken } from '../lib/clients.js';
import { validateFcmToken } from '../lib/fcm.js';

async function ensureNativeTable(q) {
  await q`CREATE TABLE IF NOT EXISTS native_push_tokens (
    token text PRIMARY KEY,
    platform text,
    owner_kind text,
    owner_id text,
    provider_id text,
    created_at bigint,
    updated_at bigint
  )`;
}

export default async function handler(req, res) {
  if (!(await sessionOk(req))) { res.status(401).json({ error: 'This session has been signed out. Please log in again.' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false }); return; }
  const b = req.body || {};
  const platform = String(b.platform || '').slice(0, 16);
  const token = String(b.token || '').slice(0, 4096).trim();

  // Resolve the owner from whichever auth is present.
  let ownerKind = null, ownerId = null, providerId = null;
  try {
    const t = (req.query && req.query.t) || (b.t) || '';
    if (t) {
      await ensureClientTables();
      const c = await getClientByToken(String(t));
      if (!c) { res.status(404).json({ error: 'This link is not valid.' }); return; }
      ownerKind = 'client'; ownerId = c.id; providerId = c.provider_id;
    } else {
      const secret = process.env.SESSION_SECRET || '';
      const h = req.headers['authorization'] || '';
      const bearer = h.startsWith('Bearer ') ? h.slice(7) : '';
      const payload = (secret && bearer) ? verifyToken(bearer, secret) : null;
      if (!payload || !payload.u) { res.status(401).json({ error: 'Not signed in.' }); return; }
      ownerKind = 'provider'; ownerId = payload.u; providerId = payload.u;
    }
  } catch (e) { res.status(401).json({ error: 'Not authorized.' }); return; }

  if (!token) { res.status(400).json({ error: 'Missing token' }); return; }

  try {
    const q = sql();
    await ensureNativeTable(q);
    const now = Date.now();
    if (req.method === 'DELETE') {
      await q`DELETE FROM native_push_tokens WHERE token = ${token} AND owner_id = ${ownerId}`;
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === 'POST') {
      // A provider's own phone opening a client's link (App Links open client spaces INSIDE the app)
      // must not hand that phone's alerts to the client: one install has one address, and this used
      // to re-key it to the client, so the provider's sign-up and form alerts went to nobody until she
      // next relaunched (2026-10-21). A provider binding always beats a client one.
      if (ownerKind === 'client') {
        try {
          const cur = await q`SELECT owner_kind FROM native_push_tokens WHERE token = ${token}`;
          if (cur.length && cur[0].owner_kind === 'provider') { res.status(200).json({ ok: true, kept: 'provider' }); return; }
        } catch (e) {}
      }
      // Re-key the token to THIS owner (a device that switches accounts must not keep the old binding).
      await q`INSERT INTO native_push_tokens (token, platform, owner_kind, owner_id, provider_id, created_at, updated_at)
        VALUES (${token}, ${platform}, ${ownerKind}, ${ownerId}, ${providerId}, ${now}, ${now})
        ON CONFLICT (token) DO UPDATE SET platform = EXCLUDED.platform, owner_kind = EXCLUDED.owner_kind,
          owner_id = EXCLUDED.owner_id, provider_id = EXCLUDED.provider_id, updated_at = EXCLUDED.updated_at`;
      // Check with Google right away that this address can actually be delivered to (nothing is shown
      // on the phone). A refused one is removed and the app is told, so it can fetch a fresh address
      // by itself (2026-10-21: a phone "linked" fine, then Google refused it on the first real alert,
      // it was deleted, and every alert after that went nowhere with no sign on the phone).
      let check = { ok: true };
      try { check = await validateFcmToken(token); } catch (e) { check = { ok: true }; }
      if (!check.ok && check.gone) {
        try { await q`DELETE FROM native_push_tokens WHERE token = ${token} AND owner_id = ${ownerId}`; } catch (e) {}
        res.status(200).json({ ok: true, invalid: true, reason: check.error || 'Google refused this device address' });
        return;
      }
      res.status(200).json({ ok: true, checked: !check.skipped, checkError: (!check.ok && check.error) ? check.error : '' });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { console.error('[native-push] failed:', e && e.message); res.status(500).json({ error: 'Something went wrong.' }); }
}
