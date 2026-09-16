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

// What KIND of device token is this?
//
// This matters because the two native apps hand back different things. Android's Capacitor push
// plugin is backed by Firebase (google-services.json + the gradle plugin), so it returns a real FCM
// registration token — those always contain a colon ("cXXX:APA91b..."). iOS has NO Firebase SDK in
// the project (no FirebaseApp.configure(), nothing in Package.swift — the GoogleService-Info.plist
// sits there unread), so the plugin returns the raw APNs device token: pure hex, no colon.
//
// FCM rejects an APNs token with "not a valid FCM registration token", which used to look exactly
// like a dead token and got the row DELETED — so an iPhone would register, lose its token on the
// first send, and then silently reach zero devices forever, with the reason never surfacing
// anywhere. Naming the shape is what makes that diagnosable instead of mysterious.
export function tokenShape(t) {
  const v = String(t || '');
  if (!v) return 'empty';
  if (v.includes(':')) return 'fcm';
  if (/^[0-9a-f]+$/i.test(v) && v.length >= 64) return 'apns';
  return 'unknown';
}

// Send one notification to one device token. Never throws — returns a small result the caller
// can act on. `gone:true` means the token is dead (app uninstalled / token rotated) and should be
// deleted so we stop trying it.
export async function sendFcm(token, payload) {
  const sa = serviceAccount();
  if (!sa) return { ok: false, skipped: true };
  if (!token) return { ok: false, error: 'no token' };
  // An APNs token can never be delivered through FCM. Fail it here rather than round-tripping to
  // Google for a 400, and crucially do NOT mark it `gone` — it's a real, live device token, and
  // deleting it destroys the only evidence of what's wrong.
  if (tokenShape(token) === 'apns') {
    console.error('[fcm] refusing to send an APNs device token through FCM — the iOS app has no Firebase SDK, so this token can only be delivered via APNs directly');
    return { ok: false, error: 'apns-token-no-firebase' };
  }
  const at = await accessToken();
  if (!at) return { ok: false, error: 'no access token' };
  const title = String((payload && payload.title) || 'SlickChart');
  const bodyTxt = String((payload && payload.body) || '');
  // FCM data values must be strings. `url` drives web-push navigation; kind/clientId/itemId let the
  // app open the exact item the notification is about (deep link) when tapped natively.
  const data = {};
  if (payload && payload.url) data.url = String(payload.url);
  if (payload && payload.tag) data.tag = String(payload.tag);
  if (payload && payload.kind) data.kind = String(payload.kind);
  if (payload && payload.clientId) data.clientId = String(payload.clientId);
  if (payload && payload.itemId) data.itemId = String(payload.itemId);
  if (payload && payload.screen) data.screen = String(payload.screen);
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
// Returns { sent, devices, results:[{platform, shape, ok, error}] } so a diagnostic caller can say
// WHY nothing landed. Best-effort and self-contained: a DB hiccup just yields zeros.
//
// Every ordinary caller uses sendToOwner() below and gets the plain count it always got; this
// exists because a bare "0 devices reached" is indistinguishable between "no phone registered",
// "credentials missing" and "this token can't go through FCM at all", and that ambiguity is what
// made a broken iPhone push take days to pin down.
export async function pushReport(ownerKind, ownerId, payload) {
  const empty = { sent: 0, devices: 0, results: [] };
  if (!serviceAccount() || !ownerId) return { ...empty, error: !ownerId ? 'no owner' : 'fcm not configured' };
  let rows;
  try {
    const q = sql();
    rows = await q`SELECT token, platform FROM native_push_tokens WHERE owner_kind=${ownerKind} AND owner_id=${String(ownerId)}`;
  } catch (e) { return { ...empty, error: 'db' }; }
  let sent = 0;
  const results = [];
  for (const row of (rows || [])) {
    const r = await sendFcm(row.token, payload);
    const shape = tokenShape(row.token);
    if (r.ok) sent++;
    else if (r.gone) { try { const q = sql(); await q`DELETE FROM native_push_tokens WHERE token=${row.token}`; } catch (e) {} }
    results.push({ platform: row.platform || '', shape, ok: !!r.ok, gone: !!r.gone, error: r.error || '' });
  }
  return { sent, devices: (rows || []).length, results };
}

async function sendToOwner(ownerKind, ownerId, payload) {
  const r = await pushReport(ownerKind, ownerId, payload);
  return r.sent;
}

// Push to every device belonging to the founder account(s), resolved from FOUNDER_EMAILS.
//
// Several places announce something to Ashley's phone (a new provider signup, a Build roadmap sale,
// a free-starter signup) and each had grown its own copy of this same lookup. Returns how many
// devices were reached. Best-effort: never throws, and a missing config just yields 0.
export async function pushFounders(payload) {
  if (!serviceAccount()) return 0;
  const emails = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || process.env.FOUNDER_NOTIFY_EMAIL || 'botanicalaestheticsbyashley@gmail.com')
    .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!emails.length) return 0;
  let pushed = 0;
  for (const fe of emails) {
    try {
      const q = sql();
      const provs = await q`SELECT id FROM providers WHERE lower(email) = ${fe}`;
      for (const pr of (provs || [])) { try { pushed += (await sendToOwner('provider', pr.id, payload)) || 0; } catch (e) {} }
    } catch (e) {}
  }
  return pushed;
}

// Push to a client's native app(s) (their phone). owner_kind 'client', keyed by client id.
export function sendNativeToClient(clientId, payload) { return sendToOwner('client', clientId, payload); }
// Push to a provider's native app(s). owner_kind 'provider', keyed by provider id.
export function sendNativeToProvider(providerId, payload) { return sendToOwner('provider', providerId, payload); }
