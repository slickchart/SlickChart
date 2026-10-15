// Send-path sweep (crons + provider push) against a REAL PostgreSQL 16, real lib/clients.js,
// lib/provider-push.js and the real api/cron-*.js handlers. Push / native / Square are stubbed and
// RECORD every send, so each check counts what actually reaches a device.
//
//   node scratchpad/sweep2-cron-sends.mjs
//
// Prints CONFIRMED-BUG / SOUND per check. Nothing in api/ or lib/ is modified (copied to a temp tree).
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const VERCEL = '/home/user/SlickChart/slickchart-vercel';
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cronsv-'));
const sock = fs.mkdtempSync(path.join(os.tmpdir(), 'cronsock-'));
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
  const isSelect = /^(select|with)/i.test(t) && !/^with[\\s\\S]*\\b(update|insert|delete)\\b/i.test(t);
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
export async function ensureProvidersTable() {}
`;
// Every push is recorded with which subscription/owner it reached.
const PUSHSTUB = `export const SENT = [];
export function pushConfigured(){ return true; }
export function validPushEndpoint(){ return true; }
export async function sendPushToAll(subs, payload){ let n=0; for (const s of subs) { SENT.push({ ch:'web', endpoint: s.sub && s.sub.endpoint, payload }); n++; } return n; }
`;
const FCMSTUB = `import { sql } from './db.js';
export const NSENT = [];
export function nativePushConfigured(){ return true; }
export async function sendNativeToClient(id, payload){ const r = await sql()\`SELECT token FROM native_push_tokens WHERE owner_kind='client' AND owner_id=\${String(id)}\`; for (const t of r) NSENT.push({ ch:'native', token:t.token, payload }); return r.length; }
`;
const SQSTUB = `export const STATE = { bookings: [], customers: {} };
export async function getConnection(p){ return { token: 'tok-' + p }; }
export async function squareFetch(p){ if (p.startsWith('/v2/locations')) return { locations: [] };
  if (p.startsWith('/v2/bookings')) return { bookings: STATE.bookings };
  const m = p.match(/^\\/v2\\/customers\\/(.+)$/); if (m) return { customer: STATE.customers[m[1]] };
  return {}; }
export async function enforceFounderMerchantIsolation(){ return {}; }
`;

const lib = path.join(root, 'lib'), api = path.join(root, 'api');
fs.mkdirSync(lib, { recursive: true }); fs.mkdirSync(api, { recursive: true });
fs.writeFileSync(path.join(lib, 'db.js'), DBSTUB);
fs.writeFileSync(path.join(lib, 'push.js'), PUSHSTUB);
fs.writeFileSync(path.join(lib, 'fcm.js'), FCMSTUB);
fs.writeFileSync(path.join(lib, 'square.js'), SQSTUB);
for (const f of ['clients.js', 'provider-push.js']) fs.copyFileSync(path.join(VERCEL, 'lib', f), path.join(lib, f));
for (const f of ['cron-reminders.js', 'cron-checkins.js', 'cron-events.js', 'cron-automations.js']) fs.copyFileSync(path.join(VERCEL, 'api', f), path.join(api, f));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
if (asRoot) sh('chown -R ' + USER + ' ' + root);

process.env.CRON_SECRET = 's';
const L = await import(path.join(lib, 'clients.js'));
const D = await import(path.join(lib, 'db.js'));
const P = await import(path.join(lib, 'push.js'));
const F = await import(path.join(lib, 'fcm.js'));
const SQ = await import(path.join(lib, 'square.js'));
const PP = await import(path.join(lib, 'provider-push.js'));
const reminders = (await import(path.join(api, 'cron-reminders.js'))).default;
const checkins = (await import(path.join(api, 'cron-checkins.js'))).default;
const events = (await import(path.join(api, 'cron-events.js'))).default;
const automations = (await import(path.join(api, 'cron-automations.js'))).default;
const q = D.sql();
await L.ensureClientTables(); await D.ensureTable(); await PP.ensureProviderPushTable();
await q`CREATE TABLE IF NOT EXISTS native_push_tokens (token text PRIMARY KEY, platform text, owner_kind text, owner_id text, provider_id text, created_at bigint, updated_at bigint)`;
await q`CREATE TABLE IF NOT EXISTS square_connections (provider_id text PRIMARY KEY)`;

const realNow = Date.now;
function at(ms) { Date.now = () => ms; }
async function cron(h) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await h({ method: 'GET', headers: { authorization: 'Bearer s' }, query: {} }, res);
  return res;
}
function report(name, bug, detail) { console.log((bug ? 'CONFIRMED-BUG  ' : 'SOUND          ') + name + '\n               ' + JSON.stringify(detail)); }
const reset = async () => { P.SENT.length = 0; F.NSENT.length = 0; await q`DELETE FROM reminder_log`; await q`DELETE FROM client_events`; };
const sub = (ep) => ({ endpoint: 'https://push.example/' + ep, keys: { p256dh: 'x', auth: 'y' } });

