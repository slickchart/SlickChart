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
import { pushReport, pushFoundersReport, nativePushConfigured } from '../../lib/fcm.js';
import { apnsConfigured, apnsTarget } from '../../lib/apns.js';
import { recentNotifies } from '../../lib/notify-log.js';

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

    if (!nativePushConfigured()) {
      res.status(200).json({ ok: true, fcm: false, devices, devicesSession, sent: 0, message: 'Push notifications aren’t configured on the server yet. That’s a one-time server setup — tell Claude and it’ll walk you through it.' });
      return;
    }

    // Optional delay before sending, so the founder can close the app first and confirm a TRUE OS banner
    // (a foreground push shows only an in-app toast). The SERVER holds the timer, so it fires even after
    // the app is backgrounded/closed and the client fetch is abandoned. Clamped well under Vercel's 10s
    // function limit so the send always completes.
    let delayMs = 0;
    try { delayMs = Math.max(0, Math.min(7, parseInt((req.query && req.query.delay) || (req.body && req.body.delay) || 0, 10) || 0)) * 1000; } catch (e) {}
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));

    // Send down the REAL path first. This used to send to the session-union set, which meant a
    // passing test proved only "this phone can receive a push" — not "a new-signup push would reach
    // it". Those are different lookups: a signup/sale push runs server-side with no session, so it
    // can only find the founder by FOUNDER_EMAILS -> providers.email -> native_push_tokens. If that
    // chain is broken, the old test still passed and the real alert still went nowhere, which is
    // exactly the gap being chased here. So: exercise the real chain, and only fall back to the
    // session id if it comes up empty — reporting that it did.
    const founder = await pushFoundersReport({ title: '✅ Test push', body: 'Your SlickChart push notifications are working 🎉', url: '/slickchart', tag: 'test-push', renotify: true });
    let sent = founder.sent || 0;
    const results = (founder.results || []).slice();
    const founderDevices = founder.devices || 0;

    // Fallback: the founder-email chain found no device, so confirm the phone itself still works by
    // sending the way the old test did. A banner from THIS means the phone is fine and the lookup is
    // what's broken.
    let viaFallback = false;
    if (founderDevices === 0) {
      for (const pid of providerIds) {
        try {
          const r = await pushReport('provider', pid, { title: '✅ Test push (fallback)', body: 'Your phone works, but new-signup alerts are not finding it 🎉', url: '/slickchart', tag: 'test-push', renotify: true });
          if (r.devices) viaFallback = true;
          sent += r.sent || 0;
          for (const one of (r.results || [])) results.push(one);
        } catch (e) {}
      }
    }

    // An iPhone registered through the current native app hands back an APNs token, and the iOS
    // project has no Firebase SDK to turn that into an FCM one — so FCM can never deliver to it. That
    // is a build-side gap, not a stale token, and telling her to "re-open the app" would be a
    // wild goose chase. Name it exactly.
    const apns = results.filter(r => r.shape === 'apns');

    let message;
    if (devices === 0 && founderDevices === 0) {
      message = 'No phone is registered yet. Open the SlickChart app on your PHONE (not desktop), make sure you’re logged in, and allow notifications when it asks — then try this again.';
    } else if (founderDevices === 0 && viaFallback) {
      message = 'Found the bug. Your phone works fine, but a new-signup alert looks you up by your founder email, and that lookup finds no phone — so real signup pushes have been going nowhere while this test passed. You should still get a banner just now (that was the fallback). Tell Claude: "founder lookup finds 0 devices."';
    } else if (apns.length && sent === 0) {
      message = apnsConfigured()
        ? 'Found your iPhone and tried Apple directly, but the send was refused: ' + ((apns.find(r => r.error) || {}).error || 'no reason given') + '. Most often that means the Apple key details are wrong, or the app was installed from Xcode (sandbox) while the server is set to production. Tell Claude what this said.'
        : 'Found your iPhone, but the Apple push key isn’t set on the server yet, so nothing can be delivered to it. Android is unaffected. Tell Claude "the iPhone needs the APNs key" and it’ll walk you through adding it — no app update needed.';
    } else if (sent > 0) {
      message = 'Sent to ' + sent + ' of your device' + (sent === 1 ? '' : 's') + ' — you should see it on your phone in a few seconds (lock the phone / close the app first, since an open app may not show a banner). This went down the exact same path a real new-signup alert uses, so if it arrives, signup alerts will too. 🎉';
      if (devicesSession === 0) message += ' (Heads up: your phone is registered under a different provider record than this session — the real signup push handles that, and so does this test.)';
      if (apns.length && !apnsConfigured()) message += ' One of your devices is an iPhone, and the Apple push key isn’t set on the server yet — tell Claude.';
    } else {
      const why = (results.find(r => r.error) || {}).error || '';
      message = devices + ' device' + (devices === 1 ? '' : 's') + ' registered, but the push didn’t go through' + (why ? ' (' + why + ')' : '') + '. Re-open the app on your phone with notifications on, then try again — and if it still fails, tell Claude what this said.';
    }
    // What actually happened on the last few REAL signups. A test that passes while real alerts go
    // missing is the exact situation this tool existed to catch and didn't, so it now reports the
    // real events alongside its own result rather than only proving itself.
    let recent = [];
    try { recent = await recentNotifies(5); } catch (e) {}
    if (recent.length) {
      const bad = recent.filter(r => !r.sent);
      message += bad.length
        ? ' — but ' + bad.length + ' of the last ' + recent.length + ' real signups reached nobody: ' + (bad[0].skipped || bad[0].detail || 'reason not recorded') + '. Tell Claude that line.'
        : ' The last ' + recent.length + ' real signups all reached your phone too.';
    } else {
      message += ' No real signups have come through since this logging went live, so the next one will be recorded either way.';
    }

    // `results` is the diagnostic payload: platform, token shape and the real error per device.
    // founderDevices vs devices is the one comparison that matters: the first is what a real signup
    // push can reach, the second is what this session can reach. They should be equal.
    res.status(200).json({
      ok: true, fcm: true, devices, devicesSession, sent, providers: providerIds.length, results, message,
      founderDevices, founderSent: founder.sent || 0, founderEmails: founder.emails || [],
      founderProviders: (founder.providerIds || []).length, viaFallback,
      apns: apnsTarget(),
      recent: recent.map(r => ({ at: r.at, kind: r.kind, subject: r.subject, skipped: r.skipped, devices: r.devices, sent: r.sent, detail: r.detail }))
    });
  } catch (e) {
    console.error('[admin/test-push] failed:', e && e.message || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
