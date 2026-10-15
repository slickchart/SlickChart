// Client-facing endpoints against a REAL PostgreSQL 16 (setup copied from sweep-dup-server-pg.mjs).
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
const PORT = '55493';
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
const AUTHSTUB = "export function verifyToken(t){ try{ return JSON.parse(Buffer.from(String(t),'base64').toString('utf8')); }catch(e){ return null; } }\nexport async function isSessionValid(){ return true; }\n\nexport async function sessionFromReq(req){ const h=(req&&req.headers&&req.headers.authorization)||''; const t=h.startsWith('Bearer ')?h.slice(7):''; try{ const p=JSON.parse(Buffer.from(String(t),'base64').toString('utf8')); return p&&p.u?p:null; }catch(e){ return null; } }\nexport async function sessionOk(){ return true; }";
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
const EMAILSTUB = "export const SENT=[]; export async function sendEmail(m){ SENT.push(m); }\nexport function trustedOrigin(){return 'https://x';}\nexport const bookingGuestEmailHtml=()=>'',bookingGuestEmailText=()=>'',bookingProviderEmailHtml=()=>'',bookingProviderEmailText=()=>'';\n";

const lib = path.join(root, 'lib'), api = path.join(root, 'api'), adm = path.join(api, 'admin');
fs.mkdirSync(adm, { recursive: true }); fs.mkdirSync(lib, { recursive: true });
fs.writeFileSync(path.join(lib, 'db.js'), DBSTUB);
fs.writeFileSync(path.join(lib, 'auth.js'), AUTHSTUB);
fs.writeFileSync(path.join(lib, 'consult.js'), CONSULTSTUB);
fs.writeFileSync(path.join(lib, 'booking.js'), BOOKSTUB);
fs.writeFileSync(path.join(lib, 'email.js'), EMAILSTUB);
for (const f of ['clients.js']) fs.copyFileSync(path.join(VERCEL, 'lib', f), path.join(lib, f));
// real scrypt hashing for client-code
fs.writeFileSync(path.join(lib, 'auth.js'), fs.readFileSync(path.join(VERCEL, 'lib', 'auth.js'), 'utf8'));
fs.writeFileSync(path.join(lib, 'fcm.js'), 'export async function sendNativeToProvider(){ return 0; }\n');
for (const f of ['book-request.js', 'client-code.js', 'client-submit.js', 'client-prefs.js', 'client-data.js', 'client-delete.js']) fs.copyFileSync(path.join(VERCEL, 'api', f), path.join(api, f));
fs.writeFileSync(path.join(lib, 'booking.js'), BOOKSTUB + '\nexport async function listServices(){ return []; }\n');
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
if (asRoot) sh('chown -R ' + USER + ' ' + root);

process.env.SESSION_SECRET = 'test';
process.env.FOUNDER_EMAILS = 'founder@x.com';

const L = await import(path.join(lib, 'clients.js'));
const D = await import(path.join(lib, 'db.js'));
const E = await import(path.join(lib, 'email.js'));
const A = n => import(path.join(api, n)).then(m => m.default);
const bookApi = await A('book-request.js'), codeApi = await A('client-code.js'), submitApi = await A('client-submit.js');
const prefsApi = await A('client-prefs.js'), dataApi = await A('client-data.js');
const q = D.sql();
await L.ensureClientTables(); await D.ensureTable();
async function call(h, method, body, query, ip) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() {}, send(b) { this.body = b; return this; } };
  await h({ method, headers: { 'x-real-ip': ip || String(Math.random()) }, query: query || {}, body: body || {} }, res);
  return res;
}
const out = [];
function report(name, bug, detail) { out.push({ name, bug }); console.log((bug ? 'CONFIRMED-BUG  ' : 'SOUND          ') + name + '\n               ' + JSON.stringify(detail).slice(0, 500)); }
const FUT = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

// 1. Public booking: a retry after a lost reply / a second tab = TWO booking requests.
{
  const b = { slug: 'ashley', name: 'Rae New', email: 'rae@ex.com', date: FUT, time: '10:00' };
  await call(bookApi, 'POST', b); await call(bookApi, 'POST', b);
  const ev = await q`SELECT id FROM client_events WHERE provider_id='prov_A' AND kind='booking' AND payload->>'time'='10:00'`;
  report('book-request: same booking sent twice (retry / two tabs) -> ' + ev.length + ' booking events', ev.length > 1, ev.map(r => r.id));
}

// 2. client-code VERIFY: MAX_ATTEMPTS is read-then-increment, so concurrent guesses all get a scrypt check.
{
  await L.upsertClient('prov_A', { id: 'c_code1', name: 'Code Person', email: 'code@ex.com', data: {} });
  await call(codeApi, 'POST', { email: 'code@ex.com' });
  const sentCode = (String((E.SENT.find(m => m.to === 'code@ex.com') || {}).text || '').match(/\d{6}/) || [])[0];
  const wrong = Array.from({ length: 40 }, (_, i) => String((Number(sentCode) + 1 + i) % 1000000).padStart(6, '0'));
  const rs = await Promise.all(wrong.map(c => call(codeApi, 'POST', { email: 'code@ex.com', code: c })));
  const checked = rs.filter(r => r.body && /didn.t match/.test(r.body.error || '')).length;
  report('client-code: 40 concurrent wrong guesses on one code -> ' + checked + ' were actually checked (cap is 6)', checked > 6, { checked, attempts: (await q`SELECT attempts FROM client_login_codes WHERE email='code@ex.com'`)[0] });
}