// ── 1. cron-reminders: a merge in the morning re-sends today's appointment reminder ──────────────
{
  await reset();
  const T0 = Date.UTC(2026, 9, 20, 7, 5);              // 07:05 UTC, client tz UTC → morning window
  const appt = Date.UTC(2026, 9, 20, 15, 0);           // appointment today 15:00
  await L.upsertClient('prov_A', { id: 'cA_copy', name: 'Rae Dup', email: 'rae@ex.com', data: {} });
  await L.upsertClient('prov_A', { id: 'cA_keep', name: 'Rae Dup', email: 'rae@ex.com', data: {} });
  await L.saveClientPrefs('cA_copy', { notif: { enabled: true }, reminders: { tz: 'UTC', appts: [{ at: appt, label: '3pm' }] } });
  await L.savePushSub('cA_copy', 'prov_A', sub('rae-phone'));
  at(T0); await cron(reminders);
  const first = P.SENT.filter(s => /apptday/.test(s.payload.tag)).length;
  // provider merges the copy into the keeper (api/clients.js does mergeClientRows then markClientDeleted)
  await L.mergeClientRows('prov_A', 'cA_copy', 'cA_keep');
  await L.markClientDeleted('prov_A', 'cA_copy');
  at(T0 + 2 * 3600e3); await cron(reminders);
  const total = P.SENT.filter(s => /apptday/.test(s.payload.tag)).length;
  report('cron-reminders: "Appointment today" sent ' + total + 'x to one phone when a merge lands between morning runs', total > first,
    { beforeMerge: first, afterMerge: total, rkeysKeep: (await q`SELECT rkey FROM reminder_log WHERE client_id='cA_keep'`).map(r => r.rkey) });
}

// ── 2. cron-checkins: merge between hourly runs re-sends the check-in message + push ──────────────
{
  await reset();
  const T0 = Date.UTC(2026, 9, 20, 9, 5);
  await q`INSERT INTO square_connections (provider_id) VALUES ('prov_C') ON CONFLICT DO NOTHING`;
  await L.upsertClient('prov_C', { id: 'cC_1', name: 'Kim Two', email: 'kim@ex.com', data: {} });
  await L.upsertClient('prov_C', { id: 'cC_2', name: 'Kim Two', email: 'kim@ex.com', data: {} });
  await q`UPDATE clients SET opened_at=1 WHERE id IN ('cC_1','cC_2')`;
  await L.savePushSub('cC_1', 'prov_C', sub('kim-phone'));
  SQ.STATE.bookings = [{ id: 'bk1', status: 'ACCEPTED', customer_id: 'cu1', start_at: new Date(T0 + 20 * 3600e3).toISOString() }];
  SQ.STATE.customers = { cu1: { email_address: 'kim@ex.com' } };
  at(T0); await cron(checkins);
  const matched = (await q`SELECT client_id FROM reminder_log WHERE rkey='cicron:bk1'`).map(r => r.client_id);
  const other = matched[0] === 'cC_1' ? 'cC_2' : 'cC_1';
  await L.mergeClientRows('prov_C', matched[0], other);
  await L.markClientDeleted('prov_C', matched[0]);
  at(T0 + 3600e3); await cron(checkins);
  const msgs = (await q`SELECT client_id FROM client_events WHERE kind='provider_message'`).length;
  const pushes = P.SENT.filter(s => /checkin:bk1/.test(s.payload.tag)).length;
  report('cron-checkins: one booking -> ' + msgs + ' check-in messages / ' + pushes + ' pushes after a merge between runs', msgs > 1 || pushes > 1,
    { claimedFor: (await q`SELECT client_id FROM reminder_log WHERE rkey='cicron:bk1'`).map(r => r.client_id), msgs, pushes });
}

