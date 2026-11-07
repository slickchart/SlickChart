// /api/admin/client-forms on real Postgres (PGlite): owner's account only, no answers, finds forms
// on the account list, events, earlier copies.   PGLITE=<dir> node scratchpad/test-client-forms-diag.mjs
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const { PGlite } = await import(pathToFileURL(path.join(process.env.PGLITE, 'node_modules/@electric-sql/pglite/dist/index.js')));
const db = new PGlite(); globalThis.__db = db;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfd-')); fs.mkdirSync(path.join(dir, 'lib')); fs.mkdirSync(path.join(dir, 'api/admin'), { recursive: true });
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.copyFileSync(path.join(SRC, 'api/admin/client-forms.js'), path.join(dir, 'api/admin/client-forms.js'));
fs.writeFileSync(path.join(dir, 'api/feedback.js'), "export async function monitorKeyOk(req){return req.headers.authorization==='Monitor good';}");
fs.writeFileSync(path.join(dir, 'lib/db.js'), `export function dbEnabled(){return true;}
export function sql(){ return async (strs, ...v) => { let t=''; strs.forEach((s,i)=>{t+=s+(i<v.length?'$'+(i+1):'');}); const r = await globalThis.__db.query(t, v); return r.rows; }; }`);
process.env.OWNER_EMAIL = 'ash@x.com';
await db.exec(`CREATE TABLE providers (id text, email text);
CREATE TABLE clients (id text, provider_id text, token text, name text, email text, phone text, data jsonb DEFAULT '{}'::jsonb, invited_at bigint, opened_at bigint, created_at bigint, updated_at bigint, deleted_at bigint);
CREATE TABLE client_events (id text, client_id text, provider_id text, kind text, payload jsonb, seen int, created_at bigint);
CREATE TABLE kv (owner text, k text, v text);
CREATE TABLE kv_history (id bigserial, owner text, k text, v text, reason text, saved_at timestamptz DEFAULT now());
INSERT INTO providers VALUES ('pA','ash@x.com'),('pB','other@x.com');
INSERT INTO clients VALUES ('sq_j','pA','t1','Josie Statzer','','', '{"forms":[{"formId":"intake"}]}',1,2,3,4,NULL),('jB','pB','t2','Josie Other','','','{}',1,2,3,4,NULL);
INSERT INTO client_events VALUES ('ev1','sq_j','pA','form','{"formId":"intake","title":"Intake","answers":{"secret":"ANSWER"}}',0,${Date.now()}),('evB','jB','pB','form','{"formId":"intake"}',0,${Date.now()}),('ev2','gone','pA','form','{"formId":"intake","title":"Intake"}',0,${Date.now()});
INSERT INTO kv VALUES ('pA','sc_clients','{"sq_j":{"name":"Josie Statzer","notes":"PRIVATE NOTE","submittedForms":[]}}'),('pA','sc_merged_into','{"gone":"sq_j"}');
INSERT INTO kv_history (owner,k,v,reason) VALUES ('pA','sc_clients','{"sq_j":{"name":"Josie Statzer","submittedForms":[{"formId":"intake","evId":"ev1","answers":{"a":"ANSWER2"}}]}}','shrink');`);
const { default: h } = await import(pathToFileURL(path.join(dir, 'api/admin/client-forms.js')));
const call = async (auth, name) => { let code = 0, body = null; await h({ method: 'GET', headers: { authorization: auth }, query: { name } }, { setHeader() {}, status(c) { code = c; return this; }, json(b) { body = b; } }); return { code, body }; };
let bad = 0; const ck = (ok, m) => { console.log((ok ? 'PASS ' : 'FAIL ') + m); if (!ok) bad++; };
ck((await call('Monitor bad', 'josie')).code === 403, 'no key, no answer');
const { code, body } = await call('Monitor good', 'josie');
const s = JSON.stringify(body);
ck(code === 200, 'answers with the key');
ck(body.serverRows.length === 1 && body.serverRows[0].id === 'sq_j', "only the owner's own client row");
ck(!/jB|Josie Other|other@/.test(s), "another provider's client never appears");
ck(!/ANSWER|PRIVATE NOTE/.test(s), 'no answers or notes in the reply');
ck(body.events.length === 1 && body.events[0].formId === 'intake', 'her form events are listed');
ck(body.formEventsWithNoClientRow === 1, 'forms on an id with no client row are counted');
ck(body.accountList[0].forms.length === 0 && body.earlierCopies[0].matches[0].forms.length === 1, 'shows the list lost a form an earlier copy had');
ck(body.mergedInto.length === 1, 'merge records touching her are shown');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS'); process.exit(bad ? 1 : 0);
