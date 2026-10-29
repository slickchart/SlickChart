// Square sign-in kept alive (2026-10-29b). refreshExpiringConnections renews every connection near or
// past expiry, each under its own provider; a success clears the error and the connection is usable on
// that same call; a failure is RECORDED (refresh_error) instead of only reaching the console; a
// connection that failed in the last 6 hours is not hammered again. Real Postgres via PGlite; Square's
// token endpoint is faked with a stubbed fetch.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const PGL = process.env.PGLITE || '/tmp/claude-0/-home-user-SlickChart/69b4016b-0c9f-5f42-97d7-5785f421acd8/scratchpad/pgl';
const { PGlite } = await import(pathToFileURL(path.join(PGL, 'node_modules/@electric-sql/pglite/dist/index.js')));
const db = new PGlite(); globalThis.__db = db;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-'));
fs.mkdirSync(path.join(dir, 'lib'));
for (const f of ['square.js', 'auth.js', 'crypto.js']) fs.copyFileSync(path.join(SRC, 'lib', f), path.join(dir, 'lib', f));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(dir, 'lib/db.js'), `
export function dbEnabled(){return true;} export async function ensureProvidersTable(){} export async function ensureSquareCreateLog(){}
export function sql(){ return async (strs, ...v) => { let t=''; strs.forEach((s,i)=>{t+=s+(i<v.length?'$'+(i+1):'');}); const r = await globalThis.__db.query(t, v); return r.rows; }; }`);
process.env.SQUARE_APP_ID = 'app'; process.env.SQUARE_APP_SECRET = 'sec'; process.env.SESSION_SECRET = 'x'; process.env.TOKEN_ENC_KEY = process.env.TOKEN_ENC_KEY || 'k'.repeat(64);
const { encrypt } = await import(pathToFileURL(path.join(dir, 'lib/crypto.js')));
await db.exec(`CREATE TABLE square_connections (provider_id text PRIMARY KEY, access_token text, refresh_token text, expires_at timestamptz, merchant_id text, location_id text, updated_at timestamptz DEFAULT now(), connected_at timestamptz, last_used_at timestamptz, refresh_error text, refresh_failed_at timestamptz);`);
const ins = (id, exp, rt, failedAgo) => db.query(`INSERT INTO square_connections (provider_id, access_token, refresh_token, expires_at, refresh_failed_at) VALUES ($1,$2,$3,now() + ($4 || ' days')::interval, ${failedAgo ? "now() - interval '" + failedAgo + "'" : 'NULL'})`, [id, encrypt('old-' + id), encrypt(rt), String(exp)]);
await ins('expired', -15, 'rt-good'); await ins('soon', 3, 'rt-good'); await ins('fine', 25, 'rt-good'); await ins('revoked', -2, 'rt-bad'); await ins('justfailed', -2, 'rt-bad', '1 hour');
const calls = [];
globalThis.fetch = async (url, opt) => { const b = JSON.parse(opt.body || '{}'); calls.push(b.refresh_token);
  if (b.refresh_token === 'rt-good') return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'new-at', refresh_token: 'rt-good', expires_at: new Date(Date.now() + 30 * 864e5).toISOString() }) };
  return { ok: false, status: 401, text: async () => JSON.stringify({ errors: [{ detail: 'refresh token revoked' }] }) }; };
const { refreshExpiringConnections, getConnection } = await import(pathToFileURL(path.join(dir, 'lib/square.js')));
let fail = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || !d ? '' : '  :: ' + d)); if (!c) fail++; };
const out = await refreshExpiringConnections();
const rows = Object.fromEntries((await db.query('SELECT provider_id, expires_at, refresh_error FROM square_connections')).rows.map(r => [r.provider_id, r]));
ok(out.due === 3 && out.refreshed === 2 && out.failed === 1, 'expired + soon + revoked were due; 2 renewed, 1 failed', JSON.stringify(out));
ok(new Date(rows.expired.expires_at) > new Date(Date.now() + 29 * 864e5) && new Date(rows.soon.expires_at) > new Date(Date.now() + 29 * 864e5), 'the expired and the expiring connection now last 30 days');
ok(new Date(rows.fine.expires_at) < new Date(Date.now() + 26 * 864e5), 'a connection with weeks left is left alone');
ok(/revoked/.test(rows.revoked.refresh_error || ''), 'a failed refresh is recorded with Square\'s reason', rows.revoked.refresh_error);
ok(!calls.filter(Boolean).length || calls.length === 3, 'the one that failed an hour ago is not retried yet', String(calls.length));
const c = await getConnection('revoked');
ok(c === null, 'an expired connection that cannot refresh returns nothing (she must reconnect)');
await db.query("UPDATE square_connections SET expires_at = now() - interval '1 day', refresh_error = 'old' WHERE provider_id = 'expired'");
const c2 = await getConnection('expired');
ok(c2 && c2.token === 'new-at', 'an expired connection that refreshes is usable on that same call', JSON.stringify(c2));
ok(!(await db.query("SELECT refresh_error FROM square_connections WHERE provider_id='expired'")).rows[0].refresh_error, 'a successful refresh clears the old error');
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
