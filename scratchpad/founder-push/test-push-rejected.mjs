// A phone Google rejects is named in the test popup with Google's reason, not silently dropped.
import { register } from 'node:module';
import crypto from 'crypto';
register('./hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel/', import.meta.url).pathname;
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
Object.assign(process.env, { DATABASE_URL: 'postgres://x', FOUNDER_EMAILS: 'ashley@x.com', SESSION_SECRET: 's3cret',
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'sa@p.iam', project_id: 'proj', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) });
delete process.env.VAPID_PUBLIC_KEY; delete process.env.APNS_KEY_P8;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const now = Date.now(), old = Date.UTC(2026, 9, 20, 18, 32);
const rows = [{ token: 'work:APA91b-old', platform: 'android', updated_at: old }, { token: 'main:APA91b-new', platform: 'android', updated_at: now }];
const deleted = [];
globalThis.__sqlHandler = (t, v) => {
  if (/SELECT id FROM providers WHERE lower\(email\)/.test(t)) return [{ id: 'prov_ash' }];
  if (/SELECT token, platform, updated_at FROM native_push_tokens/.test(t)) return rows.filter(r => !deleted.includes(r.token));
  if (/DELETE FROM native_push_tokens WHERE token=/.test(t)) { deleted.push(v[0]); return []; }
  if (/SELECT platform, updated_at, created_at FROM native_push_tokens/.test(t)) return rows.filter(r => !deleted.includes(r.token)).map(r => ({ platform: r.platform, updated_at: r.updated_at }));
  return [];
};
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('oauth2')) return { ok: true, status: 200, json: async () => ({ access_token: 'at', expires_in: 3600 }), text: async () => '' };
  const body = JSON.parse(init.body);
  if (body.message.token.startsWith('main:')) return { ok: false, status: 404, text: async () => '{"error":{"code":404,"message":"Requested entity was not found.","status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}' };
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};
const { signToken } = await import(APP + 'lib/auth.js');
const { default: h } = await import(APP + 'api/admin/test-push.js');
let out; const res = { status() { return this; }, json(j) { out = j; return this; }, setHeader() {} };
await h({ method: 'POST', headers: { authorization: 'Bearer ' + signToken({ u: 'prov_ash', e: 'ashley@x.com' }, 's3cret') }, query: {}, body: {} }, res);
const m = out && out.message || '';
console.log('   ' + m.slice(m.indexOf('What happened')));
ok(/1\) Android app \(last opened Oct 20, 11:32 AM\): delivered to Google/.test(m), 'the work phone is shown as delivered');
ok(/2\) Android app \(last opened [^)]+\): Google rejected this device address \(404 NOT_FOUND: Requested entity was not found\.\), so it was removed/.test(m), 'the rejected main phone is named with Google\'s reason');
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
