// Saving a value too big for one request (2026-11-18): api/store.js takes it in pieces and saves it
// only when every piece is in and they add up, through the ordinary save path, on real PostgreSQL 16.
// Then the app's own Cloud._sendBig is driven in Chromium against this same server.
import { execFile } from 'child_process';
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';
import { createRequire } from 'module';
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16'); process.exit(0); }
const V = new URL('../slickchart-vercel/', import.meta.url).pathname;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'big-')), sock = fs.mkdtempSync(path.join(os.tmpdir(), 'bigsock-'));
const PORT = '55501', asRoot = process.getuid() === 0, USER = asRoot ? 'pgtest' : os.userInfo().username;
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
const S = await import(path.join(root, 'api', 'store.js'));
// A tiny Vercel-like server: JSON body up to 4.5 MB, otherwise 413, like the platform.
const srv = http.createServer((req, res) => {
  let b = []; let len = 0; req.on('data', d => { len += d.length; b.push(d); });
  req.on('end', async () => {
    if (len > 4.5e6) { res.statusCode = 413; res.end('{"error":"too large"}'); return; }
    res.status = c => { res.statusCode = c; return { json: o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); } }; };
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*'); res.setHeader('Access-Control-Allow-Methods', '*');
    if (req.method === 'OPTIONS') { res.end(); return; }
    try { req.body = len ? JSON.parse(Buffer.concat(b).toString('utf8')) : {}; } catch (e) { res.statusCode = 400; res.end('{}'); return; }
    req.query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    if (!req.url.startsWith('/api/')) { const f = path.join(V, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.startsWith(V) && fs.existsSync(f) && fs.statSync(f).isFile()) { res.setHeader('Content-Type', f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); res.end(fs.readFileSync(f)); } else { res.statusCode = 404; res.end(); } return; }
    if (!req.url.startsWith('/api/store')) { res.setHeader('Content-Type', 'application/json'); res.end('{}'); return; }
    if (globalThis.FAIL_PIECE != null && req.body && req.body.part && req.body.part.i === globalThis.FAIL_PIECE) { globalThis.FAIL_PIECE = null; res.statusCode = 500; res.end('{"error":"boom"}'); return; }
    await store(req, res);
  });
}).listen(0);
const base = 'http://127.0.0.1:' + srv.address().port;
const api = (tok, body, m = 'PUT') => fetch(base + '/api/store', { method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: body && JSON.stringify(body) });
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' — ' + String(JSON.stringify(d)).slice(0, 300))); ok ? pass++ : fail++; };

// A client list of 6 MB: notes with quotes, newlines and emoji.
const roster = {}; for (let i = 0; i < 2600; i++) roster['c' + i] = { id: 'c' + i, name: 'Client ' + i + ' 😀', notes: ('Peel "30%", skin ok.\n😊 ').repeat(90) };
const big = JSON.stringify(roster);
check('the list is past the one-request limit', Buffer.byteLength(JSON.stringify({ items: { sc_clients: big } })) > 4.5e6, big.length);
const r413 = await api('TOK-A', { items: { sc_clients: big } });
check('sent whole, the platform refuses it (413), as today', r413.status === 413, r413.status);
await api('TOK-A', { items: { sc_clients: JSON.stringify({ c0: { id: 'c0', name: 'Old' } }) } });

// pieces by hand
const cut = (v, size) => { const out = []; let i = 0; while (i < v.length) { let e = Math.min(v.length, i + size); if (e < v.length) { const c = v.charCodeAt(e - 1); if (c >= 0xD800 && c <= 0xDBFF) e--; } out.push(v.slice(i, e)); i = e; } return out; };
const parts = cut(big, 900000), n = parts.length, id = 'test0001abcd';
for (let i = 0; i < n - 1; i++) { const r = await api('TOK-A', { part: { k: 'sc_clients', id, i, n, total: big.length, data: parts[i] } }); const j = await r.json(); if (!(r.ok && j.partial)) check('piece ' + i + ' kept', false, j); }
let now = (await q`SELECT v FROM kv WHERE owner='provA' AND k='sc_clients'`)[0].v;
check('before the last piece the account still has the old list (never half a list)', JSON.parse(now).c0.name === 'Old');
// another account cannot finish provider A's upload
const rb = await api('TOK-B', { part: { k: 'sc_clients', id, i: n - 1, n, total: big.length, data: parts[n - 1] } }); const jb = await rb.json();
check('another account sending the last piece does not complete it', jb.partial === true && (await q`SELECT count(*)::int AS c FROM kv WHERE owner='provB' AND k='sc_clients'`)[0].c === 0, jb);
const rl = await api('TOK-A', { part: { k: 'sc_clients', id, i: n - 1, n, total: big.length, data: parts[n - 1] } }); const jl = await rl.json();
check('the last piece saves it', rl.ok && jl.ok && !jl.partial, jl);
now = (await q`SELECT v FROM kv WHERE owner='provA' AND k='sc_clients'`)[0].v;
check('the saved list is identical, emoji included (' + Math.round(now.length / 1e6 * 10) / 10 + 'M chars)', now === big);
check('the pieces are cleaned up', (await q`SELECT count(*)::int AS c FROM kv_parts WHERE owner='provA'`)[0].c === 0);
check('provider B\'s stray piece never touched A', (await q`SELECT count(*)::int AS c FROM kv WHERE owner='provB'`)[0].c === 0);
const hist = await q`SELECT reason FROM kv_history WHERE owner='provA' AND k='sc_clients'`;
check('the ordinary save path ran (history copy kept)', hist.length >= 1, hist);
// mismatch: total does not add up -> nothing saved
const p2 = cut(big.slice(0, 1500000), 900000);
await api('TOK-A', { part: { k: 'sc_clients', id: 'test0002abcd', i: 0, n: 2, total: 1500001, data: p2[0] } });
const rm = await api('TOK-A', { part: { k: 'sc_clients', id: 'test0002abcd', i: 1, n: 2, total: 1500001, data: p2[1] } });
check('pieces that do not add up are refused and nothing changes', rm.status === 409 && (await q`SELECT v FROM kv WHERE owner='provA' AND k='sc_clients'`)[0].v === big, rm.status);
const re = await api('TOK-A', { part: { k: 'sc_clients', id: 'test0003abcd', i: 0, n: 2, total: 3, data: 'a\uD83D' } });
check('a piece cut inside an emoji is refused', re.status === 400, re.status);
const ru = await fetch(base + '/api/store', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ part: { k: 'sc_clients', id: 'test0004abcd', i: 0, n: 1, total: 1, data: 'x' } }) });
check('no session, no piece', ru.status === 401, ru.status);
// reading it back: whole-account read is streamed past 3.5 MB
const rg = await fetch(base + '/api/store', { headers: { Authorization: 'Bearer TOK-A' } }); const jg = await rg.json();
check('a new device reads the whole list back', jg.data.sc_clients === big);
const rk = await fetch(base + '/api/store?key=sc_clients', { headers: { Authorization: 'Bearer TOK-A' } }); const jk = await rk.json();
check('the one-key read returns it too', jk.data.sc_clients === big);

