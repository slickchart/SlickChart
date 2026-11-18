// lib/clients.js listAllClientPrefs (2026-11-18): reads EVERY client with reminders, in pages, not
// the first 20,000; plus the cron-reminders delete-sync owner query runs on real PostgreSQL.
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
const src = fs.readFileSync(new URL('./sweep-dup-server-pg.mjs', import.meta.url), 'utf8');
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-')), sock = fs.mkdtempSync(path.join(os.tmpdir(), 'cppsock-'));
const PORT = '55499', asRoot = process.getuid() === 0, USER = asRoot ? 'pgtest' : os.userInfo().username;
const sh = c => execFileSync('/bin/sh', ['-c', c], { encoding: 'utf8', maxBuffer: 1 << 28 });
const pg = c => sh(asRoot ? "su " + USER + " -c '" + c.replace(/'/g, "'\\''") + "'" : c);
if (asRoot) { try { sh('id ' + USER); } catch (e) { sh('useradd -m ' + USER); } sh('chown -R ' + USER + ' ' + root + ' ' + sock + ' && chmod 777 ' + sock); }
let started = false;
process.on('exit', () => { if (started) { try { pg(PGBIN + '/pg_ctl -D ' + root + '/data stop -m immediate'); } catch (e) {} } });
pg(PGBIN + '/initdb -D ' + root + '/data -U ' + USER + ' --auth=trust >/dev/null');
pg(PGBIN + "/pg_ctl -D " + root + "/data -o '-k " + sock + " -p " + PORT + " -c listen_addresses=' -l " + root + "/log start -w >/dev/null");
started = true;
const stub = src.slice(src.indexOf('const DBSTUB = `') + 16, src.indexOf('`;\nconst AUTHSTUB')).replace(/\$\{PGBIN\}/g, PGBIN).replace(/\$\{sock\}/g, sock).replace(/\$\{PORT\}/g, PORT).replace(/\$\{USER\}/g, USER).replace(/\\`/g, '`').replace(/\\\$/g, '$').replace(/\\\\/g, '\\');
fs.mkdirSync(path.join(root, 'lib'));
fs.writeFileSync(path.join(root, 'lib', 'db.js'), stub.replace("execFile(", "execFile(").replace(/maxBuffer:\s*\d+/, 'maxBuffer: 1<<28'));
fs.copyFileSync(new URL('../slickchart-vercel/lib/clients.js', import.meta.url), path.join(root, 'lib', 'clients.js'));
for (const f of fs.readdirSync(new URL('../slickchart-vercel/lib/', import.meta.url))) if (!fs.existsSync(path.join(root, 'lib', f))) fs.copyFileSync(new URL('../slickchart-vercel/lib/' + f, import.meta.url), path.join(root, 'lib', f));
fs.writeFileSync(path.join(root, 'lib', 'db.js'), stub + '\nexport async function schemaInPlace(){ return false; }\n');
const D = await import(path.join(root, 'lib', 'db.js'));
const L = await import(path.join(root, 'lib', 'clients.js'));
const q = D.sql(); await D.ensureTable(); await L.ensureClientTables();
await q`INSERT INTO clients (id, provider_id, token, name, data) SELECT 'c' || lpad(g::text, 6, '0'), 'p' || (g % 600), 't' || g, 'n', '{}'::jsonb FROM generate_series(1, 23000) g`;
await q`INSERT INTO client_prefs (client_id, prefs) SELECT id, '{"reminders":{"tz":"UTC"}}'::jsonb FROM clients`;
await q`UPDATE clients SET deleted_at = 1 WHERE id = 'c000007'`;
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' — ' + JSON.stringify(d))); ok ? pass++ : fail++; };
const rows = await L.listAllClientPrefs();
check('every client past 20,000 is read (23,000 minus 1 deleted)', rows.length === 22999, rows.length);
check('no client twice', new Set(rows.map(r => r.client_id)).size === rows.length);
check('the deleted client is skipped', !rows.some(r => r.client_id === 'c000007'));
check('rows carry prefs and provider', rows[22998].prefs.reminders.tz === 'UTC' && rows[22998].provider_id);
await q`INSERT INTO kv (owner, k, v) SELECT 'p' || g, 'sc_deleted_clients', '{}' FROM generate_series(1, 700) g`;
const cr = fs.readFileSync(new URL('../slickchart-vercel/api/cron-reminders.js', import.meta.url), 'utf8');
const m = /sql\(\)`(SELECT DISTINCT owner FROM kv[\s\S]*?)`/.exec(cr)[1];
const owners = await q([m]);
check('delete sync query runs and picks the recently changed accounts (all 700 just written)', owners.length === 700, owners.length);
await q`UPDATE kv SET updated_at = now() - interval '1 day'`;
const later = await q([m]);
check('otherwise about 1/24th of them each hour', later.length > 5 && later.length < 70, later.length);
console.log('\n' + pass + '/' + (pass + fail) + ' passed'); process.exit(fail ? 1 : 0);
