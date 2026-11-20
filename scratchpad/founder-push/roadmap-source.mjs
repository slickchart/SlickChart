// Roadmap sale SOURCE (2026-11-20, Ashley: "can we see where the sale came from? ... track how those
// come in just like the app providers"). The Build page's src -> /api/build-checkout -> Stripe
// metadata src_* -> webhook -> build_purchases row + her alert "Came from: ...".
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel/', import.meta.url).pathname;
Object.assign(process.env, { DATABASE_URL: 'postgres://x', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv',
  FOUNDER_EMAILS: 'ashley@x.com', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_SECRET_KEY: 'sk_test', BUILD_PRICE_ID: 'price_x' });
delete process.env.FIREBASE_SERVICE_ACCOUNT; delete process.env.APNS_KEY_P8;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const inserts = [];
globalThis.__sqlHandler = (t, v) => {
  if (/INSERT INTO build_purchases/.test(t)) { inserts.push({ t, v }); return []; }
  if (/UPDATE build_purchases SET notified_at/.test(t)) return [{ stripe_session_id: v[0] }];
  if (/SELECT id FROM providers WHERE lower\(email\)/.test(t)) return v[0] === 'ashley@x.com' ? [{ id: 'prov_ash' }] : [];
  if (/FROM provider_push_subscriptions WHERE provider_id=/.test(t)) return v[0] === 'prov_ash' ? [{ id: 'pp1', sub: JSON.stringify({ endpoint: 'https://web.push.apple.com/ok', keys: {} }) }] : [];
  if (/count\(\*\)::int AS n, COALESCE/.test(t)) return [{ n: 2, cents: 19400 }];
  return [];
};
const res = () => ({ code: 0, status(s) { this.code = s; return this; }, json(j) { this.body = j; return this; }, setHeader() {} });

// 1. Checkout: the page's src becomes cleaned Stripe metadata; junk is dropped.
const realFetch = globalThis.fetch; let form = null;
globalThis.fetch = async (url, o) => { if (/checkout\/sessions/.test(String(url))) { form = new URLSearchParams(o.body); return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/x' }) }; } return realFetch(url, o); };
const { default: checkout } = await import(APP + 'api/build-checkout.js');
let r = res();
await checkout({ method: 'POST', body: { roadmap: 'any', src: { utm: 'utm__pinterest__build__pin3', lp: '/build-any-business', ref: 'www.Pinterest.com', lref: 'pinterest.com' } } }, r);
ok(r.code === 200 && form.get('metadata[src_source]') === 'pinterest' && form.get('metadata[src_campaign]') === 'build' && form.get('metadata[src_content]') === 'pin3'
  && form.get('metadata[src_landing]') === '/build-any-business' && form.get('metadata[src_referrer]') === 'pinterest.com' && !form.get('metadata[src_lastref]')
  && form.get('metadata[roadmap]') === 'any', 'checkout copies the cleaned source onto Stripe metadata');
r = res();
await checkout({ method: 'POST', body: { src: { utm: 'utm__<b>x</b>__' + 'a'.repeat(300), lp: 'javascript:alert(1)', ref: 'not a host', extra: 'drop' } } }, r);
const keys = [...form.keys()].filter(k => /src_/.test(k));
ok(r.code === 200 && !form.get('metadata[src_referrer]') && keys.every(k => /^metadata\[src_(source|campaign|content|landing|referrer|lastref)\]$/.test(k)) && !/[<>:]/.test(keys.map(k => form.get(k)).join('')), 'junk source is cleaned or dropped: ' + keys.map(k => k + '=' + form.get(k)).join(' '));
r = res();
await checkout({ method: 'POST', body: '{}' }, r);
ok(r.code === 200 && form.get('metadata[roadmap]') === 'beauty' && ![...form.keys()].some(k => /src_/.test(k)), 'an old page posting {} still checks out, with no source');
globalThis.fetch = realFetch;

// 2. Webhook: the sale row stores the source and her push names it.
const crypto = await import('crypto'); const { Readable } = await import('stream');
const { default: webhook } = await import(APP + 'api/stripe-webhook.js');
const send = async (obj) => { const ev = JSON.stringify({ type: 'checkout.session.completed', data: { object: obj } });
  const ts = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', 'whsec_test').update(ts + '.' + ev).digest('hex');
  const req = Readable.from([Buffer.from(ev)]); req.method = 'POST'; req.headers = { 'stripe-signature': `t=${ts},v1=${sig}` }; const rr = res(); await webhook(req, rr); return rr; };
await send({ id: 'cs_src1', mode: 'payment', amount_total: 9700, currency: 'usd', customer_details: { email: 'buyer@y.com' },
  metadata: { product: 'build', roadmap: 'beauty', src_landing: '/build/blog/what-an-app-actually-costs', src_referrer: 'google.com' } });
const row = inserts.find(i => i.v[0] === 'cs_src1');
ok(row && row.v.includes('google.com') && row.v.includes('/build/blog/what-an-app-actually-costs') && row.v.includes('Google search (landed on /build/blog/what-an-app-actually-costs)'), 'webhook stores the source on the sale');
const push = (globalThis.__webSends || []).find(s => /sold!/.test(s.body.title));
ok(push && /from Google search/.test(push.body.body), 'her sale push says where it came from: ' + (push && push.body.body));
await send({ id: 'cs_src2', mode: 'payment', amount_total: 9700, currency: 'usd', customer_details: { email: 'old@y.com' }, metadata: { product: 'build', roadmap: 'beauty' } });
const row2 = inserts.find(i => i.v[0] === 'cs_src2');
ok(row2 && row2.v.slice(6, 12).every(x => x == null), 'a sale with no source info stores NULLs (reads as "not recorded")');

console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
