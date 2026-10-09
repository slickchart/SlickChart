// Pulling a provider's work out of a point-in-time branch, against TWO REAL PostgreSQL databases —
// one standing in for the live account, one for the Neon branch.
//
//   node scripts/test-recover-import.mjs        (from slickchart-vercel/)
//
// This is a tool that only ever runs during an incident, on real lost work, under time pressure.
// Finding out then that it imports the wrong account's rows, or quietly overwrites the live copy,
// is not acceptable — so it is tested here instead.
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const STUB = (db) => "import { execFileSync } from 'child_process';\nlet n = 0;\nfunction lit(v) {\n  if (v === null || v === undefined) return 'NULL';\n  if (typeof v === 'number') return String(v);\n  if (typeof v === 'boolean') return v ? 'true' : 'false';\n  if (Array.isArray(v)) return 'ARRAY[' + v.map(lit).join(',') + ']::text[]';\n  const tag = 'q' + (n++);\n  return '$' + tag + '$' + String(v) + '$' + tag + '$';\n}\nexport function run(text) {\n  const trimmed = text.trim().replace(/;\\s*$/, '');\n  const isSelect = /^select/i.test(trimmed);\n  const returning = !isSelect && /\\breturning\\b/i.test(trimmed);\n  const q = isSelect\n    ? \"SELECT COALESCE(json_agg(row_to_json(rec)),'[]') FROM (\" + trimmed + \") rec\"\n    : returning ? \"WITH rec AS (\" + trimmed + \") SELECT COALESCE(json_agg(row_to_json(rec)),'[]') FROM rec\" : trimmed;\n  const out = execFileSync('__PSQL__', ['-h','__SOCK__','-p','__PORT__','-U','__USER__','-d','" + db + "','-A','-t','-X','-v','ON_ERROR_STOP=1','-c', q], { encoding: 'utf8' });\n  return (isSelect || returning) ? JSON.parse(out.trim() || '[]') : [];\n}\nexport function tag() {\n  return function (strings, ...vals) {\n    let text = '';\n    strings.forEach((s, i) => { text += s; if (i < vals.length) text += lit(vals[i]); });\n    return Promise.resolve(run(text));\n  };\n}\n";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const VERCEL = process.argv[2] || path.join(HERE, '..');
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16 at ' + PGBIN); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rimp-'));
const sock = fs.mkdtempSync(path.join(os.tmpdir(), 'rimps-'));
const PORT = '55447';
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const USER = asRoot ? 'pgtest' : os.userInfo().username;
function sh(c) { return execFileSync('/bin/sh', ['-c', c], { encoding: 'utf8' }); }
function pg(c) { return sh(asRoot ? "su " + USER + " -c '" + c.replace(/'/g, "'\\''") + "'" : c); }
if (asRoot) { try { sh('id ' + USER); } catch (e) { sh('useradd -m ' + USER); } sh('chown -R ' + USER + ' ' + root + ' ' + sock + ' && chmod 777 ' + sock); }
let started = false;
process.on('exit', () => { if (started) { try { pg(PGBIN + '/pg_ctl -D ' + root + '/data stop -m immediate'); } catch (e) {} } });
pg(PGBIN + '/initdb -D ' + root + '/data -U ' + USER + ' --auth=trust >/dev/null');
pg(PGBIN + "/pg_ctl -D " + root + "/data -o '-k " + sock + " -p " + PORT + " -c listen_addresses=' -l " + root + "/log start -w >/dev/null");
started = true;
pg(PGBIN + "/psql -h " + sock + " -p " + PORT + " -U " + USER + " -d postgres -c 'CREATE DATABASE backup'");
pg(PGBIN + "/psql -h " + sock + " -p " + PORT + " -U " + USER + " -d postgres -c 'CREATE DATABASE earlier'");

const lib = path.join(root, 'lib'), api = path.join(root, 'api', 'admin');
const nm = path.join(root, 'node_modules', '@neondatabase', 'serverless');
fs.mkdirSync(lib, { recursive: true }); fs.mkdirSync(api, { recursive: true }); fs.mkdirSync(nm, { recursive: true });
const fill = (t, db) => STUB(db).replace('__PSQL__', PGBIN + '/psql').replace('__SOCK__', sock).replace('__PORT__', PORT).replace('__USER__', USER);

// lib/db.js -> the LIVE database
fs.writeFileSync(path.join(lib, 'db.js'), fill(STUB, 'postgres')
  + "\nexport function sql(){return tag();}\nexport function dbEnabled(){return true;}\n"
  + "export async function ensureTable(){await tag()`CREATE TABLE IF NOT EXISTS kv (owner text NOT NULL,k text NOT NULL,v text,updated_at timestamptz DEFAULT now(),PRIMARY KEY(owner,k))`;}\n"
  + "export async function ensureProvidersTable(){await tag()`CREATE TABLE IF NOT EXISTS providers (id text PRIMARY KEY,email text,name text)`;}\n");
// @neondatabase/serverless -> the BACKUP branch, whatever connection string it is handed
fs.writeFileSync(path.join(nm, 'package.json'), '{"name":"@neondatabase/serverless","version":"0.0.0","type":"module","main":"index.js"}');
// neon(cs) routes to a DIFFERENT database per connection string, so several branches can be told
// apart the way real ones would be. The db name is taken from the host part of the fake string.
fs.writeFileSync(path.join(nm, 'index.js'),
  "import { execFileSync } from 'child_process';\nlet n = 0;\n"
  + "function lit(v) {\n  if (v === null || v === undefined) return 'NULL';\n  if (typeof v === 'number') return String(v);\n  if (typeof v === 'boolean') return v ? 'true' : 'false';\n  const tag = 'q' + (n++);\n  return '$' + tag + '$' + String(v) + '$' + tag + '$';\n}\n"
  + "function mk(db){ return function(strings, ...vals){ let text=''; strings.forEach((s,i)=>{text+=s; if(i<vals.length)text+=lit(vals[i]);});\n"
  + "  const trimmed=text.trim().replace(/;\\s*$/,'');\n"
  + "  const q=\"SELECT COALESCE(json_agg(row_to_json(rec)),'[]') FROM (\"+trimmed+\") rec\";\n"
  + "  const out=execFileSync('" + PGBIN + "/psql',['-h','" + sock + "','-p','" + PORT + "','-U','" + USER + "','-d',db,'-A','-t','-X','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'});\n"
  + "  return Promise.resolve(JSON.parse(out.trim()||'[]')); }; }\n"
  + "export function neon(cs){ const s=String(cs||'');\n"
  + "  if(s.indexOf('postgres')<0) throw new Error('bad connection string');\n"
  + "  const host=(s.split('@')[1]||''); const db=(host.split('.')[0]||'backup');\n"
  + "  return mk(db); }\n");
fs.writeFileSync(path.join(lib, 'auth.js'),
  "export function verifyToken(t){try{return JSON.parse(Buffer.from(String(t),'base64').toString('utf8'));}catch(e){return null;}}\nexport async function isSessionValid(){return true;}\n");
fs.writeFileSync(path.join(lib, 'kv-history.js'), fs.readFileSync(path.join(VERCEL, 'lib', 'kv-history.js'), 'utf8'));
fs.writeFileSync(path.join(api, 'recover-import.mjs'), fs.readFileSync(path.join(VERCEL, 'api', 'admin', 'recover-import.js'), 'utf8'));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
if (asRoot) sh('chown -R ' + USER + ' ' + root);

process.env.FOUNDER_EMAILS = 'ashley@slickchart.app';
process.env.SESSION_SECRET = 'test';
// Two branches, as Ashley will actually have: one from just before the loss and an earlier one.
process.env.RECOVERY_DATABASE_URL = 'postgres://u:p@backup.neon.tech/db, postgres://u:p@earlier.neon.tech/db';

const handler = (await import(path.join(api, 'recover-import.mjs'))).default;
const { sql } = await import(path.join(lib, 'db.js'));
function runOn(db, text) {
  return execFileSync(PGBIN + '/psql', ['-h', sock, '-p', PORT, '-U', USER, '-d', db, '-A', '-t', '-X', '-v', 'ON_ERROR_STOP=1', '-c', text], { encoding: 'utf8' });
}
const runBackup = (t) => runOn('backup', t);
const runEarlier = (t) => runOn('earlier', t);
const q = sql();
let fails = 0;
const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (c ? '' : '   -> ' + JSON.stringify(x))); if (!c) fails++; };
const tokenFor = e => Buffer.from(JSON.stringify({ u: 'me', e, sid: 's' })).toString('base64');
async function call(method, opts) {
  opts = opts || {};
  const res = { code: 0, body: null, status(c){this.code=c;return this;}, json(b){this.body=b;return this;}, setHeader(){}, end(){} };
  await handler({ method, headers: { authorization: opts.token ? 'Bearer ' + opts.token : '' },
    query: opts.query || {}, body: opts.body || {} }, res);
  return res;
}

// live
await q`CREATE TABLE IF NOT EXISTS providers (id text PRIMARY KEY, email text, name text)`;
await q`CREATE TABLE IF NOT EXISTS kv (owner text NOT NULL, k text NOT NULL, v text, updated_at timestamptz DEFAULT now(), PRIMARY KEY (owner,k))`;
await q`INSERT INTO providers (id,email,name) VALUES ('prov_h','heather@example.com','Heather Hinkle') ON CONFLICT DO NOTHING`;
await q`INSERT INTO providers (id,email,name) VALUES ('prov_d','diana@example.com','Diana') ON CONFLICT DO NOTHING`;
// backup branch — from BEFORE the loss
runBackup("CREATE TABLE IF NOT EXISTS kv (owner text NOT NULL, k text NOT NULL, v text, updated_at timestamptz DEFAULT now(), PRIMARY KEY (owner,k))");

const good = {}; for (let i = 0; i < 10; i++) good['c' + i] = { name: 'Client ' + i, notes: 'HER REAL NOTE ' + i, skin: 'dry' };
const wrecked = {}; for (let i = 0; i < 9; i++) wrecked['c' + i] = { name: 'Client ' + i, notes: '', skin: '—' };
const lit = s => "$lit$" + s + "$lit$";
runBackup("INSERT INTO kv (owner,k,v) VALUES ('prov_h','sc_clients'," + lit(JSON.stringify(good)) + ")");
runBackup("INSERT INTO kv (owner,k,v) VALUES ('prov_h','sc_bizinfo'," + lit('{"name":"Hers"}') + ")");
runBackup("INSERT INTO kv (owner,k,v) VALUES ('prov_d','sc_session_summaries'," + lit(JSON.stringify({ x: [{ id: 's1' }, { id: 's2' }] })) + ")");
// The EARLIER branch: taken before she wrote two of the three sets of notes, so it holds LESS.
// Picking it over the later one would lose exactly the work she is most upset about.
runEarlier("CREATE TABLE IF NOT EXISTS kv (owner text NOT NULL, k text NOT NULL, v text, updated_at timestamptz DEFAULT now(), PRIMARY KEY (owner,k))");
const fewer = {}; for (let i = 0; i < 10; i++) fewer['c' + i] = { name: 'Client ' + i, notes: i < 4 ? ('HER REAL NOTE ' + i) : '', skin: 'dry' };
runEarlier("INSERT INTO kv (owner,k,v) VALUES ('prov_h','sc_clients'," + lit(JSON.stringify(fewer)) + ")");
runEarlier("INSERT INTO kv (owner,k,v) VALUES ('prov_d','sc_session_summaries'," + lit(JSON.stringify({ x: [{ id: 's1' }] })) + ")");
await q`INSERT INTO kv (owner,k,v) VALUES ('prov_h','sc_clients',${JSON.stringify(wrecked)})`;

// ── the gate, and the env switch ──
ok('not a founder -> 403', (await call('GET', { token: tokenFor('x@y.com'), query: { email: 'heather@example.com' } })).code === 403);
const keep = process.env.RECOVERY_DATABASE_URL; delete process.env.RECOVERY_DATABASE_URL;
let r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { email: 'heather@example.com' } });
ok('says plainly when no branch is configured', r.body && r.body.configured === false && !!r.body.hint, r.body);
process.env.RECOVERY_DATABASE_URL = keep;

