// test-change-email-pg: api/change-email.js against a REAL PostgreSQL 16, running the real api/ + lib/ files
// copied next to stubs (same pattern as scratchpad/sweep-dup-server-pg.mjs). Nothing in api/ or lib/
// is modified.
//   1. cron-events pushes to ANOTHER provider's client (ids taken from attacker-writable kv sc_clients)
//   2. delete-account leaves rows behind (files, kv_history, course_versions, google_*, tombstones, ...)
//   3. after delete-account, a REVOKED token is accepted again (isSessionValid fails open on a missing row)
//   4. totp-setup disables 2FA with no password / code, and works on a revoked session
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
const VERCEL = '/home/user/SlickChart/slickchart-vercel';
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chgem-'));
const sock = fs.mkdtempSync(path.join(os.tmpdir(), 'chgsock-'));
const PORT = '55497';
const asRoot = process.getuid && process.getuid() === 0;
const USER = asRoot ? 'pgtest' : os.userInfo().username;
const sh = c => execFileSync('/bin/sh', ['-c', c], { encoding: 'utf8' });
const pg = c => sh(asRoot ? "su " + USER + " -c '" + c.replace(/'/g, "'\\''") + "'" : c);
if (asRoot) { try { sh('id ' + USER); } catch (e) { sh('useradd -m ' + USER); } sh('chown -R ' + USER + ' ' + root + ' ' + sock + ' && chmod 777 ' + sock); }
let started = false;
process.on('exit', () => { if (started) { try { pg(PGBIN + '/pg_ctl -D ' + root + '/data stop -m immediate'); } catch (e) {} } });
pg(PGBIN + '/initdb -D ' + root + '/data -U ' + USER + ' --auth=trust >/dev/null');
pg(PGBIN + "/pg_ctl -D " + root + "/data -o '-k " + sock + " -p " + PORT + " -c listen_addresses=' -l " + root + "/log start -w >/dev/null");
started = true;
const realDb = fs.readFileSync(VERCEL + '/lib/db.js', 'utf8').replace(/^import \{ neon \}.*$/m, '');
const DBSTUB = `import { execFileSync } from 'child_process';
let n = 0;
function lit(v){ if(v===null||v===undefined)return 'NULL'; if(typeof v==='number')return String(v); if(typeof v==='boolean')return v?'true':'false';
  if(Array.isArray(v))return 'ARRAY['+v.map(lit).join(',')+']::text[]'; const t='q'+(n++); return '$'+t+'$'+String(v)+'$'+t+'$'; }
function run(text){ const t=text.trim().replace(/;\\s*$/,''); const sel=/^(select|with)/i.test(t)&&!/^with[\\s\\S]*\\b(update|insert|delete)\\b/i.test(t); const ret=!sel&&/\\breturning\\b/i.test(t);
  const q=sel?"SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM ("+t+") t":ret?"WITH t AS ("+t+") SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM t":t;
  const out=execFileSync('${PGBIN}/psql',['-h','${sock}','-p','${PORT}','-U','${USER}','-d','postgres','-A','-t','-X','-q','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'});
  return (sel||ret)?JSON.parse(out.trim()||'[]'):[]; }
function neon(){ return (s,...v)=>{ let x=''; s.forEach((p,i)=>{x+=p; if(i<v.length)x+=lit(v[i]);}); return Promise.resolve().then(()=>run(x)); }; }
` + realDb;

const lib = root + '/lib', api = root + '/api';
fs.mkdirSync(lib, { recursive: true }); fs.mkdirSync(api, { recursive: true });
fs.writeFileSync(root + '/package.json', '{"type":"module"}');
fs.writeFileSync(lib + '/db.js', DBSTUB);
for (const f of ['auth.js', 'totp.js', 'stripe-subs.js']) fs.copyFileSync(VERCEL + '/lib/' + f, lib + '/' + f);
fs.writeFileSync(lib + '/email.js', `export async function sendEmail(m){ globalThis.__MAIL.push(m); return {}; } export function trustedOrigin(){ return 'https://slickchart.app'; }`);
globalThis.__MAIL = [];
for (const f of ['change-email.js', 'login.js', 'billing-status.js']) fs.copyFileSync(VERCEL + '/api/' + f, api + '/' + f);
if (asRoot) sh('chown -R ' + USER + ' ' + root);
process.env.SESSION_SECRET = 'sess'; process.env.DATABASE_URL = 'stub'; process.env.STRIPE_SECRET_KEY = 'sk_test'; process.env.REQUIRE_PAYMENT = 'true';
// Stripe stub: customers keyed by id with an email.
const STRIPE = { cus_A: { id: 'cus_A', email: 'old@x.com' }, cus_A2: { id: 'cus_A2', email: 'old@x.com' }, cus_B: { id: 'cus_B', email: 'b@x.com' } };
const STRIPE_SUBS = { cus_A: [{ id: 'sub_A', status: 'active' }] };
globalThis.fetch = async (url, opt) => {
  const u = new URL(url); const ok = j => ({ ok: true, json: async () => j, text: async () => '' });
  if (u.pathname === '/v1/customers' ) { const em = u.searchParams.get('email'); return ok({ data: Object.values(STRIPE).filter(c => c.email === em) }); }
  const m = u.pathname.match(/^\/v1\/customers\/(.+)$/);
  if (m && opt && opt.method === 'POST') { const p = new URLSearchParams(opt.body); STRIPE[m[1]].email = p.get('email'); return ok(STRIPE[m[1]]); }
  if (u.pathname === '/v1/subscriptions') return ok({ data: STRIPE_SUBS[u.searchParams.get('customer')] || [] });
  return { ok: false, json: async () => ({}), text: async () => '' };
};
const D = await import(lib + '/db.js'); const A = await import(lib + '/auth.js');
const CE = (await import(api + '/change-email.js')).default;
const LOGIN = (await import(api + '/login.js')).default;
const BILL = (await import(api + '/billing-status.js')).default;
const q = D.sql();
await D.ensureProvidersTable();
await q`CREATE TABLE IF NOT EXISTS nurture_sends (email text NOT NULL, seq text NOT NULL, step int NOT NULL, sent_at timestamptz DEFAULT now(), UNIQUE(email, seq, step))`;
await q`CREATE TABLE IF NOT EXISTS nurture_optout (email text PRIMARY KEY, ts timestamptz DEFAULT now())`;
await q`CREATE TABLE IF NOT EXISTS waitlist (id serial PRIMARY KEY, email text UNIQUE, name text, profession text, created_at timestamptz DEFAULT now())`;
const call = async (h, method, { body, query, headers } = {}) => { const r = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() {}, send(b) { this.body = b; } };
  await h({ method, headers: Object.assign({ 'user-agent': 'x' }, headers || {}), query: query || {}, body: body || {} }, r); return r; };
let fails = 0; const check = (name, cond, detail) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(detail))); if (!cond) fails++; };

