// Her phone is signed in to an account whose stored email is not the founder address. A founder
// session seen by /api/admin/signups makes that account's devices get founder alerts; a non-founder
// session can never add itself.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel/', import.meta.url).pathname;
Object.assign(process.env, { DATABASE_URL: 'postgres://x', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', FOUNDER_EMAILS: 'ashley@x.com', SESSION_SECRET: 's3cret' });
delete process.env.FIREBASE_SERVICE_ACCOUNT; delete process.env.APNS_KEY_P8;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const fa = new Map();
const subsBy = { prov_old: [{ id: 'po', sub: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/old', keys: {} }) }],
  prov_phone: [{ id: 'pf', sub: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/phone', keys: {} }) }],
  prov_stranger: [{ id: 'ps', sub: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/stranger', keys: {} }) }] };
globalThis.__sqlHandler = (t, v) => {
  if (/SELECT id FROM providers WHERE lower\(email\)/.test(t)) return v[0] === 'ashley@x.com' ? [{ id: 'prov_old' }] : [];
  if (/INSERT INTO founder_accounts/.test(t)) { fa.set(v[0], v[1]); return []; }
  if (/SELECT provider_id FROM founder_accounts/.test(t)) return [...fa].filter(([, e]) => v[0].includes(e)).map(([id]) => ({ provider_id: id }));
  if (/FROM provider_push_subscriptions WHERE provider_id=/.test(t)) return subsBy[v[0]] || [];
  if (/FROM subscriptions s/.test(t)) return [];
  return [];
};
const { signToken } = await import(APP + 'lib/auth.js');
const { default: signups } = await import(APP + 'api/admin/signups.js');
const { pushFoundersReport } = await import(APP + 'lib/fcm.js');
const call = async (u, e) => { let code = 0; const res = { status(s) { code = s; return this; }, json() { return this; }, setHeader() {} };
  await signups({ method: 'GET', query: {}, headers: { authorization: 'Bearer ' + signToken({ u, e }, 's3cret') } }, res); return code; };
const ends = () => (globalThis.__webSends || []).map(s => s.sub.endpoint.split('/').pop());

globalThis.__webSends = [];
await pushFoundersReport({ title: 't' });
ok(ends().join() === 'old', 'before: the founder alert reaches only the stale email-matched device (' + ends() + ')');

ok(await call('prov_stranger', 'someone@else.com') === 403, 'a non-founder session is refused');
ok(!fa.has('prov_stranger'), 'and is NOT recorded as a founder account');
ok(await call('prov_phone', 'ashley@x.com') === 200, 'her phone account (founder login email) polls signups');

globalThis.__webSends = [];
await pushFoundersReport({ title: 't' });
ok(ends().sort().join() === 'old,phone', 'after: the alert reaches her phone account too (' + ends() + ')');
ok(!ends().includes('stranger'), 'never a non-founder account');
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
