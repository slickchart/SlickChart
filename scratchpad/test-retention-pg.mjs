// 2026-11-18: lib/retention.js against a real PostgreSQL 16. Old records go; everything the app can
// still read stays (unrevoked sessions, undated reminder claims, founder rows, recent rows, the newest
// 10 kv_history copies per key, daily/shrink copies, other kv keys). Once a day only.
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
const src = fs.readFileSync(new URL('./sweep-dup-server-pg.mjs', import.meta.url), 'utf8');
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ret-')), sock = fs.mkdtempSync(path.join(os.tmpdir(), 'retsock-'));
const PORT = '55497', asRoot = process.getuid() === 0, USER = asRoot ? 'pgtest' : os.userInfo().username;
const sh = c => execFileSync('/bin/sh', ['-c', c], { encoding: 'utf8' });
const pg = c => sh(asRoot ? "su " + USER + " -c '" + c.replace(/'/g, "'\\''") + "'" : c);
if (asRoot) { try { sh('id ' + USER); } catch (e) { sh('useradd -m ' + USER); } sh('chown -R ' + USER + ' ' + root + ' ' + sock + ' && chmod 777 ' + sock); }
let started = false;
process.on('exit', () => { if (started) { try { pg(PGBIN + '/pg_ctl -D ' + root + '/data stop -m immediate'); } catch (e) {} } });
pg(PGBIN + '/initdb -D ' + root + '/data -U ' + USER + ' --auth=trust >/dev/null');
pg(PGBIN + "/pg_ctl -D " + root + "/data -o '-k " + sock + " -p " + PORT + " -c listen_addresses=' -l " + root + "/log start -w >/dev/null");
started = true;
const stub = src.slice(src.indexOf('const DBSTUB = `') + 16, src.indexOf('`;\nconst AUTHSTUB')).replace(/\$\{PGBIN\}/g, PGBIN).replace(/\$\{sock\}/g, sock).replace(/\$\{PORT\}/g, PORT).replace(/\$\{USER\}/g, USER).replace(/\\`/g, '`').replace(/\\\$/g, '$').replace(/\\\\/g, '\\');
const lib = path.join(root, 'lib'); fs.mkdirSync(lib);
fs.writeFileSync(path.join(lib, 'db.js'), stub);
fs.writeFileSync(path.join(lib, 'clients.js'), `import { sql } from './db.js';
export async function claimReminder(cid, rkey) { const r = await sql()\`INSERT INTO reminder_log (client_id, rkey, sent_at) VALUES (\${cid}, \${rkey}, \${Date.now()}) ON CONFLICT (client_id, rkey) DO NOTHING RETURNING rkey\`; return r.length > 0; }\n`);
fs.copyFileSync(new URL('../slickchart-vercel/lib/retention.js', import.meta.url).pathname, path.join(lib, 'retention.js'));
const D = await import(path.join(lib, 'db.js')); const q = D.sql(); await D.ensureTable();
const R = await import(path.join(lib, 'retention.js'));
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  — ' + JSON.stringify(d) : '')); ok ? pass++ : fail++; };
const cnt = async (t, w) => (await q([`SELECT count(*)::int AS n FROM ${t} WHERE ${w || 'true'}`]))[0].n;

// The real table shapes (lib/db.js, lib/kv-history.js, lib/clients.js).
await q`CREATE TABLE kv_history (id bigserial PRIMARY KEY, owner text NOT NULL, k text NOT NULL, v text, bytes integer, items integer, reason text, saved_at timestamptz DEFAULT now())`;
await q`CREATE TABLE reminder_log (client_id text NOT NULL, rkey text NOT NULL, sent_at bigint, PRIMARY KEY (client_id, rkey))`;
await q`CREATE TABLE login_attempts (id bigserial PRIMARY KEY, email text NOT NULL, ts timestamptz DEFAULT now(), ip text)`;
await q`CREATE TABLE auth_tokens (token text PRIMARY KEY, provider_id text NOT NULL, kind text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT now(), data text)`;
await q`CREATE TABLE sessions (id text PRIMARY KEY, provider_id text NOT NULL, device text, location text, ip text, created_at timestamptz DEFAULT now(), last_seen_at timestamptz DEFAULT now(), revoked boolean DEFAULT false)`;

// kv_history: 30 old before-restore copies of one key (20 should go), 5 old dedupe copies (all stay:
// within the newest 10), 15 recent before-purge copies (all stay: last 90 days), 30 old 'daily' (stay).
await q`INSERT INTO kv_history (owner,k,v,reason,saved_at) SELECT 'provA','sc_clients','x','before-restore', now() - (interval '1 day' * (100 + g)) FROM generate_series(1,30) g`;
await q`INSERT INTO kv_history (owner,k,v,reason,saved_at) SELECT 'provA','sc_autos','x','dedupe', now() - interval '200 days' FROM generate_series(1,5) g`;
await q`INSERT INTO kv_history (owner,k,v,reason,saved_at) SELECT 'provB','sc_clients','x','before-purge', now() - interval '10 days' FROM generate_series(1,15) g`;
await q`INSERT INTO kv_history (owner,k,v,reason,saved_at) SELECT 'provA','sc_clients','x','daily', now() - interval '400 days' FROM generate_series(1,30) g`;
// Another account's copies of the same key are counted on their own.
await q`INSERT INTO kv_history (owner,k,v,reason,saved_at) SELECT 'provC','sc_clients','x','before-restore', now() - interval '300 days' FROM generate_series(1,8) g`;

const old = Date.now() - 200 * 86400000, recent = Date.now() - 10 * 86400000;
const rl = [
  ['c1', 'homecare:2026-01-01', old, 'gone'], ['c1', 'homecare2:2026-01-01', old, 'gone'], ['c1', 'apptbefore:2026-01-01:9', old, 'gone'],
  ['c1', 'apptday:2026-01-01:9', old, 'gone'], ['c1', 'auto:p:a:1', old, 'gone'], ['c1', 'evt:bday:p:a:2025:c1', old, 'gone'],
  ['c1', 'cicron:b1', old, 'gone'], ['system', 'retention:2026-01-01', old, 'gone'],
  ['c1', 'homecare:2026-11-08', recent, 'kept'], ['c1', 'evt:nov:p:a:c1', old, 'kept'], ['c1', 'heal-2:p:c1', old, 'kept'],
  ['founder', 'auto:x', old, 'kept'], ['founder', 'paid:abc', old, 'kept'], ['c1', 'something-else', old, 'kept'], ['c1', 'auto:nosent', null, 'kept'],
];
for (const [c, k, t] of rl) await q`INSERT INTO reminder_log (client_id, rkey, sent_at) VALUES (${c}, ${k}, ${t})`;

await q`INSERT INTO login_attempts (email, ts) SELECT 'a@x', now() - interval '60 days' FROM generate_series(1,12000) g`;   // > 2 batches
await q`INSERT INTO login_attempts (email, ts) SELECT 'a@x', now() - interval '5 minutes' FROM generate_series(1,3) g`;
await q`INSERT INTO auth_tokens (token, provider_id, kind, expires_at) VALUES ('t_old','p','reset', now() - interval '30 days'), ('t_fresh','p','reset', now() - interval '1 day'), ('t_live','p','reset', now() + interval '1 hour')`;
await q`INSERT INTO sessions (id, provider_id, revoked, last_seen_at) VALUES ('s_rev_old','p',true, now() - interval '100 days'), ('s_rev_new','p',true, now() - interval '5 days'), ('s_live_old','p',false, now() - interval '700 days'), ('s_live','p',false, now())`;
const dOld = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10), dNew = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
await q`INSERT INTO kv (owner,k,v) VALUES ('p', ${'aiusage:' + dOld}, '3'), ('p', ${'aiusage:' + dNew}, '4'), ('p','sc_clients','[]'), ('p','aiusage_settings','{}')`;

const out = await R.pruneOldRecords(q);
check('no rule failed', out.errors.length === 0, out.errors);
check('kv_history: 20 old before-restore copies removed (newest 10 kept)', await cnt('kv_history', "owner='provA' AND reason='before-restore'") === 10);
check('kv_history: the 10 kept are the newest', (await q`SELECT min(saved_at) > now() - interval '111 days' AS ok FROM kv_history WHERE owner='provA' AND reason='before-restore'`)[0].ok === true);
check('kv_history: 5 old dedupe copies kept (within 10)', await cnt('kv_history', "reason='dedupe'") === 5);
check('kv_history: 15 recent copies kept (last 90 days)', await cnt('kv_history', "reason='before-purge'") === 15);
check('kv_history: daily copies untouched', await cnt('kv_history', "reason='daily'") === 30);
check('kv_history: another account counted on its own (8 kept)', await cnt('kv_history', "owner='provC'") === 8);
for (const [c, k, , want] of rl) {
  const n = (await q`SELECT count(*)::int AS n FROM reminder_log WHERE client_id=${c} AND rkey=${k}`)[0].n;
  check('reminder_log ' + c + ' ' + k + ' ' + want, want === 'gone' ? n === 0 : n === 1);
}
check('login_attempts: 12,000 old removed in batches', await cnt('login_attempts', "ts < now() - interval '1 day'") === 0, out.removed);
check('login_attempts: recent kept (the limiter still sees them)', await cnt('login_attempts') === 3);
check('auth_tokens: only the long-expired one removed', (await q`SELECT token FROM auth_tokens ORDER BY token`).map(r => r.token).join() === 't_fresh,t_live');
check('sessions: only revoked + unseen 60 days removed; signed-in devices kept however old', (await q`SELECT id FROM sessions ORDER BY id`).map(r => r.id).join() === 's_live,s_live_old,s_rev_new');
check('kv: old AI counters removed, recent and everything else kept', (await q`SELECT k FROM kv ORDER BY k`).map(r => r.k).join() === ['aiusage:' + dNew, 'aiusage_settings', 'sc_clients'].join());

const again = await R.pruneOldRecords(q);
check('a second run removes nothing more', Object.values(again.removed).every(n => n === 0), again.removed);
const d1 = await R.pruneOldRecordsDaily(q), d2 = await R.pruneOldRecordsDaily(q);
check('daily: the first run of the day works, the second does nothing', !!d1 && d2 === null, { d1: !!d1, d2 });

// One broken rule never stops the others.
await q`ALTER TABLE sessions RENAME TO sessions_x`;
await q`INSERT INTO auth_tokens (token, provider_id, kind, expires_at) VALUES ('t_old2','p','reset', now() - interval '30 days')`;
const broken = await R.pruneOldRecords(q);
check('a failing rule is reported and the rest still run', broken.errors.some(e => /^sessions:/.test(e)) && broken.removed.auth_tokens === 1, broken);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
