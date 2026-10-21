import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
const APP = '/home/user/SlickChart/slickchart-vercel';
process.env.DATABASE_URL = 'postgres://x'; process.env.VAPID_PUBLIC_KEY = 'pub'; process.env.VAPID_PRIVATE_KEY = 'priv';
process.env.FOUNDER_EMAILS = 'ashley@x.com'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
delete process.env.FIREBASE_SERVICE_ACCOUNT; delete process.env.APNS_KEY_P8;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const notifyRows = [];
globalThis.__sqlHandler = (t, v) => {
  if (/UPDATE subscriptions SET paid_notified_at/.test(t)) return [{ email: v[0] }];
  if (/SELECT id FROM providers WHERE lower\(email\)/.test(t)) return v[0] === 'ashley@x.com' ? [{ id: 'prov_ash' }] : [];
  if (/FROM provider_push_subscriptions WHERE provider_id=/.test(t)) {
    if (v[0] === 'prov_ash') return [{ id: 'pp1', sub: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: {} }) }, { id: 'pp2', sub: JSON.stringify({ endpoint: 'https://web.push.apple.com/gone1', keys: {} }) }];
    return [{ id: 'ppX', sub: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/other', keys: {} }) }];
  }
  if (/INSERT INTO notify_log/.test(t)) { notifyRows.push(v); return []; }
  if (/count\(\*\)::int AS n FROM subscriptions/.test(t)) return [{ n: 7 }];
  if (/SELECT name FROM providers/.test(t)) return [{ name: '' }];
  return [];
};
const { default: handler } = await import(APP + '/api/stripe-webhook.js');
const crypto = await import('crypto');
const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer_details: { email: 'JRiske412@gmail.com' }, customer: 'cus_1', subscription: 'sub_1' } } });
const ts = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac('sha256', 'whsec_test').update(ts + '.' + body).digest('hex');
const { Readable } = await import('stream');
const req = Readable.from([Buffer.from(body)]); req.method = 'POST'; req.headers = { 'stripe-signature': `t=${ts},v1=${sig}` };
let status = 0, out = null; const res = { status(s) { status = s; return this; }, json(j) { out = j; return this; }, setHeader() {} };
await handler(req, res);
ok(status === 200, 'webhook answered 200 (' + status + ' ' + JSON.stringify(out) + ')');
const sends = globalThis.__webSends || [];
ok(sends.length === 2, 'paid signup pushed to both of the founder browser subscriptions (' + sends.length + ')');
ok(sends.every(s => s.body.title === '💰 New paid provider!' && /jriske412@gmail.com just signed up — that's 7 paying providers/.test(s.body.body)), 'push carries the paid-provider title and body');
ok(!sends.some(s => s.sub.endpoint.includes('other')), 'no push reached a non-founder subscription');
const del = globalThis.__sqlCalls.filter(c => /DELETE FROM provider_push_subscriptions WHERE id=/.test(c.text));
ok(del.length === 1 && del[0].vals[0] === 'pp2', 'a gone subscription is pruned by its id');
ok(notifyRows.length === 1 && notifyRows[0][0] === 'paid-signup' && notifyRows[0][3] === 2 && notifyRows[0][4] === 1, 'notify_log records the paid signup: devices=2 sent=1 (' + JSON.stringify(notifyRows[0]) + ')');
ok(!/jriske412@gmail.com/.test(String(notifyRows[0][1])), 'logged address is masked (' + notifyRows[0][1] + ')');
// Second delivery of the same event: claim already taken -> silent.
globalThis.__sqlHandler = ((h) => (t, v) => /UPDATE subscriptions SET paid_notified_at/.test(t) ? [] : h(t, v))(globalThis.__sqlHandler);
const before = sends.length;
const req2 = Readable.from([Buffer.from(body)]); req2.method = 'POST'; req2.headers = req.headers;
await handler(req2, res);
ok((globalThis.__webSends || []).length === before && notifyRows.length === 1, 'a repeat event (renewal/retry) does not push again');
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
