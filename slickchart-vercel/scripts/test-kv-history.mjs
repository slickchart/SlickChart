// The safety net, against a REAL PostgreSQL 16.
//
//   node scripts/test-kv-history.mjs        (from slickchart-vercel/)
//
// Four separate incidents have ended with a provider's work gone and no way back — Diana's
// summaries, Riquelle's forms, Heather's horse links, Heather's notes. Each had a different cause.
// This file asserts the property that holds whatever the cause: if a write SHRINKS one of her
// libraries, the old value is still there afterwards and can be put back.
//
// Against a real database because every claim here is SQL: the window function in pruneKey, ANY(),
// the jsonb counting, and the restore's insert-then-upsert ordering.
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const STUB = "import { execFileSync } from 'child_process';\nlet n = 0;\nfunction lit(v) {\n  if (v === null || v === undefined) return 'NULL';\n  if (typeof v === 'number') return String(v);\n  if (typeof v === 'boolean') return v ? 'true' : 'false';\n  if (Array.isArray(v)) return 'ARRAY[' + v.map(lit).join(',') + ']::text[]';\n  const tag = 'q' + (n++);\n  return '$' + tag + '$' + String(v) + '$' + tag + '$';\n}\nfunction run(text) {\n  const trimmed = text.trim().replace(/;\\s*$/, '');\n  const isSelect = /^select/i.test(trimmed);\n  const returning = !isSelect && /\\breturning\\b/i.test(trimmed);\n  const q = isSelect\n    ? \"SELECT COALESCE(json_agg(row_to_json(rec)),'[]') FROM (\" + trimmed + \") rec\"\n    : returning\n      ? \"WITH rec AS (\" + trimmed + \") SELECT COALESCE(json_agg(row_to_json(rec)),'[]') FROM rec\"\n      : trimmed;\n  const out = execFileSync('__PSQL__',\n    ['-h', '__SOCK__', '-p', '__PORT__', '-U', '__USER__', '-d', 'postgres', '-A', '-t', '-X', '-v', 'ON_ERROR_STOP=1', '-c', q],\n    { encoding: 'utf8' });\n  return (isSelect || returning) ? JSON.parse(out.trim() || '[]') : [];\n}\nexport function sql() {\n  return function (strings, ...vals) {\n    let text = '';\n    strings.forEach((s, i) => { text += s; if (i < vals.length) text += lit(vals[i]); });\n    return Promise.resolve(run(text));\n  };\n}\nexport function dbEnabled() { return true; }\n";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const VERCEL = process.argv[2] || path.join(HERE, '..');
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16 at ' + PGBIN); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kvh-'));
const sock = fs.mkdtempSync(path.join(os.tmpdir(), 'kvhs-'));
const PORT = '55441';
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

const lib = path.join(root, 'lib');
fs.mkdirSync(lib, { recursive: true });
fs.writeFileSync(path.join(lib, 'db.js'), STUB.replace('__PSQL__', PGBIN + '/psql').replace('__SOCK__', sock).replace('__PORT__', PORT).replace('__USER__', USER));
fs.writeFileSync(path.join(lib, 'kv-history.mjs'), fs.readFileSync(path.join(VERCEL, 'lib', 'kv-history.js'), 'utf8'));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
if (asRoot) sh('chown -R ' + USER + ' ' + root);

const H = await import(path.join(lib, 'kv-history.mjs'));
const { sql } = await import(path.join(lib, 'db.js'));
const q = sql();
let fails = 0;
function ok(n, c, x) { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (c ? '' : '   -> ' + JSON.stringify(x))); if (!c) fails++; }

await q`CREATE TABLE IF NOT EXISTS kv (owner text NOT NULL, k text NOT NULL, v text, updated_at timestamptz DEFAULT now(), PRIMARY KEY (owner,k))`;
await H.ensureHistoryTable();
const P = 'prov_heather', P2 = 'prov_other';
const put = (o, k, v) => q`INSERT INTO kv (owner,k,v) VALUES (${o},${k},${v})
  ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()`;
const read = async (o, k) => { const r = await q`SELECT v FROM kv WHERE owner=${o} AND k=${k}`; return r[0] ? r[0].v : null; };
const hist = async (o, k) => await q`SELECT id,k,items,reason FROM kv_history WHERE owner=${o} AND k=${k} ORDER BY saved_at DESC, id DESC`;

// ── the counting the whole thing rests on ──
ok('counts an object', H.itemCount('{"a":1,"b":2}') === 2);
ok('counts an array', H.itemCount('[1,2,3]') === 3);
ok('junk counts as nothing', H.itemCount('not json') === 0 && H.itemCount(null) === 0);

