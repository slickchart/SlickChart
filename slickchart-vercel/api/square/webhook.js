// POST /api/square/webhook  — receives Square webhook events (bookings, payments, catalog, refunds).
//
// Verifies the HMAC-SHA256 signature Square sends (using SQUARE_WEBHOOK_SIGNATURE_KEY + the exact
// notification URL) so only genuine Square calls are accepted, then records a lightweight "recent
// Square activity" marker in the owning provider's synced store. The provider app pulls that key on
// its next tick and can surface a toast / refresh instantly — near-real-time without polling harder.
//
// Setup (one time, by the seller): in Square Developer dashboard add this URL as a webhook endpoint,
// subscribe to booking.*, payment.*, refund.*, catalog.version.updated, and set the signature key in
// Vercel as SQUARE_WEBHOOK_SIGNATURE_KEY (+ SQUARE_WEBHOOK_URL = this exact https URL).
//
// Nothing here gates access to anything. This used to also unlock a paid course by matching a
// "SC1:<clientId>:<courseId>" note on a completed payment; courses are no longer locked at all, so
// that is gone. Don't add a feature back whose working state depends on an event arriving.
import crypto from 'crypto';
import { dbEnabled, sql } from '../../lib/db.js';

// Vercel parses JSON bodies by default; we need the RAW bytes to verify the signature.
export const config = { api: { bodyParser: false } };

function readRaw(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(data));
  });
}

// The canonical https URL Square must be pointed at — and the one the signature is verified against.
// SQUARE_WEBHOOK_URL wins when set, because behind a proxy the host header can differ from the URL
// Square actually called, and a mismatch there fails every signature silently.
function webhookUrl(req) {
  if (process.env.SQUARE_WEBHOOK_URL) return process.env.SQUARE_WEBHOOK_URL;
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['host'] || '';
  const path = String(req.url || '/api/square/webhook').split('?')[0];
  return proto + '://' + host + path;
}

export default async function handler(req, res) {
  // A plain GET is a setup check, not an event: it says whether this endpoint is configured well
  // enough to unlock a paid course, and what exact URL to register in Square. Nothing secret is
  // returned — only whether the signing key exists, never any part of it. Without this the only way
  // to know the key was missing was that paid courses quietly never unlocked.
  if (req.method === 'GET') {
    const hasKey = !!(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '');
    const pinned = process.env.SQUARE_WEBHOOK_URL || '';
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
    const host = req.headers['host'] || '';
    const derived = proto + '://' + host + '/api/square/webhook';
    res.setHeader('Cache-Control', 'no-store');
    // What matters is that `signatureCheckedAgainst` equals the Notification URL registered in
    // Square, character for character. It has NOT got to match the domain this check was opened on:
    // this deployment answers on more than one hostname, and an earlier version of this reply
    // compared the two and reported a mismatch that meant nothing.
    res.status(200).json({
      ok: true,
      ready: hasKey,
      signingKeySet: hasKey,
      signatureCheckedAgainst: pinned || derived,
      pinnedUrlSet: !!pinned,
      subscribeTo: ['payment.created', 'payment.updated'],
      note: !hasKey
        ? 'SQUARE_WEBHOOK_SIGNATURE_KEY is NOT set in Vercel — every Square event is being ignored.'
        : (pinned
          ? 'Signing key is set. Signatures are checked against the pinned URL above, which must be the exact Notification URL in Square. It does not need to match the domain you opened this on.'
          : 'Signing key is set, but no SQUARE_WEBHOOK_URL is pinned, so signatures are checked against whichever hostname the request arrives on. Pin it to the exact Notification URL registered in Square.')
    });
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const raw = await readRaw(req);

  // Verify signature. Square: base64( HMAC-SHA256( notificationUrl + rawBody, signatureKey ) ).
  try {
    const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '';
    const sig = req.headers['x-square-hmacsha256-signature'] || '';
    if (!key) { res.status(200).json({ ok: false, note: 'not-configured' }); return; }  // accept-but-ignore until configured
    const url = webhookUrl(req);
    const expected = crypto.createHmac('sha256', key).update(url + raw).digest('base64');
    const a = Buffer.from(expected); const b = Buffer.from(String(sig));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { res.status(401).json({ error: 'bad signature' }); return; }
  } catch (e) { res.status(401).json({ error: 'signature check failed' }); return; }

  let evt = {};
  try { evt = JSON.parse(raw || '{}'); } catch (e) {}
  const type = String(evt.type || '');
  const merchantId = String(evt.merchant_id || '');

  // Record the activity marker BEFORE responding. On Vercel, work started after res is sent isn't
  // guaranteed to run (the instance can be frozen/reclaimed), so a post-response write was lost most of
  // the time. The DB work below is two quick queries — well within Square's retry timeout — and is still
  // wrapped so any failure can't turn a genuine event into a non-200 that Square keeps retrying.
  try {
    if (dbEnabled() && merchantId) {
      const q = sql();
      const rows = await q`SELECT provider_id FROM square_connections WHERE merchant_id = ${merchantId} LIMIT 1`;
      const providerId = rows[0] && rows[0].provider_id;
      if (providerId) {
        // A friendly summary the app can toast.
        let label = 'Square update';
        if (/^booking\./.test(type)) label = 'A booking changed in Square';
        else if (/^payment\./.test(type)) label = 'A payment came through in Square';
        else if (/^refund\./.test(type)) label = 'A refund was processed in Square';
        else if (/^catalog\./.test(type)) label = 'Your Square catalog changed';
        const activity = JSON.stringify({ type, label, at: Date.now() });
        // Record into the provider's synced kv under a key the app reads (but never writes), so pulling
        // it can't clobber the app's own data. ensureTable is a no-op if the table already exists.
        await q`INSERT INTO kv (owner, k, v) VALUES (${providerId}, 'sc_square_activity', ${activity})
          ON CONFLICT (owner, k) DO UPDATE SET v = EXCLUDED.v`;
      }
    }
  } catch (e) { console.error('[square webhook] record failed:', e && e.message); }

  res.status(200).json({ ok: true });
}
