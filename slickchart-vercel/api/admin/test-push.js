// POST /api/admin/test-push — FOUNDER-ONLY. Sends a test push to the founder's phone and reports what
// it found, so the founder can confirm their phone will actually receive the "new paid provider" pushes.
//
// IMPORTANT: this must target the SAME devices the real paid-signup push does. The Stripe webhook pushes
// to EVERY provider row whose email is a founder email (FOUNDER_EMAILS) — not just the caller's current
// session id. If the founder has more than one provider record for their email (a re-signup left a
// duplicate), their phone's push token can be registered under a DIFFERENT provider id than the session
// they're tapping this from. Client message/form pushes still land (those target the client's
// provider_id), but a test aimed only at the session id would miss the phone and read as "broken" when
// the real push actually works. So we union the session id with every email-matched provider id, and
// report both counts so a mismatch is visible instead of mysterious.
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

    // Every provider id that shares the founder's email (there can be more than one), unioned with the
    // id from the current session — this is the exact device set the real paid-signup push reaches.
    const idSet = new Set([String(payload.u)]);
    try { const rows = await q`SELECT id FROM providers WHERE lower(email) = ${email}`; for (const r of (rows || [])) idSet.add(String(r.id)); } catch (e) {}
    const providerIds = Array.from(idSet);

    // Device counts: total across the whole set (what the real push uses) vs. under the current session
    // id alone — if these differ, the phone is registered under a different provider record.
    let devices = 0, devicesSession = 0;
    try { const r = await q`SELECT count(*)::int AS n FROM native_push_tokens WHERE owner_kind = 'provider' AND owner_id = ANY(${providerIds}::text[])`; devices = (r[0] && r[0].n) || 0; } catch (e) {}
    try { const r = await q`SELECT count(*)::int AS n FROM native_push_tokens WHERE owner_kind = 'provider' AND owner_id = ${String(payload.u)}`; devicesSession = (r[0] && r[0].n) || 0; } catch (e) {}

    if (!fcmConfigured()) {
      res.status(200).json({ ok: true, fcm: false, devices, devicesSession, sent: 0, message: 'Push notifications aren’t configured on the server yet (FCM). That’s a one-time server setup — tell Claude and it’ll walk you through it.' });
      return;
    }

    // Optional delay before sending, so the founder can close the app first and confirm a TRUE OS banner
    // (a foreground push shows only an in-app toast). The SERVER holds the timer, so it fires even after
    // the app is backgrounded/closed and the client fetch is abandoned. Clamped well under Vercel's 10s
    // function limit so the send always completes.
    let delayMs = 0;
    try { delayMs = Math.max(0, Math.min(7, parseInt((req.query && req.query.delay) || (req.body && req.body.delay) || 0, 10) || 0)) * 1000; } catch (e) {}
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));

    // Send to the full set — exactly like a real paid-signup push.
    let sent = 0;
    for (const pid of providerIds) {
      try { sent += (await sendNativeToProvider(pid, { title: '✅ Test push', body: 'Your SlickChart push notifications are working 🎉', url: '/slickchart', tag: 'test-push', renotify: true })) || 0; } catch (e) {}
    }

    let message;
    if (devices === 0) {
      message = 'No phone is registered yet. Open the SlickChart app on your PHONE (not desktop), make sure you’re logged in, and allow notifications when it asks — then try this again.';
    } else if (sent > 0) {
      message = 'Sent to ' + sent + ' of your device' + (sent === 1 ? '' : 's') + ' — you should see it on your phone in a few seconds (lock the phone / close the app first, since an open app may not show a banner). If it arrives, your paid-signup pushes will too. 🎉';
      if (devicesSession === 0) message += ' (Heads up: your phone is registered under a different provider record than this session — the real paid-signup push handles that, and now so does this test.)';
    } else {
      message = devices + ' device' + (devices === 1 ? '' : 's') + ' registered, but the push didn’t go through (the token may be stale). Re-open the app on your phone with notifications on, then try again.';
    }
    res.status(200).json({ ok: true, fcm: true, devices, devicesSession, sent, providers: providerIds.length, message });
  } catch (e) {
    console.error('[admin/test-push] failed:', e && e.message || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
