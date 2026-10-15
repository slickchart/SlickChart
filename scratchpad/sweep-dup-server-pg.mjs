// Duplicate-client sweep, SERVER side, against a REAL PostgreSQL 16 (same pattern as
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
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dupsv-'));
const sock = fs.mkdtempSync(path.join(os.tmpdir(), 'dupsock-'));
const PORT = '55491';
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
export async function ensureFilesTable() {}
`;
const AUTHSTUB = "export function verifyToken(t){ try{ return JSON.parse(Buffer.from(String(t),'base64').toString('utf8')); }catch(e){ return null; } }\nexport async function isSessionValid(){ return true; }\n";
const CONSULTSTUB = "export async function getProviderBySlug(s){ return s==='ashley' ? {id:'prov_A', email:'', name:'A'} : null; }\n";
const BOOKSTUB = `export const DAY_KEYS=['sun','mon','tue','wed','thu','fri','sat'];
export async function getBookingConfig(){ return {on:true, mode:'request', leadHours:0, horizonDays:400, emailGuest:false, emailMe:false}; }
export async function getHours(){ const o={}; DAY_KEYS.forEach(k=>o[k]={open:true,start:'00:00',end:'23:59'}); return o; }
export async function getServices(){ return [{name:'Facial'}]; }
export function pickService(s){ return s[0]; }
export function serviceMins(){ return 60; }
export function serviceDeposit(){ return 0; }
export async function depositLinkFor(){ return ''; }
export async function openSlots(){ return null; }
export function toMins(s){ const m=String(s||'').match(/^(\\d{1,2}):(\\d{2})$/); return m? (+m[1])*60+(+m[2]) : null; }
export function isoDay(d){ return /^\\d{4}-\\d{2}-\\d{2}$/.test(String(d||''))?String(d):''; }
`;
const EMAILSTUB = "export async function sendEmail(){}\nexport function trustedOrigin(){return 'https://x';}\nexport const bookingGuestEmailHtml=()=>'',bookingGuestEmailText=()=>'',bookingProviderEmailHtml=()=>'',bookingProviderEmailText=()=>'';\n";

const lib = path.join(root, 'lib'), api = path.join(root, 'api'), adm = path.join(api, 'admin');
fs.mkdirSync(adm, { recursive: true }); fs.mkdirSync(lib, { recursive: true });
fs.writeFileSync(path.join(lib, 'db.js'), DBSTUB);
fs.writeFileSync(path.join(lib, 'auth.js'), AUTHSTUB);
fs.writeFileSync(path.join(lib, 'consult.js'), CONSULTSTUB);
fs.writeFileSync(path.join(lib, 'booking.js'), BOOKSTUB);
fs.writeFileSync(path.join(lib, 'email.js'), EMAILSTUB);
for (const f of ['clients.js', 'kv-history.js']) fs.copyFileSync(path.join(VERCEL, 'lib', f), path.join(lib, f));
fs.copyFileSync(path.join(VERCEL, 'api', 'clients.js'), path.join(api, 'clients.js'));
fs.copyFileSync(path.join(VERCEL, 'api', 'book-request.js'), path.join(api, 'book-request.js'));
fs.copyFileSync(path.join(VERCEL, 'api', 'admin', 'client-recover.js'), path.join(adm, 'client-recover.js'));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
if (asRoot) sh('chown -R ' + USER + ' ' + root);

process.env.SESSION_SECRET = 'test';
process.env.FOUNDER_EMAILS = 'founder@x.com';
const L = await import(path.join(lib, 'clients.js'));
const D = await import(path.join(lib, 'db.js'));
const clientsApi = (await import(path.join(api, 'clients.js'))).default;
const bookApi = (await import(path.join(api, 'book-request.js'))).default;
const recoverApi = (await import(path.join(adm, 'client-recover.js'))).default;
const q = D.sql();
await L.ensureClientTables(); await D.ensureTable(); await D.ensureProvidersTable();
await q`INSERT INTO providers (id,email,name) VALUES ('prov_A','a@x.com','A'),('prov_B','b@x.com','B') ON CONFLICT DO NOTHING`;

const tok = (u, e) => Buffer.from(JSON.stringify({ u, e: e || (u + '@x.com'), sid: 's' })).toString('base64');
async function call(h, method, body, token, query) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() {} };
  await h({ method, headers: { authorization: token ? 'Bearer ' + token : '', 'x-real-ip': String(Math.random()) }, query: query || {}, body: body || {} }, res);
  return res;
}
const out = [];
function report(name, bug, detail) { out.push({ name, bug, detail }); console.log((bug ? 'CONFIRMED-BUG  ' : 'SOUND          ') + name + '\n               ' + JSON.stringify(detail)); }
const live = async (p, extra) => (await q`SELECT id, name, email, deleted_at FROM clients WHERE provider_id=${p} AND deleted_at IS NULL ORDER BY id`).filter(extra || (() => true));
const FUT = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

// 1. Public booking, NEW person, double-submit (two concurrent requests).
{
  const b = { slug: 'ashley', name: 'Rae New', email: 'rae@ex.com', date: FUT, time: '10:00' };
  await Promise.all([call(bookApi, 'POST', b), call(bookApi, 'POST', b), call(bookApi, 'POST', b)]);
  const rows = await live('prov_A', r => r.email === 'rae@ex.com');
  report('book-request: 3 concurrent submits for one new email create ' + rows.length + ' client rows', rows.length > 1, rows.map(r => r.id));
}

// 2. Public booking for an EXISTING client: is the stored chart blob / name overwritten?
{
  await L.upsertClient('prov_A', { id: 'c1700000000001', name: 'Jane Doe', email: 'jane@ex.com', phone: '555',
    data: { profile: { skin: 'Dry', allergies: 'Latex' }, aftercare: ['spf'], providerName: 'Ashley', summaries: [{ id: 's1' }] } });
  const r = await call(bookApi, 'POST', { slug: 'ashley', name: 'J', email: 'JANE@ex.com', date: FUT, time: '11:00' });
  const row = (await q`SELECT id, name, data FROM clients WHERE id='c1700000000001'`)[0];
  const d = row.data;
  const lost = !d.aftercare || !(d.profile && d.profile.skin) || !d.providerName;
  report('book-request on existing client (unauthenticated) overwrites name/data blob', lost || row.name !== 'Jane Doe',
    { status: r.code, name: row.name, keys: Object.keys(d), profile: d.profile, summariesKept: Array.isArray(d.summaries) && d.summaries.length });
  const dup = await live('prov_A', x => (x.email || '').toLowerCase() === 'jane@ex.com');
  report('book-request matches existing client by email case-insensitively (no dup)', dup.length !== 1, dup.map(x => x.id));
}

// 3. Booking with whitespace-stored email, or phone-only match.
{
  await L.upsertClient('prov_A', { id: 'c1700000000002', name: 'Pat Space', email: 'pat@ex.com ', phone: '(555) 222-3333', data: {} });
  await call(bookApi, 'POST', { slug: 'ashley', name: 'Pat Space', email: 'pat@ex.com', date: FUT, time: '12:00' });
  const rows = await live('prov_A', x => (x.email || '').trim().toLowerCase() === 'pat@ex.com');
  report('book-request: stored email with trailing space is not matched -> duplicate', rows.length > 1, rows.map(r => r.id));
  await L.upsertClient('prov_A', { id: 'c1700000000003', name: 'Sam Phone', email: '', phone: '5554443333', data: {} });
  await call(bookApi, 'POST', { slug: 'ashley', name: 'Sam Phone', email: 'sam@ex.com', phone: '555-444-3333', date: FUT, time: '13:00' });
  const sp = await live('prov_A', x => x.name === 'Sam Phone');
  report('book-request: existing client known by phone only (no email) gets a second row', sp.length > 1, sp.map(r => r.id));
}

// 4. deletedIds: owner-scoped, and a later stale push cannot resurrect.
{
  await L.upsertClient('prov_A', { id: 'c1700000000010', name: 'Dup One', email: 'd@ex.com', data: {} });
  await L.upsertClient('prov_B', { id: 'c1700000000011', name: 'B client', email: 'bb@ex.com', data: {} });
  const r1 = await call(clientsApi, 'POST', { clients: [], deletedIds: ['c1700000000010', 'c1700000000011'] }, tok('prov_A'));
  const bRow = await live('prov_B', x => x.id === 'c1700000000011');
  report('deletedIds cannot touch another provider\'s row', bRow.length !== 1, { status: r1.code, bStillLive: bRow.length });
  const r2 = await call(clientsApi, 'POST', { clients: [{ id: 'c1700000000010', name: 'Dup One', email: 'd@ex.com', data: { x: 1 } }] }, tok('prov_A'));
  const back = await live('prov_A', x => x.id === 'c1700000000010');
  report('stale push of a soft-deleted id does not resurrect it', back.length !== 0, { resp: r2.body && r2.body.clients });
}

// 5. Purge (hard delete) removes the server tombstone; a stale push then re-inserts it LIVE.
{
  await L.upsertClient('prov_A', { id: 'c1700000000020', name: 'Merged Away', email: 'm@ex.com', data: {} });
  await L.markClientDeleted('prov_A', 'c1700000000020');
  await q`INSERT INTO kv (owner,k,v) VALUES ('prov_A','sc_clients','{}') ON CONFLICT (owner,k) DO NOTHING`;
  const p = await call(recoverApi, 'POST', { purgeClasses: ['removed'], confirm: true }, tok('founder', 'founder@x.com'), { email: 'a@x.com' });
  const gone = (await q`SELECT id FROM clients WHERE id='c1700000000020'`).length === 0;
  await call(clientsApi, 'POST', { clients: [{ id: 'c1700000000020', name: 'Merged Away', email: 'm@ex.com', data: {} }] }, tok('prov_A'));
  const back = await live('prov_A', x => x.id === 'c1700000000020');
  report('after founder purge of a removed row, a stale device push re-creates it as a LIVE client', gone && back.length === 1,
    { purgeStatus: p.code, purged: p.body && p.body.purged, hardDeleted: gone, liveAgain: back.length });
}

// 6. Same Square customer under two random ids: any server uniqueness?
{
  await call(clientsApi, 'POST', { clients: [
    { id: 'c1700000000030', name: 'Sq Person', email: 'sq@ex.com', data: { squareId: 'SQ1' } },
    { id: 'c1700000000031', name: 'Sq Person', email: 'sq@ex.com', data: { squareId: 'SQ1' } }] }, tok('prov_A'));
  const rows = await live('prov_A', x => x.email === 'sq@ex.com');
  report('server accepts the same person (same email + squareId) under 2 ids, no uniqueness', rows.length > 1, rows.map(r => r.id));
}

// 7. Concurrent upsert of ONE new id: one row, one token.
{
  const c = { id: 'c1700000000040', name: 'Race', email: 'race@ex.com', data: {} };
  const rs = await Promise.all([0, 1, 2, 3].map(() => L.upsertClient('prov_A', c).catch(e => ({ err: e.code || e.message }))));
  const rows = await q`SELECT token FROM clients WHERE id='c1700000000040'`;
  const toks = new Set(rs.map(r => r.token));
  report('concurrent upsert of the same new id -> one row, every caller gets the stored token', rows.length !== 1 || toks.size !== 1 || !toks.has(rows[0].token), { rows: rows.length, tokens: [...toks], errs: rs.filter(r => r.err) });
}

// 8. Cross-account id collision: id_taken, no clobber.
{
  await L.upsertClient('prov_B', { id: 'c1700000000050', name: 'B Own', email: 'bown@ex.com', data: { k: 1 } });
  let err = null; try { await L.upsertClient('prov_A', { id: 'c1700000000050', name: 'A Intruder', email: 'x@ex.com', data: {} }); } catch (e) { err = e.code; }
  const row = (await q`SELECT provider_id, name FROM clients WHERE id='c1700000000050'`)[0];
  report('cross-account id collision does not clobber (id_taken)', row.provider_id !== 'prov_B' || row.name !== 'B Own', { err, row });
}

// 9. Race: deletedIds and a stale upsert of the same id land together.
{
  await L.upsertClient('prov_A', { id: 'c1700000000060', name: 'Racy', email: 'racy@ex.com', data: { v: 1 } });
  await Promise.all([
    call(clientsApi, 'POST', { clients: [], deletedIds: ['c1700000000060'] }, tok('prov_A')),
    call(clientsApi, 'POST', { clients: [{ id: 'c1700000000060', name: 'Racy', email: 'racy@ex.com', data: { v: 2 } }] }, tok('prov_A'))]);
  const row = (await q`SELECT deleted_at FROM clients WHERE id='c1700000000060'`)[0];
  report('delete racing a stale upsert still ends deleted', !row.deleted_at, row);
}

// 10. Founder restoreIds on a merged-away copy while the survivor is live -> two live copies.
{
  await L.upsertClient('prov_A', { id: 'c1700000000070', name: 'Keep Me', email: 'k@ex.com', data: {} });
  await L.upsertClient('prov_A', { id: 'c1700000000071', name: 'Keep Me', email: 'k@ex.com', data: {} });
  await L.markClientDeleted('prov_A', 'c1700000000071');
  const r = await call(recoverApi, 'POST', { restoreIds: ['c1700000000071'] }, tok('founder', 'founder@x.com'), { email: 'a@x.com' });
  const rows = await live('prov_A', x => x.email === 'k@ex.com');
  report('founder restoreIds un-deletes a merged-away copy with no check for a live twin (by design; unconfirmed as a bug)', rows.length > 1, { restored: r.body && r.body.restored, live: rows.map(x => x.id) });
}
console.log('\n' + out.filter(x => x.bug).length + ' confirmed issue(s) of ' + out.length + ' checks');
process.exit(0);
