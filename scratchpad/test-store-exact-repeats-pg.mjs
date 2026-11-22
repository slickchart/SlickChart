// An old build that doubles sc_autos / sc_imported_products on every sync can no longer grow the
// ACCOUNT copy (CLAUDE.md §0.9, 2026-11-22: aur… 5 -> 9,720 -> 19,440 rows). api/store.js drops
// byte-for-byte repeat rows of those two keys on save; nothing else changes. Real PostgreSQL 16.
import { execFile } from 'child_process';
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';
import { createRequire } from 'module';
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16'); process.exit(0); }
const V = new URL('../slickchart-vercel/', import.meta.url).pathname;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rep-')), sock = fs.mkdtempSync(path.join(os.tmpdir(), 'repsock-'));
const PORT = '55507', asRoot = process.getuid() === 0, USER = asRoot ? 'pgtest' : os.userInfo().username;
const sh = c => execFileSync('/bin/sh', ['-c', c], { encoding: 'utf8' });
const pg = c => sh(asRoot ? "su " + USER + " -c '" + c.replace(/'/g, "'\\''") + "'" : c);
if (asRoot) { try { sh('id ' + USER); } catch (e) { sh('useradd -m ' + USER); } sh('chown -R ' + USER + ' ' + root + ' ' + sock + ' && chmod 777 ' + sock); }
let started = false;
process.on('exit', () => { if (started) { try { pg(PGBIN + '/pg_ctl -D ' + root + '/data stop -m immediate'); } catch (e) {} } });
pg(PGBIN + '/initdb -D ' + root + '/data -U ' + USER + ' --auth=trust -E UTF8 >/dev/null');
pg(PGBIN + "/pg_ctl -D " + root + "/data -o '-k " + sock + " -p " + PORT + " -c listen_addresses=' -l " + root + "/log start -w >/dev/null");
started = true;
for (const d of ['lib', 'api']) fs.mkdirSync(path.join(root, d));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
// SQL goes in on stdin (a 4 MB value does not fit in a command line).
fs.writeFileSync(path.join(root, 'lib', 'db.js'), `import { spawn } from 'child_process';
let n = 0;
function lit(v) { if (v === null || v === undefined) return 'NULL'; if (typeof v === 'number') return String(v); if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return 'ARRAY[' + v.map(lit).join(',') + ']::text[]'; const tag = 'q' + (n++) + 'x'; return '$' + tag + '$' + String(v) + '$' + tag + '$'; }
function run(text) { const t = text.trim().replace(/;\\s*$/, ''); const isSel = /^(select|with)/i.test(t); const ret = !isSel && /\\breturning\\b/i.test(t);
  const q = isSel ? "SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM (" + t + ") t" : ret ? "WITH t AS (" + t + ") SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM t" : t;
  return new Promise((res, rej) => { const p = spawn('${PGBIN}/psql', ['-h', '${sock}', '-p', '${PORT}', '-U', '${USER}', '-d', 'postgres', '-A', '-t', '-X', '-q', '-v', 'ON_ERROR_STOP=1']);
    const ob = []; let err = ''; p.stdout.on('data', d => ob.push(d)); p.stderr.on('data', d => err += d);
    p.on('close', c => { const out = Buffer.concat(ob).toString('utf8'); if (c) return rej(new Error(err)); try { res((isSel || ret) ? JSON.parse(out.trim() || '[]') : []); } catch (e) { res([]); } });
    p.stdin.end(q + ';\\n'); }); }
export function sql() { return (strings, ...vals) => { let s = ''; strings.forEach((x, i) => { s += x; if (i < vals.length) s += lit(vals[i]); }); return run(s); }; }
export function dbEnabled() { return true; }
export async function ensureTable() { await sql()\`CREATE TABLE IF NOT EXISTS kv (owner text NOT NULL, k text NOT NULL, v text, updated_at timestamptz DEFAULT now(), PRIMARY KEY (owner,k))\`; }
export async function ensureProvidersTable() {}
`);
fs.writeFileSync(path.join(root, 'lib', 'auth.js'), `export const verifyToken = t => t === 'TOK-A' ? { u: 'provA', sid: 's1' } : t === 'TOK-B' ? { u: 'provB', sid: 's2' } : null;
export const signToken = () => 'x'; export const isSessionValid = async () => true;`);
fs.writeFileSync(path.join(root, 'lib', 'clients.js'), 'export const reconcileDeletedClients = async () => ({});');
fs.copyFileSync(V + 'lib/kv-history.js', path.join(root, 'lib', 'kv-history.js'));
fs.copyFileSync(V + 'api/store.js', path.join(root, 'api', 'store.js'));
fs.copyFileSync(V + 'lib/exact-repeats.js', path.join(root, 'lib', 'exact-repeats.js'));
process.env.SESSION_SECRET = 'test';
const D = await import(path.join(root, 'lib', 'db.js')); await D.ensureTable(); const q = D.sql();
const store = (await import(path.join(root, 'api', 'store.js'))).default;

let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };
async function put(tok, items) { let code = 0, out = null; const res = { setHeader() {}, status(c) { code = c; return { json(o) { out = o; }, end() {} }; } };
  await store({ method: 'PUT', headers: { authorization: 'Bearer ' + tok }, query: {}, body: { items } }, res); return { code, out }; }
const get = async (o, k) => { const r = await q`SELECT v FROM kv WHERE owner=${o} AND k=${k}`; return r[0] ? JSON.parse(r[0].v) : null; };
const autos = [{ id: 'a1', name: 'Rebook', on: true }, { id: 'a2', name: 'Birthday', on: false }, { name: 'old no id', days: 30 }];
// 1. An old device sends the list doubled four times over (3 -> 48 rows).
let big = autos; for (let i = 0; i < 4; i++) big = big.concat(big);
let r = await put('TOK-A', { sc_autos: JSON.stringify(big) });
ok(r.code === 200 && r.out && r.out.ok, 'save accepted (' + r.code + ')');
let v = await get('provA', 'sc_autos');
ok(Array.isArray(v) && v.length === 3, 'account keeps the 3 distinct rows, not ' + big.length + ' (got ' + (v && v.length) + ')');
ok(JSON.stringify(v) === JSON.stringify(autos), 'first copy of each row kept, in order');
// 2. merge(X,X): the same list again does not grow it.
await put('TOK-A', { sc_autos: JSON.stringify(autos.concat(autos)) });
v = await get('provA', 'sc_autos'); ok(v.length === 3, 'doubling again still 3');
// 3. Rows that differ by one letter both stay (nothing she made is lost).
const two = [{ id: 'a1', name: 'Rebook' }, { id: 'a1', name: 'Rebooks' }];
await put('TOK-A', { sc_autos: JSON.stringify(two) }); v = await get('provA', 'sc_autos');
ok(v.length === 2, 'near-identical rows are both kept');
// 4. A delete (shorter list) is stored as sent.
await put('TOK-A', { sc_autos: JSON.stringify([autos[0]]) }); v = await get('provA', 'sc_autos');
ok(v.length === 1 && v[0].id === 'a1', 'a removal is saved as sent');
// 5. sc_imported_products too.
const prods = [{ name: 'Serum', price: 40 }, { name: 'SPF', price: 30 }];
await put('TOK-A', { sc_imported_products: JSON.stringify(prods.concat(prods, prods)) });
v = await get('provA', 'sc_imported_products'); ok(v.length === 2, 'sc_imported_products repeats dropped (' + v.length + ')');
// 6. Other keys are untouched: a list that may legitimately hold equal rows is stored as sent.
const same = [{ t: 'x' }, { t: 'x' }];
await put('TOK-A', { sc_notes_log: JSON.stringify(same) }); v = await get('provA', 'sc_notes_log');
ok(v.length === 2, 'other keys keep repeats exactly as sent');
// 7. A non-array value is stored untouched.
await put('TOK-A', { sc_autos: '{"weird":1}' }); v = await get('provA', 'sc_autos');
ok(v && v.weird === 1, 'non-list value stored as sent');
// 8. Isolation: B's save never touches A.
await put('TOK-B', { sc_autos: JSON.stringify(big) });
const a = await get('provA', 'sc_autos'), b = await get('provB', 'sc_autos');
ok(a && a.weird === 1 && b.length === 3, 'B saves its own list; A unchanged');
console.log(pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
