// Sign-in pass renewal (2026-10-29a). A pass lasts 30 days and was never renewed, so every provider
// was signed out on day 30 mid-use. A full GET /api/store now returns `renew` once the pass is a week
// old. Runs api/store.js against an in-memory database stand-in.
// Proves: a fresh pass gets no renew; a week-old pass gets one with the SAME u/e/sid and a later exp;
// a revoked session gets 401 and nothing; no-sid, scoped (k) and purpose (p) tokens are never renewed;
// ?key= reads never renew; the renewed pass works and still dies when its session is revoked.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'renew-'));
fs.mkdirSync(path.join(dir, 'api')); fs.mkdirSync(path.join(dir, 'lib'));
fs.copyFileSync(path.join(SRC, 'api/store.js'), path.join(dir, 'api/store.js'));
fs.copyFileSync(path.join(SRC, 'lib/auth.js'), path.join(dir, 'lib/auth.js'));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(dir, 'lib/db.js'), `
export const S = globalThis.__S = { sessions: { s1: { revoked: false } }, kv: [{ owner: 'p1', k: 'sc_x', v: '1' }, { owner: 'p2', k: 'sc_x', v: 'OTHER' }] };
export function dbEnabled() { return true; }
export async function ensureProvidersTable() {} export async function ensureTable() {}
export function sql() { return async (strs, ...v) => { const t = strs.join('?').replace(/\\s+/g, ' ');
  if (/SELECT revoked FROM sessions/.test(t)) return S.sessions[v[0]] ? [S.sessions[v[0]]] : [];
  if (/UPDATE sessions SET last_seen_at/.test(t)) return [];
  if (/SELECT k, v FROM kv WHERE owner = \\? AND k = \\?/.test(t)) return S.kv.filter(r => r.owner === v[0] && r.k === v[1]);
  if (/SELECT k, v FROM kv WHERE owner = \\?/.test(t)) return S.kv.filter(r => r.owner === v[0]);
  throw new Error('unhandled SQL: ' + t); }; }`);
fs.writeFileSync(path.join(dir, 'lib/kv-history.js'), 'export async function snapshotBeforeWrite(){} export async function rescueDeviceCopy(){}');
fs.writeFileSync(path.join(dir, 'lib/clients.js'), 'export async function reconcileDeletedClients(){ globalThis.__recon = (globalThis.__recon||0)+1; return {removed:0,restored:0}; }');
process.env.SESSION_SECRET = 'sec';
const { default: handler } = await import(pathToFileURL(path.join(dir, 'api/store.js')));
const { signToken, verifyToken } = await import(pathToFileURL(path.join(dir, 'lib/auth.js')));
const S = globalThis.__S;
const call = async (tok, query) => { let code = 0, out; const res = { status(c) { code = c; return this; }, json(j) { out = j; }, setHeader() {} }; await handler({ method: 'GET', headers: tok ? { authorization: 'Bearer ' + tok } : {}, query: query || {} }, res); return { code, j: out }; };
const D = 86400;
const aged = (claims, ageDays) => signToken(claims, 'sec', 30 * D - ageDays * D);   // ttl shortened = pass issued ageDays ago
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

const fresh = await call(aged({ u: 'p1', e: 'a@x.com', sid: 's1' }, 1));
ok(fresh.code === 200 && !fresh.j.renew, 'a 1-day-old pass is not renewed');
ok(fresh.j.data.sc_x === '1' && Object.keys(fresh.j.data).length === 1, 'reads only its own data');
const old = await call(aged({ u: 'p1', e: 'a@x.com', sid: 's1' }, 10));
const nt = old.j.renew && verifyToken(old.j.renew, 'sec');
ok(!!nt, 'a 10-day-old pass gets a renewed pass');
ok(nt && nt.u === 'p1' && nt.e === 'a@x.com' && nt.sid === 's1' && !nt.k && !nt.p, 'renewed pass has the same account and session');
ok(nt && nt.exp - Math.floor(Date.now() / 1000) > 29 * D, 'renewed pass lasts 30 days');
const viaNew = await call(old.j.renew);
ok(viaNew.code === 200 && viaNew.j.data.sc_x === '1' && !viaNew.j.renew, 'the renewed pass works and is not renewed again right away');
ok(!(await call(aged({ u: 'p1', e: 'a@x.com', sid: 's1' }, 10), { key: 'sc_x' })).j.renew, 'a one-key read never renews');
ok(!(await call(aged({ u: 'p1', e: 'a@x.com' }, 10))).j.renew, 'a pass with no session id is never renewed');
ok((await call(aged({ u: 'p1', e: 'a@x.com', sid: 's1', k: 'cal' }, 10))).code === 401, 'a scoped pass is refused (and never renewed)');
ok(!(await call(aged({ u: 'p1', e: 'a@x.com', sid: 's1', p: 'x' }, 10))).j.renew, 'a purpose pass is never renewed');
ok((await call(aged({ u: 'p1', e: 'a@x.com', sid: 'gone' }, 10))).code === 401, 'an unknown session gets 401, no renew');
S.sessions.s1.revoked = true;
const rv = await call(aged({ u: 'p1', e: 'a@x.com', sid: 's1' }, 10));
ok(rv.code === 401 && !(rv.j && rv.j.renew), 'a signed-out session gets 401 and no renew');
ok((await call(old.j.renew)).code === 401, 'the renewed pass dies with its session');
ok((await call(signToken({ u: 'p1', sid: 's1' }, 'sec', -10))).code === 401, 'an expired pass is still refused');
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
