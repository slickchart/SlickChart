// GET /api/square/connection says expired:true only for the CALLER's own expired connection
// (real Postgres via PGlite). PGLITE=<dir with node_modules/@electric-sql/pglite> node this
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const { PGlite } = await import(pathToFileURL(path.join(process.env.PGLITE || '/tmp/pgl', 'node_modules/@electric-sql/pglite/dist/index.js')));
const db = new PGlite(); globalThis.__db = db;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqx-')); fs.mkdirSync(path.join(dir, 'api/square'), { recursive: true }); fs.mkdirSync(path.join(dir, 'lib'));
fs.copyFileSync(path.join(SRC, 'api/square/connection.js'), path.join(dir, 'api/square/connection.js'));
let src = fs.readFileSync(path.join(SRC, 'lib/square.js'), 'utf8');
fs.writeFileSync(path.join(dir, 'lib/square.js'), src);
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(dir, 'lib/db.js'), `export function dbEnabled(){return true;} export async function ensureProvidersTable(){} export async function ensureSquareCreateLog(){}
export function sql(){ return async (strs, ...v) => { let t=''; strs.forEach((s,i)=>{t+=s+(i<v.length?'$'+(i+1):'');}); const r = await globalThis.__db.query(t, v); return r.rows; }; }`);
fs.writeFileSync(path.join(dir, 'lib/auth.js'), `export function verifyToken(t){return t?{pid:t}:null;} export async function sessionFromReq(req){const t=(req.headers.authorization||'').replace('Bearer ','');return t?{pid:t,ok:true}:null;} export async function isSessionValid(){return true;}`);
fs.writeFileSync(path.join(dir, 'lib/crypto.js'), `export function encrypt(x){return 'e:'+x;} export function decrypt(x){return String(x||'').replace(/^e:/,'');}`);
await db.exec(`CREATE TABLE square_connections (provider_id text PRIMARY KEY, access_token text, refresh_token text, expires_at timestamptz, merchant_id text, location_id text, connected_at timestamptz, updated_at timestamptz, refresh_error text, refresh_failed_at timestamptz);
INSERT INTO square_connections (provider_id,access_token,refresh_token,expires_at,merchant_id) VALUES ('dead','e:a','',now()-interval '60 days','M_DEAD'),('live','e:b','e:r',now()+interval '20 days','M_LIVE');`);
const sq = await import(pathToFileURL(path.join(dir, 'lib/square.js')));
const out = {};
for (const pid of ['dead', 'live', 'none']) out[pid] = await sq.connectionExpiry(pid);
let fail = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : '  :: ' + JSON.stringify(d))); if (!c) fail++; };
ok(out.dead.expired === true && /^\d{4}-/.test(out.dead.expiredAt), 'her own expired connection reads as expired', out.dead);
ok(out.live.expired === false && !out.live.expiredAt, 'a working connection is not expired', out.live);
ok(out.none.expired === false, 'no connection at all is not "expired"', out.none);
const src2 = fs.readFileSync(path.join(SRC, 'lib/square.js'), 'utf8'); const fn = src2.slice(src2.indexOf('export async function connectionExpiry'), src2.indexOf('// Read a provider\'s connection'));
ok(/WHERE provider_id = \$\{providerId\}/.test(fn), 'the lookup is tied to the caller\'s own provider id');
const cs = fs.readFileSync(path.join(SRC, 'api/square/connection.js'), 'utf8');
ok(/providerFromReqChecked\(req\)/.test(cs) && /connectionExpiry\(providerId\)/.test(cs) && !/req\.(query|body)/.test(cs), 'the endpoint uses only the verified session, never a request field');
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