// ── the preview ──
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { email: 'heather@example.com' } });
ok('preview 200', r.code === 200 && r.body.ok, r.code);
const row = (r.body.keys || []).find(x => x.key === 'sc_clients');
ok('sees 10 in the backup against 9 live', !!(row && row.backupItems === 10 && row.liveItems === 9), row);
ok('marks it worth importing', !!(row && row.worthIt === true), row);
ok('ignores settings keys entirely', !(r.body.keys || []).some(x => x.key === 'sc_bizinfo'), r.body.keys);
ok('sees no other provider\'s rows', !(r.body.keys || []).some(x => x.key === 'sc_session_summaries'), r.body.keys);
ok('preview carries NO stored values', JSON.stringify(r.body).indexOf('HER REAL NOTE') < 0);

// ── SEVERAL branches at once, which is the real shape of this ──
ok('reports both branches', (r.body.branches || []).length === 2, (r.body.branches || []).map(b => b.label));
ok('labels them by branch name, never the connection string',
  (r.body.branches || []).every(b => /^(backup|earlier)$/.test(b.label)), (r.body.branches || []).map(b => b.label));
ok('a label never leaks a password', JSON.stringify(r.body).indexOf('u:p@') < 0);
ok('the RICHEST branch is listed first', r.body.branches[0].label === 'backup', r.body.branches.map(b => b.label));
// The two branches weigh the SAME (10 clients, 3 fields each) and differ only in whether the
// notes have words in them — the exact damage. Weight cannot see it; bytes can, and the ranking
// has to use both or it recommends the empty one.
const earlierRow = (r.body.branches[1].keys || []).find(x => x.key === 'sc_clients');
ok('the two branches weigh the same, so weight alone cannot rank them',
  !!(earlierRow && earlierRow.backupWeight === row.backupWeight), [earlierRow && earlierRow.backupWeight, row.backupWeight]);
