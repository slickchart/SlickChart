// sweep2-sec: server security checks against a REAL PostgreSQL 16, running the real api/ + lib/ files
// copied next to stubs (same pattern as scratchpad/sweep-dup-server-pg.mjs). Nothing in api/ or lib/
// is modified.
//   1. cron-events pushes to ANOTHER provider's client (ids taken from attacker-writable kv sc_clients)
//   2. delete-account leaves rows behind (files, kv_history, course_versions, google_*, tombstones, ...)
//   3. after delete-account, a REVOKED token is accepted again (isSessionValid fails open on a missing row)
//   4. totp-setup disables 2FA with no password / code, and works on a revoked session
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
const VERCEL = '/home/user/SlickChart/slickchart-vercel';
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2sec-'));
const sock = fs.mkdtempSync(path.join(os.tmpdir(), 's2sock-'));
const PORT = '55493';
const asRoot = process.getuid && process.getuid() === 0;
const USER = asRoot ? 'pgtest' : os.userInfo().username;
const sh = c => execFileSync('/bin/sh', ['-c', c], { encoding: 'utf8' });
const pg = c => sh(asRoot ? "su " + USER + " -c '" + c.replace(/'/g, "'\\''") + "'" : c);
if (asRoot) { try { sh('id ' + USER); } catch (e) { sh('useradd -m ' + USER); } sh('chown -R ' + USER + ' ' + root + ' ' + sock + ' && chmod 777 ' + sock); }
let started = false;
process.on('exit', () => { if (started) { try { pg(PGBIN + '/pg_ctl -D ' + root + '/data stop -m immediate'); } catch (e) {} } });
pg(PGBIN + '/initdb -D ' + root + '/data -U ' + USER + ' --auth=trust >/dev/null');
pg(PGBIN + "/pg_ctl -D " + root + "/data -o '-k " + sock + " -p " + PORT + " -c listen_addresses=' -l " + root + "/log start -w >/dev/null");
started = true;
const realDb = fs.readFileSync(VERCEL + '/lib/db.js', 'utf8').replace(/^import \{ neon \}.*$/m, '');
const DBSTUB = `import { execFileSync } from 'child_process';
let n = 0;
function lit(v){ if(v===null||v===undefined)return 'NULL'; if(typeof v==='number')return String(v); if(typeof v==='boolean')return v?'true':'false';
  if(Array.isArray(v))return 'ARRAY['+v.map(lit).join(',')+']::text[]'; const t='q'+(n++); return '$'+t+'$'+String(v)+'$'+t+'$'; }
function run(text){ const t=text.trim().replace(/;\\s*$/,''); const sel=/^(select|with)/i.test(t)&&!/^with[\\s\\S]*\\b(update|insert|delete)\\b/i.test(t); const ret=!sel&&/\\breturning\\b/i.test(t);
  const q=sel?"SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM ("+t+") t":ret?"WITH t AS ("+t+") SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM t":t;
  const out=execFileSync('${PGBIN}/psql',['-h','${sock}','-p','${PORT}','-U','${USER}','-d','postgres','-A','-t','-X','-q','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'});
  return (sel||ret)?JSON.parse(out.trim()||'[]'):[]; }
function neon(){ return (s,...v)=>{ let x=''; s.forEach((p,i)=>{x+=p; if(i<v.length)x+=lit(v[i]);}); return Promise.resolve().then(()=>run(x)); }; }
` + realDb;
const lib = root + '/lib', api = root + '/api';
fs.mkdirSync(lib, { recursive: true }); fs.mkdirSync(api, { recursive: true });
fs.writeFileSync(root + '/package.json', '{"type":"module"}');
fs.writeFileSync(lib + '/db.js', DBSTUB);
for (const f of ['clients.js', 'auth.js', 'totp.js', 'kv-history.js', 'google-cal.js']) fs.copyFileSync(VERCEL + '/lib/' + f, lib + '/' + f);
const SENT = [];
fs.writeFileSync(lib + '/push.js', `export function pushConfigured(){return true} export async function sendPushToAll(subs,p){ globalThis.__SENT.push({ch:'web',subs:subs.map(s=>s.id),p}); return subs.length } export function validPushEndpoint(){return true}`);
fs.writeFileSync(lib + '/fcm.js', `export function nativePushConfigured(){return true} export async function sendNativeToClient(id,p){ globalThis.__SENT.push({ch:'native',client:id,p}); return 1 }`);
fs.writeFileSync(lib + '/square.js', `export async function disconnect(){}`);
globalThis.__SENT = SENT;
for (const f of ['cron-events.js', 'delete-account.js', 'totp-setup.js', 'store.js']) fs.copyFileSync(VERCEL + '/api/' + f, api + '/' + f);
if (asRoot) sh('chown -R ' + USER + ' ' + root);
process.env.CRON_SECRET = 'cron'; process.env.SESSION_SECRET = 'sess'; process.env.DATABASE_URL = 'stub';
process.env.DATABASE_URL='stub';
const D = await import(lib + '/db.js'); const L = await import(lib + '/clients.js'); const A = await import(lib + '/auth.js');
const q = D.sql();
await D.ensureProvidersTable(); await D.ensureTable(); await L.ensureClientTables();
const call = async (h, method, { body, query, headers } = {}) => { const r = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() {}, send(b) { this.body = b; } };
  await h({ method, headers: Object.assign({ 'user-agent': 'x' }, headers || {}), query: query || {}, body: body || {} }, r); return r; };
const report = (name, bug, detail) => console.log((bug ? 'CONFIRMED-BUG  ' : 'SOUND          ') + name + '\n               ' + JSON.stringify(detail));

// ── 1. cron-events cross-tenant ─────────────────────────────────────────────
{
  await q`INSERT INTO providers (id,email,name,pass_hash) VALUES ('p_victim','v@x.com','V','x'),('p_attacker','a@x.com','A','x')`;
  // Victim's real client, with a registered push device.
  await L.upsertClient('p_victim', { id: 'c1760000000000', name: 'Jane Victim', email: 'jane@ex.com', data: {} });
  await L.savePushSub('c1760000000000', 'p_victim', { endpoint: 'https://push.example/jane' });
  // Attacker writes ONLY their own kv (exactly what PUT /api/store allows): a fake roster entry under
  // the victim's client id with today's birthday, and a birthday automation.
  const now = new Date(); const tz = 'UTC';
  const hourNow = now.getUTCHours();
  const md = String(now.getUTCMonth() + 1).padStart(2, '0') + '-' + String(now.getUTCDate()).padStart(2, '0');
  const bday = now.getUTCFullYear() - 30 + '-' + md;
  // MORNING window is 8..11 local: pick an IANA zone where it is 9am now.
  const zones = ['Pacific/Kiritimati','Pacific/Tongatapu','Pacific/Auckland','Asia/Tokyo','Asia/Shanghai','Asia/Kolkata','Europe/Moscow','Europe/Berlin','Europe/London','UTC','Atlantic/Azores','America/Sao_Paulo','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','Pacific/Pago_Pago'];
  const hourIn = z => parseInt(new Intl.DateTimeFormat('en-US', { timeZone: z, hour: 'numeric', hour12: false }).format(now), 10) % 24;
  const zone = zones.find(z => hourIn(z) >= 8 && hourIn(z) <= 11) || 'UTC';
  const mdIn = new Intl.DateTimeFormat('en-CA', { timeZone: zone, month: '2-digit', day: '2-digit' }).format(now);
  await q`INSERT INTO kv (owner,k,v) VALUES ('p_attacker','sc_clients',${JSON.stringify({ c1760000000000: { name: 'Jane', birthday: '1990-' + mdIn } })}),
                                             ('p_attacker','sc_autos',${JSON.stringify([{ id: 'a1', on: true, trigger: 'birthday', tz: zone, msg: 'Your account is locked, verify at https://evil.example' }])})`;
  const cron = (await import(api + '/cron-events.js')).default;
  const r = await call(cron, 'GET', { headers: { authorization: 'Bearer cron' } });
  const hit = SENT.filter(s => (s.subs || []).length || s.client === 'c1760000000000');
  report('cron-events: attacker kv (sc_clients + sc_autos) pushes attacker text to ANOTHER provider\'s client device', hit.length > 0,
    { zone, cron: r.body, sends: hit.map(s => ({ ch: s.ch, body: s.p.body, url: s.p.url })) });
}

// ── 2/3. delete-account completeness + revoked token after delete ─────────
{
  const P = 'p_del';
  await q`INSERT INTO providers (id,email,name,pass_hash) VALUES (${P},'del@x.com','Del','x')`;
  const sidOld = await A.createSession(q, P, { headers: {} });
  const sidNow = await A.createSession(q, P, { headers: {} });
  await q`UPDATE sessions SET revoked=true WHERE id=${sidOld}`;
  const oldTok = A.signToken({ u: P, e: 'del@x.com', sid: sidOld }, 'sess');
  const nowTok = A.signToken({ u: P, e: 'del@x.com', sid: sidNow }, 'sess');
  await D.ensureFilesTable(); await D.ensureCourseVersionsTable();
  const KH = await import(lib + '/kv-history.js');
  await q`INSERT INTO files (owner,id,name,data) VALUES (${P},'ph_1','photo','BASE64FACEPHOTO')`;
  await q`INSERT INTO course_versions (owner,course_id,payload) VALUES (${P},'co1','{}')`;
  try { await KH.ensureKvHistory?.(); } catch (e) {}
  try { await q`CREATE TABLE IF NOT EXISTS kv_history (id bigserial PRIMARY KEY, owner text NOT NULL, k text NOT NULL, v text, bytes integer, items integer, reason text, saved_at timestamptz DEFAULT now())`; } catch (e) {}
  await q`INSERT INTO kv_history (owner,k,v) VALUES (${P},'sc_clients','{"c1":{"name":"Secret Client","notes":"rosacea"}}')`;
  await q`INSERT INTO client_tombstones (provider_id,id,deleted_at) VALUES (${P},'c9',1)`;
  const G = await import(lib + '/google-cal.js'); try { await G.ensureGoogleTable(); } catch (e) {}
  try { await q`INSERT INTO google_connections (provider_id, refresh_token) VALUES (${P}, 'enc-refresh')`; } catch (e) {}
  try { await q`INSERT INTO google_accounts (id, provider_id, refresh_token) VALUES ('g1', ${P}, 'enc-refresh')`; } catch (e) {}
  try { await q`CREATE TABLE IF NOT EXISTS provider_push_subscriptions (id text PRIMARY KEY, provider_id text NOT NULL, endpoint text NOT NULL, sub text NOT NULL, created_at bigint)`;
        await q`INSERT INTO provider_push_subscriptions (id,provider_id,endpoint,sub) VALUES ('pp1',${P},'https://push.example/p','{}')`; } catch (e) {}
  const del = (await import(api + '/delete-account.js')).default;
  const r = await call(del, 'POST', { headers: { authorization: 'Bearer ' + nowTok } });
  const left = {};
  for (const [t, col] of [['files','owner'],['course_versions','owner'],['kv_history','owner'],['client_tombstones','provider_id'],['google_connections','provider_id'],['google_accounts','provider_id'],['provider_push_subscriptions','provider_id'],['providers','id'],['kv','owner'],['sessions','provider_id']]) {
    try { const x = await q([`SELECT count(*)::int AS n FROM ${t} WHERE ${col} = `, ''], P); left[t] = x[0].n; } catch (e) { left[t] = 'n/a'; }
  }
  const leftover = Object.entries(left).filter(([, n]) => n && n !== 'n/a');
  report('delete-account leaves this provider\'s rows behind', leftover.length > 0, { status: r.code, left });
  // The token that was REVOKED before the delete:
  const before = await A.isSessionValid(q, sidOld);
  const store = (await import(api + '/store.js')).default;
  const w = await call(store, 'PUT', { headers: { authorization: 'Bearer ' + oldTok }, body: { items: { sc_note: 'written by a revoked token' } } });
  const kvBack = await q`SELECT v FROM kv WHERE owner=${P}`;
  report('after delete-account, a previously REVOKED token is accepted again (isSessionValid fails open on a missing row)', before === true && w.code === 200,
    { isSessionValid: before, storePutStatus: w.code, kvRowsRecreatedForDeletedAccount: kvBack.length });
}

// ── 4. totp-setup ──────────────────────────────────────────────────────────
{
  const P = 'p_totp';
  await q`INSERT INTO providers (id,email,name,pass_hash,totp_secret,totp_enabled) VALUES (${P},'t@x.com','T','x','JBSWY3DPEHPK3PXP',true)`;
  const sid = await A.createSession(q, P, { headers: {} });
  await q`UPDATE sessions SET revoked=true WHERE id=${sid}`;
  const tok = A.signToken({ u: P, e: 't@x.com', sid }, 'sess');
  const setup = (await import(api + '/totp-setup.js')).default;
  const r = await call(setup, 'POST', { headers: { authorization: 'Bearer ' + tok } });
  const row = (await q`SELECT totp_enabled, totp_secret FROM providers WHERE id=${P}`)[0];
  report('totp-setup on a REVOKED session, with no password and no current code, turns 2FA OFF and replaces the secret', r.code === 200 && row.totp_enabled === false,
    { status: r.code, totp_enabled_after: row.totp_enabled, secretReplaced: row.totp_secret !== 'JBSWY3DPEHPK3PXP' });
}
process.exit(0);
