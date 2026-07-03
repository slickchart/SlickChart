// Shared Square helpers. Lives OUTSIDE /api so Vercel doesn't treat it as an endpoint.
//
// Two modes, transparently:
//  1) Per-provider OAuth (multi-tenant): each provider connects their OWN Square
//     account; we store their (encrypted) tokens in square_connections and use them.
//  2) Legacy single-token: if a provider has no OAuth connection, we fall back to the
//     deployment-wide SQUARE_ACCESS_TOKEN — so the original owner setup keeps working.
import { sql, ensureProvidersTable, dbEnabled } from './db.js';
import { verifyToken } from './auth.js';
import { encrypt, decrypt } from './crypto.js';

export function squareConfig() {
  const env = (process.env.SQUARE_ENV || 'sandbox').toLowerCase();
  const base = env === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
  return {
    env, base,
    token: process.env.SQUARE_ACCESS_TOKEN || '',        // legacy single-token fallback
    appId: process.env.SQUARE_APP_ID || '',
    appSecret: process.env.SQUARE_APP_SECRET || '',
    version: process.env.SQUARE_VERSION || '',
    locationId: process.env.SQUARE_LOCATION_ID || ''
  };
}

// The permissions SlickChart needs from each seller.
export const SQUARE_SCOPES = [
  'MERCHANT_PROFILE_READ', 'CUSTOMERS_READ', 'CUSTOMERS_WRITE',
  'ITEMS_READ', 'APPOINTMENTS_READ', 'APPOINTMENTS_WRITE', 'APPOINTMENTS_BUSINESS_SETTINGS_READ',
  'PAYMENTS_WRITE', 'PAYMENTS_READ', 'ORDERS_WRITE', 'INVOICES_WRITE'
].join('+');

// Legacy shared-key gate (still used as a fallback path).
export function requireAuth(req, res) {
  const expected = process.env.APP_SHARED_SECRET || '';
  const got = req.headers['x-slickchart-key'] || '';
  if (!expected) { res.status(500).json({ error: 'Server is missing APP_SHARED_SECRET.' }); return false; }
  if (got !== expected) { res.status(401).json({ error: 'Unauthorized — wrong or missing access key.' }); return false; }
  return true;
}

// Core Square call. Pass an explicit token (per-provider); falls back to env token.
export async function squareFetch(path, { method = 'GET', body } = {}, token) {
  const cfg = squareConfig();
  const bearer = token || cfg.token;
  if (!bearer) { const err = new Error('No Square access token available.'); err.status = 401; throw err; }
  const headers = { 'Authorization': `Bearer ${bearer}`, 'Content-Type': 'application/json' };
  if (cfg.version) headers['Square-Version'] = cfg.version;
  const resp = await fetch(cfg.base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await resp.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!resp.ok) {
    const detail = data && data.errors && data.errors[0] && data.errors[0].detail;
    const err = new Error(detail || `Square API error (${resp.status})`);
    err.status = resp.status; err.squareErrors = data.errors; throw err;
  }
  return data;
}

export async function resolveLocationId(token, stored) {
  if (stored) return stored;
  const cfg = squareConfig();
  if (cfg.locationId) return cfg.locationId;
  const data = await squareFetch('/v2/locations', {}, token);
  const all = data.locations || [];
  const pick = all.filter(l => l.status === 'ACTIVE')[0] || all[0];
  return pick ? pick.id : null;
}

// ── OAuth ────────────────────────────────────────────────────────────────────
export function authorizeUrl(state, redirectUri) {
  const cfg = squareConfig();
  const p = new URLSearchParams({ client_id: cfg.appId, scope: SQUARE_SCOPES, session: 'false', state });
  if (redirectUri) p.set('redirect_uri', redirectUri);
  // scope must not be URL-encoded '+' → set() encodes it; build manually to keep '+'
  return cfg.base + '/oauth2/authorize?client_id=' + encodeURIComponent(cfg.appId) +
    '&scope=' + SQUARE_SCOPES + '&session=false&state=' + encodeURIComponent(state) +
    (redirectUri ? '&redirect_uri=' + encodeURIComponent(redirectUri) : '');
}