// The app itself: Cloud._send hands a big value to _sendBig, which saves it in pieces.
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const p = await b.newPage();
await p.route('**/sw.js', r => r.fulfill({ status: 404, body: '' }));
await p.goto(base + '/slickchart.html');
await p.waitForFunction(() => typeof Cloud === 'object' && typeof Cloud._sendBig === 'function');
const big2 = big.replace(/Peel/g, 'Facial');
const out = await p.evaluate(async (v) => {
  Cloud.token = 'TOK-A'; Cloud._holdUploads = () => false; Cloud._passive = false;
  const before = Object.keys(Cloud._queue || {}).length;
  Cloud._send({ sc_clients: v, sc_small: '{"a":1}' }, 0);
  for (let i = 0; i < 300 && !(Cloud._serverSeen && Cloud._serverSeen.sc_clients === v); i++) await new Promise(r => setTimeout(r, 100));
  return { seen: !!(Cloud._serverSeen && Cloud._serverSeen.sc_clients === v), busy: !!(Cloud._bigBusy && Cloud._bigBusy.sc_clients), queued: 'sc_clients' in (Cloud._queue || {}) };
}, big2);
await new Promise(r => setTimeout(r, 500));
const saved = (await q`SELECT v FROM kv WHERE owner='provA' AND k='sc_clients'`)[0].v;
const small = (await q`SELECT v FROM kv WHERE owner='provA' AND k='sc_small'`)[0];
check('the app saved the 6 MB list in pieces and knows it landed', out.seen && !out.busy && !out.queued && saved === big2, out);
check('the small value in the same save went as before', small && small.v === '{"a":1}', small);
// a piece fails half way (a dropped connection): the account keeps the last whole list, and the app
// sends it again until it lands. Meanwhile she edits again: the NEWEST list is what ends up saved.
globalThis.FAIL_PIECE = 3;
const big3 = big.replace(/Facial|Peel/g, 'Dermaplane'), big4 = big3.replace(/skin ok/g, 'skin calm');
const out2 = await p.evaluate(async ([v3, v4]) => {
  Cloud._send({ sc_clients: v3 }, 0);
  await new Promise(r => setTimeout(r, 30));
  Cloud._queue.sc_clients = v4; Cloud._flush(0);       // her next edit, while the first is still going
  for (let i = 0; i < 600 && !(Cloud._serverSeen && Cloud._serverSeen.sc_clients === v4); i++) await new Promise(r => setTimeout(r, 100));
  return { seen4: !!(Cloud._serverSeen && Cloud._serverSeen.sc_clients === v4) };
}, [big3, big4]);
const saved4 = (await q`SELECT v FROM kv WHERE owner='provA' AND k='sc_clients'`)[0].v;
check('a failed piece is retried and her newest edit is what is saved', out2.seen4 && saved4 === big4, { out2, same3: saved4 === big3, same2: saved4 === big2 });
check('no stray pieces left behind but the failed attempt (cleared within a day)', (await q`SELECT count(DISTINCT upload_id)::int AS c FROM kv_parts WHERE owner='provA'`)[0].c <= 1);
const th = await p.evaluate(() => {
  const q2 = JSON.stringify({ x: '"'.repeat(1700000) });          // 1.7M chars, ~3.4 MB once escaped
  return { quotes: Cloud._tooBigForOne(q2), small: Cloud._tooBigForOne('{"a":1}'), plain: Cloud._tooBigForOne('a'.repeat(2900000)), plainBig: Cloud._tooBigForOne('a'.repeat(3100000)) };
});
check('size is judged as sent: a quote-heavy 1.7M-character list goes in pieces, a plain 2.9M one does not', th.quotes && !th.small && !th.plain && th.plainBig, th);
await b.close(); srv.close();
console.log('\n' + pass + '/' + (pass + fail) + ' passed'); process.exit(fail ? 1 : 0);
