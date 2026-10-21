// A provider's own phone opening a client link must not hand her alerts to the client.
// A client-owned address still moves to a provider who signs in on that device.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel/', import.meta.url).pathname;
Object.assign(process.env, { DATABASE_URL: 'postgres://x', SESSION_SECRET: 's3cret' });
delete process.env.FIREBASE_SERVICE_ACCOUNT;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const rows = new Map();
globalThis.__sqlHandler = (t, v) => {
  if (/FROM sessions/.test(t)) return [{ ok: 1 }];
  if (/FROM clients WHERE token=/.test(t)) return v[0] === 'clientlink' ? [{ id: 'cl_9', provider_id: 'prov_OTHER' }] : [];
  if (/SELECT owner_kind FROM native_push_tokens WHERE token =/.test(t)) { const r = rows.get(v[0]); return r ? [r] : []; }
  if (/INSERT INTO native_push_tokens/.test(t)) { rows.set(v[0], { token: v[0], platform: v[1], owner_kind: v[2], owner_id: v[3], provider_id: v[4] }); return []; }
  if (/DELETE FROM native_push_tokens WHERE token = /.test(t)) { const r = rows.get(v[0]); if (r && r.owner_id === v[1]) rows.delete(v[0]); return []; }
  return [];
};
const auth = await import(APP + 'lib/auth.js');
const { default: h } = await import(APP + 'api/native-push.js');
const ses = auth.signToken({ u: 'prov_1', e: 'a@b.com' }, 's3cret');
const call = async ({ method = 'POST', token, asClient }) => { let out, code; const res = { status(s) { code = s; return this; }, json(j) { out = j; return this; }, setHeader() {} };
  await h({ method, query: asClient ? { t: 'clientlink' } : {}, body: { platform: 'android', token }, headers: asClient ? {} : { authorization: 'Bearer ' + ses } }, res); return { code, out }; };

await call({ token: 'phoneA' });
ok(rows.get('phoneA').owner_kind === 'provider' && rows.get('phoneA').owner_id === 'prov_1', 'provider phone linked to her');
let r = await call({ token: 'phoneA', asClient: true });
ok(r.out.kept === 'provider' && rows.get('phoneA').owner_id === 'prov_1', 'client link opened on her phone keeps her alerts there');
r = await call({ token: 'phoneB', asClient: true });
ok(rows.get('phoneB').owner_kind === 'client' && rows.get('phoneB').provider_id === 'prov_OTHER', 'a client phone still registers as a client');
r = await call({ token: 'phoneB' });
ok(rows.get('phoneB').owner_kind === 'provider' && rows.get('phoneB').owner_id === 'prov_1', 'a provider signing in on a client-owned device takes it over');
r = await call({ method: 'DELETE', token: 'phoneA', asClient: true });
ok(rows.has('phoneA'), 'a client link cannot remove the provider binding');
r = await call({ method: 'DELETE', token: 'phoneA' });
ok(!rows.has('phoneA'), 'her own sign-out removes it');
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
