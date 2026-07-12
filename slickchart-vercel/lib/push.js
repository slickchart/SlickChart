// Web Push (VAPID) sender. Keys live in env vars (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY);
// if they're not set this module is a safe no-op, so the rest of the app keeps working
// with push simply disabled. The public key is also embedded in the client app — the two
// MUST match, or the browser's push service will reject every send.
import webpush from 'web-push';

let _state = null; // null = unchecked, true = configured, false = not configured
function ensure() {
  if (_state !== null) return _state;
  const pub = process.env.VAPID_PUBLIC_KEY || '';
  const priv = process.env.VAPID_PRIVATE_KEY || '';
  // A mailto: (or https:) subject is required by the Web Push spec so push services can
  // contact the sender. Overridable via env; harmless default otherwise.
  const subject = process.env.VAPID_SUBJECT || 'mailto:hello@slickchart.app';
  if (pub && priv) {
    try { webpush.setVapidDetails(subject, pub, priv); _state = true; }
    catch (e) { console.error('[push] bad VAPID config:', e && e.message); _state = false; }
  } else {
    _state = false;
  }
  return _state;
}

export function pushConfigured() { return ensure(); }

// A push subscription is client-supplied JSON, and we later POST to its `endpoint`. Without a
// guard, a client could set `endpoint` to an internal URL (e.g. the cloud metadata IP) and turn
// that send into a blind SSRF. Real browser push services are always https to a public host, so
// require https and reject loopback / private / link-local / internal hosts. Applied both when a
// subscription is stored (api/push-subscribe) and again before every send (below), so any bad
// endpoint stored before this guard existed still never gets hit.
const _INTERNAL_HOST = /(^|\.)(localhost|internal|local)$/i;
export function validPushEndpoint(endpoint) {
  let u;
  try { u = new URL(String(endpoint || '')); } catch (_) { return false; }
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'metadata.google.internal' || _INTERNAL_HOST.test(h)) return false;
  // IPv6 loopback (::1), unique-local (fc00::/7), link-local (fe80::/10).
  if (h === '::1' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return false;
  // IPv4 literal → block private / loopback / link-local / reserved ranges.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  return true;
}

// Send one notification to one subscription. Never throws — returns a small result the
// caller can act on. `gone:true` means the subscription is dead (the browser unsubscribed
// or the endpoint expired) and should be deleted so we stop trying it.
export async function sendPush(subscription, payload) {
  if (!ensure()) return { ok: false, skipped: true };
  if (!subscription || !subscription.endpoint) return { ok: false, error: 'bad subscription' };
  if (!validPushEndpoint(subscription.endpoint)) return { ok: false, error: 'blocked endpoint' };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload || {}), { TTL: 3600 });
    return { ok: true };
  } catch (e) {
    const code = e && e.statusCode;
    if (code === 404 || code === 410) return { ok: false, gone: true };
    return { ok: false, error: (e && e.message) || 'send failed', code };
  }
}

// Send the same notification to all of a client's devices, deleting any that are gone.
// `subs` is an array of { id, sub } rows; `del(id)` removes one. Returns how many landed.
export async function sendPushToAll(subs, payload, del) {
  if (!ensure() || !Array.isArray(subs) || !subs.length) return 0;
  let sent = 0;
  for (const row of subs) {
    const r = await sendPush(row.sub, payload);
    if (r.ok) sent++;
    else if (r.gone && typeof del === 'function') { try { await del(row.id); } catch (e) {} }
  }
  return sent;
}
