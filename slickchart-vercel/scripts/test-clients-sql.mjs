// Stub for lib/db.js: renders the tagged template to SQL text and runs it through psql.
const STUB = "import { execFileSync } from 'child_process';\nlet n = 0;\nfunction lit(v) {\n  if (v === null || v === undefined) return 'NULL';\n  if (typeof v === 'number') return String(v);\n  if (typeof v === 'boolean') return v ? 'true' : 'false';\n  const tag = 'q' + (n++);\n  return '$' + tag + '$' + String(v) + '$' + tag + '$';\n}\nfunction run(text) {\n  const trimmed = text.trim().replace(/;\\s*$/, '');\n  const isSelect = /^select/i.test(trimmed);\n  const q = isSelect\n    ? \"SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM (\" + trimmed + \") t\"\n    : trimmed;\n  const out = execFileSync('__PSQL__',\n    ['-h', '__SOCK__', '-p', '__PORT__', '-U', '__USER__', '-d', 'postgres', '-A', '-t', '-X', '-v', 'ON_ERROR_STOP=1', '-c', q],\n    { encoding: 'utf8' });\n  return isSelect ? JSON.parse(out.trim() || '[]') : [];\n}\nexport function sql() {\n  return function (strings, ...vals) {\n    let text = '';\n    strings.forEach((s, i) => { text += s; if (i < vals.length) text += lit(vals[i]); });\n    return Promise.resolve(run(text));\n  };\n}\n";

