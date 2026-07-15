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

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const raw = await readRaw(req);

  // Verify signature. Square: base64( HMAC-SHA256( notificationUrl + rawBody, signatureKey ) ).
  try {
    const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '';
    const sig = req.headers['x-square-hmacsha256-signature'] || '';
    if (!key) { res.status(200).json({ ok: false, note: 'not-configured' }); return; }  // accept-but-ignore until configured
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
    const host = req.headers['host'] || '';
    const url = process.env.SQUARE_WEBHOOK_URL || (proto + '://' + host + (req.url || '/api/square/webhook'));
    const expected = crypto.createHmac('sha256', key).update(url + raw).digest('base64');
    const a = Buffer.from(expected); const b = Buffer.from(String(sig));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { res.status(401).json({ error: 'bad signature' }); return; }
  } catch (e) { res.status(401).json({ error: 'signature check failed' }); return; }

  let evt = {};
  try { evt = JSON.parse(raw || '{}'); } catch (e) {}
  const type = String(evt.type || '');
  const merchantId = String(evt.merchant_id || '');

  // Always 200 quickly so Square doesn't retry; do the (best-effort) recording after.
  res.status(200).json({ ok: true });

  try {
    if (!dbEnabled() || !merchantId) return;
    const q = sql();
    const rows = await q`SELECT provider_id FROM square_connections WHERE merchant_id = ${merchantId} LIMIT 1`;
    const providerId = rows[0] && rows[0].provider_id;
    if (!providerId) return;
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
  } catch (e) { console.error('[square webhook] record failed:', e && e.message); }
}
