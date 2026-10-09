// Runs api/admin/client-recover.js against a REAL PostgreSQL 16, with HEATHER'S EXACT SITUATION
// seeded: 4 clients, 2 of them soft-deleted, 2 of them owners carrying horses that each have their
// own session summaries.
//
//   node scripts/test-client-recover.mjs        (from slickchart-vercel/)
//
// Why a real database and not a mock: the whole claim of this tool is "the server never hard-deletes,
// so her data is still there". That claim lives in SQL — markClientDeleted's UPDATE, listClients'
// `deleted_at IS NULL`, and the restore's conditions. Asserting it against a stub would be asserting
// my own belief about jsonb and NULLs rather than what Postgres does. Same shape as
// test-clients-sql.mjs; skips cleanly where there is no PostgreSQL 16.
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const STUB = "import { execFileSync } from 'child_process';\nlet n = 0;\nfunction lit(v) {\n  if (v === null || v === undefined) return 'NULL';\n  if (typeof v === 'number') return String(v);\n  if (typeof v === 'boolean') return v ? 'true' : 'false';\n  const tag = 'q' + (n++);\n  return '$' + tag + '$' + String(v) + '$' + tag + '$';\n}\nfunction run(text) {\n  const trimmed = text.trim().replace(/;\\s*$/, '');\n  const isSelect = /^select/i.test(trimmed);\n  const returning = !isSelect && /\\breturning\\b/i.test(trimmed);\n  // A data-modifying statement with RETURNING cannot sit in a FROM clause; it has to be a CTE.\n  const q = isSelect\n    ? \"SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM (\" + trimmed + \") t\"\n    : returning\n      ? \"WITH t AS (\" + trimmed + \") SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM t\"\n      : trimmed;\n  const out = execFileSync('__PSQL__',\n    ['-h', '__SOCK__', '-p', '__PORT__', '-U', '__USER__', '-d', 'postgres', '-A', '-t', '-X', '-v', 'ON_ERROR_STOP=1', '-c', q],\n    { encoding: 'utf8' });\n  return (isSelect || returning) ? JSON.parse(out.trim() || '[]') : [];\n}\nexport function sql() {\n  return function (strings, ...vals) {\n    let text = '';\n    strings.forEach((s, i) => { text += s; if (i < vals.length) text += lit(vals[i]); });\n    return Promise.resolve(run(text));\n  };\n}\nexport function dbEnabled() { return true; }\nexport async function ensureTable() { await sql()`CREATE TABLE IF NOT EXISTS kv (owner text NOT NULL, k text NOT NULL, v text, updated_at timestamptz DEFAULT now(), PRIMARY KEY (owner,k))`; }\nexport async function ensureProvidersTable() { await sql()`CREATE TABLE IF NOT EXISTS providers (id text PRIMARY KEY, email text, name text, created_at bigint)`; }\n";

// The founder gate reads the TOKEN's email. The token is opaque to the endpoint, so the stub decodes
// a plain JSON token — which lets the test drive the gate itself (founder / not founder / no token).
const AUTHSTUB = "export function verifyToken(t){ try{ return JSON.parse(Buffer.from(String(t),'base64').toString('utf8')); }catch(e){ return null; } }\nexport async function isSessionValid(){ return true; }\n";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const VERCEL = process.argv[2] || path.join(HERE, '..');
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16 at ' + PGBIN); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screc-'));
const sock = fs.mkdtempSync(path.join(os.tmpdir(), 'scrsock-'));
const PORT = '55437';
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

// Lay the files out so the endpoint's own relative imports (../../lib/db.js) resolve to the stubs,
// and lib/clients.js is the REAL one.
const api = path.join(root, 'api', 'admin'), lib = path.join(root, 'lib');
fs.mkdirSync(api, { recursive: true }); fs.mkdirSync(lib, { recursive: true });
fs.writeFileSync(path.join(lib, 'db.js'), STUB.replace('__PSQL__', PGBIN + '/psql').replace('__SOCK__', sock).replace('__PORT__', PORT).replace('__USER__', USER));
fs.writeFileSync(path.join(lib, 'auth.js'), AUTHSTUB);
fs.writeFileSync(path.join(lib, 'clients.js'), fs.readFileSync(path.join(VERCEL, 'lib', 'clients.js'), 'utf8'));
// client-recover.js imports the history lib for the "Earlier copies" section.
fs.writeFileSync(path.join(lib, 'kv-history.js'), fs.readFileSync(path.join(VERCEL, 'lib', 'kv-history.js'), 'utf8'));
fs.writeFileSync(path.join(api, 'client-recover.mjs'), fs.readFileSync(path.join(VERCEL, 'api', 'admin', 'client-recover.js'), 'utf8'));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
if (asRoot) sh('chown -R ' + USER + ' ' + root);

