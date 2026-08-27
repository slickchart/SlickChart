// POST /api/admin/test-push — FOUNDER-ONLY. Sends a test push to the caller's OWN provider devices
// and reports how many are registered, so the founder can confirm their phone will actually receive
// the "new paid provider" pushes (these go to the native app on the phone, not the desktop web app).
import { dbEnabled, sql } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { sendNativeToProvider, fcmConfigured } from '../../lib/fcm.js';

function norm(s) { return String(s || '').trim().toLowerCase(); }

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(500).json({ error: 'No database configured.' }); return; }
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && tok ? verifyToken(tok, secret) : null;
  if (!payload || !payload.u) { res.status(401).json({ error: 'Not logged in.' }); return; }
  try { if (payload.sid && !(await isSessionValid(sql(), payload.sid))) { res.status(401).json({ error: 'Session expired.' }); return; } } catch (e) {}
  const email = norm(payload.e);
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '')
    .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!email || !founders.includes(email)) { res.status(403).json({ error: 'Owner-only.', code: 'notowner' }); return; }

  try {
    const q = sql();
    // How many of THIS founder's phones are registered for native push right now.
    let devices = 0;
    try { const r = await q`SELECT count(*)::int AS n FROM native_push_tokens WHERE owner_kind = 'provider' AND owner_id = ${payload.u}`; devices = (r[0] && r[0].n) || 0; } catch (e) {}

    if (!fcmConfigured()) {
      res.status(200).json({ ok: true, fcm: false, devices, sent: 0, message: 'Push notifications aren’t configured on the server yet (FCM). That’s a one-time server setup — tell Claude and it’ll walk you through it.' });
      return;
    }
    let sent = 0;
    try { sent = await sendNativeToProvider(payload.u, { title: '✅ Test push', body: 'Your SlickChart push notifications are working 🎉', url: '/slickchart', tag: 'test-push', renotify: true }); } catch (e) {}

    let message;
    if (devices === 0) message = 'No phone is registered yet. Install the SlickChart app on your PHONE (App Store / Play), log in, and allow notifications when it asks — then try this again.';
    else if (sent > 0) message = 'Sent to ' + sent + ' of your device' + (devices === 1 ? '' : 's') + ' — you should see it on your phone in a few seconds. If you do, your paid-signup pushes will work too. 🎉';
    else message = devices + ' device' + (devices === 1 ? '' : 's') + ' registered, but the push didn’t go through (the token may be stale). Re-open the app on your phone with notifications on, then try again.';
    res.status(200).json({ ok: true, fcm: true, devices, sent, message });
  } catch (e) {
    console.error('[admin/test-push] failed:', e && e.message || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