ok('the earlier branch is shown as holding less TEXT', !!(earlierRow && earlierRow.backupBytes < row.backupBytes), earlierRow);
ok('and it is ranked below the fuller one', r.body.branches[0].totalBytes > r.body.branches[1].totalBytes,
  r.body.branches.map(b => [b.label, b.totalBytes]));

// ── the import ──
r = await call('POST', { token: tokenFor('ashley@slickchart.app'), body: { email: 'heather@example.com' } });
ok('import 200', r.code === 200 && r.body.ok, r.body);
ok('imported the roster', r.body.imported === 1 && r.body.keys[0].key === 'sc_clients', r.body);
const hist = await q`SELECT k, v, items, reason FROM kv_history WHERE owner='prov_h'`;
ok('landed as a from-backup version', hist.length === 1 && hist[0].reason === 'from-backup', hist.map(h => h.reason));
ok('with all 10 clients in it', hist[0].items === 10, hist[0].items);
ok('HER NOTES ARE IN IT', JSON.parse(hist[0].v).c4.notes === 'HER REAL NOTE 4', JSON.parse(hist[0].v).c4);
// the whole point: live is untouched until a human says so
const liveNow = await q`SELECT v FROM kv WHERE owner='prov_h' AND k='sc_clients'`;
ok('LIVE DATA WAS NOT TOUCHED', Object.keys(JSON.parse(liveNow[0].v)).length === 9, Object.keys(JSON.parse(liveNow[0].v)).length);

