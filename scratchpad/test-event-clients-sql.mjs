// listEvents keeps OLD forms past the 2000 window; listEventClients names removed copies, this
// provider's only, never a client who erased their own data. Real Postgres (PGlite).
//   PGLITE=<dir> node scratchpad/test-event-clients-sql.mjs
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const PGL = process.env.PGLITE;
const { PGlite } = await import(pathToFileURL(path.join(PGL, 'node_modules/@electric-sql/pglite/dist/index.js')));
const db = new PGlite(); globalThis.__db = db;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evc-')); fs.mkdirSync(path.join(dir, 'lib'));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
for (const f of fs.readdirSync(path.join(SRC, 'lib'))) if (f.endsWith('.js')) fs.copyFileSync(path.join(SRC, 'lib', f), path.join(dir, 'lib', f));
fs.writeFileSync(path.join(dir, 'lib/db.js'), `export function dbEnabled(){return true;}
export function sql(){ return async (strs, ...v) => { let t=''; strs.forEach((s,i)=>{t+=s+(i<v.length?'$'+(i+1):'');}); const r = await globalThis.__db.query(t, v); return r.rows; }; }
export async function ensureTable(){} export async function ensureProvidersTable(){} export async function ensureFilesTable(){}`);
const L = await import(pathToFileURL(path.join(dir, 'lib/clients.js')));
await L.ensureClientTables();
const q = (t, v) => db.query(t, v);
await q(`INSERT INTO clients (id,provider_id,token,name,email,phone,created_at) VALUES
 ('live','A','t1','Cooper Howard','c@x','',1),('copy','A','t2','Cooper Howard','c@x','',1),
 ('erased','A','t3','','','',1),('otherprov','B','t4','Not Hers','n@x','',1)`);
await q(`UPDATE clients SET deleted_at=5 WHERE id IN ('copy','erased','otherprov')`);
// 2100 messages newer than an old form.
await q(`INSERT INTO client_events (id,client_id,provider_id,kind,payload,created_at) VALUES ('oldform','copy','A','form','{}',10)`);
await q(`INSERT INTO client_events (id,client_id,provider_id,kind,payload,created_at) SELECT 'm'||g,'live','A','message','{}',100+g FROM generate_series(1,2100) g`);
await q(`INSERT INTO client_events (id,client_id,provider_id,kind,payload,created_at) VALUES ('ef','erased','A','form','{}',20),('bf','otherprov','A','form','{}',30),('bf2','otherprov','B','form','{}',30)`);
let bad = 0; const ck = (ok, m) => { console.log((ok ? 'PASS ' : 'FAIL ') + m); if (!ok) bad++; };
const ev = await L.listEvents('A');
ck(ev.some(e => e.id === 'oldform'), 'a form older than the newest 2000 events is still returned');
ck(ev.filter(e => e.kind === 'message').length === 2000, 'messages still capped at the window');
ck(!ev.some(e => e.id === 'bf2'), "another provider's event never returned");
const rows = await L.listEventClients('A', ev);
const ids = rows.map(r => r.id).sort();
ck(ids.includes('copy'), 'the removed copy is named');
ck(!ids.includes('erased'), 'a client who erased their own data is never named');
ck(!ids.includes('otherprov'), "another provider's row is never named, even if an event points at it");
ck(!ids.includes('live'), 'live rows are not repeated');
ck(rows.every(r => !('token' in r) && !('data' in r)), 'no token or data in the answer');
const few = await L.listEvents('B');
ck(few.length === 1, 'under the window nothing extra is queried');
console.log(bad ? 'FAILURES ' + bad : 'ALL PASS'); process.exit(bad ? 1 : 0);
