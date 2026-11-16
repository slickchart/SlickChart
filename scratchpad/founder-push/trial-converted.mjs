// "Tell me when free trials become paid" (2026-11-16): the first real payment on a trial pushes
// "Trial converted to paid" to every founder device, once; a repeat/renewal stays silent.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel', import.meta.url).pathname;
process.env.DATABASE_URL = 'postgres://x'; process.env.VAPID_PUBLIC_KEY = 'pub'; process.env.VAPID_PRIVATE_KEY = 'priv';
process.env.FOUNDER_EMAILS = 'ashley@x.com'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
delete process.env.FIREBASE_SERVICE_ACCOUNT; delete process.env.APNS_KEY_P8;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const notifyRows = []; let claims = 0, claimSql = '';
globalThis.__sqlHandler = (t, v) => {
  if (/UPDATE trial_outcomes SET paid_invoices/.test(t)) return [{ outcome: 'converted' }];
  if (/UPDATE trial_outcomes SET converted_notified_at/.test(t)) { claims++; claimSql = t; return claims === 1 ? [{ email: 'jen@y.com', plan_amount: 2900, plan_interval: 'month' }] : []; }
  if (/SELECT id FROM providers WHERE lower\(email\)/.test(t)) return v[0] === 'ashley@x.com' ? [{ id: 'prov_ash' }] : [];
  if (/FROM provider_push_subscriptions WHERE provider_id=/.test(t)) return v[0] === 'prov_ash' ? [{ id: 'pp1', sub: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/a', keys: {} }) }, { id: 'pp3', sub: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/b', keys: {} }) }] : [];
  if (/INSERT INTO notify_log/.test(t)) { notifyRows.push(v); return []; }
  if (/count\(\*\)::int AS n FROM trial_outcomes/.test(t)) return [{ n: 3 }];
  if (/SELECT name FROM providers/.test(t)) return [{ name: 'Jen Smith' }];
  return [];
};
const { default: handler } = await import(APP + '/api/stripe-webhook.js');
const crypto = await import('crypto'); const { Readable } = await import('stream');
async function send(obj) {
  const body = JSON.stringify(obj); const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_test').update(ts + '.' + body).digest('hex');
  const req = Readable.from([Buffer.from(body)]); req.method = 'POST'; req.headers = { 'stripe-signature': `t=${ts},v1=${sig}` };
  let status = 0; const res = { status(s) { status = s; return this; }, json() { return this; }, setHeader() {} };
  await handler(req, res); return status;
}
const inv = { type: 'invoice.paid', data: { object: { amount_paid: 2900, subscription: 'sub_9', customer: 'cus_9' } } };
ok(await send(inv) === 200, 'invoice.paid answered 200');
const sends = globalThis.__webSends || [];
ok(sends.length === 2, 'conversion pushed to both founder devices (' + sends.length + ')');
ok(sends.every(s => s.body.title === '💰 Trial converted to paid!' && /Jen Smith is now paying \(\$29\/month\)/.test(s.body.body)), 'push says "Trial converted to paid" with her name and plan (' + (sends[0] && sends[0].body.body) + ')');
ok(/first_paid_at > now\(\) - interval '3 days'/.test(claimSql) && /converted_notified_at IS NULL/.test(claimSql), 'claim is once-only and only for a fresh first payment');
ok(notifyRows.length === 1 && notifyRows[0][0] === 'trial-converted', 'notify_log records it (' + JSON.stringify(notifyRows[0]) + ')');
const before = sends.length;
await send(inv);
ok((globalThis.__webSends || []).length === before && notifyRows.length === 1, 'a renewal / repeat delivery does not push again');
const zero = { type: 'invoice.paid', data: { object: { amount_paid: 0, subscription: 'sub_10' } } };
await send(zero);
ok((globalThis.__webSends || []).length === before, 'a $0 invoice (trial start) never announces');
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
