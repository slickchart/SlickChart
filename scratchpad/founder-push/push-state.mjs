// /api/admin/push-state: only the owner's live monitor key; founder devices only; no tokens leak.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel/', import.meta.url).pathname;
Object.assign(process.env, { DATABASE_URL: 'postgres://x', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', FOUNDER_EMAILS: 'ashley@x.com', OWNER_EMAIL: 'ashley@x.com', SESSION_SECRET: 's3cret' });
delete process.env.FIREBASE_SERVICE_ACCOUNT; delete process.env.APNS_KEY_P8;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
let nonce = 'n1';
globalThis.__sqlHandler = (t, v) => {
  if (/SELECT nonce, last_used FROM feedback_monitor/.test(t)) return v[0] === 'ashley@x.com' ? [{ nonce }] : [];
  if (/SELECT id FROM providers WHERE lower\(email\)/.test(t)) return [{ id: 'prov_old1' }];
  if (/SELECT provider_id, seen_at FROM founder_accounts/.test(t)) return [{ provider_id: 'prov_main', seen_at: 'x' }];
  if (/SELECT provider_id FROM founder_accounts/.test(t)) return [{ provider_id: 'prov_main' }];
  if (/SELECT token, platform, owner_id/.test(t)) return [{ token: 'abc:SECRETTOKEN123456', platform: 'android', owner_id: 'prov_old1', created_at: 1, updated_at: 2 }];
  if (/FROM provider_push_subscriptions WHERE provider_id=/.test(t)) return [{ id: 'pp', sub: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/w', keys: {} }) }];
  if (/FROM device_reports/.test(t)) { if (v[0] !== 'prov_main' && v[0] !== 'prov_old1') throw new Error('device report for a non-founder id ' + v[0]);
    return v[0] === 'prov_main' ? [{ device_key: 'd1', updated_at: new Date().toISOString(), report: { native: true, platform: 'Android', kind: 'installed app', build: '2026-10-21i', pushPerm: 'granted', pushPost: 'ok', pushEnds: 'ZZZZZZ' } }]
      : [{ device_key: 'd2', updated_at: new Date().toISOString(), report: { native: true, platform: 'Android', kind: 'installed app', build: '2026-10-21i', pushPerm: 'granted', pushPost: 'ok', pushEnds: '123456' } }]; }
  return [];
};
const { signToken } = await import(APP + 'lib/auth.js');
const { default: h } = await import(APP + 'api/admin/push-state.js');
const call = async (auth, method = 'GET', query = {}) => { let code = 0, out; const res = { status(s) { code = s; return this; }, json(j) { out = j; return this; }, setHeader() {} }; await h({ method, query, headers: auth ? { authorization: auth } : {} }, res); return { code, out }; };
const key = signToken({ k: 'fbmon', e: 'ashley@x.com', n: 'n1' }, 's3cret', 3600);
const session = signToken({ u: 'prov_old1', e: 'ashley@x.com' }, 's3cret', 3600);
ok((await call('')).code === 403, 'no key: refused');
ok((await call('Bearer ' + session)).code === 403, 'a founder SESSION token is not this key');
ok((await call('Monitor ' + session)).code === 403, 'a session token sent as a monitor key is refused');
ok((await call('Monitor ' + signToken({ k: 'fbmon', e: 'someone@else.com', n: 'n1' }, 's3cret', 3600))).code === 403, 'a key for another email is refused');
nonce = 'n2'; ok((await call('Monitor ' + key)).code === 403, 'a switched-off (replaced) key is refused'); nonce = 'n1';
const r = await call('Monitor ' + key);
ok(r.code === 200 && r.out.accounts.length === 2, 'live key: both founder accounts: ' + JSON.stringify(r.out.accounts));
ok(r.out.phoneApps[0].addressEnds === '123456' && !JSON.stringify(r.out).includes('SECRETTOKEN'), 'never returns a device token');
ok(r.out.devices.length === 2 && r.out.devices.some(d => d.pushEnds === '123456' && d.onAlertList === true), 'a phone on the list is shown as linked');
ok(r.out.problems.length === 1 && /NOT on the alert list/.test(r.out.problems[0]) && /2026-10-21i/.test(r.out.problems[0]), 'a phone in use but missing from the list is named: ' + r.out.problems[0]);
const s = await call('Monitor ' + key, 'POST', { send: '1' });
ok(s.code === 200 && s.out.send && s.out.send.sent >= 1, 'send=1 runs the founder test: ' + JSON.stringify(s.out.send));
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