// ── 2b. cron-checkins WITHOUT a merge: two live rows for one email, matched in heap order ─────────
{
  await reset();
  const T0 = Date.UTC(2026, 9, 21, 9, 5);
  await L.upsertClient('prov_D', { id: 'cD_1', name: 'Lee', email: 'lee@ex.com', data: {} });
  await L.upsertClient('prov_D', { id: 'cD_2', name: 'Lee', email: 'lee@ex.com', data: {} });
  await q`INSERT INTO square_connections (provider_id) VALUES ('prov_D') ON CONFLICT DO NOTHING`;
  await q`UPDATE clients SET opened_at=1 WHERE id IN ('cD_1','cD_2')`;
  SQ.STATE.bookings = [{ id: 'bk2', status: 'ACCEPTED', customer_id: 'cu2', start_at: new Date(T0 + 20 * 3600e3).toISOString() }];
  SQ.STATE.customers = { cu2: { email_address: 'lee@ex.com' } };
  // Other providers' connections from test 2 must not interfere: remove them.
  await q`DELETE FROM square_connections WHERE provider_id <> 'prov_D'`;
  at(T0); await cron(checkins);
  const first = (await q`SELECT client_id FROM reminder_log WHERE rkey='cicron:bk2'`).map(r => r.client_id)[0];
  // The provider's app syncs that client (any edit) → the row is rewritten → it moves in heap order.
  await q`UPDATE clients SET updated_at=${realNow()} WHERE id=${first}`;
  at(T0 + 3600e3); await cron(checkins);
  const msgs = (await q`SELECT client_id FROM client_events WHERE kind='provider_message' AND provider_id='prov_D'`).map(r => r.client_id);
  report('cron-checkins: duplicate rows (pre-merge) + an ordinary sync -> ' + msgs.length + ' check-ins for one booking', msgs.length > 1, { msgs });
}

// ── 3. cron-events: provider B's chart id collides with provider A's client row ──────────────────
{
  await reset();
  const T0 = Date.UTC(2026, 9, 22, 9, 5);   // Oct 22, 09:05 UTC
  await L.upsertClient('prov_A', { id: 'c1760000000000', name: 'Alice OfA', email: 'alice@a.com', data: {} });
  await L.savePushSub('c1760000000000', 'prov_A', sub('alice-phone'));
  // Provider B's own chart got the same id (her upsert was refused with id_taken) — it is still in her sc_clients.
  await q`INSERT INTO kv (owner,k,v) VALUES ('prov_B','sc_clients',${JSON.stringify({ c1760000000000: { name: 'Bella OfB', birthday: '1990-10-22' } })}) ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v`;
  await q`INSERT INTO kv (owner,k,v) VALUES ('prov_B','sc_autos',${JSON.stringify([{ id: 'bday1', on: true, trigger: "On client's birthday", msg: 'Happy birthday {client_name}! From B studio', tz: 'UTC' }])}) ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v`;
  at(T0); await cron(events);
  const toAlice = P.SENT.filter(s => s.endpoint === 'https://push.example/alice-phone');
  const ev = await q`SELECT provider_id, client_id FROM client_events WHERE client_id='c1760000000000'`;
  report('cron-events: provider B\'s birthday message pushed to provider A\'s client device', toAlice.length > 0,
    { pushes: toAlice.map(s => ({ body: s.payload.body, url: s.payload.url })), eventRows: ev });
}

// ── 4. opt-out: client turned notifications OFF (notif.enabled=false) ────────────────────────────
{
  await reset();
  const T0 = Date.UTC(2026, 9, 23, 10, 5);
  await L.upsertClient('prov_E', { id: 'cE_1', name: 'Opt Out', email: 'o@ex.com', data: {} });
  await L.savePushSub('cE_1', 'prov_E', sub('optout-phone'));
  await L.saveClientPrefs('cE_1', { notif: { enabled: false, messagereply: true }, reminders: { tz: 'UTC' } });
  await q`INSERT INTO kv (owner,k,v) VALUES ('prov_E','sc_autos',${JSON.stringify([{ id: 'promo', on: true, msg: 'Fall special!', sendAt: T0 - 60e3 }])}) ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v`;
  at(T0); await cron(automations);
  const pushes = P.SENT.filter(s => s.endpoint === 'https://push.example/optout-phone').length;
  report('cron-automations: pushes to a client who switched notifications OFF', pushes > 0, { pushes });
}

// ── 5. provider web push: one browser endpoint stays bound to the provider who signed OUT ─────────
{
  await PP.saveProviderPushSub('prov_A', sub('shared-ipad'));
  // A signs out (the app never DELETEs the subscription), B signs in on the same browser, turns push on
  await PP.saveProviderPushSub('prov_B', sub('shared-ipad'));
  const a = (await PP.listProviderPushSubs('prov_A')).map(s => s.sub.endpoint);
  report('provider-push: after A signs out and B enables push on the same browser, A\'s reminders still target it', a.includes('https://push.example/shared-ipad'), { provA: a });
}

Date.now = realNow;
process.exit(0);