async function obtainToken(payload) {
  const cfg = squareConfig();
  const resp = await fetch(cfg.base + '/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: cfg.appId, client_secret: cfg.appSecret, ...payload })
  });
  const text = await resp.text(); let data; try { data = JSON.parse(text); } catch { data = {}; }
  if (!resp.ok) { const err = new Error((data.errors && data.errors[0] && data.errors[0].detail) || 'Square token exchange failed'); err.status = resp.status; throw err; }
  return data; // { access_token, refresh_token, expires_at, merchant_id }
}
export function exchangeCode(code, redirectUri) {
  const b = { code, grant_type: 'authorization_code' };
  if (redirectUri) b.redirect_uri = redirectUri;
  return obtainToken(b);
}
export function refreshToken(refresh) { return obtainToken({ refresh_token: refresh, grant_type: 'refresh_token' }); }

// Persist a provider's connection (tokens encrypted at rest).
export async function storeConnection(providerId, resp) {
  const q = sql();
  await ensureProvidersTable();
  let locationId = null;
  try { locationId = await resolveLocationId(resp.access_token, null); } catch (e) {}
  await q`INSERT INTO square_connections (provider_id, access_token, refresh_token, expires_at, merchant_id, location_id, connected_at, updated_at)
    VALUES (${providerId}, ${encrypt(resp.access_token)}, ${encrypt(resp.refresh_token)}, ${resp.expires_at || null}, ${resp.merchant_id || null}, ${locationId}, now(), now())
    ON CONFLICT (provider_id) DO UPDATE SET access_token=EXCLUDED.access_token, refresh_token=EXCLUDED.refresh_token,
      expires_at=EXCLUDED.expires_at, merchant_id=EXCLUDED.merchant_id, location_id=COALESCE(EXCLUDED.location_id, square_connections.location_id),
      connected_at=COALESCE(square_connections.connected_at, now()), updated_at=now()`;
  return { locationId, merchantId: resp.merchant_id || null };
}
export async function disconnect(providerId) {
  const q = sql();
  await q`DELETE FROM square_connections WHERE provider_id = ${providerId}`;
}

// Read a provider's connection; refresh the token if it expires within 7 days.
export async function getConnection(providerId) {
  if (!dbEnabled() || !providerId) return null;
  await ensureProvidersTable();
  const q = sql();
  const rows = await q`SELECT * FROM square_connections WHERE provider_id = ${providerId}`;
  if (!rows.length) return null;
  const row = rows[0];
  let access = decrypt(row.access_token);
  const refresh = decrypt(row.refresh_token);
  const soon = row.expires_at && (new Date(row.expires_at).getTime() - Date.now() < 7 * 864e5);
  if (soon && refresh) {
    try {
      const r = await refreshToken(refresh);
      await q`UPDATE square_connections SET access_token=${encrypt(r.access_token)},
        refresh_token=${encrypt(r.refresh_token || refresh)}, expires_at=${r.expires_at || null}, updated_at=now()
        WHERE provider_id=${providerId}`;
      access = r.access_token;
    } catch (e) { /* keep existing token; may still be valid */ }
  }
  return { token: access, locationId: row.location_id || null, merchantId: row.merchant_id || null };
}

// Identify the requesting provider from their SlickChart session (Bearer token).
export function providerFromReq(req) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && tok ? verifyToken(tok, secret) : null;
  return payload && payload.u ? payload.u : null;
}

// One call for data endpoints: returns { token, locationId } for the caller, or writes
// an error and returns null. Order: provider's OAuth connection → legacy shared-key+env.
export async function sqContext(req, res) {
  const providerId = providerFromReq(req);
  if (providerId) {
    try {
      const conn = await getConnection(providerId);
      if (conn && conn.token) {
        try { const q = sql(); q`UPDATE square_connections SET last_used_at=now() WHERE provider_id=${providerId} AND (last_used_at IS NULL OR last_used_at < now() - interval '1 hour')`.catch(() => {}); } catch (e) {}
        return { token: conn.token, locationId: conn.locationId, providerId };
      }
    } catch (e) { /* fall through to legacy */ }
  }
  // Legacy fallback: shared key + deployment env token (original single-tenant setup)
  const cfg = squareConfig();
  const key = req.headers['x-slickchart-key'] || '';
  if (cfg.token && process.env.APP_SHARED_SECRET && key === process.env.APP_SHARED_SECRET) {
    return { token: cfg.token, locationId: cfg.locationId || null, providerId: providerId || 'owner' };
  }
  res.status(401).json({ error: 'Square isn\u2019t connected for this account yet.', code: 'nosquare' });
  return null;
}
