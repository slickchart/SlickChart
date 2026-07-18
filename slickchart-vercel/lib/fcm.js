// Native push via Firebase Cloud Messaging (FCM) HTTP v1.
//
// Reads FIREBASE_SERVICE_ACCOUNT (the service-account JSON, raw or base64) from the environment
// and mints its own short-lived OAuth token by signing a JWT with the account's private key — so
// there's NO firebase-admin dependency to bundle. Sends to the device tokens that the Capacitor
// apps register through /api/native-push (table native_push_tokens).
//
// If FIREBASE_SERVICE_ACCOUNT isn't set (or is malformed) every function here is a safe no-op,
// so the rest of the app keeps working with native push simply disabled — exactly like lib/push.js
// does for web push.
import crypto from 'crypto';
import { sql } from './db.js';

let _sa = undefined; // undefined = unchecked, object = parsed, null = unusable
function serviceAccount() {
  if (_sa !== undefined) return _sa;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) { _sa = null; return _sa; }
  try {
    // Accept either raw JSON or base64-encoded JSON (some hosts mangle multiline secrets).
    const txt = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const j = JSON.parse(txt);
    if (j && j.client_email && j.private_key && j.project_id) {
      // A pasted key often has literal "\n" sequences instead of real newlines — normalize so
      // the PEM parses.
      j.private_key = String(j.private_key).replace(/\\n/g, '\n');
      _sa = j;
    } else {
      console.error('[fcm] FIREBASE_SERVICE_ACCOUNT missing client_email/private_key/project_id');
      _sa = null;
    }
  } catch (e) {
    console.error('[fcm] bad FIREBASE_SERVICE_ACCOUNT:', e && e.message);
    _sa = null;
  }
  return _sa;
}

export function fcmConfigured() { return !!serviceAccount(); }

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let _tok = null; // { access_token, exp } — cached across invocations within a warm instance
async function accessToken() {
  const sa = serviceAccount();
  if (!sa) return null;
  const now = Math.floor(Date.now() / 1000);
  if (_tok && _tok.exp - 60 > now) return _tok.access_token;
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  let jwt;
  try {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(header + '.' + claims);
    jwt = header + '.' + claims + '.' + b64url(signer.sign(sa.private_key));
  } catch (e) { console.error('[fcm] JWT sign failed:', e && e.message); return null; }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); console.error('[fcm] token exchange failed', r.status, t.slice(0, 300)); return null; }
    const j = await r.json();
    if (!j || !j.access_token) return null;
    _tok = { access_token: j.access_token, exp: now + (Number(j.expires_in) || 3600) };
    return _tok.access_token;
  } catch (e) { console.error('[fcm] token exchange error:', e && e.message); return null; }
}

// Send one notification to one device token. Never throws — returns a small result the caller
// can act on. `gone:true` means the token is dead (app uninstalled / token rotated) and should be
// deleted so we stop trying it.
export async function sendFcm(token, payload) {
  const sa = serviceAccount();
  if (!sa) return { ok: false, skipped: true };
  if (!token) return { ok: false, error: 'no token' };
  const at = await accessToken();
  if (!at) return { ok: false, error: 'no access token' };
  const title = String((payload && payload.title) || 'SlickChart');
  const bodyTxt = String((payload && payload.body) || '');
  // FCM data values must be strings.
  const data = {};
  if (payload && payload.url) data.url = String(payload.url);
  if (payload && payload.tag) data.tag = String(payload.tag);
  const message = {
    token,
    notification: { title, body: bodyTxt },
    data,
    android: { priority: 'high', notification: { sound: 'default' } },
    apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } }
  };
  try {
    const r = await fetch('https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + at, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    if (r.ok) return { ok: true };
    const t = await r.text().catch(() => '');
    // 404 UNREGISTERED, or 400 with a token-specific complaint, => the token is dead. We DON'T
    // treat a generic 400 as dead (that could be our own bad message shape) to avoid nuking good
    // tokens over a code bug.
    if (r.status === 404 || (r.status === 400 && /UNREGISTERED|registration token|not a valid FCM|InvalidRegistration/i.test(t))) {
      return { ok: false, gone: true };
    }
    console.error('[fcm] send failed', r.status, t.slice(0, 300));
    return { ok: false, error: 'send ' + r.status };
  } catch (e) { return { ok: false, error: (e && e.message) || 'send failed' }; }
}

// Look up one subject's device tokens and push to all of them, pruning any that come back dead.
// Returns how many landed. Best-effort and self-contained: a DB hiccup just yields 0.
async function sendToOwner(ownerKind, ownerId, payload) {
  if (!serviceAccount() || !ownerId) return 0;
  let rows;
  try {
    const q = sql();
    rows = await q`SELECT token FROM native_push_tokens WHERE owner_kind=${ownerKind} AND owner_id=${String(ownerId)}`;
  } catch (e) { return 0; }
  let sent = 0;
  for (const row of (rows || [])) {
    const r = await sendFcm(row.token, payload);
    if (r.ok) sent++;
    else if (r.gone) { try { const q = sql(); await q`DELETE FROM native_push_tokens WHERE token=${row.token}`; } catch (e) {} }
  }
  return sent;
}

// Push to a client's native app(s) (their phone). owner_kind 'client', keyed by client id.
export function sendNativeToClient(clientId, payload) { return sendToOwner('client', clientId, payload); }
// Push to a provider's native app(s). owner_kind 'provider', keyed by provider id.
export function sendNativeToProvider(providerId, payload) { return sendToOwner('provider', providerId, payload); }