// Runs the REAL SQL in lib/clients.js against a REAL PostgreSQL 16, because the guards that keep a
// client's summaries and pending forms alive are written IN the statement (a read-then-write in JS
// would race two concurrent syncs) and reasoning about jsonb by eye is how a bug ships.
//
//   node scripts/test-clients-sql.mjs        (from slickchart-vercel/)
//
// It boots a throwaway cluster in a temp dir, points a stub ./db.js at it through psql, imports the
// real upsertClient and asserts the decision table. @neondatabase/serverless isn't installed in the
// scratch env, hence the stub — the SQL text under test is the shipped text, unmodified. Not in CI:
// it needs a local PostgreSQL 16 (it exits 0 with SKIP when there isn't one). Run it by hand after
// ANY change to lib/clients.js.
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Repo root is derived from this file's own location, so it runs from anywhere.
const HERE = path.dirname(new URL(import.meta.url).pathname);
const VERCEL = process.argv[2] || path.join(HERE, '..');
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16 at ' + PGBIN); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scsql-'));
const sock = fs.mkdtempSync(path.join(os.tmpdir(), 'scsock-'));
const PORT = '55433';
// initdb refuses to run as root, so when we are root we hand the cluster to a throwaway account and
// make the socket dir world-traversable (the session scratchpad isn't traversable by that user).
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const USER = asRoot ? 'pgtest' : os.userInfo().username;
function sh(cmd) { return execFileSync('/bin/sh', ['-c', cmd], { encoding: 'utf8' }); }
function pg(cmd) { return sh(asRoot ? "su " + USER + " -c '" + cmd.replace(/'/g, "'\\''") + "'" : cmd); }
if (asRoot) {
  try { sh('id ' + USER); } catch (e) { sh('useradd -m ' + USER); }
  sh('chown -R ' + USER + ' ' + root + ' ' + sock + ' && chmod 777 ' + sock);
}
let started = false;
process.on('exit', function () { if (started) { try { pg(PGBIN + '/pg_ctl -D ' + root + '/data stop -m immediate'); } catch (e) {} } });
pg(PGBIN + '/initdb -D ' + root + '/data -U ' + USER + ' --auth=trust >/dev/null');
pg(PGBIN + "/pg_ctl -D " + root + "/data -o '-k " + sock + " -p " + PORT + " -c listen_addresses=' -l " + root + "/log start -w >/dev/null");
started = true;

const hdir = path.join(root, 'h');
fs.mkdirSync(hdir);
// lib/google-cal.js also imports dbEnabled, so the stub has to provide it.
fs.writeFileSync(path.join(hdir, 'db.js'), STUB.replace('__PSQL__', PGBIN + '/psql').replace('__SOCK__', sock).replace('__PORT__', PORT).replace('__USER__', USER)
  + '\nexport function dbEnabled() { return true; }\n');
fs.writeFileSync(path.join(hdir, 'clients.mjs'), fs.readFileSync(path.join(VERCEL, 'lib', 'clients.js'), 'utf8'));
if (asRoot) sh('chown -R ' + USER + ' ' + root);

const { ensureClientTables, upsertClient } = await import(path.join(hdir, 'clients.mjs'));
const { sql } = await import(path.join(hdir, 'db.js'));

const q = sql();
const P = 'prov_A', P2 = 'prov_B';
let fails = 0;
function ok(name, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond ? '' : '   -> ' + JSON.stringify(extra)));
  if (!cond) fails++;
}
async function stored(id, prov) {
  const r = await q`SELECT data FROM clients WHERE id=${id} AND provider_id=${prov || P}`;
  return r[0] ? (typeof r[0].data === 'string' ? JSON.parse(r[0].data) : r[0].data) : null;
}
const S1 = { id: 's1', ts: 1000, title: 'First visit' };
const S2 = { id: 's2', ts: 2000, title: 'Second visit' };
const F1 = { id: 'f1', formId: 'intake' };

await ensureClientTables();

// --- 1. the bug: an UPDATE whose blob has no summaries must not wipe the stored ones
await upsertClient(P, { id: 'c1', name: 'Jen', data: { summaries: [S2, S1], profile: { skin: 'dry' } } });
ok('seed stored 2 summaries', (await stored('c1')).summaries.length === 2);
await upsertClient(P, { id: 'c1', name: 'Jen', data: { summaries: [], profile: { skin: 'oily' } } });
let d = await stored('c1');
ok('empty summaries does NOT wipe stored', d.summaries && d.summaries.length === 2, d);
ok('rest of the blob still updates', d.profile && d.profile.skin === 'oily', d);

// --- 2. key absent entirely (not just empty)
await upsertClient(P, { id: 'c1', name: 'Jen', data: { profile: { skin: 'combo' } } });
d = await stored('c1');
ok('absent summaries key does NOT wipe stored', d.summaries && d.summaries.length === 2, d);

// --- 3. a real edit still lands
await upsertClient(P, { id: 'c1', name: 'Jen', data: { summaries: [S1] } });
d = await stored('c1');
ok('genuine shrink 2 -> 1 is allowed', d.summaries.length === 1 && d.summaries[0].id === 's1', d);
await upsertClient(P, { id: 'c1', name: 'Jen', data: { summaries: [S2, S1] } });
ok('growth 1 -> 2 is allowed', (await stored('c1')).summaries.length === 2);

// --- 4. no key is invented on a blob that never had one
await upsertClient(P, { id: 'c2', name: 'Pat', data: { profile: {} } });
await upsertClient(P, { id: 'c2', name: 'Pat', data: { profile: { a: 1 } } });
d = await stored('c2');
ok('no summaries key invented', !('summaries' in d), d);
ok('no pendingForms key invented', !('pendingForms' in d), d);

// --- 5. pendingForms, same guard, on the UPDATE path (it only had one on INSERT before)
await upsertClient(P, { id: 'c3', name: 'Rae', data: { pendingForms: [F1] } });
await upsertClient(P, { id: 'c3', name: 'Rae', data: { pendingForms: [], note: 'x' } });
d = await stored('c3');
ok('empty pendingForms does NOT wipe stored (UPDATE path)', d.pendingForms.length === 1, d);
await upsertClient(P, { id: 'c3', name: 'Rae', data: { pendingForms: [] } });
await upsertClient(P, { id: 'c3', name: 'Rae', data: { pendingForms: [] } });
ok('pendingForms still protected on repeat', (await stored('c3')).pendingForms.length === 1);

// --- 6. INSERT ... ON CONFLICT path (brand-new id, two racing writes)
await q`INSERT INTO clients (id, provider_id, token, name, email, phone, data, created_at, updated_at)
  VALUES ('c4', ${P}, 'tok_c4', 'Dee', '', '', ${JSON.stringify({ summaries: [S1], pendingForms: [F1] })}::jsonb, 1, 1)`;
await upsertClient(P, { id: 'c4', name: 'Dee', data: { summaries: [], pendingForms: [] } });
d = await stored('c4');
ok('ON CONFLICT: empty summaries kept stored', d.summaries.length === 1, d);
ok('ON CONFLICT: empty pendingForms kept stored', d.pendingForms.length === 1, d);
await upsertClient(P, { id: 'c4', name: 'Dee', data: { summaries: [S1, S2], pendingForms: [] } });
d = await stored('c4');
ok('ON CONFLICT: real summaries land', d.summaries.length === 2, d);

// --- 7. non-array junk in either side does not throw or corrupt
await upsertClient(P, { id: 'c5', name: 'Odd', data: { summaries: 'nope' } });
d = await stored('c5');
ok('string summaries stored as-is (no crash)', d.summaries === 'nope', d);
await upsertClient(P, { id: 'c5', name: 'Odd', data: { summaries: [S1] } });
ok('recovers to a real array', (await stored('c5')).summaries.length === 1);
await upsertClient(P, { id: 'c5', name: 'Odd', data: { summaries: null } });
d = await stored('c5');
ok('null summaries does NOT wipe stored', Array.isArray(d.summaries) && d.summaries.length === 1, d);

// --- 8. tenant isolation: another provider cannot touch this row
await q`INSERT INTO clients (id, provider_id, token, name, email, phone, data, created_at, updated_at)
  VALUES ('c6', ${P}, 'tok_c6', 'Mine', '', '', ${JSON.stringify({ summaries: [S1], secret: 'A' })}::jsonb, 1, 1)`;
let threw = null;
try { await upsertClient(P2, { id: 'c6', name: 'HIJACK', data: { summaries: [S2], secret: 'B' } }); }
catch (e) { threw = e; }
ok('cross-provider upsert is rejected, not silently ok', threw && threw.code === 'id_taken', threw && threw.message);
d = await stored('c6');
ok('cross-provider upsert does not modify the row', d.secret === 'A' && d.summaries[0].id === 's1', d);
const nameRow = await q`SELECT name FROM clients WHERE id='c6'`;
ok('cross-provider upsert does not rename', nameRow[0].name === 'Mine', nameRow);

// --- 9. deleted (tombstoned) client stays a no-op
await q`UPDATE clients SET deleted_at=123 WHERE id='c6'`;
await upsertClient(P, { id: 'c6', name: 'Back', data: { summaries: [S2] } });
d = await stored('c6');
ok('tombstoned client not resurrected', d.secret === 'A' && d.summaries[0].id === 's1', d);

// --- 10. `animals` — the equestrian owner's list of horses, which carries each horse's own
// summaries and is the last fallback copy of the owner-to-horse grouping.
const H1 = { id: 'h1', name: 'Thunder', species: 'Horse', summaries: [S1] };
await upsertClient(P, { id: 'c8', name: 'Sarah', data: { animals: [H1], profile: {} } });
await upsertClient(P, { id: 'c8', name: 'Sarah', data: { animals: [], profile: { a: 1 } } });
d = await stored('c8');
ok("empty animals does NOT wipe the owner's horses", d.animals.length === 1, d);
await upsertClient(P, { id: 'c8', name: 'Sarah', data: { animals: [H1, { id: 'h2', name: 'Biscuit' }] } });
ok('a second horse still lands', (await stored('c8')).animals.length === 2);
await upsertClient(P, { id: 'c9', name: 'Esty', data: { profile: {} } });
await upsertClient(P, { id: 'c9', name: 'Esty', data: { profile: { a: 1 } } });
ok('no animals key invented for a provider with none', !('animals' in (await stored('c9'))));

// --- 11. phone is still COALESCEd, never blanked
await upsertClient(P, { id: 'c7', name: 'Ph', phone: '555-0100', data: {} });
await upsertClient(P, { id: 'c7', name: 'Ph', data: {} });
const ph = await q`SELECT phone, name FROM clients WHERE id='c7'`;
ok('phone survives a write that omits it', ph[0].phone === '555-0100', ph);

// --- 12. google_connections: a token REFRESH returns no refresh_token, and the upsert must keep the
// one we already hold. Nulling it turns a working two-way calendar into a dead one an hour later,
// silently, and the only symptom is bookings stopping being blocked.
const gsrc = fs.readFileSync(path.join(VERCEL, 'lib', 'google-cal.js'), 'utf8');
fs.writeFileSync(path.join(hdir, 'gcal.mjs'), gsrc);
const G = await import(path.join(hdir, 'gcal.mjs'));
await G.ensureGoogleTable();
await G.saveGoogleConnection('prov_G', { access_token: 'at1', refresh_token: 'rt1', expires_in: 3600 });
let g = await G.getGoogleConnection('prov_G');
ok('google: first connect stores both tokens', g.access_token === 'at1' && g.refresh_token === 'rt1', g);
await G.saveGoogleConnection('prov_G', { access_token: 'at2', expires_in: 3600 });   // a refresh
g = await G.getGoogleConnection('prov_G');
ok('google: refresh keeps the refresh token', g.refresh_token === 'rt1', g);
ok('google: refresh updates the access token', g.access_token === 'at2', g);
ok('google: reconnect clears a stale error', g.last_error === null, g);
const gOther = await G.getGoogleConnection('prov_H');
ok('google: another provider has no connection', gOther === null || gOther === undefined, gOther);
await G.deleteGoogleConnection('prov_G');
ok('google: disconnect removes the row', !(await G.getGoogleConnection('prov_G')));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall green');
process.exitCode = fails ? 1 : 0;
