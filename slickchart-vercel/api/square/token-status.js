// GET /api/square/token-status
// Introspects the seller's Square access token (Square's RetrieveTokenStatus)
// and reports, in plain language, which permissions it has — so the app can show
// a green/red "ready to book" checklist without the seller touching any dev tools.
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

// The permissions live booking needs, with a human label for each.
const REQUIRED = [
  { scope: 'APPOINTMENTS_READ',                   label: 'Read your appointments' },
  { scope: 'APPOINTMENTS_WRITE',                  label: 'Create appointments' },
  { scope: 'INVOICES_READ',                       label: 'Read your invoices' },
  { scope: 'INVOICES_WRITE',                      label: 'Send invoices' },
  { scope: 'ORDERS_READ',                         label: 'Read your sales' },
  { scope: 'PAYMENTS_READ',                       label: 'Read your payments' },
  { scope: 'CUSTOMERS_READ',                      label: 'Look up clients' },
  { scope: 'ITEMS_READ',                          label: 'Read your services & prices' },
  { scope: 'MERCHANT_PROFILE_READ',               label: 'Find your location' }
];

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);

  try {
    // POST /oauth2/token/status returns the granted scopes for the token in use.
    const data = await sf('/oauth2/token/status', { method: 'POST' });
    const scopes = Array.isArray(data.scopes) ? data.scopes : [];

    const checks = REQUIRED.map(r => ({ scope: r.scope, label: r.label, ok: scopes.includes(r.scope) }));
    const ready = checks.every(c => c.ok);

    res.status(200).json({
      ready,
      checks,
      // If Square can't return a scope list (rare), say so instead of showing
      // everything as "missing" — that would be misleading.
      inconclusive: scopes.length === 0,
      grantedScopes: scopes,
      expiresAt: data.expires_at || null,
      merchantId: data.merchant_id || null
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.squareErrors || null });
  }
}
