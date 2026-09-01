// Shared Square helpers. Lives OUTSIDE /api so Vercel doesn't treat it as an endpoint.
//
// ONE mode only: per-provider OAuth (multi-tenant). Each provider connects their OWN Square account and
// we store their encrypted tokens in square_connections, keyed by provider. There is NO shared/
// deployment-wide token — the SQUARE_ACCESS_TOKEN + APP_SHARED_SECRET fallback that caused the
// cross-account leak has been removed entirely, so no request can ever touch a Square account that
// isn't the caller's own, and one Square merchant maps to exactly one provider (DB-enforced).
import { sql, ensureProvidersTable, dbEnabled } from './db.js';
import { verifyToken } from './auth.js';
import { encrypt, decrypt } from './crypto.js';

export function squareConfig() {
  const env = (process.env.SQUARE_ENV || 'sandbox').toLowerCase();
  const base = env === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
  return {
    env, base,
    // NOTE: no shared SQUARE_ACCESS_TOKEN here on purpose. Every provider uses their OWN OAuth token
    // (square_connections); there is no deployment-wide token anymore, so no call can cross accounts.
    appId: process.env.SQUARE_APP_ID || '',
    appSecret: process.env.SQUARE_APP_SECRET || '',
    version: process.env.SQUARE_VERSION || '2026-05-20',
    locationId: process.env.SQUARE_LOCATION_ID || ''
  };
}

// The permissions SlickChart needs from each seller.
export const SQUARE_SCOPES = [
  'MERCHANT_PROFILE_READ', 'CUSTOMERS_READ', 'CUSTOMERS_WRITE',
  'ITEMS_READ', 'INVENTORY_READ',
  'APPOINTMENTS_READ', 'APPOINTMENTS_WRITE', 'APPOINTMENTS_ALL_READ', 'APPOINTMENTS_ALL_WRITE', 'APPOINTMENTS_BUSINESS_SETTINGS_READ',
  'PAYMENTS_WRITE', 'PAYMENTS_READ', 'ORDERS_WRITE', 'ORDERS_READ', 'INVOICES_WRITE', 'INVOICES_READ',
  // Added for: inventory counts, loyalty balances/points, and gift-card balance/redeem.
  'LOYALTY_READ', 'LOYALTY_WRITE', 'GIFTCARDS_READ', 'GIFTCARDS_WRITE'
].join('+');