process.env.FOUNDER_EMAILS = 'ashley@slickchart.app';
process.env.SESSION_SECRET = 'test';

const handler = (await import(path.join(api, 'client-recover.mjs'))).default;
const { ensureClientTables, upsertClient, listClients, markClientDeleted } = await import(path.join(lib, 'clients.js'));
const { sql } = await import(path.join(lib, 'db.js'));
const q = sql();

let fails = 0;
function ok(name, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond ? '' : '   -> ' + JSON.stringify(extra)));
  if (!cond) fails++;
}
const tokenFor = e => Buffer.from(JSON.stringify({ u: 'me', e: e, sid: 's' })).toString('base64');
async function call(method, opts) {
  opts = opts || {};
  const res = { code: 0, body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader() {}, end() {} };
  await handler({ method, headers: { authorization: opts.token ? ('Bearer ' + opts.token) : '' },
    query: opts.query || {}, body: opts.body || {} }, res);
  return res;
}

await ensureClientTables();
const { ensureTable, ensureProvidersTable } = await import(path.join(lib, 'db.js'));
await ensureTable(); await ensureProvidersTable();

const H = 'prov_heather', OTHER = 'prov_other';
await q`INSERT INTO providers (id,email,name) VALUES (${H},'heather@example.com','Heather') ON CONFLICT (id) DO NOTHING`;
await q`INSERT INTO providers (id,email,name) VALUES (${OTHER},'other@example.com','Other') ON CONFLICT (id) DO NOTHING`;

// ── HER SITUATION ────────────────────────────────────────────────────────────
// Two owners with horses, each horse carrying its own summaries. Two plain clients.
const horse = (n, s) => ({ id: 'a_' + n, name: n, species: 'Horse', treatment: 'Laser',
  summaries: Array.from({ length: s }, (_, i) => ({ id: n + i, ts: 1000 + i, title: 'Session ' + (i + 1) })),
  progressPhotos: [{ pid: 'p_' + n }] });
await upsertClient(H, { id: 'c_owner1', name: 'Dana Reed', data: {
  profile: { concerns: 'stiffness', treatment: 'Equine laser' },
  summaries: [{ id: 'o1', ts: 1, title: 'Owner visit' }],
  animals: [horse('Comet', 3), horse('Pepper', 2)], forms: [{ id: 'f1' }], progressPhotos: [] } });
await upsertClient(H, { id: 'c_owner2', name: 'Maria Cole', data: {
  profile: { concerns: 'back', treatment: 'Equine laser' },
  summaries: [],
  animals: [horse('Juno', 4)], progressPhotos: [] } });
await upsertClient(H, { id: 'c_plain1', name: 'Sam Gray', data: { profile: { treatment: 'Laser' }, summaries: [{ id: 'x', ts: 2 }], animals: [] } });
await upsertClient(H, { id: 'c_plain2', name: 'Lee Park', data: { profile: {}, summaries: [], animals: [] } });
// Another provider's client, same shape — nothing below may ever touch it.
await upsertClient(OTHER, { id: 'c_notmine', name: 'Someone Else', data: { summaries: [{ id: 'z' }] } });

ok('seeded 4 clients for her', (await listClients(H)).length === 4);

// The two owners with horses disappear — exactly what she reported.
await markClientDeleted(H, 'c_owner1');
await markClientDeleted(H, 'c_owner2');
ok('only 2 clients show now (her symptom)', (await listClients(H)).length === 2);

// THE CLAIM UNDER TEST: the rows and their data survived the soft delete.
let raw = await q`SELECT data, deleted_at FROM clients WHERE id='c_owner1' AND provider_id=${H}`;
let blob = raw[0] && (typeof raw[0].data === 'string' ? JSON.parse(raw[0].data) : raw[0].data);
ok('removed row still EXISTS', !!raw[0], raw[0]);
ok('removed row is tombstoned, not gone', !!(raw[0] && raw[0].deleted_at));
ok('its summaries survived', !!(blob && blob.summaries && blob.summaries.length === 1), blob && blob.summaries);
ok('its HORSES survived', !!(blob && blob.animals && blob.animals.length === 2), blob && (blob.animals || []).length);
ok('each horse kept its own summaries', !!(blob && blob.animals[0].summaries.length === 3 && blob.animals[1].summaries.length === 2));

