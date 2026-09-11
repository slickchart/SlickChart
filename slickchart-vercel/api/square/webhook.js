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

// A course a client paid for, unlocked automatically.
//
// When the provider sends a paid course we create the Square payment link with the note
// "SC1:<clientId>:<courseId>" (api/square/payment-link.js). Square echoes that note back on the
// completed Payment, so a finished checkout tells us exactly what to unlock without the client or the
// provider doing anything.
//
// ISOLATION: providerId is derived from the event's own merchant_id via square_connections, and the
// unlock is written ONLY under that owner. A hostile seller crafting this note in their own Square
// account can therefore only ever unlock something inside their own row — there is no path from one
// merchant's webhook to another provider's data. The ids are also character-restricted before they
// reach a key, so they can't be used to write somewhere else in that row.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
async function recordCoursePurchase(q, providerId, evt, type) {
  if (!/^payment\./.test(type)) return;
  const pay = (evt && evt.data && evt.data.object && evt.data.object.payment) || null;
  if (!pay) return;
  if (String(pay.status || '').toUpperCase() !== 'COMPLETED') return;   // authorized/failed isn't paid
  const m = /^SC1:([^:]+):([^:\s]+)/.exec(String(pay.note || '').trim());
  if (!m) return;
  const clientId = m[1], courseId = m[2];
  if (!SAFE_ID.test(clientId) || !SAFE_ID.test(courseId)) return;
  const entry = { at: Date.now(), paymentId: String(pay.id || '').slice(0, 64) };
  // Append into a single accumulating map. Read-modify-write in one statement so two webhooks landing
  // together can't drop each other's unlock; the provider app merges this key rather than overwriting
  // it (it's registered as a tombstone-style map), so a stale device can never re-lock a paid course.
  const key = clientId + ':' + courseId;
  const patch = JSON.stringify({ [key]: entry });
  try {
    await q`INSERT INTO kv (owner, k, v) VALUES (${providerId}, 'sc_course_purchases', ${patch})
      ON CONFLICT (owner, k) DO UPDATE
      SET v = (COALESCE(NULLIF(kv.v,'')::jsonb, '{}'::jsonb) || ${patch}::jsonb)::text,
          updated_at = now()`;
  } catch (e) {
    // The stored value wasn't valid JSON (shouldn't happen — only this handler and the app write it).
    // Rebuild it rather than letting a paid course stay locked forever.
    const rows = await q`SELECT v FROM kv WHERE owner = ${providerId} AND k = 'sc_course_purchases'`;
    let cur = {};
    try { const parsed = JSON.parse((rows[0] && rows[0].v) || '{}'); if (parsed && typeof parsed === 'object') cur = parsed; } catch (e2) {}
    cur[key] = entry;
    const merged = JSON.stringify(cur);
    await q`INSERT INTO kv (owner, k, v) VALUES (${providerId}, 'sc_course_purchases', ${merged})
      ON CONFLICT (owner, k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
  }
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
        await recordCoursePurchase(q, providerId, evt, type);
      }
    }
  } catch (e) { console.error('[square webhook] record failed:', e && e.message); }

  res.status(200).json({ ok: true });
}