const PW = 'Secret123!';
await q`INSERT INTO providers (id,email,name,pass_hash,verified) VALUES ('p_a','old@x.com','A',${A.hashPassword(PW)},true),('p_b','b@x.com','B',${A.hashPassword(PW)},true),('p_f','botanicalaestheticsbyashley@gmail.com','F',${A.hashPassword(PW)},true)`;
await q`INSERT INTO subscriptions (email, stripe_customer_id, stripe_subscription_id, status) VALUES ('old@x.com','cus_A','sub_A','active'),('b@x.com','cus_B','sub_B','active')`;
await q`INSERT INTO nurture_sends (email, seq, step) VALUES ('old@x.com','founder',0),('old@x.com','founder',1)`;
await q`INSERT INTO waitlist (email) VALUES ('old@x.com')`;
const loginTok = async (email) => { const r = await call(LOGIN, 'POST', { body: { email, password: PW } }); return r.body && r.body.token; };
const tokA1 = await loginTok('old@x.com'); const tokA2 = await loginTok('old@x.com'); const tokB = await loginTok('b@x.com'); const tokF = await loginTok('botanicalaestheticsbyashley@gmail.com');
check('setup: logins work', tokA1 && tokA2 && tokB && tokF, { tokA1, tokB, tokF });
const H = t => ({ authorization: 'Bearer ' + t });

let r = await call(CE, 'GET', { headers: H(tokA1) });
check('GET shows current email', r.code === 200 && r.body.email === 'old@x.com' && r.body.pending === null && r.body.canChange === true, r.body);
r = await call(CE, 'GET', {});
check('GET with no session is refused', r.code === 401, r);
r = await call(CE, 'POST', { body: { newEmail: 'new@x.com', password: PW } });
check('request with no session is refused', r.code === 401, r.body);
r = await call(CE, 'POST', { headers: H(tokA1), body: { newEmail: 'new@x.com', password: 'wrong' } });
check('wrong password is refused', r.code === 400 && /password/i.test(r.body.error), r.body);
r = await call(CE, 'POST', { headers: H(tokF), body: { newEmail: 'f2@x.com', password: PW } });
check('founder account cannot change here', r.code === 400, r.body);
r = await call(CE, 'POST', { headers: H(tokA1), body: { newEmail: 'Botanicalaestheticsbyashley@gmail.com', password: PW } });
check('cannot move onto a founder email', r.code === 400, r.body);

