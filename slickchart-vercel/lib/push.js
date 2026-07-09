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

// Send one notification to one subscription. Never throws — returns a small result the
// caller can act on. `gone:true` means the subscription is dead (the browser unsubscribed
// or the endpoint expired) and should be deleted so we stop trying it.
export async function sendPush(subscription, payload) {
  if (!ensure()) return { ok: false, skipped: true };
  if (!subscription || !subscription.endpoint) return { ok: false, error: 'bad subscription' };
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