// ── HEATHER: 10 real clients replaced by placeholders ──
const roster = {};
for (let i = 0; i < 10; i++) roster['c' + i] = { name: 'Client ' + i, notes: 'a real chart note for client ' + i, skin: 'dry' };
await put(P, 'sc_clients', JSON.stringify(roster));
// the app rebuilds 9 of them as placeholders and drops one
const wrecked = {};
for (let i = 0; i < 9; i++) wrecked['c' + i] = { name: 'Client ' + i, notes: '', skin: '—' };
await H.snapshotBeforeWrite(P, { sc_clients: JSON.stringify(wrecked) });
await put(P, 'sc_clients', JSON.stringify(wrecked));
let h = await hist(P, 'sc_clients');
ok('the shrink was caught', h.length === 1 && h[0].reason === 'shrink', h);
ok('the kept copy has all 10', h[0].items === 10, h[0]);
// and we can put it back
let res = await H.restoreVersion(P, h[0].id);
ok('restore reports ok', res.ok === true && res.items === 10, res);
const back = JSON.parse(await read(P, 'sc_clients'));
ok('her 10 clients are back', Object.keys(back).length === 10);
ok('HER NOTES ARE BACK', back.c3.notes === 'a real chart note for client 3', back.c3);
// the restore itself is undoable
h = await hist(P, 'sc_clients');
ok('the wrecked version was kept too, so a restore is undoable', h.some(x => x.reason === 'before-restore' && x.items === 9), h);

// ── DIANA: same client count, but the summaries inside were emptied ──
const full = {}; for (let i = 0; i < 6; i++) full['c' + i] = Array.from({ length: 9 }, (_, j) => ({ id: 's' + j, text: 'a visit summary with real content in it number ' + j }));
await put(P, 'sc_session_summaries', JSON.stringify(full));
const gutted = {}; for (let i = 0; i < 6; i++) gutted['c' + i] = [];
await H.snapshotBeforeWrite(P, { sc_session_summaries: JSON.stringify(gutted) });
await put(P, 'sc_session_summaries', JSON.stringify(gutted));
h = await hist(P, 'sc_session_summaries');
ok('a same-count gutting is caught by size', h.length === 1 && h[0].reason === 'shrink', h);
res = await H.restoreVersion(P, h[0].id);
const sum = JSON.parse(await read(P, 'sc_session_summaries'));
ok('the summaries come back', sum.c2.length === 9, sum.c2 && sum.c2.length);

// ── what must NOT be kept, or the table grows for nothing ──
await q`DELETE FROM kv_history WHERE owner=${P} AND k='sc_forms'`;
await put(P, 'sc_forms', JSON.stringify({ a: 1 }));
await H.snapshotBeforeWrite(P, { sc_forms: JSON.stringify({ a: 1, b: 2 }) });
await put(P, 'sc_forms', JSON.stringify({ a: 1, b: 2 }));
let hf = await hist(P, 'sc_forms');
ok('a GROWING write keeps one daily, not a shrink', hf.length === 1 && hf[0].reason === 'daily', hf);
await H.snapshotBeforeWrite(P, { sc_forms: JSON.stringify({ a: 1, b: 2, c: 3 }) });
hf = await hist(P, 'sc_forms');
ok('a second growing write the same day keeps nothing more', hf.length === 1, hf);
ok('an identical write keeps nothing', H.snapshotReason('{"a":1}', '{"a":1}', null, Date.now()) === '');
ok('a settings blob is never kept', H.snapshotReason('{}', '{"x":1}', null, Date.now()) === '');
ok('an untracked key is ignored entirely',
  (await H.snapshotBeforeWrite(P, { sc_bizinfo: '{}' })).saved === 0);

// ── pruning keeps it bounded ──
await q`DELETE FROM kv_history WHERE owner=${P} AND k='sc_docs'`;
for (let i = 20; i > 0; i--) {
  await put(P, 'sc_docs', JSON.stringify(Array.from({ length: i + 1 }, (_, j) => ({ id: j }))));
  await H.snapshotBeforeWrite(P, { sc_docs: JSON.stringify(Array.from({ length: i }, (_, j) => ({ id: j }))) });
  await put(P, 'sc_docs', JSON.stringify(Array.from({ length: i }, (_, j) => ({ id: j }))));
}
const hd = await hist(P, 'sc_docs');
ok('shrink history is capped at 8', hd.filter(x => x.reason === 'shrink').length === 8, hd.length);
ok('the NEWEST shrinks are the ones kept', hd.filter(x => x.reason === 'shrink')[0].items === 2, hd[0]);

// ── isolation: another provider's history is untouchable (§0.1) ──
await put(P2, 'sc_clients', JSON.stringify({ x: { name: 'Theirs' }, y: { name: 'Theirs2' } }));
await H.snapshotBeforeWrite(P2, { sc_clients: JSON.stringify({ x: { name: 'Theirs' } }) });
const h2 = await hist(P2, 'sc_clients');
ok('the other provider got their own snapshot', h2.length === 1, h2);
res = await H.restoreVersion(P, h2[0].id);
ok('one provider cannot restore another provider\'s version', res.ok === false, res);
const theirs = JSON.parse(await read(P2, 'sc_clients'));
ok('...and their data was not touched', Object.keys(theirs).length === 2);
const mine = await H.listHistory(P, 'sc_clients');
ok('a listing never leaks another provider\'s rows', mine.every(x => x.id !== h2[0].id));
ok('a listing carries metadata only, never the value', mine.every(x => !('v' in x)), mine[0]);

// ── it must never break a save ──
res = await H.restoreVersion(P, 99999999);
ok('restoring a version that is gone fails cleanly', res.ok === false && !!res.error, res);

console.log(fails ? '\n' + fails + ' FAILED' : '\nall green');
process.exit(fails ? 1 : 0);
