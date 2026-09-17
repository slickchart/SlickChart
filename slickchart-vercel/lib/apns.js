// Native push to iOS devices, sent straight to Apple.
//
// Why this exists rather than going through Firebase like Android does: the iOS app has no Firebase
// SDK in it (stock AppDelegate, nothing in Package.swift), so @capacitor/push-notifications hands
// back a raw APNs device token. FCM cannot deliver to one of those. Adding Firebase to the iOS
// target would mean a native rebuild and an App Store resubmit; talking to Apple directly is a
// server-side change only, and the tokens already sitting in native_push_tokens are exactly the
// kind Apple wants. Nothing on anyone's phone has to change.
//
// Config (Vercel env). Unset = every function here is a safe no-op, same as lib/fcm.js:
//   APNS_KEY_P8     the .p8 auth key, raw PEM or base64. The same key uploaded to Firebase works.
//   APNS_KEY_ID     the 10-character Key ID Apple shows next to the key
//   APNS_TEAM_ID    the 10-character Team ID from the developer account
//   APNS_BUNDLE_ID  defaults to com.slickchart.app
//   APNS_ENV        'sandbox' to hit Apple's sandbox host; anything else = production
//
// A note on hosts, because this is the classic way to lose an afternoon: a build installed from the
// App Store or TestFlight is PRODUCTION, and a build run from Xcode onto your own phone is SANDBOX.
// The same device token is not valid on both. A token registered by a debug build gets BadDeviceToken
// from the production host, which reads exactly like a dead token.
import crypto from 'crypto';
import http2 from 'http2';

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

let _key = undefined;   // undefined = unchecked, object = usable, null = not configured/broken
function apnsKey() {
  if (_key !== undefined) return _key;
  const raw = String(process.env.APNS_KEY_P8 || '').trim();
  const kid = String(process.env.APNS_KEY_ID || '').trim();
  const team = String(process.env.APNS_TEAM_ID || '').trim();
  if (!raw || !kid || !team) { _key = null; return _key; }
  try {
    // Accept the PEM pasted directly (with real or literal \n) or base64-wrapped, because hosts
    // mangle multiline secrets in different ways and both forms turn up in practice.
    const pem = raw.includes('BEGIN') ? raw.replace(/\\n/g, '\n') : Buffer.from(raw, 'base64').toString('utf8');
    const keyObject = crypto.createPrivateKey(pem);
    _key = {
      keyObject, kid, team,
      bundle: String(process.env.APNS_BUNDLE_ID || 'com.slickchart.app').trim(),
      host: /sandbox/i.test(String(process.env.APNS_ENV || '')) ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
    };
  } catch (e) {
    console.error('[apns] APNS_KEY_P8 could not be read as a private key:', e && e.message);
    _key = null;
  }
  return _key;
}

export function apnsConfigured() { return !!apnsKey(); }
/** For diagnostics: which host and bundle we'd send to, without exposing the key. */
export function apnsTarget() { const k = apnsKey(); return k ? { host: k.host, bundle: k.bundle, keyId: k.kid } : null; }

// Apple wants a JWT signed ES256. It stays valid an hour, and Apple rejects a provider that mints
// them too often (TooManyProviderTokenUpdates), so it's cached and reused for 50 minutes.
let _jwt = null;
function providerToken() {
  const k = apnsKey();
  if (!k) return null;
  const now = Math.floor(Date.now() / 1000);
  if (_jwt && (now - _jwt.iat) < 3000) return _jwt.token;
  try {
    const signingInput = b64url(JSON.stringify({ alg: 'ES256', kid: k.kid })) + '.' + b64url(JSON.stringify({ iss: k.team, iat: now }));
    // JWS needs the raw r||s pair, not the DER sequence Node produces by default.
    const sig = crypto.sign('sha256', Buffer.from(signingInput), { key: k.keyObject, dsaEncoding: 'ieee-p1363' });
    _jwt = { token: signingInput + '.' + b64url(sig), iat: now };
    return _jwt.token;
  } catch (e) { console.error('[apns] could not sign the provider token:', e && e.message); return null; }
}

const TIMEOUT_MS = 8000;

/**
 * Send one notification to one iOS device token.
 * Mirrors sendFcm's contract exactly so the caller doesn't care which transport ran:
 * { ok } on success, { gone:true } when the token is dead and should be pruned, { error } otherwise.
 * Never throws.
 */
export function sendApns(deviceToken, payload) {
  const k = apnsKey();
  if (!k) return Promise.resolve({ ok: false, skipped: true, error: 'apns-not-configured' });
  if (!deviceToken) return Promise.resolve({ ok: false, error: 'no token' });
  const jwt = providerToken();
  if (!jwt) return Promise.resolve({ ok: false, error: 'apns-token-signing-failed' });

  const aps = {
    alert: { title: String((payload && payload.title) || 'SlickChart'), body: String((payload && payload.body) || '') },
    sound: 'default'
  };
  // Same extra keys FCM carries, so a tapped notification deep-links identically on both platforms.
  const extra = {};
  for (const key of ['url', 'tag', 'kind', 'clientId', 'itemId', 'screen']) {
    if (payload && payload[key]) extra[key] = String(payload[key]);
  }
  const body = JSON.stringify({ aps, ...extra });

  return new Promise(resolve => {
    let settled = false;
    const finish = r => { if (!settled) { settled = true; resolve(r); } };
    let client;
    try {
      // HTTP/2 is not optional here: APNs speaks nothing else, which is also why this can't use
      // fetch() — undici is HTTP/1.1 only.
      client = http2.connect('https://' + k.host);
    } catch (e) { return finish({ ok: false, error: 'apns connect: ' + ((e && e.message) || '') }); }

    const shutdown = () => { try { client.close(); } catch (e) { try { client.destroy(); } catch (e2) {} } };
    client.on('error', e => { finish({ ok: false, error: 'apns socket: ' + ((e && e.message) || '') }); try { client.destroy(); } catch (e2) {} });

    let req;
    try {
      req = client.request({
        ':method': 'POST',
        ':path': '/3/device/' + deviceToken,
        'authorization': 'bearer ' + jwt,
        'apns-topic': k.bundle,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json'
      });
    } catch (e) { shutdown(); return finish({ ok: false, error: 'apns request: ' + ((e && e.message) || '') }); }

    let status = 0, raw = '';
    req.setEncoding('utf8');
    req.on('response', h => { status = Number(h[':status']) || 0; });
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      shutdown();
      if (status === 200) return finish({ ok: true });
      let reason = '';
      try { reason = (JSON.parse(raw || '{}') || {}).reason || ''; } catch (e) {}
      // 410 Unregistered = the app was deleted. BadDeviceToken = this token is not valid for this
      // topic/environment. Both mean stop trying it. Everything else stays, including 403, which is
      // a credentials problem on our side and must never cost someone their registration.
      if (status === 410 || reason === 'Unregistered' || reason === 'BadDeviceToken') {
        return finish({ ok: false, gone: true, error: reason || ('apns ' + status) });
      }
      if (reason) console.error('[apns] send failed', status, reason);
      finish({ ok: false, error: reason || ('apns ' + status) });
    });
    req.on('error', e => { shutdown(); finish({ ok: false, error: 'apns stream: ' + ((e && e.message) || '') }); });
    req.setTimeout(TIMEOUT_MS, () => { try { req.close(); } catch (e) {} shutdown(); finish({ ok: false, error: 'apns timeout' }); });

    req.end(body);
  });
}
