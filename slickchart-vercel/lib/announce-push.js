// Push a "What's new" update to every PROVIDER device (2026-10-23, Ashley: "I want to make sure when
// I post these updates that the providers get a notification about it").
//
// The only caller is POST /api/announcements, which is gated to OWNER_EMAIL by the verified session
// token. What goes out is the announcement she typed, identical for every device, so nothing of one
// provider's reaches another. Client devices are never included: native rows are owner_kind
// 'provider' only, and web subscriptions come from provider_push_subscriptions, a provider-only table.
//
// Best-effort and never throws. A dead address is pruned exactly as the per-provider senders do.
import { sql } from './db.js';
import { sendFcm, tokenShape, nativePushConfigured } from './fcm.js';
import { sendApns } from './apns.js';
import { pushConfigured as webPushConfigured, sendPush } from './push.js';

const POOL = 12;   // sends in flight at once: fast enough for hundreds of devices, gentle on Google/Apple

async function pool(items, fn) {
  let i = 0;
  const run = async () => { while (i < items.length) { const it = items[i++]; try { await fn(it); } catch (e) {} } };
  await Promise.all(Array.from({ length: Math.min(POOL, items.length) }, run));
}

export async function pushAnnouncementToProviders(title, body) {
  const out = { devices: 0, sent: 0, phones: 0, browsers: 0 };
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  const payload = {
    title: String(title || 'SlickChart update').slice(0, 120),
    body: text.length > 180 ? text.slice(0, 177).trimEnd() + '…' : text,
    url: '/slickchart?n=news', kind: 'news', tag: 'sc-news'
  };
  const q = sql();
  if (nativePushConfigured()) {
    let rows = [];
    try { rows = await q`SELECT DISTINCT token FROM native_push_tokens WHERE owner_kind = 'provider'`; } catch (e) {}
    out.phones = rows.length; out.devices += rows.length;
    await pool(rows, async row => {
      const r = tokenShape(row.token) === 'apns' ? await sendApns(row.token, payload) : await sendFcm(row.token, payload);
      if (r.ok) out.sent++;
      else if (r.gone) { try { await q`DELETE FROM native_push_tokens WHERE token = ${row.token}`; } catch (e) {} }
    });
  }
  if (webPushConfigured()) {
    let rows = [];
    try { rows = await q`SELECT id, endpoint, sub FROM provider_push_subscriptions`; } catch (e) {}
    // One endpoint can sit under two accounts on a shared browser; it is one device, so send once.
    const seen = new Set();
    const subs = [];
    for (const r of rows) { if (seen.has(r.endpoint)) continue; seen.add(r.endpoint); let s = null; try { s = JSON.parse(r.sub); } catch (e) {} if (s) subs.push({ id: r.id, sub: s }); }
    out.browsers = subs.length; out.devices += subs.length;
    await pool(subs, async row => {
      const r = await sendPush(row.sub, payload, { timeout: 4000 });
      if (r.ok) out.sent++;
      else if (r.gone) { try { await q`DELETE FROM provider_push_subscriptions WHERE id = ${row.id}`; } catch (e) {} }
    });
  }
  return out;
}
