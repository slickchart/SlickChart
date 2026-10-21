// Feedback monitor key (2026-10-21d): the daily brief in Claude reads /api/feedback with a scoped,
// revocable key. Runs api/feedback.js against an in-memory stand-in for the database.
// Proves: only the owner can make or switch off a key; the key reads the inbox and `since` filters;
// a new key or "Switch off" kills the old one; a key never works as a session anywhere; a provider's
// session cannot read; a forged / other-email key is refused.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbmon-'));
fs.mkdirSync(path.join(dir, 'api')); fs.mkdirSync(path.join(dir, 'lib'));
fs.copyFileSync(path.join(SRC, 'api/feedback.js'), path.join(dir, 'api/feedback.js'));
fs.copyFileSync(path.join(SRC, 'lib/auth.js'), path.join(dir, 'lib/auth.js'));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
// db stand-in: interprets just the statements feedback.js issues.
fs.writeFileSync(path.join(dir, 'lib/db.js'), `
export const S = globalThis.__S = { feedback: [], providers: [{ id: 'own', email: 'owner@x.com', name: 'Ashley' }, { id: 'p2', email: 'pro@x.com', name: 'Jess' }], mon: null };
export function dbEnabled() { return true; }
export async function ensureProvidersTable() {}
export function sql() { return async (strs, ...v) => {
  const t = strs.join('?').replace(/\\s+/g, ' ');
  if (/CREATE TABLE/.test(t)) return [];
  if (/SELECT email FROM providers/.test(t)) return S.providers.filter(p => p.id === v[0]);
  if (/SELECT name FROM providers/.test(t)) return S.providers.filter(p => p.id === v[0]);
  if (/SELECT nonce/.test(t)) return S.mon && S.mon.owner === v[0] ? [{ nonce: S.mon.nonce }] : [];
  if (/UPDATE feedback_monitor SET last_used/.test(t)) { if (S.mon) S.mon.used = Date.now(); return []; }
  if (/SELECT extract\\(epoch from created_at\\)/.test(t)) return S.mon ? [{ c: S.mon.c, u: S.mon.used || null }] : [];
  if (/DELETE FROM feedback_monitor/.test(t)) { if (S.mon && S.mon.owner === v[0]) S.mon = null; return []; }
  if (/INSERT INTO feedback_monitor/.test(t)) { S.mon = { owner: v[0], nonce: v[1], c: Date.now() }; return []; }
  if (/FROM feedback f/.test(t)) { const since = v[0] * 1000; return S.feedback.filter(f => f.ts > since).sort((a, b) => b.ts - a.ts).map(f => ({ ...f, name: (S.providers.find(p => p.id === f.provider_id) || {}).name })); }
  if (/SELECT 1 FROM feedback/.test(t)) return [];
  if (/INSERT INTO feedback/.test(t)) { S.feedback.push({ id: S.feedback.length + 1, provider_id: v[0], email: v[1], rating: v[2], message: v[3], kind: v[4], time_saved: v[5], ts: Date.now() }); return []; }
  throw new Error('unhandled SQL: ' + t);
}; }`);
fs.writeFileSync(path.join(dir, 'lib/email.js'), 'export async function sendEmail(){}');
fs.writeFileSync(path.join(dir, 'lib/fcm.js'), 'export async function pushFoundersReport(){return{}} export function founderPushConfigured(){return false}');
fs.writeFileSync(path.join(dir, 'lib/notify-log.js'), 'export async function recordNotify(){}');
process.env.SESSION_SECRET = 'test-secret'; process.env.OWNER_EMAIL = 'owner@x.com';
const { default: handler } = await import(pathToFileURL(path.join(dir, 'api/feedback.js')));
const { signToken, verifyToken } = await import(pathToFileURL(path.join(dir, 'lib/auth.js')));
const S = globalThis.__S;
const call = async (method, { auth, body, query } = {}) => { let code = 0, out; const res = { status(c) { code = c; return this; }, json(j) { out = j; } }; await handler({ method, headers: auth ? { authorization: auth } : {}, body, query: query || {} }, res); return { code, j: out }; };
const ownerTok = 'Bearer ' + signToken({ u: 'own', e: 'owner@x.com' }, 'test-secret');
const proTok = 'Bearer ' + signToken({ u: 'p2', e: 'pro@x.com' }, 'test-secret');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

S.feedback.push({ id: 1, provider_id: 'p2', email: 'pro@x.com', rating: null, message: 'old report', kind: 'adhoc', time_saved: null, ts: Date.now() - 86400000 * 3 });
await call('POST', { auth: proTok, body: { message: 'forms vanish on my phone' } });

ok((await call('POST', { auth: proTok, body: { action: 'monitor-key' } })).code === 403, 'a provider cannot make a key');
ok((await call('POST', { body: { action: 'monitor-key' } })).code === 403, 'no session cannot make a key');
ok(S.feedback.length === 2, 'an action body is never stored as feedback');
const k1 = (await call('POST', { auth: ownerTok, body: { action: 'monitor-key' } })).j.key;
ok(!!k1, 'owner makes a key');
const r1 = await call('GET', { auth: 'Monitor ' + k1 });
ok(r1.code === 200 && r1.j.items.length === 2 && r1.j.items[0].name === 'Jess', 'key reads the inbox with provider names');
ok(r1.j.monitor === undefined, 'key read does not expose key status');
const r2 = await call('GET', { auth: 'Monitor ' + k1, query: { since: String(Date.now() - 86400000) } });
ok(r2.j.items.length === 1 && r2.j.items[0].message === 'forms vanish on my phone', 'since filters to new feedback');
const ro = await call('GET', { auth: ownerTok });
ok(ro.code === 200 && ro.j.monitor && ro.j.monitor.on && ro.j.monitor.lastUsed > 0, 'owner screen sees the key is on and when it last read');
ok((await call('GET', { auth: proTok })).code === 403, 'a provider session still cannot read the inbox');
ok(verifyToken(k1, 'test-secret') === null, 'the key is refused by verifyToken as a session (scoped)');
ok((await call('GET', { auth: 'Bearer ' + k1 })).code === 403, 'the key sent as a Bearer session cannot read');
const forged = signToken({ k: 'fbmon', e: 'pro@x.com', n: S.mon.nonce }, 'test-secret');
ok((await call('GET', { auth: 'Monitor ' + forged })).code === 403, 'a key naming another email is refused');
ok((await call('GET', { auth: 'Monitor ' + signToken({ k: 'fbmon', e: 'owner@x.com', n: S.mon.nonce }, 'wrong') })).code === 403, 'a key signed with another secret is refused');
const k2 = (await call('POST', { auth: ownerTok, body: { action: 'monitor-key' } })).j.key;
ok((await call('GET', { auth: 'Monitor ' + k1 })).code === 403, 'a new key kills the old one');
ok((await call('GET', { auth: 'Monitor ' + k2 })).code === 200, 'the new key works');
ok((await call('POST', { auth: proTok, body: { action: 'monitor-off' } })).code === 403, 'a provider cannot switch it off');
await call('POST', { auth: ownerTok, body: { action: 'monitor-off' } });
ok((await call('GET', { auth: 'Monitor ' + k2 })).code === 403, 'Switch off kills the key');
ok((await call('GET', { auth: ownerTok })).j.monitor.on === false, 'owner screen shows it off');
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
