// 2026-11-18 growth sweep, server side, against a real PostgreSQL 16.
//  - cron-automations / cron-events / provider reminders read ONE account at a time (one bloated
//    sc_autos used to fail the run for everyone) and send a repeated automation once, not per copy.
//  - a chunked file piece sent twice (retry after a lost answer) is not appended twice.
//  - the same consult request sent twice within ten minutes is saved once.
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
const src = fs.readFileSync(new URL('./sweep-dup-server-pg.mjs', import.meta.url), 'utf8');
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grow-')), sock = fs.mkdtempSync(path.join(os.tmpdir(), 'growsock-'));
const PORT = '55498', asRoot = process.getuid() === 0, USER = asRoot ? 'pgtest' : os.userInfo().username;
const sh = c => execFileSync('/bin/sh', ['-c', c], { encoding: 'utf8' });
const pg = c => sh(asRoot ? "su " + USER + " -c '" + c.replace(/'/g, "'\\''") + "'" : c);
if (asRoot) { try { sh('id ' + USER); } catch (e) { sh('useradd -m ' + USER); } sh('chown -R ' + USER + ' ' + root + ' ' + sock + ' && chmod 777 ' + sock); }
let started = false;
process.on('exit', () => { if (started) { try { pg(PGBIN + '/pg_ctl -D ' + root + '/data stop -m immediate'); } catch (e) {} } });
pg(PGBIN + '/initdb -D ' + root + '/data -U ' + USER + ' --auth=trust >/dev/null');
pg(PGBIN + "/pg_ctl -D " + root + "/data -o '-k " + sock + " -p " + PORT + " -c listen_addresses=' -l " + root + "/log start -w >/dev/null");
started = true;
let stub = src.slice(src.indexOf('const DBSTUB = `') + 16, src.indexOf('`;\nconst AUTHSTUB')).replace(/\$\{PGBIN\}/g, PGBIN).replace(/\$\{sock\}/g, sock).replace(/\$\{PORT\}/g, PORT).replace(/\$\{USER\}/g, USER).replace(/\\`/g, '`').replace(/\\\$/g, '$').replace(/\\\\/g, '\\');
// The real files table shape (lib/db.js ensureFilesTable), including the new staging_next column.
stub = stub.replace('export async function ensureFilesTable() {}', `export async function ensureFilesTable() {
  await sql()\`CREATE TABLE IF NOT EXISTS files (owner text NOT NULL, id text NOT NULL, name text, type text, data text, updated_at timestamptz DEFAULT now(), PRIMARY KEY (owner, id))\`;
  await sql()\`ALTER TABLE files ADD COLUMN IF NOT EXISTS complete boolean NOT NULL DEFAULT true\`;
  await sql()\`ALTER TABLE files ADD COLUMN IF NOT EXISTS staging text\`;
  await sql()\`ALTER TABLE files ADD COLUMN IF NOT EXISTS staging_next integer\`;
}
export async function readKeyAllOwners(q, key) {
  const rows = await q\`SELECT owner, v FROM kv WHERE k = \${key} AND coalesce(octet_length(v), 0) <= 1000000\`;
  const big = await q\`SELECT owner FROM kv WHERE k = \${key} AND octet_length(v) > 1000000\`;
  for (const b of big) { const r = await q\`SELECT owner, v FROM kv WHERE owner = \${b.owner} AND k = \${key}\`; if (r[0]) rows.push(r[0]); }
  return rows;
}
export async function getFileRow(owner, id) { const r = await sql()\`SELECT id, name, type, data FROM files WHERE owner = \${owner} AND id = \${id} AND complete IS NOT FALSE\`; return r[0] || null; }`);
const lib = path.join(root, 'lib'), api = path.join(root, 'api'); fs.mkdirSync(lib); fs.mkdirSync(api);
fs.writeFileSync(path.join(lib, 'db.js'), stub);
fs.writeFileSync(path.join(lib, 'auth.js'), "export function verifyToken(t){ try{ return JSON.parse(Buffer.from(String(t),'base64').toString('utf8')); }catch(e){ return null; } }\nexport async function isSessionValid(){ return true; }\n");
fs.writeFileSync(path.join(lib, 'clients.js'), `
export const sent = []; const claims = new Set();
export async function ensureClientTables() {}
export async function listClients(owner) { return [{ id: owner + '_c1', name: 'Amy A' }, { id: owner + '_c2', name: 'Bea B' }]; }
export async function claimReminder(cid, key) { const k = cid + '|' + key; if (claims.has(k)) return false; claims.add(k); return true; }
export async function logEvent(owner, cid, kind, payload) { sent.push({ owner, cid, kind, text: payload && payload.text }); }
export async function listPushSubs() { return []; } export async function deletePushSub() {}
export function spaceUrl() { return ''; } export async function getClientToken() { return ''; } export async function wantsPush() { return false; }
export async function getClientByToken() { return null; }
`);
fs.writeFileSync(path.join(lib, 'push.js'), 'export function pushConfigured(){return false;} export async function sendPushToAll(){return 0;}\n');
fs.writeFileSync(path.join(lib, 'fcm.js'), 'export function nativePushConfigured(){return false;} export async function sendNativeToClient(){return 0;}\n');
fs.writeFileSync(path.join(lib, 'cron-runs.js'), 'export function withCronRun(n, h){ return h; }\n');
const REAL = new URL('../slickchart-vercel/', import.meta.url).pathname;
for (const f of ['provider-push.js', 'consult.js']) fs.copyFileSync(REAL + 'lib/' + f, path.join(lib, f));
for (const f of ['cron-automations.js', 'cron-events.js', 'guide-file.js']) fs.copyFileSync(REAL + 'api/' + f, path.join(api, f));

const D = await import(path.join(lib, 'db.js'));
const q = D.sql(); await D.ensureTable();
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  — ' + JSON.stringify(d) : '')); ok ? pass++ : fail++; };
const put = (o, k, v) => q`INSERT INTO kv (owner,k,v) VALUES (${o},${k},${typeof v === 'string' ? v : JSON.stringify(v)}) ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v`;
const mkRes = () => { const r = { code: 0, body: null }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.setHeader = () => {}; r.end = () => r; return r; };
process.env.CRON_SECRET = 'cs';
const cronReq = { headers: { authorization: 'Bearer cs' }, query: {} };

// ── cron-automations: a due automation stored 300 times sends ONCE per client ──────────────────
const due = { id: 'a1', name: 'Promo', msg: 'Hi {client_name}', on: true, sendAt: Date.now() - 60000, repeatEvery: 'once' };
await put('provA', 'sc_autos', Array(300).fill(due));
await put('provB', 'sc_autos', [Object.assign({}, due, { id: 'b1' })]);
await put('provC', 'sc_autos', '{not json');                      // a broken value only skips its own owner
const C = await import(path.join(lib, 'clients.js'));
const CA = (await import(path.join(api, 'cron-automations.js'))).default;
let res = mkRes(); await CA(cronReq, res);
const aSent = C.sent.filter(s => s.owner === 'provA').length, bSent = C.sent.filter(s => s.owner === 'provB').length;
check('cron-automations runs', res.code === 200, res.body);
check('300 copies of one due automation: each client messaged once', aSent === 2, aSent);
check('the other account is still served', bSent === 2, bSent);
check('the summary counts the automation once, not 300 times', res.body && res.body.automations === 2, res.body);

// ── cron-events: same, reading her charts only for her own account ─────────────────────────────
C.sent.length = 0;
// A zone where it is 9am right now, so the morning-only sender runs whatever hour the test runs.
const hUtc = new Date().getUTCHours(); let off = 9 - hUtc; if (off > 14) off -= 24; if (off < -12) off += 24;
const TZ = off === 0 ? 'UTC' : 'Etc/GMT' + (off > 0 ? '-' + off : '+' + (-off));
const loc = new Date(Date.now() + off * 3600000);
const md = String(loc.getUTCMonth() + 1).padStart(2, '0') + '-' + String(loc.getUTCDate()).padStart(2, '0');
await q`CREATE TABLE IF NOT EXISTS clients (id text PRIMARY KEY, provider_id text, token text, deleted_at timestamptz)`;
await q`INSERT INTO clients (id, provider_id) VALUES ('ca1','provA'), ('cb1','provB') ON CONFLICT DO NOTHING`;
await put('provA', 'sc_clients', { ca1: { name: 'Amy A', birthday: '1990-' + md } });
await put('provB', 'sc_clients', { cb1: { name: 'Bea B', birthday: '1991-' + md } });
const ev = { id: 'bd', name: 'Birthday', trigger: "On client's birthday", msg: 'Happy birthday {client_name}', on: true, tz: TZ };
await put('provA', 'sc_autos', Array(200).fill(ev));
await put('provB', 'sc_autos', [ev]);
const CE = (await import(path.join(api, 'cron-events.js'))).default;
res = mkRes(); await CE(cronReq, res);
check('cron-events runs', res.code === 200, res.body);
{
  check('200 copies of the birthday automation: one message', C.sent.filter(s => s.owner === 'provA').length === 1, C.sent);
  check('each account messages only its own client', C.sent.every(s => (s.owner === 'provA' && s.cid === 'ca1') || (s.owner === 'provB' && s.cid === 'cb1')), C.sent);
}

// ── listReminderOwners: per owner, client names only, never another owner's ──────────────────
await q`CREATE TABLE IF NOT EXISTS provider_push_subscriptions (provider_id text)`;
await q`CREATE TABLE IF NOT EXISTS native_push_tokens (owner_kind text, owner_id text)`;
await q`INSERT INTO provider_push_subscriptions VALUES ('provA')`;
await q`INSERT INTO native_push_tokens VALUES ('provider','provB')`;
await put('provA', 'sc_reminders', [{ id: 'r1', clientId: 'ca1' }]);
await put('provB', 'sc_reminders', [{ id: 'r2', clientId: 'cb1' }]);
await put('provB', 'sc_notif_settings', { a: 1 });
await put('provD', 'sc_reminders', [{ id: 'r3' }]);            // no device: not listed
const PP = await import(path.join(lib, 'provider-push.js'));
const owners = await PP.listReminderOwners();
const byO = Object.fromEntries(owners.map(o => [o.owner, o]));
check('reminder owners: web-push and app-only providers, not one with no device', Object.keys(byO).sort().join() === 'provA,provB', Object.keys(byO));
check('reminder owners: her client names, from her own list only', byO.provA && byO.provA.clients && byO.provA.clients.ca1 && byO.provA.clients.ca1.name === 'Amy A' && !byO.provA.clients.cb1, byO.provA && byO.provA.clients);
check('reminder owners: reminders and settings carried', byO.provB && Array.isArray(byO.provB.reminders) && byO.provB.notif && byO.provB.notif.a === 1, byO.provB);
await put('provA', 'sc_clients', '{broken');
const owners2 = await PP.listReminderOwners();
check('a broken client list loses only its names, not the account', owners2.some(o => o.owner === 'provA' && Array.isArray(o.reminders)), owners2.map(o => o.owner));

// ── guide-file: a repeated piece is not appended twice ───────────────────────────────────────
process.env.SESSION_SECRET = 's';
const tok = Buffer.from(JSON.stringify({ u: 'provA', sid: 'x' })).toString('base64');
const GF = (await import(path.join(api, 'guide-file.js'))).default;
const putPart = async (index, total, data, id = 'f1') => { const r = mkRes(); await GF({ method: 'PUT', headers: { authorization: 'Bearer ' + tok }, query: {}, body: { id, name: 'n.pdf', type: 'application/pdf', part: { index, total, data } } }, r); return r; };
await putPart(0, 3, 'AAA'); await putPart(1, 3, 'BBB');
const rep = await putPart(1, 3, 'BBB');                         // the retry of a piece that already landed
check('a repeated piece is acknowledged', rep.code === 200 && rep.body && rep.body.repeat === true, rep.body);
const last = await putPart(2, 3, 'CCC');
const row = (await q`SELECT data, complete FROM files WHERE owner = 'provA' AND id = 'f1'`)[0];
check('the file is whole, each piece once', last.code === 200 && row && row.data === 'AAABBBCCC' && row.complete === true, row);
const lastAgain = await putPart(2, 3, 'CCC');
check('repeating the LAST piece after it completed is acknowledged, file unchanged', lastAgain.code === 200 && (await q`SELECT data FROM files WHERE id='f1'`)[0].data === 'AAABBBCCC', lastAgain.body);
await putPart(0, 3, 'XXX', 'f2');
const skip = await putPart(2, 3, 'ZZZ', 'f2');
check('a piece out of order is refused (409), nothing appended', skip.code === 409 && (await q`SELECT staging FROM files WHERE id='f2'`)[0].staging === 'XXX', skip.body);
await q`INSERT INTO files (owner, id, staging, complete) VALUES ('provA','f3','OLD',false)`;   // begun on the previous build
const legacy = await putPart(1, 2, 'NEW', 'f3');
check('an upload begun before this change still finishes', legacy.code === 200 && (await q`SELECT data FROM files WHERE id='f3'`)[0].data === 'OLDNEW', legacy.body);
const other = mkRes(); await GF({ method: 'PUT', headers: { authorization: 'Bearer ' + Buffer.from(JSON.stringify({ u: 'provB', sid: 'y' })).toString('base64') }, query: {}, body: { id: 'f2', part: { index: 1, total: 3, data: 'EVIL' } } }, other);
check('another account cannot append to her upload', other.code === 409 && (await q`SELECT staging FROM files WHERE owner='provA' AND id='f2'`)[0].staging === 'XXX', other.body);

// ── consult requests: a double tap is one request ────────────────────────────────────────────
const CO = await import(path.join(lib, 'consult.js'));
await q`CREATE TABLE IF NOT EXISTS providers (id text PRIMARY KEY)`;
const id1 = await CO.addConsultRequest('provA', { name: 'Zoe', email: 'z@x.test', phone: '', message: 'Acne help' });
const id2 = await CO.addConsultRequest('provA', { name: 'Zoe', email: 'z@x.test', phone: '', message: 'Acne help' });
const id3 = await CO.addConsultRequest('provA', { name: 'Zoe', email: 'z@x.test', phone: '', message: 'Different question' });
const id4 = await CO.addConsultRequest('provB', { name: 'Zoe', email: 'z@x.test', phone: '', message: 'Acne help' });
const n = (await q`SELECT count(*)::int AS n FROM consult_requests WHERE provider_id = 'provA'`)[0].n;
check('the same consult request twice is saved once (the repeat returns null)', !!id1 && id2 === null && n === 2, { id1, id2, n });
check('a different message, or another provider, is its own request', !!id3 && !!id4 && id4 !== id1, { id3, id4 });

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exitCode = fail ? 1 : 0;
