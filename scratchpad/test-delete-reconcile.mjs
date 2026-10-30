// reconcileDeletedClients (2026-10-30), against a REAL Postgres (PGlite). A delete whose own request
// was lost leaves the row live while the delete record reached the account; this closes it, puts back
// a client she restored, and never touches another account, a client who deleted their own data, or
// a purged id.  PGLITE=<dir> node scratchpad/test-delete-reconcile.mjs
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const PGL = process.env.PGLITE || '/tmp/claude-0/-home-user-SlickChart/69b4016b-0c9f-5f42-97d7-5785f421acd8/scratchpad/pgl';
const { PGlite } = await import(pathToFileURL(path.join(PGL, 'node_modules/@electric-sql/pglite/dist/index.js')));
const db = new PGlite(); globalThis.__db = db;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-')); fs.mkdirSync(path.join(dir, 'lib'));
fs.copyFileSync(path.join(SRC, 'lib/clients.js'), path.join(dir, 'lib/clients.js'));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(dir, 'lib/db.js'), `export function dbEnabled(){return true;}
export function sql(){ return async (strs, ...v) => { let t=''; strs.forEach((s,i)=>{t+=s+(i<v.length?'$'+(i+1):'');}); const r = await globalThis.__db.query(t, v); return r.rows; }; }`);
for (const f of fs.readdirSync(path.join(SRC, 'lib'))) if (f.endsWith('.js') && !fs.existsSync(path.join(dir, 'lib', f))) fs.copyFileSync(path.join(SRC, 'lib', f), path.join(dir, 'lib', f));
let fail = 0; const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : '  :: ' + (x || ''))); if (!c) fail++; };
await db.exec(`CREATE TABLE kv (owner text, k text, v text, PRIMARY KEY(owner,k));`);
const { reconcileDeletedClients, ensureClientTables } = await import(pathToFileURL(path.join(dir, 'lib/clients.js')));
await ensureClientTables();
const T = 1790000000000;
const add = (id, p, tok, del) => db.query(`INSERT INTO clients (id, provider_id, token, name, deleted_at) VALUES ($1,$2,$3,'x',$4)`, [id, p, tok, del]);
await add('gone', 'A', 't1', null);           // deleted on her phone, request lost
await add('kept', 'A', 't2', null);           // never deleted
await add('back', 'A', 't3', T);              // deleted, then she put it back
await add('selfdel', 'A', 'revoked_zz', T);   // the client deleted their own data
await add('purged', 'A', 't5', T);            // purged id (tombstone)
await add('redel', 'A', 't6', null);          // put back, then deleted again
await add('gone', 'B', 't7', null).catch(() => {}); // another account, same id shape
await add('b_gone', 'B', 't8', null);         // another account's client, in A's record by mistake
await db.query(`INSERT INTO client_tombstones (provider_id, id, deleted_at) VALUES ('A','purged',$1)`, [T]);
await db.query(`INSERT INTO kv VALUES ('A','sc_deleted_clients',$1),('A','sc_undeleted_clients',$2)`, [
  JSON.stringify({ gone: T + 10, back: T + 1, selfdel: T + 1, purged: T + 1, redel: T + 50, b_gone: T + 5 }),
  JSON.stringify({ back: T + 20, selfdel: T + 20, purged: T + 20, redel: T + 30 })]);
const r = await reconcileDeletedClients('A');
const st = async (id, p) => (await db.query('SELECT deleted_at FROM clients WHERE id=$1 AND provider_id=$2', [id, p])).rows[0];
ok((await st('gone', 'A')).deleted_at != null, 'a client she deleted (request lost) is soft-deleted');
ok((await st('kept', 'A')).deleted_at == null, 'a client she never deleted is untouched');
ok((await st('back', 'A')).deleted_at == null, 'a client she put back gets its row back');
ok((await st('selfdel', 'A')).deleted_at != null, 'a client who deleted their own data is never revived');
ok((await st('purged', 'A')).deleted_at != null, 'a purged id is never revived');
ok((await st('redel', 'A')).deleted_at != null, 'put back then deleted again stays deleted');
ok((await st('b_gone', 'B')).deleted_at == null, "another account's client is never touched, even if its id is in her record");
ok(r.removed === 2 && r.restored === 1, 'counts are reported', JSON.stringify(r));
const again = await reconcileDeletedClients('A');
ok(again.removed === 0 && again.restored === 0, 'running again changes nothing', JSON.stringify(again));
ok((await reconcileDeletedClients('')).removed === 0, 'no account, nothing done');
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