globalThis.__MAIL.length = 0;
r = await call(CE, 'POST', { headers: H(tokA1), body: { newEmail: 'b@x.com', password: PW } });
let tk = await q`SELECT * FROM auth_tokens WHERE kind='email_change'`;
check('taken address: same generic answer, no token, only that inbox is told', r.code === 200 && r.body.ok && tk.length === 0 && globalThis.__MAIL.length === 1 && globalThis.__MAIL[0].to === 'b@x.com', { b: r.body, tk, mail: globalThis.__MAIL.map(m => m.to) });

globalThis.__MAIL.length = 0;
r = await call(CE, 'POST', { headers: H(tokA1), body: { newEmail: ' New@X.com ', password: PW } });
tk = await q`SELECT * FROM auth_tokens WHERE kind='email_change'`;
check('request: token for p_a carrying the new address', r.code === 200 && tk.length === 1 && tk[0].provider_id === 'p_a' && tk[0].data === 'new@x.com', { b: r.body, tk });
check('request: confirm link to NEW, notice to OLD', globalThis.__MAIL.length === 2 && globalThis.__MAIL[0].to === 'new@x.com' && globalThis.__MAIL[0].html.includes('?emailchange=' + tk[0].token) && globalThis.__MAIL[1].to === 'old@x.com' && !globalThis.__MAIL[1].html.includes(tk[0].token), globalThis.__MAIL.map(m => m.to));
let p = await q`SELECT email FROM providers WHERE id='p_a'`;
check('nothing changes before confirm', p[0].email === 'old@x.com', p);
r = await call(CE, 'GET', { headers: H(tokA2) });
check('GET shows the pending address', r.body.pending === 'new@x.com', r.body);

r = await call(CE, 'POST', { body: { confirm: 'guessed-token' } });
check('a guessed token does nothing', r.code === 400, r.body);

globalThis.__MAIL.length = 0;
r = await call(CE, 'POST', { body: { confirm: tk[0].token } });
check('confirm succeeds', r.code === 200 && r.body.email === 'new@x.com', r.body);
p = await q`SELECT id, email FROM providers ORDER BY id`;
check('only p_a changed', JSON.stringify(p) === JSON.stringify([{ id: 'p_a', email: 'new@x.com' }, { id: 'p_b', email: 'b@x.com' }, { id: 'p_f', email: 'botanicalaestheticsbyashley@gmail.com' }]), p);
const subs = await q`SELECT email, stripe_customer_id, status FROM subscriptions ORDER BY email`;
check('subscription row moved to the new address', subs.some(s => s.email === 'new@x.com' && s.stripe_customer_id === 'cus_A' && s.status === 'active') && !subs.some(s => s.email === 'old@x.com'), subs);
check('every Stripe customer on the old address now has the new one; B untouched', STRIPE.cus_A.email === 'new@x.com' && STRIPE.cus_A2.email === 'new@x.com' && STRIPE.cus_B.email === 'b@x.com', STRIPE);
const ns = await q`SELECT email, step FROM nurture_sends WHERE email='new@x.com' ORDER BY step`;
check('welcome-email history carried over (no re-send)', ns.length === 2, ns);
const wl = await q`SELECT email FROM waitlist`;
check('waitlist row moved (old address not treated as a lead)', wl.length === 1 && wl[0].email === 'new@x.com', wl);
check('both addresses told', globalThis.__MAIL.map(m => m.to).sort().join() === 'new@x.com,old@x.com', globalThis.__MAIL.map(m => m.to));
const ses = await q`SELECT revoked FROM sessions WHERE provider_id='p_a'`;
check('no session was revoked (no device wipe)', ses.length >= 2 && ses.every(s => !s.revoked), ses);
r = await call(CE, 'POST', { body: { confirm: tk[0].token } });
check('the link only works once', r.code === 400, r.body);

r = await call(BILL, 'GET', { headers: H(tokA2) });
check('an old-token device still sees her subscription', r.code === 200 && r.body.subscription && r.body.subscription.status === 'active', r.body);
r = await call(LOGIN, 'POST', { body: { email: 'new@x.com', password: PW } });
check('sign in with the new email passes the paywall', r.code === 200 && r.body.token, r.body);
r = await call(LOGIN, 'POST', { body: { email: 'old@x.com', password: PW } });
check('old email no longer signs in', r.code === 401, r.body);

// A pending token for p_a must never be redeemable once someone else took that address.
const tokA3 = await loginTok('new@x.com');
await call(CE, 'POST', { headers: H(tokA3), body: { newEmail: 'later@x.com', password: PW } });
tk = await q`SELECT * FROM auth_tokens WHERE kind='email_change'`;
await q`INSERT INTO providers (id,email,name,pass_hash) VALUES ('p_c','later@x.com','C','x')`;
r = await call(CE, 'POST', { body: { confirm: tk[0].token } });
p = await q`SELECT email FROM providers WHERE id='p_a'`;
check('confirm refuses an address that was taken meanwhile', r.code === 409 && p[0].email === 'new@x.com', { b: r.body, p });

console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