// Core Square call. The caller MUST pass its own per-provider token.
// SECURITY (data isolation — top priority): this NO LONGER falls back to the deployment-wide
// SQUARE_ACCESS_TOKEN. That silent fallback was the exact mechanism behind the cross-account Square
// leak — any call reaching here with a missing/empty token would read or WRITE against the owner's
// merchant directory, mixing one account's customers into another's (and re-polluting a directory the
// owner just cleaned). sqContext always resolves the provider's own token (and even the gated
// legacy-owner path returns that token explicitly), so a falsy token here is a bug: fail loudly instead
// of quietly touching the shared merchant.
export async function squareFetch(path, { method = 'GET', body } = {}, token) {
  const cfg = squareConfig();
  const bearer = token || '';
  if (!bearer) { const err = new Error('No Square access token for this request.'); err.status = 401; err.code = 'notoken'; throw err; }
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
// The redirect_uri MUST byte-for-byte match the Redirect URL registered in the Square
// Developer Dashboard, or Square rejects the authorize call with "Invalid value for
// parameter `redirect_uri`". Deriving it from the request host makes it vary by whichever
// domain the app was opened from (slickchart.app vs slick-chart.vercel.app), which breaks
// the match. Pin it with SQUARE_REDIRECT_URI so authorize AND the token exchange always
// send the one canonical value that's registered. Falls back to the request host only when
// the env var isn't set (preserves old behavior for existing setups).
export function squareRedirectUri(req) {
  const fixed = (process.env.SQUARE_REDIRECT_URI || '').trim();
  if (fixed) return fixed;
  const host = (req && (req.headers['x-forwarded-host'] || req.headers.host)) || 'slickchart.app';
  const proto = (req && req.headers['x-forwarded-proto']) || 'https';
  return proto + '://' + host + '/api/square/callback';
}
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

// Revoke a seller's tokens at Square so a disconnect fully severs access (not just locally).
// The Revoke endpoint uses the "Client {app_secret}" auth scheme (not Bearer). Revoking by
// access_token (without revoke_only_access_token) invalidates the merchant's access AND refresh
// tokens. Square requires this on disconnect — deleting our row alone leaves live tokens behind.
export async function revokeToken({ accessToken, merchantId }) {
  const cfg = squareConfig();
  if (!cfg.appId || !cfg.appSecret) return { skipped: true };
  if (!accessToken && !merchantId) return { skipped: true };
  const body = { client_id: cfg.appId };
  if (accessToken) body.access_token = accessToken; else body.merchant_id = merchantId;
  const resp = await fetch(cfg.base + '/oauth2/revoke', {
    method: 'POST',
    headers: { 'Authorization': 'Client ' + cfg.appSecret, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) { const t = await resp.text().catch(() => ''); const e = new Error('Square revoke failed (' + resp.status + ') ' + t); e.status = resp.status; throw e; }
  return resp.json().catch(() => ({}));
}

// Persist a provider's connection (tokens encrypted at rest).
export async function storeConnection(providerId, resp) {
  const q = sql();
  await ensureProvidersTable();
  // Make sure we KNOW the merchant before storing. If Square's token response didn't include a
  // merchant_id, the clash guard below (gated on `if (mid)`) and the unique index (WHERE merchant_id IS
  // NOT NULL) would both be silently skipped — a hole a second account could slip through with a null
  // merchant. Resolve it from the token itself so isolation is always enforced. (Best-effort: a Square
  // hiccup here shouldn't block a legit connect; the hourly sweep still catches any duplicate that forms.)
  if (resp && !resp.merchant_id && resp.access_token) {
    try { const m = await squareFetch('/v2/merchants', {}, resp.access_token); const mm = (m && m.merchant && m.merchant[0]) || null; if (mm && mm.id) resp.merchant_id = mm.id; } catch (e) {}
  }
  // DATA ISOLATION (top priority): a Square merchant directory must belong to exactly ONE SlickChart
  // provider. If this merchant is already connected to a DIFFERENT provider, letting a second account
  // connect it would give both the SAME customer list — each other's clients would sync in. That is the
  // cross-account leak. Refuse the connect so one merchant can never feed two accounts. (A lookup hiccup
  // must not block a legitimate connect, so only a confirmed clash throws.)
  const mid = resp && resp.merchant_id;
  if (mid) {
    let clashProvider = null;
    try {
      const clash = await q`SELECT provider_id FROM square_connections WHERE merchant_id=${mid} AND provider_id <> ${providerId} LIMIT 1`;
      clashProvider = clash && clash[0] && clash[0].provider_id;
    } catch (e) { /* lookup failed — don't block a legit connect on a transient DB error */ }
    if (clashProvider) {
      console.error('[square] BLOCKED cross-account connect: merchant ' + mid + ' already linked to provider ' + clashProvider + ', refused for ' + providerId);
      const e = new Error('This Square account is already connected to another SlickChart account. Disconnect it there first, or contact support.');
      e.status = 409; e.code = 'merchant_taken';
      throw e;
    }
  }
  let locationId = null;
  try { locationId = await resolveLocationId(resp.access_token, null); } catch (e) {}
  // The DB is the FINAL word: a UNIQUE index on merchant_id (lib/db.js) makes it physically impossible
  // for two providers to hold the same Square merchant, even if the guard above ever fails open (DB
  // hiccup) or two connects race. If the INSERT trips that unique index, surface it as the same clean
  // "already connected to another account" refusal rather than a raw 500.
  try {
    await q`INSERT INTO square_connections (provider_id, access_token, refresh_token, expires_at, merchant_id, location_id, connected_at, updated_at)
      VALUES (${providerId}, ${encrypt(resp.access_token)}, ${encrypt(resp.refresh_token)}, ${resp.expires_at || null}, ${resp.merchant_id || null}, ${locationId}, now(), now())
      ON CONFLICT (provider_id) DO UPDATE SET access_token=EXCLUDED.access_token, refresh_token=EXCLUDED.refresh_token,
        expires_at=EXCLUDED.expires_at, merchant_id=EXCLUDED.merchant_id, location_id=COALESCE(EXCLUDED.location_id, square_connections.location_id),
        connected_at=COALESCE(square_connections.connected_at, now()), updated_at=now()`;
  } catch (e) {
    const msg = String((e && (e.code || e.message)) || '').toLowerCase();
    if (msg.includes('23505') || msg.includes('square_connections_merchant_uniq') || msg.includes('unique')) {
      console.error('[square] BLOCKED cross-account connect at DB constraint: merchant ' + mid + ' for provider ' + providerId);
      const err = new Error('This Square account is already connected to another SlickChart account. Disconnect it there first, or contact support.');
      err.status = 409; err.code = 'merchant_taken';
      throw err;
    }
    throw e;
  }
  return { locationId, merchantId: resp.merchant_id || null };
}
export async function disconnect(providerId) {
  const q = sql();
  // Revoke at Square FIRST so the tokens are truly dead, not just removed from our DB (Square
  // requires this on disconnect; it's also what the "never keeps access" trust promise implies).
  // Best-effort: if the row is already gone, the token's invalid, or Square errors, we still
  // delete the local row so the provider is never stuck showing "connected" on our side.
  try {
    const rows = await q`SELECT access_token, merchant_id FROM square_connections WHERE provider_id = ${providerId}`;
    if (rows[0]) {
      const accessToken = decrypt(rows[0].access_token);
      if (accessToken || rows[0].merchant_id) {
        try { await revokeToken({ accessToken, merchantId: rows[0].merchant_id }); }
        catch (e) { console.error('[square] revoke on disconnect failed (deleting local row anyway):', e && e.message || e); }
      }
    }
  } catch (e) { /* proceed to delete regardless */ }
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

// ── AUTONOMOUS ISOLATION ENFORCEMENT ─────────────────────────────────────────────────────────────
// A Square merchant belongs to exactly ONE SlickChart provider. If a SECOND account is connected to the
// same merchant, every one of its Square writes (customer creates from its own bookings/imports) lands in
// the FIRST provider's customer directory — the cross-account leak. storeConnection blocks NEW duplicates,
// but a duplicate that formed earlier keeps injecting until it's removed. This sweep removes them for good:
// for every FOUNDER's merchant, it revokes at Square + deletes any OTHER account connected to it, then
// (best-effort) installs the DB-level uniqueness lock. It only ever touches a founder's own merchant and
// only removes accounts that are NOT the founder, so it can never sever a legitimate provider's own Square.
// Runs autonomously from the hourly cron and on demand from the founder's isolation tool — no leak can
// persist longer than one cron tick, and none can re-form while the founder stays connected.
export async function enforceFounderMerchantIsolation() {
  const out = { ran: true, merchants: [], severed: [], dbLock: false, errors: [] };
  if (!dbEnabled()) { out.ran = false; return out; }
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '')
    .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!founders.length) { out.ran = false; return out; }
  const q = sql();
  try {
    // Founder provider ids → their merchant ids (only rows that actually have a merchant connected).
    const fRows = await q`
      SELECT sc.provider_id, sc.merchant_id
      FROM square_connections sc
      JOIN providers p ON p.id = sc.provider_id
      WHERE lower(p.email) = ANY(${founders}::text[]) AND sc.merchant_id IS NOT NULL`;
    for (const f of (fRows || [])) {
      const mid = f.merchant_id, ownerPid = String(f.provider_id);
      out.merchants.push(mid);
      let foreign = [];
      try { foreign = await q`SELECT provider_id, access_token FROM square_connections WHERE merchant_id = ${mid} AND provider_id <> ${ownerPid}`; }
      catch (e) { out.errors.push('lookup ' + mid + ': ' + (e && e.message)); continue; }
      for (const r of (foreign || [])) {
        const pid = String(r.provider_id);
        // Revoke at Square so the token is truly dead, then delete the row.
        let revoked = false;
        try { const at = decrypt(r.access_token); if (at) { await revokeToken({ accessToken: at }); revoked = true; } } catch (e) {}
        try { await q`DELETE FROM square_connections WHERE provider_id = ${pid} AND merchant_id = ${mid}`; out.severed.push({ providerId: pid, merchantId: mid, revoked }); }
        catch (e) { out.errors.push('delete ' + pid + ': ' + (e && e.message)); }
      }
    }
    // Now that duplicates on founder merchants are cleared, install/verify the DB-level lock. (If other
    // non-founder merchants still have duplicates elsewhere this global index may not create yet, but the
    // app-level clash guard in storeConnection still refuses new duplicates in the meantime.)
    try { await q`CREATE UNIQUE INDEX IF NOT EXISTS square_connections_merchant_uniq ON square_connections (merchant_id) WHERE merchant_id IS NOT NULL`; } catch (e) { out.errors.push('index: ' + (e && e.message)); }
    try { const idx = await q`SELECT 1 FROM pg_indexes WHERE indexname = 'square_connections_merchant_uniq'`; out.dbLock = !!(idx && idx.length); } catch (e) {}
  } catch (e) { out.errors.push('enforce: ' + (e && e.message)); }
  return out;
}

// Identify the requesting provider from their SlickChart session (Bearer token).
export function providerFromReq(req) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && tok ? verifyToken(tok, secret) : null;
  return payload && payload.u ? payload.u : null;
}

// One call for data endpoints: returns { token, locationId, providerId } for the caller, or writes an
// error and returns null. There is EXACTLY ONE token source: the authenticated provider's OWN Square
// OAuth connection. There is NO shared/deployment-wide fallback of any kind — the shared
// SQUARE_ACCESS_TOKEN + APP_SHARED_SECRET path that caused the cross-account leak has been removed
// entirely, so no request can ever operate on a Square account that isn't the caller's own.
export async function sqContext(req, res) {
  const providerId = providerFromReq(req);
  if (!providerId) {
    res.status(401).json({ error: 'Please sign in to use Square.', code: 'nosquare' });
    return null;
  }
  try {
    const conn = await getConnection(providerId);
    if (conn && conn.token) {
      try { const q = sql(); q`UPDATE square_connections SET last_used_at=now() WHERE provider_id=${providerId} AND (last_used_at IS NULL OR last_used_at < now() - interval '1 hour')`.catch(() => {}); } catch (e) {}
      return { token: conn.token, locationId: conn.locationId, providerId };
    }
  } catch (e) { /* fall through to nosquare */ }
  // This account has no Square connected. Never fall back to any shared token — the provider must connect
  // their OWN Square, so one account can never touch another's Square directory.
  res.status(401).json({ error: 'Connect your own Square account to sync your customers.', code: 'nosquare' });
  return null;
}
