// /api/native-push checks a new address with Google (validate_only) and drops one Google refuses.
import { register } from 'node:module';
import crypto from 'crypto';
register('./hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel/', import.meta.url).pathname;
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
Object.assign(process.env, { DATABASE_URL: 'postgres://x', SESSION_SECRET: 's3cret',
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'sa@p.iam', project_id: 'proj', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sent = []; const del = []; const logs = [];
globalThis.__sqlHandler = (t, v) => { if (/INSERT INTO native_push_log/.test(t)) logs.push(v); if (/DELETE FROM native_push_tokens WHERE token = /.test(t)) del.push(v); if (/FROM sessions/.test(t)) return [{ ok: 1 }]; return []; };
globalThis.fetch = async (url, init) => { const u = String(url);
  if (u.includes('oauth2')) return { ok: true, status: 200, json: async () => ({ access_token: 'at', expires_in: 3600 }), text: async () => '' };
  const b = JSON.parse(init.body); sent.push(b);
  return b.message.token.startsWith('bad') ? { ok: false, status: 404, text: async () => '{"error":{"status":"NOT_FOUND","message":"Requested entity was not found."}}' } : { ok: true, status: 200, text: async () => '{}', json: async () => ({}) }; };
const auth = await import(APP + 'lib/auth.js');
const { default: h } = await import(APP + 'api/native-push.js');
const tok = auth.signToken({ u: 'prov_1', e: 'a@b.com' }, 's3cret');
const call = async (token) => { let out, code; const res = { status(s) { code = s; return this; }, json(j) { out = j; return this; }, setHeader() {} };
  await h({ method: 'POST', query: {}, body: { platform: 'android', token }, headers: { authorization: 'Bearer ' + tok } }, res); return { code, out }; };
let r = await call('good:APA91b');
ok(r.code === 200 && r.out.ok && !r.out.invalid && r.out.checked, 'good address saved and checked: ' + JSON.stringify(r.out));
ok(sent[0] && sent[0].validate_only === true, 'the check uses validate_only, nothing shown on the phone');
r = await call('bad:APA91b');
ok(r.out.invalid && /404 NOT_FOUND/.test(r.out.reason), 'refused address reported: ' + r.out.reason);
ok(del.length === 1 && del[0][0] === 'bad:APA91b' && del[0][1] === 'prov_1', 'refused address removed, scoped to this owner');
ok(logs.length === 2 && logs[0][0] === 'prov_1' && logs[0][4] === 'linked, Google accepted' && logs[0][2] === 'APA91b', 'a good link is recorded with only the last 6 characters: ' + JSON.stringify(logs[0]));
ok(logs[1] && logs[1][4] === 'removed: refused when linking' && /404 NOT_FOUND/.test(logs[1][5]) && !JSON.stringify(logs).includes('bad:APA'), 'a refused link is recorded with Google\'s answer, never the address: ' + JSON.stringify(logs[1]));
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