// ── the gate ─────────────────────────────────────────────────────────────────
ok('no token -> 401', (await call('GET', { query: { email: 'heather@example.com' } })).code === 401);
ok('not a founder -> 403', (await call('GET', { token: tokenFor('someone@else.com'), query: { email: 'heather@example.com' } })).code === 403);
ok('unknown provider -> 404', (await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { email: 'nobody@example.com' } })).code === 404);

// ── name search: she knows "Heather Hinkle", not the sign-in email ───────────
let r;
await q`UPDATE providers SET name='Heather Hinkle' WHERE id=${H}`;
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { q: 'hinkle' } });
ok('finds her by surname', r.code === 200 && r.body.ok && !r.body.needsPick && r.body.provider.id === H, r.body && r.body.provider);
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { q: 'Heather Hinkle' } });
ok('finds her by full name', r.code === 200 && r.body.ok && r.body.provider.id === H);
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { q: 'HINK' } });
ok('name search ignores case', r.code === 200 && r.body.ok && r.body.provider.id === H);
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { q: 'heather@exam' } });
ok('a partial EMAIL works in the name box too', r.code === 200 && r.body.ok && r.body.provider.id === H);
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { q: 'nobody-like-this' } });
ok('no match -> 404', r.code === 404, r.code);
// Two providers matching must NEVER be guessed at.
await q`UPDATE providers SET name='Heather Other' WHERE id=${OTHER}`;
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { q: 'heather' } });
ok('ambiguous -> hands back the list, no diagnosis', r.code === 200 && r.body.needsPick === true && (r.body.matches || []).length === 2, r.body);
ok('the pick list carries no client data', JSON.stringify(r.body).indexOf('Dana Reed') < 0);
// A WRITE must never resolve by name.
r = await call('POST', { token: tokenFor('ashley@slickchart.app'), body: { q: 'hinkle', restoreIds: ['c_owner1'] } });
ok('restore refuses a name, demands the exact email', r.code === 400, r.code);
ok('name search is still founder-gated', (await call('GET', { token: tokenFor('x@y.com'), query: { q: 'hinkle' } })).code === 403);
// A % or _ typed into the box must not turn into a wildcard match-everything. This FAILED the first
// time: stripping the wildcards left an empty string, so `%` listed every provider on the deployment.
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { q: '%' } });
ok('a bare % is rejected, not treated as match-all', r.code === 400, r.code);
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { q: '%hink%' } });
ok('wildcards around a real name still find her', r.code === 200 && r.body.ok && r.body.provider.id === H, r.code);
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { q: 'h' } });
ok('one letter is rejected', r.code === 400, r.code);
await q`UPDATE providers SET name='Other' WHERE id=${OTHER}`;

// ── the diagnosis ────────────────────────────────────────────────────────────
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { email: 'HEATHER@example.com ' } });
ok('diagnosis 200 (email normalised)', r.code === 200 && r.body && r.body.ok, r.code);
const j = r.body || {};
ok('reports 4 rows total', j.counts && j.counts.rowsTotal === 4, j.counts);
ok('reports 2 showing, 2 removed', j.counts && j.counts.rowsLive === 2 && j.counts.rowsDeleted === 2, j.counts);
const o1 = (j.clients || []).find(c => c.id === 'c_owner1');
ok('names the removed client', !!(o1 && o1.name === 'Dana Reed'), o1 && o1.name);
ok('counts her summaries', !!(o1 && o1.has.summaries === 1), o1 && o1.has);
ok('counts her chart fields', !!(o1 && o1.has.profileFilled === 2), o1 && o1.has.profileFilled);
// A brand-new EMPTY record is seeded with placeholders. It must score ZERO, not five — scoring
// five is what made every row on the real account look like it held a chart.
await upsertClient(H, { id: 'c_skel', name: 'Skeleton', data: { profile: {
  skin: '\u2014', concerns: '\u2014', allergies: 'None noted', fitz: '\u2014',
  treatment: 'New client', lastVisit: '\u2014', nextVisit: 'Not scheduled' }, summaries: [], animals: [] } });
{
  const rr = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { email: 'heather@example.com' } });
  const sk = (rr.body.clients || []).find(c => c.id === 'c_skel');
  ok('an empty skeleton scores 0 chart fields, not 5', !!(sk && sk.has.profileFilled === 0), sk && sk.has);
}
ok('lists both horses by name', !!(o1 && o1.has.animals.length === 2 && o1.has.animals[0].name === 'Comet'), o1 && o1.has.animals);
ok('counts each horse\'s summaries', !!(o1 && o1.has.animals[0].summaries === 3 && o1.has.animals[1].summaries === 2));
ok('NEVER returns note content', JSON.stringify(j.clients||[]).indexOf('Session 1') < 0 && JSON.stringify(j.clients||[]).indexOf('stiffness') < 0);
ok('sees no other provider\'s client', !(j.clients || []).some(c => c.id === 'c_notmine'));