// 3. client-submit idempotency: same _idem twice = one event; scoped per client.
{
  const a = await L.upsertClient('prov_A', { id: 'c_sub1', name: 'Sub One', email: 's1@ex.com', data: {} });
  const b = await L.upsertClient('prov_A', { id: 'c_sub2', name: 'Sub Two', email: 's2@ex.com', data: {} });
  await call(submitApi, 'POST', { t: a.token, kind: 'checkin', payload: { _idem: 'K1', notes: 'x' } });
  await call(submitApi, 'POST', { t: a.token, kind: 'checkin', payload: { _idem: 'K1', notes: 'x' } });
  await call(submitApi, 'POST', { t: b.token, kind: 'checkin', payload: { _idem: 'K1', notes: 'y' } });
  const n1 = (await q`SELECT id FROM client_events WHERE client_id='c_sub1'`).length, n2 = (await q`SELECT id FROM client_events WHERE client_id='c_sub2'`).length;
  report('client-submit: duplicate _idem collapses, other client unaffected', !(n1 === 1 && n2 === 1), { n1, n2 });
  // long client ids (sq_ + 26-char Square id) are truncated into the scope: same key from two clients of the same provider?
  const long1 = 'sq_' + 'ABCDEFGHJKMNPQRSTVWXYZ0123' , long2 = 'sq_' + 'ABCDEFGHJKMNPQRSTVWXYZ0124';
  const pl = 'p_0123456789abcdef';
  const c1 = await L.upsertClient(pl, { id: long1, name: 'L1', email: 'l1@ex.com', data: {} });
  const c2 = await L.upsertClient(pl, { id: long2, name: 'L2', email: 'l2@ex.com', data: {} });
  await call(submitApi, 'POST', { t: c1.token, kind: 'message', payload: { _idem: 'SAMEKEY', text: 'one' } });
  await call(submitApi, 'POST', { t: c2.token, kind: 'message', payload: { _idem: 'SAMEKEY', text: 'two' } });
  const m2 = (await q`SELECT id FROM client_events WHERE client_id=${long2}`).length;
  report('client-submit: idem scope keeps two sq_ clients of a p_ provider apart (scope truncation)', m2 !== 1, { m2 });
}

// 4. client-prefs is a blind overwrite: two devices (or the fresh-device PUT) replace the whole blob.
{
  const c = await L.upsertClient('prov_A', { id: 'c_pref', name: 'Pref', email: 'p@ex.com', data: {} });
  await call(prefsApi, 'PUT', { t: c.token, prefs: { hiddenSummaries: { s1: 1 }, contact: { phone: '1' } } }, { t: c.token });
  await call(prefsApi, 'PUT', { t: c.token, prefs: { notif: { enabled: true } } }, { t: c.token });
  const g = await call(prefsApi, 'GET', {}, { t: c.token });
  report('client-prefs PUT replaces the whole blob (hiddenSummaries/contact from device 1 erased by device 2)', !(g.body.prefs.hiddenSummaries), g.body.prefs);
}

// 5. A removed (provider-deleted) client's link stops reading AND writing.
{
  const c = await L.upsertClient('prov_A', { id: 'c_gone', name: 'Gone', email: 'g@ex.com', data: { summaries: [{ id: 's' }] } });
  await L.markClientDeleted('prov_A', 'c_gone');
  const d = await call(dataApi, 'GET', {}, { t: c.token });
  const s = await call(submitApi, 'POST', { t: c.token, kind: 'message', payload: { text: 'hi' } });
  const p = await call(prefsApi, 'PUT', { t: c.token, prefs: { a: 1 } }, { t: c.token });
  report('deleted client link: data/submit/prefs all refused', !(d.code === 404 && s.code === 404 && p.code === 404), { data: d.code, submit: s.code, prefs: p.code });
}

// 6. Merge where BOTH links were opened: the copy's link goes dead (its user sees "This link isn't working").
{
  const keep = await L.upsertClient('prov_A', { id: 'c_keep', name: 'Mo', email: 'mo@ex.com', data: {} });
  const copy = await L.upsertClient('prov_A', { id: 'c_copy', name: 'Mo', email: 'mo2@ex.com', data: {} });
  await L.markOpened(keep.token); await L.markOpened(copy.token);
  await L.mergeClientRows('prov_A', 'c_copy', 'c_keep'); await L.markClientDeleted('prov_A', 'c_copy');
  const d = await call(dataApi, 'GET', {}, { t: copy.token });
  report('merge with both links opened: the merged-away link 404s (client must be re-sent a link) [design gap]', d.code === 404, { code: d.code });
}
console.log('\n' + out.filter(x => x.bug).length + ' confirmed issue(s) of ' + out.length + ' checks');
process.exit(0);