// ── it works for ANY provider, which is the point for Diana ──
r = await call('POST', { token: tokenFor('ashley@slickchart.app'), body: { email: 'diana@example.com' } });
ok('imports a second provider too', r.code === 200 && r.body.imported === 1, r.body);
const dh = await q`SELECT owner, k, items FROM kv_history WHERE owner='prov_d'`;
ok('...into HER OWN history, not Heather\'s', dh.length === 1 && dh[0].k === 'sc_session_summaries', dh);
const hh = await q`SELECT count(*)::int AS n FROM kv_history WHERE owner='prov_h'`;
ok('...and Heather\'s history is unchanged by it', hh[0].n === 1, hh[0]);

// ── nothing worth importing ──
await q`UPDATE kv SET v=${JSON.stringify(good)} WHERE owner='prov_h' AND k='sc_clients'`;
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { email: 'heather@example.com' } });
ok('a key that is already fine is not worth importing', (r.body.keys.find(x => x.key === 'sc_clients') || {}).worthIt === false);
r = await call('POST', { token: tokenFor('ashley@slickchart.app'), body: { email: 'heather@example.com' } });
ok('and importing refuses rather than making noise', r.code === 400, r.body);
// ...unless explicitly asked for by key
r = await call('POST', { token: tokenFor('ashley@slickchart.app'), body: { email: 'heather@example.com', importKeys: ['sc_clients'] } });
ok('an explicit key is still imported on request', r.code === 200 && r.body.imported === 1, r.body);

// ── choosing a branch by name ──
r = await call('POST', { token: tokenFor('ashley@slickchart.app'),
  body: { email: 'heather@example.com', branch: 'earlier', importKeys: ['sc_clients'] } });
ok('can import from a named branch instead of the best one', r.code === 200 && r.body.branch === 'earlier', r.body);
const fromEarlier = await q`SELECT v FROM kv_history WHERE owner='prov_h' AND reason='from-backup' ORDER BY id DESC LIMIT 1`;
ok('...and it really is that branch\'s copy', JSON.parse(fromEarlier[0].v).c7.notes === '', JSON.parse(fromEarlier[0].v).c7);

// ── one unreachable branch must not stop the others ──
process.env.RECOVERY_DATABASE_URL = 'not-a-connection-string, postgres://u:p@backup.neon.tech/db';
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { email: 'heather@example.com' } });
ok('a broken branch is reported but the good one still works',
  r.code === 200 && (r.body.branches || []).some(b => b.error) && (r.body.branches || []).some(b => !b.error && b.keys.length), r.body && r.body.branches);
process.env.RECOVERY_DATABASE_URL = 'not-a-connection-string';
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { email: 'heather@example.com' } });
ok('every branch broken is reported, not swallowed',
  r.code === 200 && (r.body.branches || []).every(b => b.error), r.body && r.body.branches);
process.env.RECOVERY_DATABASE_URL = keep;   // the previous case left a deliberately broken one set
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { email: 'nobody@x.com' } });
ok('unknown provider -> 404', r.code === 404, r.code);

console.log(fails ? '\n' + fails + ' FAILED' : '\nall green');
process.exit(fails ? 1 : 0);
