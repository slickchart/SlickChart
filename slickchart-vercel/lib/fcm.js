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
import { sendApns, apnsConfigured } from './apns.js';
import { pushConfigured as webPushConfigured, sendPush } from './push.js';
import { listProviderPushSubs, deleteProviderPushSubById } from './provider-push.js';

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
// Is ANY native transport usable? Android goes through FCM, iOS straight to Apple, and either can be
// configured without the other. Callers that gate on "can we push natively at all" want this, not
// fcmConfigured(). Named for the transport because lib/push.js exports a pushConfigured() of its own
// for WEB push, and several files import both.
export function nativePushConfigured() { return !!serviceAccount() || apnsConfigured(); }

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
export async function sendFcm(token, payload, opts) {
  const sa = serviceAccount();
  if (!sa) return { ok: false, skipped: true };
  if (!token) return { ok: false, error: 'no token' };
  // An APNs token can never be delivered through FCM. Reaching here means APNs isn't configured
  // (sendToOwner routes iOS tokens to lib/apns.js when it is). Never mark it `gone` — it's a real,
  // live device token, and deleting it would destroy the registration over a missing env var.
  if (tokenShape(token) === 'apns') {
    console.error('[fcm] iOS token with no APNs credentials configured — set APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID');
    return { ok: false, error: 'apns-not-configured' };
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
      body: JSON.stringify(opts && opts.validateOnly ? { validate_only: true, message } : { message })
    });
    if (r.ok) return { ok: true };
    const t = await r.text().catch(() => '');
    // 404 UNREGISTERED, or 400 with a token-specific complaint, => the token is dead. We DON'T
    // treat a generic 400 as dead (that could be our own bad message shape) to avoid nuking good
    // tokens over a code bug.
    if (r.status === 404 || (r.status === 400 && /UNREGISTERED|registration token|not a valid FCM|InvalidRegistration/i.test(t))) {
      return { ok: false, gone: true, error: 'Google rejected this device address (' + r.status + ' ' + (t.match(/"status":\s*"([A-Z_]+)"/) || [])[1] + ': ' + ((t.match(/"message":\s*"([^"]{0,160})/) || [])[1] || '') + ')' };
    }
    console.error('[fcm] send failed', r.status, t.slice(0, 300));
    return { ok: false, error: 'send ' + r.status };
  } catch (e) { return { ok: false, error: (e && e.message) || 'send failed' }; }
}