// Her device has NO delete record -> so the removal did not come from her tapping delete.
ok('reports no device delete record', Array.isArray(j.deletedRecordIds) && j.deletedRecordIds.length === 0, j.deletedRecordIds);

// ── "did they vanish, or become horses?" — the question that decides everything ──
// Seed it the way 2aj's fix would leave it: the two horses are CLIENT ROWS of their own, and each
// owner's blob lists them as animals, carrying the horse's own client id.
await upsertClient(H, { id: 'c_comet', name: 'Comet', data: { summaries: [{ id: 'k1' }] } });
await upsertClient(H, { id: 'c_pepper', name: 'Pepper', data: { summaries: [] } });
await upsertClient(H, { id: 'c_nest', name: 'Nest Owner', data: {
  animals: [{ id: 'c_comet', name: 'Comet', species: 'Horse', summaries: [{ id: 'n1' }, { id: 'n2' }] },
            { id: 'c_pepper', name: 'Pepper', species: 'Horse', summaries: [] }] } });
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { email: 'heather@example.com' } });
const nest = (r.body || {}).nestedUnder || {};
ok('spots a client that is now a horse under an owner', !!(nest.c_comet && nest.c_comet.ownerId === 'c_nest'), nest.c_comet);
ok('names the owner it moved under', !!(nest.c_comet && nest.c_comet.ownerName === 'Nest Owner'), nest.c_comet);
ok('spots the second horse too', !!(nest.c_pepper && nest.c_pepper.ownerId === 'c_nest'));
ok('a plain client is NOT reported as nested', !nest.c_plain1 && !nest.c_nest, Object.keys(nest));

// A roster blob that has forgotten a live client is the OTHER way a client vanishes.
await q`INSERT INTO kv (owner,k,v) VALUES (${H},'sc_clients',${JSON.stringify({ c_plain1: { id: 'c_plain1', name: 'Sam Gray' } })})
  ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v`;
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { email: 'heather@example.com' } });
ok('reads the roster blob shape', r.body.roster && r.body.roster.shape === 'object', r.body.roster);
ok('spots a live client missing from the roster', (r.body.missingFromRoster || []).indexOf('c_plain2') >= 0, r.body.missingFromRoster);

// ── the provider-side store: where her SUMMARIES actually live ───────────────
// Every client row on the real account reported chart fields and ZERO summaries, which reads as
// catastrophic loss. The provider's own summaries are a per-client map in kv, not in clients.data,
// so the tool has to count them or the wrong conclusion is unavoidable.
await q`INSERT INTO kv (owner,k,v) VALUES (${H},'sc_session_summaries',${JSON.stringify({
  c_owner1: [{ id: 's1' }, { id: 's2' }, { id: 's3' }], c_plain1: [{ id: 's4' }] })})
  ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v`;
await q`INSERT INTO kv (owner,k,v) VALUES (${H},'sc_client_recs',${JSON.stringify({ c_owner1: ['p1','p2'] })})
  ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v`;
await q`INSERT INTO kv (owner,k,v) VALUES (${H},'sc_body_maps','not json at all')
  ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v`;
