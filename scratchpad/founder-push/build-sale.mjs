// /build purchase alerts: webhook sale, redirect sale, and the "lost my email" backfill.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel/', import.meta.url).pathname;
Object.assign(process.env, { DATABASE_URL: 'postgres://x', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv',
  FOUNDER_EMAILS: 'ashley@x.com', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_SECRET_KEY: 'sk_test', BUILD_VIDEO_URL: 'https://v', BUILD_ARTIFACT_URL: 'https://a' });
delete process.env.FIREBASE_SERVICE_ACCOUNT; delete process.env.APNS_KEY_P8;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const notified = new Set(); const notifyRows = [];
globalThis.__sqlHandler = (t, v) => {
  if (/UPDATE build_purchases SET notified_at/.test(t)) { if (notified.has(v[0])) return []; notified.add(v[0]); return [{ stripe_session_id: v[0] }]; }
  if (/SELECT id FROM providers WHERE lower\(email\)/.test(t)) return v[0] === 'ashley@x.com' ? [{ id: 'prov_ash' }] : [];
  if (/FROM provider_push_subscriptions WHERE provider_id=/.test(t)) return v[0] === 'prov_ash' ? [{ id: 'pp1', sub: JSON.stringify({ endpoint: 'https://web.push.apple.com/ok', keys: {} }) }] : [];
  if (/INSERT INTO notify_log/.test(t)) { notifyRows.push(v); return []; }
  if (/count\(\*\)::int AS n, COALESCE/.test(t)) return [{ n: 3, cents: 29100 }];
  return [];
};
const pushes = () => (globalThis.__webSends || []).filter(s => /sold!/.test(s.body.title));
const crypto = await import('crypto'); const { Readable } = await import('stream');
const res = () => ({ code: 0, status(s) { this.code = s; return this; }, json(j) { this.body = j; return this; }, setHeader() {} });

// 1. Webhook: a /build checkout announces once, to every founder device, with a record.
const { default: webhook } = await import(APP + 'api/stripe-webhook.js');
const ev = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_new1', mode: 'payment', amount_total: 9700, currency: 'usd', metadata: { product: 'build', roadmap: 'beauty' }, customer_details: { email: 'buyer@y.com' } } } });
const send = async () => { const ts = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', 'whsec_test').update(ts + '.' + ev).digest('hex');
  const req = Readable.from([Buffer.from(ev)]); req.method = 'POST'; req.headers = { 'stripe-signature': `t=${ts},v1=${sig}` }; const r = res(); await webhook(req, r); return r; };
ok((await send()).code === 200, 'webhook answers 200');
ok(pushes().length === 1 && /Beauty Biz App Build Roadmap sold!/.test(pushes()[0].body.title) && /\$97/.test(pushes()[0].body.body), 'sale pushed to her browser device: ' + JSON.stringify(pushes()[0] && pushes()[0].body));
ok(notifyRows.length === 1 && notifyRows[0][0] === 'build-sale' && notifyRows[0][4] === 1, 'build-sale recorded in notify_log with sent=1');
await send();
ok(pushes().length === 1, 'a repeated webhook does not announce twice');

// 2. Lost-my-email backfill: a RECENT sale nobody announced is announced; an OLD one stays silent.
const now = Math.floor(Date.now() / 1000);
const sessions = [
  { id: 'cs_recent', created: now - 3600, payment_status: 'paid', mode: 'payment', amount_total: 9700, currency: 'usd', metadata: { roadmap: 'beauty' }, customer_details: { email: 'late@y.com' } },
  { id: 'cs_old', created: now - 40 * 86400, payment_status: 'paid', mode: 'payment', amount_total: 9700, currency: 'usd', metadata: {}, customer_details: { email: 'late@y.com' } },
  { id: 'cs_new1', created: now - 60, payment_status: 'paid', mode: 'payment', amount_total: 9700, currency: 'usd', metadata: { roadmap: 'beauty' }, customer_details: { email: 'late@y.com' } },
];
globalThis.fetch = async (url) => {
  const u = String(url);
  const j = /customers\?/.test(u) ? { data: [{ id: 'cus_1' }] } : /checkout\/sessions/.test(u) ? { data: sessions } : {};
  return { ok: true, status: 200, json: async () => j, text: async () => '' };
};
const { default: access } = await import(APP + 'api/build-access.js');
const r2 = res(); await access({ method: 'POST', body: { email: 'late@y.com' }, headers: { 'x-real-ip': '1.2.3.4' } }, r2);
ok(r2.code === 200 && r2.body.ok, 'build-access still answers the generic success');
const titles = pushes().map(p => p.body.body);
ok(pushes().length === 2 && /late@y.com/.test(titles[1]), 'recent unannounced sale is announced from the backfill (' + pushes().length + ' pushes)');
ok(notified.has('cs_old') && !titles.some(b => /cs_old/.test(b)) && pushes().length === 2, 'old sale stays silent, already-announced sale is not repeated');
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