// Ask Google whether a device address is deliverable WITHOUT showing anything on the device
// (validate_only). Used the moment a phone links, so an address Google refuses is caught there and
// the phone can fetch a fresh one by itself, instead of the founder finding out from a missed alert.
export async function validateFcmToken(token) {
  if (!serviceAccount() || tokenShape(token) !== 'fcm') return { ok: true, skipped: true };
  return sendFcm(token, { title: 'SlickChart' }, { validateOnly: true });
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
  if (!nativePushConfigured() || !ownerId) return { ...empty, error: !ownerId ? 'no owner' : 'no push transport configured' };
  let rows;
  try {
    const q = sql();
    rows = await q`SELECT token, platform, updated_at FROM native_push_tokens WHERE owner_kind=${ownerKind} AND owner_id=${String(ownerId)}`;
  } catch (e) { return { ...empty, error: 'db' }; }
  let sent = 0;
  const results = [];
  for (const row of (rows || [])) {
    // Pick the transport from the token itself rather than the stored platform string: the shape is
    // what actually decides which service can deliver it, and it can't drift the way a label can.
    const shape = tokenShape(row.token);
    const r = shape === 'apns' ? await sendApns(row.token, payload) : await sendFcm(row.token, payload);
    if (r.ok) sent++;
    else if (r.gone) { try { const q = sql(); await q`DELETE FROM native_push_tokens WHERE token=${row.token}`; } catch (e) {} }
    results.push({ platform: row.platform || '', shape, ok: !!r.ok, gone: !!r.gone, error: r.error || '', updatedAt: Number(row.updated_at) || 0 });
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
//
// It reaches BOTH kinds of device her account has: the iPhone/Android app (native_push_tokens) and
// any browser or home-screen app where she turned notifications on (provider_push_subscriptions).
// Her follow-up reminders already went to both; the founder alerts used to reach only the native
// app, so a phone that gets her reminders could still stay silent for a paid signup (2026-10-20).
// Every id here comes from FOUNDER_EMAILS, never from a request, so nothing reaches another account.
// Founder ACCOUNTS seen by verified session, not only by providers.email. The email lookup misses
// the account her phone is actually signed in to whenever that row's stored email differs from the
// founder address (an account email changed later, a second account, a re-signup): form alerts,
// which go to the signed-in account's own id, kept reaching her phone while every founder alert went
// to one stale device under the email-matched row (2026-10-21). /api/admin/signups records the
// session's provider id here, and only after its verified token email passed the FOUNDER_EMAILS
// gate, so nothing a request says can add an account to this list.
let _faReady = false;
async function ensureFounderAccounts(q) {
  if (_faReady) return;
  await q`CREATE TABLE IF NOT EXISTS founder_accounts (provider_id text PRIMARY KEY, email text, seen_at timestamptz NOT NULL DEFAULT now())`;
  _faReady = true;
}
export async function rememberFounderAccount(providerId, email) {
  if (!providerId) return;
  try {
    const q = sql();
    await ensureFounderAccounts(q);
    await q`INSERT INTO founder_accounts (provider_id, email, seen_at) VALUES (${String(providerId)}, ${String(email || '').toLowerCase()}, now())
      ON CONFLICT (provider_id) DO UPDATE SET email = EXCLUDED.email, seen_at = now()`;
  } catch (e) {}
}
async function seenFounderAccounts(emails) {
  try {
    const q = sql();
    await ensureFounderAccounts(q);
    const rows = await q`SELECT provider_id FROM founder_accounts WHERE email = ANY(${emails}::text[]) AND seen_at > now() - interval '120 days'`;
    return (rows || []).map(r => String(r.provider_id));
  } catch (e) { return []; }
}

// The founder's accounts, resolved ONE way for everything that alerts her or reports on it: provider
// rows whose email is a founder email, plus accounts a verified founder session was seen in (120 days).
// Every input is the environment, never a request.
export function founderEmails() {
  return String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || process.env.FOUNDER_NOTIFY_EMAIL || 'botanicalaestheticsbyashley@gmail.com')
    .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
}
export async function founderAccounts() {
  const out = { emails: founderEmails(), byEmail: [], bySession: [] };
  for (const fe of out.emails) {
    try {
      const q = sql();
      const provs = await q`SELECT id FROM providers WHERE lower(email) = ${fe}`;
      for (const pr of (provs || [])) if (!out.byEmail.includes(String(pr.id))) out.byEmail.push(String(pr.id));
    } catch (e) { out.error = 'db'; }
  }
  if (out.emails.length) for (const id of await seenFounderAccounts(out.emails)) if (!out.byEmail.includes(id) && !out.bySession.includes(id)) out.bySession.push(id);
  return out;
}

export function founderPushConfigured() { return nativePushConfigured() || webPushConfigured(); }

export async function pushFoundersReport(payload) {
  const out = { sent: 0, devices: 0, emails: [], providerIds: [], results: [], webDevices: 0, webSent: 0 };
  const nativeOn = nativePushConfigured(), webOn = webPushConfigured();
  if (!nativeOn && !webOn) { out.error = 'no push transport configured'; return out; }
  const fa = await founderAccounts();
  out.emails = fa.emails;
  if (!out.emails.length) { out.error = 'no founder email configured'; return out; }
  // Resolve every founder provider id first, then send to all of their PHONES before any browser.
  // A browser endpoint is the slow, flaky transport (a dead one can sit until the function times
  // out); the phone app is the one she relies on, so it must never wait behind a browser send or
  // behind another founder record's devices (2026-10-21).
  if (fa.error) out.error = fa.error;
  out.providerIds = fa.byEmail.concat(fa.bySession);
  if (nativeOn) {
    for (const pid of out.providerIds) {
      try {
        const r = await pushReport('provider', pid, payload);
        out.sent += r.sent || 0;
        out.devices += r.devices || 0;
        for (const one of (r.results || [])) out.results.push(one);
      } catch (e) {}
    }
  }
  if (webOn) {
    const sends = [];
    for (const pid of out.providerIds) {
      let subs = [];
      try { subs = await listProviderPushSubs(pid); } catch (e) {}
      for (const row of subs) {
        out.devices++; out.webDevices++;
        sends.push(sendPush(row.sub, payload, { timeout: 4000 }).then(async r => {
          if (r.ok) { out.sent++; out.webSent++; }
          else if (r.gone) { try { await deleteProviderPushSubById(row.id); } catch (e) {} }
          out.results.push({ platform: 'web', shape: 'web', ok: !!r.ok, gone: !!r.gone, error: r.error || '' });
        }).catch(() => {}));
      }
    }
    await Promise.all(sends);
  }
  // One line naming every device that did NOT take the alert, for notify_log: a phone Google rejects
  // is deleted right after, so this line is the only trace it was ever there.
  out.failedLine = out.results.filter(x => !x.ok).map(x => (x.platform || x.shape || 'device') + ': ' + (x.error || 'failed')).join('; ');
  return out;
}

export async function pushFounders(payload) {
  const r = await pushFoundersReport(payload);
  return r.sent;
}

// Push to a client's native app(s) (their phone). owner_kind 'client', keyed by client id.
export function sendNativeToClient(clientId, payload) { return sendToOwner('client', clientId, payload); }
// Push to a provider's native app(s). owner_kind 'provider', keyed by provider id.
export function sendNativeToProvider(providerId, payload) { return sendToOwner('provider', providerId, payload); }