r = await call('GET', { token: tokenFor('ashley@slickchart.app'), query: { email: 'heather@example.com' } });
const libs = (r.body || {}).libraries || {};
ok('counts the clients a summary map covers', libs.sc_session_summaries && libs.sc_session_summaries.clients === 2, libs.sc_session_summaries);
ok('counts the summaries INSIDE it', libs.sc_session_summaries && libs.sc_session_summaries.entries === 4, libs.sc_session_summaries);
ok('reports its size', libs.sc_session_summaries && libs.sc_session_summaries.bytes > 0);
ok('counts a product-plan map the same way', libs.sc_client_recs && libs.sc_client_recs.clients === 1 && libs.sc_client_recs.entries === 2, libs.sc_client_recs);
ok('a key with no row says so', libs.sc_note_drafts && libs.sc_note_drafts.onServer === false, libs.sc_note_drafts);
ok('unparseable json does not 500 the whole lookup', !!libs.sc_body_maps && r.code === 200, libs.sc_body_maps);
ok('the roster blob is counted too', !!libs.sc_clients, libs.sc_clients);
ok('library counts carry NO content', JSON.stringify(libs).indexOf('p1') < 0 && JSON.stringify(libs).indexOf('s1') < 0);

// ── the restore ──────────────────────────────────────────────────────────────
r = await call('POST', { token: tokenFor('ashley@slickchart.app'), body: { email: 'heather@example.com', restoreIds: ['c_owner1', 'c_owner2'] } });
ok('restore 200', r.code === 200 && r.body.ok, r.code);
ok('restored both', r.body.restored === 2, r.body);
{
  const names = (await listClients(H)).map(x => x.id);
  ok('both owners show again', names.indexOf('c_owner1') >= 0 && names.indexOf('c_owner2') >= 0, names);
}
blob = (await q`SELECT data FROM clients WHERE id='c_owner1' AND provider_id=${H}`)[0].data;
blob = typeof blob === 'string' ? JSON.parse(blob) : blob;
ok('restored WITH her horses and their summaries', blob.animals.length === 2 && blob.animals[0].summaries.length === 3, blob.animals && blob.animals.length);
ok('restored with her own summary', blob.summaries.length === 1);

// Restoring again is a no-op, not an error (she may tap twice).
r = await call('POST', { token: tokenFor('ashley@slickchart.app'), body: { email: 'heather@example.com', restoreIds: ['c_owner1'] } });
ok('second restore is a harmless no-op', r.code === 200 && r.body.restored === 0, r.body);

// ── isolation: the part that must never be wrong (§0.1) ──────────────────────
await markClientDeleted(OTHER, 'c_notmine');
r = await call('POST', { token: tokenFor('ashley@slickchart.app'), body: { email: 'heather@example.com', restoreIds: ['c_notmine'] } });
ok('cannot restore another provider\'s client via her email', r.body.restored === 0, r.body);
ok('that client is still tombstoned', (await listClients(OTHER)).length === 0);
r = await call('POST', { token: tokenFor('ashley@slickchart.app'), body: { email: 'heather@example.com', exportIds: ['c_notmine'] } });
ok('cannot export another provider\'s client either', r.body.ok && r.body.clients.length === 0, r.body);

// A client who erased their OWN data has no name left; restoring that is not ours to do.
await upsertClient(H, { id: 'c_erased', name: 'Gone Soon', data: { summaries: [] } });
await q`UPDATE clients SET name='', email='', deleted_at=${Date.now()} WHERE id='c_erased' AND provider_id=${H}`;
r = await call('POST', { token: tokenFor('ashley@slickchart.app'), body: { email: 'heather@example.com', restoreIds: ['c_erased'] } });
ok('refuses to undo a client\'s OWN erasure', r.body.restored === 0, r.body);

// ── the export, for when the roster itself is beyond repair ───────────────────
r = await call('POST', { token: tokenFor('ashley@slickchart.app'), body: { email: 'heather@example.com', exportIds: ['c_owner1'] } });
ok('export returns the full blob', r.body.ok && r.body.clients.length === 1, r.body && r.body.clients && r.body.clients.length);
const ex = r.body.clients[0];
const exBlob = typeof ex.data === 'string' ? JSON.parse(ex.data) : ex.data;
ok('export carries the horses and their summaries', exBlob.animals[0].summaries.length === 3);
ok('export is only what was asked for', r.body.clients.length === 1);
r = await call('POST', { token: tokenFor('someone@else.com'), body: { email: 'heather@example.com', exportIds: ['c_owner1'] } });
ok('export is founder-gated too', r.code === 403);

console.log(fails ? '\n' + fails + ' FAILED' : '\nall green');
process.exit(fails ? 1 : 0);
