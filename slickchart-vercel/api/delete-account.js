// POST /api/delete-account  (provider session Bearer token)
// Permanently deletes the logged-in provider's account and ALL associated data. This is the
// App Store / Google Play account-deletion requirement, and the honest fulfillment of the app's
// "your data is yours — permanently delete your account" promise. It revokes the seller's Square
// tokens, cancels Stripe billing (so a deleted account is never charged again), and wipes every
// table keyed to the provider or to its clients. Deleting the account data via a blanked KV store
// (the old client-side fallback) is NOT sufficient — the account row and linked records must go.
import { sql, dbEnabled, ensureProvidersTable } from '../lib/db.js';
import { verifyToken } from '../lib/auth.js';
import { disconnect } from '../lib/square.js';

// Best-effort: cancel the provider's Stripe subscription so billing stops with the account.
async function cancelStripe(subId) {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key || !subId) return;
  try {
    await fetch('https://api.stripe.com/v1/subscriptions/' + encodeURIComponent(subId), {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + key }
    });
  } catch (e) { /* best-effort — local record is removed below regardless */ }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: true, note: 'no database configured' }); return; }
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && tok ? verifyToken(tok, secret) : null;
  const providerId = payload && payload.u;
  if (!providerId) { res.status(401).json({ error: 'Not signed in' }); return; }

  try {
    await ensureProvidersTable();
    const q = sql();

    // Resolve the account email (needed for the email-keyed tables).
    let email = (payload && payload.e) ? String(payload.e).toLowerCase() : null;
    if (!email) {
      try { const r = await q`SELECT email FROM providers WHERE id = ${providerId}`; email = (r[0] && r[0].email) ? String(r[0].email).toLowerCase() : null; } catch (e) {}
    }

    // 1) Revoke the seller's Square tokens at Square and remove the stored connection.
    try { await disconnect(providerId); } catch (e) { /* best-effort */ }

    // 2) Stop Stripe billing, then the local subscription row is removed with the rest below.
    if (email) {
      try {
        const s = await q`SELECT stripe_subscription_id FROM subscriptions WHERE email = ${email}`;
        if (s[0] && s[0].stripe_subscription_id) await cancelStripe(s[0].stripe_subscription_id);
      } catch (e) {}
    }

    // 3) Wipe every table keyed to this provider (and to its clients). Each delete is isolated so a
    //    table that isn't provisioned yet can't abort the rest. Child rows that reference a client
    //    (prefs, reminder log) are deleted before the clients themselves.
    const del = async (fn) => { try { await fn(); } catch (e) { console.error('[delete-account] partial delete failed:', e && e.message || e); } };
    await del(() => q`DELETE FROM client_prefs WHERE client_id IN (SELECT id FROM clients WHERE provider_id = ${providerId})`);
    await del(() => q`DELETE FROM reminder_log WHERE client_id IN (SELECT id FROM clients WHERE provider_id = ${providerId})`);
    await del(() => q`DELETE FROM push_subscriptions WHERE provider_id = ${providerId}`);
    await del(() => q`DELETE FROM native_push_tokens WHERE provider_id = ${providerId}`);
    await del(() => q`DELETE FROM client_events WHERE provider_id = ${providerId}`);
    await del(() => q`DELETE FROM clients WHERE provider_id = ${providerId}`);
    await del(() => q`DELETE FROM consult_requests WHERE provider_id = ${providerId}`);
    await del(() => q`DELETE FROM beta_events WHERE provider_id = ${providerId}`);
    await del(() => q`DELETE FROM feedback WHERE provider_id = ${providerId}`);
    await del(() => q`DELETE FROM sync_requests WHERE provider_id = ${providerId}`);
    await del(() => q`DELETE FROM auth_tokens WHERE provider_id = ${providerId}`);
    await del(() => q`DELETE FROM sessions WHERE provider_id = ${providerId}`);
    await del(() => q`DELETE FROM kv WHERE owner = ${providerId}`);
    if (email) {
      await del(() => q`DELETE FROM subscriptions WHERE email = ${email}`);
      await del(() => q`DELETE FROM login_attempts WHERE email = ${email} OR email = ${'reset:' + email}`);
    }

    // 4) Finally, the account row itself.
    await q`DELETE FROM providers WHERE id = ${providerId}`;

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[delete-account] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong deleting your account. Please try again.' });
  }
}
