// sweep2-photo-server-pg: photo/file endpoints, SERVER side, against a REAL PostgreSQL 16 (same pattern as
// scripts/test-client-recover.mjs). The db stub runs psql ASYNC, one process per query, so
// Promise.all genuinely interleaves statements on separate connections, which is how Neon's HTTP
// driver behaves (one implicit transaction per query).
//
//   node scratchpad/sweep-dup-server-pg.mjs
//
// Each check prints CONFIRMED-BUG / SOUND with what it saw. Nothing in api/ or lib/ is modified;
// the real files are copied into a temp tree next to stubs.
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const VERCEL = '/home/user/SlickChart/slickchart-vercel';
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'photosv-'));
const sock = fs.mkdtempSync(path.join(os.tmpdir(), 'photosock-'));
const PORT = '55497';
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const USER = asRoot ? 'pgtest' : os.userInfo().username;
function sh(cmd) { return execFileSync('/bin/sh', ['-c', cmd], { encoding: 'utf8' }); }
function pg(cmd) { return sh(asRoot ? "su " + USER + " -c '" + cmd.replace(/'/g, "'\\''") + "'" : cmd); }
if (asRoot) { try { sh('id ' + USER); } catch (e) { sh('useradd -m ' + USER); } sh('chown -R ' + USER + ' ' + root + ' ' + sock + ' && chmod 777 ' + sock); }
let started = false;
process.on('exit', () => { if (started) { try { pg(PGBIN + '/pg_ctl -D ' + root + '/data stop -m immediate'); } catch (e) {} } });
pg(PGBIN + '/initdb -D ' + root + '/data -U ' + USER + ' --auth=trust >/dev/null');
pg(PGBIN + "/pg_ctl -D " + root + "/data -o '-k " + sock + " -p " + PORT + " -c listen_addresses= -c max_connections=200' -l " + root + "/log start -w >/dev/null");
started = true;

const DBSTUB = `import { execFile } from 'child_process';
let n = 0;
function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return 'ARRAY[' + v.map(lit).join(',') + ']::text[]';
  const tag = 'q' + (n++);
  return '$' + tag + '$' + String(v) + '$' + tag + '$';
}
function run(text) {
  const t = text.trim().replace(/;\\s*$/, '');
  const isSelect = /^select/i.test(t);
  const returning = !isSelect && /\\breturning\\b/i.test(t);
  const q = isSelect ? "SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM (" + t + ") t"
    : returning ? "WITH t AS (" + t + ") SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM t" : t;
  return new Promise((res, rej) => execFile('${PGBIN}/psql',
    ['-h', '${sock}', '-p', '${PORT}', '-U', '${USER}', '-d', 'postgres', '-A', '-t', '-X', '-v', 'ON_ERROR_STOP=1', '-c', q],
    { encoding: 'utf8' }, (err, out) => { if (err) return rej(err); try { res((isSelect || returning) ? JSON.parse(out.trim() || '[]') : []); } catch (e) { res([]); } }));
}
export function sql() { return (strings, ...vals) => { let s = ''; strings.forEach((x, i) => { s += x; if (i < vals.length) s += lit(vals[i]); }); return run(s); }; }
export function dbEnabled() { return true; }
export async function getKVValue(owner, k) { const r = await sql()\`SELECT v FROM kv WHERE owner=\${owner} AND k=\${k}\`; return r[0] ? r[0].v : null; }
export async function ensureTable() { await sql()\`CREATE TABLE IF NOT EXISTS kv (owner text NOT NULL, k text NOT NULL, v text, updated_at timestamptz DEFAULT now(), PRIMARY KEY (owner,k))\`; }
export async function ensureProvidersTable() { await sql()\`CREATE TABLE IF NOT EXISTS providers (id text PRIMARY KEY, email text, name text, created_at bigint)\`; }
`;
const AUTHSTUB = "export function verifyToken(t){ try{ return JSON.parse(Buffer.from(String(t),'base64').toString('utf8')); }catch(e){ return null; } }\nexport async function isSessionValid(){ return true; }\n";
// Real ensureFilesTable/getFileRow, lifted verbatim from lib/db.js so the test runs the shipped SQL.
const realDb = fs.readFileSync(path.join(VERCEL, 'lib', 'db.js'), 'utf8');
const fStart = realDb.indexOf('let _filesReady'), fEnd = realDb.indexOf('// Provider accounts for multi-tenant login');
const FILESPART = realDb.slice(fStart, fEnd);
const lib = path.join(root, 'lib'), api = path.join(root, 'api');
fs.mkdirSync(api, { recursive: true }); fs.mkdirSync(lib, { recursive: true });
fs.writeFileSync(path.join(lib, 'db.js'), DBSTUB + '\n' + FILESPART);
fs.writeFileSync(path.join(lib, 'auth.js'), AUTHSTUB);
fs.writeFileSync(path.join(lib, 'square.js'), 'export async function disconnect(){}\n');
fs.copyFileSync(path.join(VERCEL, 'lib', 'clients.js'), path.join(lib, 'clients.js'));
for (const f of ['guide-file.js', 'delete-account.js']) fs.copyFileSync(path.join(VERCEL, 'api', f), path.join(api, f));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
if (asRoot) sh('chown -R ' + USER + ' ' + root);
process.env.SESSION_SECRET = 'test';
const L = await import(path.join(lib, 'clients.js'));
const D = await import(path.join(lib, 'db.js'));
const fileApi = (await import(path.join(api, 'guide-file.js'))).default;
const delAcct = (await import(path.join(api, 'delete-account.js'))).default;
const q = D.sql();
await L.ensureClientTables(); await D.ensureTable(); await D.ensureProvidersTable(); await D.ensureFilesTable();
await q`INSERT INTO providers (id,email,name) VALUES ('prov_A','a@x.com','A'),('prov_B','b@x.com','B') ON CONFLICT DO NOTHING`;
const tok = (u) => Buffer.from(JSON.stringify({ u, e: u + '@x.com', sid: 's' })).toString('base64');
const TA = tok('prov_A'), TB = tok('prov_B');
async function call(h, method, { body, token, query } = {}) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() {} };
  await h({ method, headers: { authorization: token ? 'Bearer ' + token : '' }, query: query || {}, body: body || {} }, res);
  return res;
}
function report(name, bug, detail) { console.log((bug ? 'CONFIRMED-BUG  ' : 'SOUND          ') + name + '\n               ' + JSON.stringify(detail)); }
const IMG = 'data:image/jpeg;base64,' + 'Q'.repeat(2000);

// 1. Provider turns photo sharing OFF ("Progress photos hidden from their app").
//    _progressPhotoRefs() returns [] when !_photosShared(c), so the next sync posts progressPhotos: [].
{
  await call(fileApi, 'PUT', { token: TA, body: { id: 'ph_share1', type: 'image/jpeg', data: IMG } });
  await L.upsertClient('prov_A', { id: 'c_alice', name: 'Alice', email: 'al@x.com', data: { _uAt: 1000, progressPhotos: [{ pid: 'ph_share1', phase: 'before', ts: 1 }] } });
  const tk = (await q`SELECT token FROM clients WHERE id='c_alice'`)[0].token;
  const before = await call(fileApi, 'GET', { query: { id: 'ph_share1', t: tk } });
  await L.upsertClient('prov_A', { id: 'c_alice', name: 'Alice', email: 'al@x.com', data: { _uAt: 2000, progressPhotos: [] } });   // sharing off, NEWER stamp
  const row = (await q`SELECT data FROM clients WHERE id='c_alice'`)[0].data;
  const after = await call(fileApi, 'GET', { query: { id: 'ph_share1', t: tk } });
  report('unshare: client still listed + can fetch photo after provider turned sharing OFF', after.code === 200 || (row.progressPhotos || []).length > 0,
    { fetchBefore: before.code, storedProgressPhotosAfterUnshare: row.progressPhotos, fetchAfter: after.code });
}

// 2. Re-upload of an existing photo in pieces (>600000 chars) knocks the complete server copy offline.
{
  // psql's single-argument limit (128KB) stops us sending a real 1.3MB body; the server does not care
  // about piece size, so the same three-piece sequence with small pieces exercises the same SQL.
  const BIG = 'data:image/jpeg;base64,' + 'Z'.repeat(30000);
  await call(fileApi, 'PUT', { token: TA, body: { id: 'ph_big1', type: 'image/jpeg', data: BIG } });
  const ok1 = await call(fileApi, 'GET', { token: TA, query: { id: 'ph_big1' } });
  // A second upload of the same pid (recovered photo not marked backed-up / sc_photo_backed > 6000 cap / second device)
  // gets piece 0 in, then the connection drops.
  await call(fileApi, 'PUT', { token: TA, body: { id: 'ph_big1', type: 'image/jpeg', part: { index: 0, total: 3, data: BIG.slice(0, 10000) } } });
  const mid = await call(fileApi, 'GET', { token: TA, query: { id: 'ph_big1' } });
  const list = await call(fileApi, 'GET', { token: TA, query: { list: 'photos' } });
  const ent = (list.body.photos || []).find(x => x.id === 'ph_big1');
  report('chunked re-upload: an interrupted re-send of an already-complete photo makes it unfetchable (404)', ok1.code === 200 && mid.code === 404,
    { firstGet: ok1.code, afterPiece0: mid.code, recoveryListStillShowsIt: !!ent, listedSize: ent && ent.size });
}

// 3. Tenant isolation on file ids.
{
  await call(fileApi, 'PUT', { token: TA, body: { id: 'ph_secretA', type: 'image/jpeg', data: IMG } });
  const bGet = await call(fileApi, 'GET', { token: TB, query: { id: 'ph_secretA' } });
  const bList = await call(fileApi, 'GET', { token: TB, query: { list: 'photos' } });
  const noAuth = await call(fileApi, 'GET', { query: { id: 'ph_secretA' } });
  await L.upsertClient('prov_B', { id: 'c_bob', name: 'Bob', data: { progressPhotos: [{ pid: 'ph_secretA' }] } });   // B's client blob names A's id
  const tkB = (await q`SELECT token FROM clients WHERE id='c_bob'`)[0].token;
  const viaBClient = await call(fileApi, 'GET', { query: { id: 'ph_secretA', t: tkB } });
  await L.upsertClient('prov_A', { id: 'c_carl', name: 'Carl', data: {} });
  const tkC = (await q`SELECT token FROM clients WHERE id='c_carl'`)[0].token;
  const otherClient = await call(fileApi, 'GET', { query: { id: 'ph_secretA', t: tkC } });
  const bPut = await call(fileApi, 'PUT', { token: TB, body: { id: 'ph_secretA', type: 'image/jpeg', data: 'data:image/jpeg;base64,BBBB' } });
  const aStill = await call(fileApi, 'GET', { token: TA, query: { id: 'ph_secretA' } });
  const bDel = await call(fileApi, 'DELETE', { token: TB, query: { id: 'ph_secretA' } });
  const aStill2 = await call(fileApi, 'GET', { token: TA, query: { id: 'ph_secretA' } });
  const bad = bGet.code === 200 || noAuth.code === 200 || viaBClient.code === 200 || otherClient.code === 200 || (bList.body.photos || []).some(x => x.id === 'ph_secretA') || !aStill.body.file || aStill.body.file.data !== IMG || !aStill2.body.file;
  report('tenant isolation: other provider / other provider\'s client / sibling client / no token cannot read, overwrite or delete', bad,
    { bGet: bGet.code, noAuth: noAuth.code, viaBClient: viaBClient.code, siblingClient: otherClient.code, bPut: bPut.code, aIntactAfterBPut: aStill.body.file && aStill.body.file.data === IMG, aIntactAfterBDel: !!(aStill2.body.file) });
}

// 4. Account deletion: are the provider's photo/file bytes deleted?
{
  const n0 = (await q`SELECT count(*)::int AS n FROM files WHERE owner='prov_A'`)[0].n;
  const r = await call(delAcct, 'POST', { token: TA });
  const n1 = (await q`SELECT count(*)::int AS n FROM files WHERE owner='prov_A'`)[0].n;
  report('delete-account leaves every client photo / guide file in the files table', n1 > 0, { status: r.code, filesBefore: n0, filesAfter: n1 });
}
