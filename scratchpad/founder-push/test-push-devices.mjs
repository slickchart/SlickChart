// The founder test push names each registered device and when it last opened the app.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel/', import.meta.url).pathname;
Object.assign(process.env, { DATABASE_URL: 'postgres://x', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', FOUNDER_EMAILS: 'ashley@x.com', SESSION_SECRET: 's3cret' });
delete process.env.FIREBASE_SERVICE_ACCOUNT; delete process.env.APNS_KEY_P8;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const old = Date.UTC(2026, 9, 2, 18, 0);
globalThis.__sqlHandler = (t, v) => {
  if (/SELECT id FROM providers WHERE lower\(email\)/.test(t)) return [{ id: 'prov_ash' }];
  if (/SELECT platform, updated_at, created_at FROM native_push_tokens/.test(t)) return [{ platform: 'android', updated_at: old, created_at: old }];
  if (/count\(\*\)::int AS n FROM provider_push_subscriptions/.test(t)) return [{ n: 1 }];
  if (/FROM provider_push_subscriptions WHERE provider_id=/.test(t)) return [{ id: 'pp1', sub: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/x', keys: {} }) }];
  return [];
};
const { signToken } = await import(APP + 'lib/auth.js');
const { default: h } = await import(APP + 'api/admin/test-push.js');
const tok = signToken({ u: 'prov_ash', e: 'ashley@x.com' }, 's3cret');
let out; const res = { status() { return this; }, json(j) { out = j; return this; }, setHeader() {} };
await h({ method: 'POST', headers: { authorization: 'Bearer ' + tok }, query: {}, body: {} }, res);
ok(out && out.ok, 'test push answers ok');
ok(/Your devices: 1\) Android app, last opened Oct 2/.test(out.message || ''), 'names the Android device and when it last opened: ' + (out && out.message || '').slice(-260));
ok(/2\) browser \/ home-screen app/.test(out.message || ''), 'lists the browser device too');
// Another founder's devices are never read: every device query is scoped to the founder provider ids.
const devQ = globalThis.__sqlCalls.filter(c => /native_push_tokens/.test(c.text));
ok(devQ.every(c => JSON.stringify(c.vals).includes('prov_ash')), 'device queries are scoped to the founder provider ids');
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
