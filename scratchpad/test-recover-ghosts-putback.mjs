// The founder Recover clients screen listed every client she had PUT BACK as "deleted again every
// time they refresh", forever, because it read only the ids on the delete record and ignored
// sc_undeleted_clients. Her app keeps a put-back client unless it was deleted again later, so the
// screen must apply the same rule (Ashley, 2026-11-02: 28 listed, Cooper Howard among them).
//   node scratchpad/test-recover-ghosts-putback.mjs   (from the repo root)
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
// Load the endpoint without its database driver (not installed here): copy it beside a stub lib/db.js.
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghosts-'));
fs.mkdirSync(path.join(dir, 'lib')); fs.mkdirSync(path.join(dir, 'api/admin'), { recursive: true });
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(dir, 'lib/db.js'), 'export const dbEnabled=()=>false, sql=()=>null, ensureTable=async()=>{}, ensureProvidersTable=async()=>{}, ensureFilesTable=async()=>{};');
for (const f of fs.readdirSync(path.join(SRC, 'lib'))) if (f.endsWith('.js') && f !== 'db.js') fs.copyFileSync(path.join(SRC, 'lib', f), path.join(dir, 'lib', f));
fs.copyFileSync(path.join(SRC, 'api/admin/client-recover.js'), path.join(dir, 'api/admin/client-recover.js'));
const { splitGhosts } = await import(pathToFileURL(path.join(dir, 'api/admin/client-recover.js')));
const T = Date.now(); let fail = 0;
const ok = (n, c, d) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); };
const clients = [
  { id: 'cooper', name: 'Cooper Howard' },          // deleted, then put back later -> kept
  { id: 'brenda', name: 'Brenda Jenkins' },         // deleted, never put back -> ghost
  { id: 'redel', name: 'Deleted again' },           // put back, then deleted again later -> ghost
  { id: 'same', name: 'Same moment' },              // put back at the same stamp -> kept (app: !(d>u))
  { id: 'bool', name: 'Old boolean delete' },       // legacy `true` delete stamp, put back -> kept
  { id: 'gone', name: 'Already removed', deleted: true }, // not live -> neither
  { id: 'fine', name: 'Not on any record' },        // not on the delete record -> neither
];
const del = { cooper: T - 5000, brenda: T - 5000, redel: T, same: T - 100, bool: true, gone: T };
const und = { cooper: T - 1000, redel: T - 3000, same: T - 100, bool: T - 9000 };
const delSet = {}; Object.keys(del).forEach(k => delSet[k] = 1);
const { ghosts, putBack } = splitGhosts(clients, delSet, del, und);
const g = ghosts.map(x => x.id).sort(), p = putBack.map(x => x.id).sort();
ok('a client put back after its delete is NOT a ghost', !g.includes('cooper') && p.includes('cooper'), { g, p });
ok('a client deleted and never put back IS a ghost', g.includes('brenda'), { g });
ok('a client deleted again after its put-back IS a ghost', g.includes('redel'), { g });
ok('put back at the same moment as the delete is kept, as in the app', p.includes('same'), { p });
ok('a legacy true delete stamp loses to a real put-back', p.includes('bool'), { p });
ok('removed and unlisted clients appear in neither list', !g.includes('gone') && !p.includes('gone') && !g.includes('fine') && !p.includes('fine'), { g, p });
// Control: the old rule (ids only) reported every one of these as a ghost.
const old = clients.filter(c => !c.deleted && delSet[c.id]).map(c => c.id).sort();
ok('control: the old rule listed the put-back clients as ghosts', old.includes('cooper') && old.includes('same') && old.includes('bool'), { old });
console.log(fail ? `${fail} FAIL` : 'ALL PASS'); process.exit(fail ? 1 : 0);
