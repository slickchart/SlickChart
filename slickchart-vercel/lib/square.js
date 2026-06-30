// Shared Square helpers.
// This file lives OUTSIDE /api on purpose, so Vercel does NOT treat it as an
// endpoint. The functions in /api import from here.
//
// Nothing secret is hard-coded. Everything sensitive comes from environment
// variables you set in Vercel (Project → Settings → Environment Variables).

export function squareConfig() {
  const env = (process.env.SQUARE_ENV || 'sandbox').toLowerCase();
  const base = env === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
  return {
    env,
    base,
    token: process.env.SQUARE_ACCESS_TOKEN || '',
    // Optional: pin a Square API version. If unset, Square uses the default
    // version tied to your application, which avoids version-mismatch errors.
    version: process.env.SQUARE_VERSION || '',
    locationId: process.env.SQUARE_LOCATION_ID || ''
  };
}

// Gate every data endpoint behind a shared access key so the URL isn't wide open.
// The key is compared against APP_SHARED_SECRET (set in Vercel). The SlickChart
// app sends it in the "x-slickchart-key" header (you type it in once).
export function requireAuth(req, res) {
  const expected = process.env.APP_SHARED_SECRET || '';
  const got = req.headers['x-slickchart-key'] || '';
  if (!expected) {
    res.status(500).json({ error: 'Server is missing APP_SHARED_SECRET. Set it in your Vercel environment variables.' });
    return false;
  }
  if (got !== expected) {
    res.status(401).json({ error: 'Unauthorized — wrong or missing access key.' });
    return false;
  }
  return true;
}

// Core helper: makes an authenticated call to Square and returns parsed JSON.
// Throws an Error (with .status) on failure so callers can surface a clean message.
export async function squareFetch(path, { method = 'GET', body } = {}) {
  const cfg = squareConfig();
  if (!cfg.token) {
    const err = new Error('Square access token not configured. Set SQUARE_ACCESS_TOKEN in Vercel.');
    err.status = 500;
    throw err;
  }
  const headers = {
    'Authorization': `Bearer ${cfg.token}`,
    'Content-Type': 'application/json'
  };
  if (cfg.version) headers['Square-Version'] = cfg.version;

  const resp = await fetch(cfg.base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await resp.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!resp.ok) {
    const detail = data && data.errors && data.errors[0] && data.errors[0].detail;
    const err = new Error(detail || `Square API error (${resp.status})`);
    err.status = resp.status;
    err.squareErrors = data.errors;
    throw err;
  }
  return data;
}

// Returns a usable location id: the pinned one (SQUARE_LOCATION_ID) if set,
// otherwise the first ACTIVE location on the account.
export async function resolveLocationId() {
  const cfg = squareConfig();
  if (cfg.locationId) return cfg.locationId;
  const data = await squareFetch('/v2/locations');
  const all = data.locations || [];
  const active = all.filter(l => l.status === 'ACTIVE');
  const pick = active[0] || all[0];
  return pick ? pick.id : null;
}
