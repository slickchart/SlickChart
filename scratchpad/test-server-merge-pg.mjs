// Server pieces of the 2026-10-15 duplicate sweep, against a real PostgreSQL 16:
//  - api/store.js unions sc_deleted_clients (newest stamp per id) and sc_merged_into
//  - lib/clients.js mergeClientRows moves events/link to the survivor, provider-scoped
// Reuses the db stub from sweep-dup-server-pg.mjs.  node scratchpad/test-server-merge-pg.mjs
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
const VERCEL = '/home/user/SlickChart/slickchart-vercel';
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16'); process.exit(0); }
const src = fs.readFileSync('/home/user/SlickChart/scratchpad/sweep-dup-server-pg.mjs', 'utf8');
const DBSTUB_RAW = src.slice(src.indexOf('const DBSTUB = `') + 16, src.indexOf('`;\nconst AUTHSTUB'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smpg-')), sock = fs.mkdtempSync(path.join(os.tmpdir(), 'smsock-'));
const PORT = '55493', asRoot = process.getuid() === 0, USER = asRoot ? 'pgtest' : os.userInfo().username;
const sh = c => execFileSync('/bin/sh', ['-c', c], { encoding: 'utf8' });
const pg = c => sh(asRoot ? "su " + USER + " -c '" + c.replace(/'/g, "'\\''") + "'" : c);
if (asRoot) { try { sh('id ' + USER); } catch (e) { sh('useradd -m ' + USER); } sh('chown -R ' + USER + ' ' + root + ' ' + sock + ' && chmod 777 ' + sock); }
let started = false; process.on('exit', () => { if (started) try { pg(PGBIN + '/pg_ctl -D ' + root + '/data stop -m immediate'); } catch (e) {} });
pg(PGBIN + '/initdb -D ' + root + '/data -U ' + USER + ' --auth=trust >/dev/null');
pg(PGBIN + "/pg_ctl -D " + root + "/data -o '-k " + sock + " -p " + PORT + " -c listen_addresses=' -l " + root + "/log start -w >/dev/null"); started = true;
const DBSTUB = eval('`' + DBSTUB_RAW + '`');
const lib = path.join(root, 'lib'), api = path.join(root, 'api'); fs.mkdirSync(lib); fs.mkdirSync(api);
fs.writeFileSync(path.join(lib, 'db.js'), DBSTUB);
fs.writeFileSync(path.join(lib, 'auth.js'), "export function verifyToken(t){try{return JSON.parse(Buffer.from(String(t),'base64').toString('utf8'));}catch(e){return null;}}\nexport async function isSessionValid(){return true;}\n");
fs.writeFileSync(path.join(lib, 'kv-history.js'), "export async function snapshotBeforeWrite(){}\nexport async function rescueDeviceCopy(){}\n");
fs.copyFileSync(path.join(VERCEL, 'lib/clients.js'), path.join(lib, 'clients.js'));
fs.copyFileSync(path.join(VERCEL, 'api/store.js'), path.join(api, 'store.js'));
fs.copyFileSync(path.join(VERCEL, 'api/clients.js'), path.join(api, 'clients.js'));
for (const f of fs.readdirSync(path.join(VERCEL, 'lib'))) if (!fs.existsSync(path.join(lib, f))) fs.copyFileSync(path.join(VERCEL, 'lib', f), path.join(lib, f));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
process.env.SESSION_SECRET = 'x';
const store = (await import(path.join(api, 'store.js'))).default;
const clientsApi = (await import(path.join(api, 'clients.js'))).default;
const C = await import(path.join(lib, 'clients.js'));
const { sql } = await import(path.join(lib, 'db.js'));
const tok = u => 'Bearer ' + Buffer.from(JSON.stringify({ u })).toString('base64');
const call = (h, method, owner, body) => new Promise(res => { const r = { code: 200, status(c) { this.code = c; return this; }, json(j) { res({ code: this.code, j }); }, setHeader() {}, end() { res({ code: this.code }); } }; h({ method, headers: { authorization: tok(owner) }, body, query: {} }, r); });
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  — ' + d)); ok ? pass++ : fail++; };
const q = sql();
const put = (owner, k, v) => call(store, 'PUT', owner, { items: { [k]: JSON.stringify(v) } });
const get = async (owner, k) => { const r = await q`SELECT v FROM kv WHERE owner=${owner} AND k=${k}`; return r[0] ? JSON.parse(r[0].v) : null; };
let r = await put('A', 'sc_deleted_clients', { x: 100, y: 200 });
if (r.code !== 200) { r = await call(store, 'POST', 'A', { items: { sc_deleted_clients: JSON.stringify({ x: 100, y: 200 }) } }); }
check('store accepts the write', r.code === 200, JSON.stringify(r));
const M = (r.code === 200 && r.j && r.j.saved) ? 'PUT' : 'POST';
await call(store, M, 'A', { items: { sc_deleted_clients: JSON.stringify({ x: 50, z: 300 }) } });
let d = await get('A', 'sc_deleted_clients');
check('stale device push keeps the other device\'s delete (y) and adds z', d && d.y === 200 && d.z === 300, JSON.stringify(d));
check('newest stamp wins per id (x stays 100)', d && d.x === 100, JSON.stringify(d));
await call(store, M, 'A', { items: { sc_merged_into: JSON.stringify({ a: 'b' }) } });
await call(store, M, 'A', { items: { sc_merged_into: JSON.stringify({ c: 'd' }) } });
d = await get('A', 'sc_merged_into');
check('sc_merged_into unions', d && d.a === 'b' && d.c === 'd', JSON.stringify(d));
await call(store, M, 'B', { items: { sc_deleted_clients: JSON.stringify({ q: 1 }) } });
d = await get('A', 'sc_deleted_clients');
check('another account\'s write does not touch A', d && !d.q, JSON.stringify(d));
await call(store, M, 'A', { items: { sc_settings: JSON.stringify({ a: 1 }) } });
await call(store, M, 'A', { items: { sc_settings: JSON.stringify({ b: 2 }) } });
d = await get('A', 'sc_settings');
check('ordinary keys still overwrite', d && !d.a && d.b === 2, JSON.stringify(d));
// mergeClientRows
await C.ensureClientTables();
await C.upsertClient('A', { id: 'keep', name: 'Pat', data: {} });
await C.upsertClient('A', { id: 'drop', name: 'Pat', data: {} });
await C.upsertClient('B', { id: 'other', name: 'Zed', data: {} });
await q`UPDATE clients SET opened_at=123 WHERE id='drop'`;
const dropTok = (await q`SELECT token FROM clients WHERE id='drop'`)[0].token;
await C.logEvent('A', 'drop', 'form', { a: 1 });
r = await call(clientsApi, 'POST', 'A', { clients: [], merged: [{ from: 'drop', to: 'keep' }], deletedIds: ['drop'] });
check('clients POST ok', r.code === 200, JSON.stringify(r));
const rows = await q`SELECT id, token, opened_at, deleted_at FROM clients WHERE provider_id='A' ORDER BY id`;
const keep = rows.find(x => x.id === 'keep'), drop = rows.find(x => x.id === 'drop');
check('survivor now holds the link the client opened', keep.token === dropTok && Number(keep.opened_at) === 123, JSON.stringify(rows));
check('copy is soft-deleted', !!drop.deleted_at, JSON.stringify(drop));
const ev = await q`SELECT client_id FROM client_events WHERE provider_id='A'`;
check('copy\'s submissions moved to the survivor', ev.length && ev.every(e => e.client_id === 'keep'), JSON.stringify(ev));
const byTok = await C.getClientByToken(dropTok);
check('old link now opens the survivor', byTok && byTok.id === 'keep', JSON.stringify(byTok));
r = await call(clientsApi, 'POST', 'A', { clients: [], merged: [{ from: 'other', to: 'keep' }] });
const other = (await q`SELECT provider_id, deleted_at FROM clients WHERE id='other'`)[0];
check('a forged pair cannot touch another account\'s client', other.provider_id === 'B' && !other.deleted_at, JSON.stringify(other));
console.log('\n' + pass + '/' + (pass + fail) + ' passed'); process.exit(fail ? 1 : 0);
