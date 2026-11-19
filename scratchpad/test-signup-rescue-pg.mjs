// test-signup-rescue-pg: the 2026-11-18 sign-up rescue (lib/signup-rescue.js, api/signup.js, api/login.js,
// api/request-reset.js, api/admin/orphans.js 'move') against a REAL PostgreSQL 16, running the real
// api/ + lib/ files copied next to stubs (same harness as test-change-email-pg). Nothing in api/ or lib/
// is modified.
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
const VERCEL = '/home/user/SlickChart/slickchart-vercel';
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sgres-'));
const sock = fs.mkdtempSync(path.join(os.tmpdir(), 'sgsock-'));
const PORT = '55531';
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
fs.mkdirSync(lib, { recursive: true }); fs.mkdirSync(api + '/admin', { recursive: true });
fs.writeFileSync(root + '/package.json', '{"type":"module"}');
fs.writeFileSync(lib + '/db.js', DBSTUB);
for (const f of ['auth.js', 'totp.js', 'stripe-subs.js', 'pricing.js', 'setup-email.js', 'signup-rescue.js', 'founder-settings.js', 'notify-log.js', 'app-launch-log.js']) fs.copyFileSync(VERCEL + '/lib/' + f, lib + '/' + f);
fs.writeFileSync(lib + '/email.js', `export async function sendEmail(m){ globalThis.__MAIL.push(m); return {}; } export function trustedOrigin(){ return 'https://slickchart.app'; } export async function addToAudience(){} export function welcomeEmailHtml(){return 'w';} export function welcomeEmailText(){return 'w';}`);
fs.writeFileSync(lib + '/fcm.js', `export function founderPushConfigured(){ return true; } export async function pushFoundersReport(p){ globalThis.__PUSH.push(p); return { devices: 2, sent: 2, providerIds: ['p_f'], results: [] }; }`);
fs.writeFileSync(lib + '/nurture.js', `import { sql } from './db.js'; export async function ensureNurtureTables(q){ q=q||sql(); await q\`CREATE TABLE IF NOT EXISTS nurture_sends (email text NOT NULL, seq text NOT NULL, step int NOT NULL, sent_at timestamptz DEFAULT now(), UNIQUE(email, seq, step))\`; await q\`CREATE TABLE IF NOT EXISTS nurture_optout (email text PRIMARY KEY, ts timestamptz DEFAULT now())\`; }`);
fs.writeFileSync(api + '/feedback.js', `export async function monitorKeyOk(req){ return (req.headers.authorization||'') === 'Monitor KEY'; }`);
globalThis.__MAIL = []; globalThis.__PUSH = [];
for (const f of ['signup.js', 'login.js', 'request-reset.js']) fs.copyFileSync(VERCEL + '/api/' + f, api + '/' + f);
fs.copyFileSync(VERCEL + '/api/admin/orphans.js', api + '/admin/orphans.js');
if (asRoot) sh('chown -R ' + USER + ' ' + root);
const FOUNDER = 'founder@test.example';
process.env.SESSION_SECRET = 'sess'; process.env.DATABASE_URL = 'stub'; process.env.STRIPE_SECRET_KEY = 'sk_test'; process.env.REQUIRE_PAYMENT = 'true';
process.env.FOUNDER_EMAILS = FOUNDER; process.env.OWNER_EMAIL = FOUNDER; process.env.FOUNDER_NOTIFY_EMAIL = 'alerts@test.example';
const STRIPE = { cus_T: { id: 'cus_T', email: 'cm_b@tahoo.com' } };
globalThis.fetch = async (url, opt) => {
  const u = new URL(url); const ok = j => ({ ok: true, json: async () => j, text: async () => '' });
  if (u.pathname === '/v1/customers') { const em = u.searchParams.get('email'); return ok({ data: Object.values(STRIPE).filter(c => c.email === em) }); }
  const m = u.pathname.match(/^\/v1\/customers\/(.+)$/);
  if (m && opt && opt.method === 'POST') { const p = new URLSearchParams(opt.body); STRIPE[m[1]].email = p.get('email'); return ok(STRIPE[m[1]]); }
  if (u.pathname === '/v1/subscriptions') return ok({ data: [] });
  return { ok: false, json: async () => ({}), text: async () => '' };
};
const D = await import(lib + '/db.js'); const A = await import(lib + '/auth.js'); const R = await import(lib + '/signup-rescue.js');
const SIGNUP = (await import(api + '/signup.js')).default;
const LOGIN = (await import(api + '/login.js')).default;
const RESET = (await import(api + '/request-reset.js')).default;
const ORPH = (await import(api + '/admin/orphans.js')).default;
const q = D.sql();
await D.ensureProvidersTable();
const call = async (h, method, { body, query, headers } = {}) => { const r = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() {}, send(b) { this.body = b; } };
  await h({ method, headers: Object.assign({ 'user-agent': 'x', 'x-real-ip': '1.2.3.4' }, headers || {}), query: query || {}, body: body || {} }, r); return r; };
let fails = 0; const check = (name, cond, detail) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(detail))); if (!cond) fails++; };
const PW = 'Secret123!';
await q`INSERT INTO providers (id,email,name,pass_hash,verified) VALUES ('p_f',${FOUNDER},'F',${A.hashPassword(PW)},true),('p_o','other@x.com','O',${A.hashPassword(PW)},true)`;
await q`INSERT INTO subscriptions (email, stripe_customer_id, stripe_subscription_id, status) VALUES ('cm_b@tahoo.com','cus_T','sub_T','active'),('jill@stuck.com','cus_J','sub_J','active'),('other@x.com','cus_O','sub_O','active'),(${FOUNDER},'cus_F','sub_F','active')`;
const founderTok = (await call(LOGIN, 'POST', { body: { email: FOUNDER, password: PW } })).body.token;
check('setup: founder login', !!founderTok);
const otherTok = (await call(LOGIN, 'POST', { body: { email: 'other@x.com', password: PW } })).body.token;

// 1. Create account with the address she owns: 402, same words whether or not a near match exists
__MAIL.length = 0; __PUSH.length = 0;
let r = await call(SIGNUP, 'POST', { body: { email: 'cm_b@yahoo.com', password: 'whatever123', name: 'C' } });
const r2 = await call(SIGNUP, 'POST', { body: { email: 'nobody@nowhere.com', password: 'whatever123', name: 'N' } });
check('402 for the unpaid address, with checkout link', r.code === 402 && /typo/.test(r.body.error) && !!r.body.checkoutUrl, r);
check('the caller sees the same answer with or without a near match (no leak)', r.body.error === r2.body.error && !JSON.stringify(r.body).includes('tahoo'), [r.body, r2.body]);
check('Ashley is told at once, with the address she paid under', __MAIL.some(m => m.to === 'alerts@test.example' && /could not get in/.test(m.subject) && /cm_b@tahoo\.com/.test(m.text) && /Move payment/.test(m.text)) && __PUSH.some(p => /cm_b@tahoo\.com/.test(p.body)), [__MAIL.map(m => m.subject), __PUSH]);
check('no near match: told she may not have subscribed', __MAIL.some(m => /nobody@nowhere\.com/.test(m.subject) && /may simply not have subscribed/.test(m.text)));
const before = __MAIL.length;
await call(SIGNUP, 'POST', { body: { email: 'cm_b@yahoo.com', password: 'whatever123', name: 'C' } });
check('a second try within 12 h is recorded but not alerted again', __MAIL.length === before && (await q`SELECT count(*)::int AS n FROM signup_problems WHERE email='cm_b@yahoo.com' AND kind='signup-unpaid'`)[0].n === 2);
await call(SIGNUP, 'POST', { body: { email: 'other@x.com', password: 'whatever123', name: 'O' } });
check('other refusals (409) recorded as signup-refused without an alert', (await q`SELECT alerted FROM signup_problems WHERE email='other@x.com' AND kind='signup-refused'`).map(x => x.alerted).join() === 'false' && __MAIL.length === before);

// 2. Sign in with the PAID address before making the account
__MAIL.length = 0; __PUSH.length = 0;
r = await call(LOGIN, 'POST', { body: { email: 'jill@stuck.com', password: 'guess1234' } });
check('sign-in still says only "incorrect"', r.code === 401 && r.body.error === 'Email or password is incorrect.', r.body);
check('her create-your-account email went to her (and only her)', __MAIL.some(m => m.to === 'jill@stuck.com' && /create your account/i.test(m.subject) && /signup=1&email=jill%40stuck\.com/.test(m.html)), __MAIL.map(m => [m.to, m.subject]));
check('Ashley told: paid but tried to sign in', __MAIL.some(m => /could not get in: jill@stuck\.com/.test(m.subject) && /SIGN IN/.test(m.text)));
const n1 = __MAIL.length;
r = await call(LOGIN, 'POST', { body: { email: 'random@x.com', password: 'guess1234' } });
check('unknown, unpaid email: same 401, nothing sent to anyone', r.code === 401 && r.body.error === 'Email or password is incorrect.' && __MAIL.length === n1);

// 3. Reset for a paid address with no account
__MAIL.length = 0;
const rr = await call(RESET, 'POST', { body: { email: 'cm_b@tahoo.com' } });
const rr2 = await call(RESET, 'POST', { body: { email: 'random@x.com' } });
check('reset answers the same 200', rr.code === 200 && rr2.code === 200 && JSON.stringify(rr.body) === JSON.stringify(rr2.body));
check('reset for a paid, no-account address sends the setup email', __MAIL.some(m => m.to === 'cm_b@tahoo.com' && /create your account/i.test(m.subject)), __MAIL.map(m => [m.to, m.subject]));

// 4. Founder screen
r = await call(ORPH, 'GET', { headers: { authorization: 'Bearer ' + founderTok } });
const ppl = r.body.people || [];
const t = ppl.find(p => p.email === 'cm_b@tahoo.com');
check('founder GET: the typo one carries the address she tried', t && t.suggest === 'cm_b@yahoo.com', ppl);
check('founder GET: turned-away list', (r.body.signupProblems || []).some(p => p.email === 'cm_b@yahoo.com' && p.kind === 'signup-unpaid' && p.match === 'cm_b@tahoo.com' && p.times === 2), r.body.signupProblems);
const rm = await call(ORPH, 'GET', { headers: { authorization: 'Monitor KEY' } });
check('Monitor GET: emails masked', rm.code === 200 && !JSON.stringify(rm.body).includes('cm_b@yahoo.com') && !JSON.stringify(rm.body).includes('jill@stuck.com') && (rm.body.signupProblems || []).length > 0, rm.body);
let mv = await call(ORPH, 'POST', { headers: { authorization: 'Monitor KEY' }, body: { move: { from: 'cm_b@tahoo.com', to: 'cm_b@yahoo.com' } } });
check('Monitor key cannot move a payment', mv.code === 403, mv);
mv = await call(ORPH, 'POST', { headers: { authorization: 'Bearer ' + otherTok }, body: { move: { from: 'cm_b@tahoo.com', to: 'other2@x.com' } } });
check('another provider cannot move a payment', mv.code === 403, mv);
mv = await call(ORPH, 'POST', { headers: { authorization: 'Bearer ' + founderTok }, body: { move: { from: 'other@x.com', to: 'zz@x.com' } } });
check('cannot move a payment that has an account', mv.code === 404 && (await q`SELECT email FROM subscriptions WHERE stripe_customer_id='cus_O'`)[0].email === 'other@x.com', mv);
mv = await call(ORPH, 'POST', { headers: { authorization: 'Bearer ' + founderTok }, body: { move: { from: 'cm_b@tahoo.com', to: 'other@x.com' } } });
check('cannot move onto an address with an account', mv.code === 409, mv);
mv = await call(ORPH, 'POST', { headers: { authorization: 'Bearer ' + founderTok }, body: { move: { from: 'cm_b@tahoo.com', to: 'jill@stuck.com' } } });
check('cannot move onto an address with its own subscription', mv.code === 409, mv);
__MAIL.length = 0;
mv = await call(ORPH, 'POST', { headers: { authorization: 'Bearer ' + founderTok }, body: { move: { from: 'cm_b@tahoo.com', to: ' CM_B@yahoo.com ' } } });
check('founder move works', mv.code === 200 && mv.body.setup === 'sent' && mv.body.to === 'cm_b@yahoo.com', mv.body);
check('subscription row and Stripe customer moved', (await q`SELECT email FROM subscriptions WHERE stripe_customer_id='cus_T'`)[0].email === 'cm_b@yahoo.com' && STRIPE.cus_T.email === 'cm_b@yahoo.com');
check('setup email went to the right address', __MAIL.some(m => m.to === 'cm_b@yahoo.com' && /signup=1&email=cm_b%40yahoo\.com/.test(m.html)));
r = await call(SIGNUP, 'POST', { body: { email: 'cm_b@yahoo.com', password: 'whatever123', name: 'C' } });
check('she can now create her account with the email she owns', r.code === 200 && !!r.body.token, r.body);
r = await call(ORPH, 'GET', { headers: { authorization: 'Bearer ' + founderTok } });
check('she is off the waiting list and her problem shows solved', !(r.body.people || []).some(p => /cm_b@/.test(p.email)) && (r.body.signupProblems || []).filter(p => p.email === 'cm_b@yahoo.com' && p.kind === 'signup-unpaid').every(p => p.solved), r.body);

// 5. Alert switch off
await q`CREATE TABLE IF NOT EXISTS founder_settings (k text PRIMARY KEY, v text NOT NULL, updated_at timestamptz DEFAULT now())`;
await q`INSERT INTO founder_settings (k, v) VALUES ('signup_problem_alert_on', '0') ON CONFLICT (k) DO UPDATE SET v = '0'`;
__MAIL.length = 0;
await call(SIGNUP, 'POST', { body: { email: 'new1@x.com', password: 'whatever123', name: 'N' } });
check('with her switch off nothing is sent, the row is still kept', !__MAIL.length && (await q`SELECT count(*)::int AS n FROM signup_problems WHERE email='new1@x.com'`)[0].n === 1);

// 6. The checkout-typo record (what the webhook calls)
await q`UPDATE founder_settings SET v='1' WHERE k='signup_problem_alert_on'`;
__MAIL.length = 0;
await R.recordSignupProblem(q, { email: 'jane@gmial.com', kind: 'checkout-typo', match: R.emailTypoSuggestion('jane@gmial.com') });
check('checkout typo alert names the address she meant', __MAIL.some(m => /jane@gmial\.com/.test(m.subject) && /probably meant: jane@gmail\.com/.test(m.text)));
// 7. 20-a-day cap
for (let i = 0; i < 25; i++) await R.recordSignupProblem(q, { email: 'spam' + i + '@x.com', kind: 'signup-unpaid' });
check('at most 20 alerts a day in all', (await q`SELECT count(*)::int AS n FROM signup_problems WHERE alerted AND at > now() - interval '24 hours'`)[0].n <= 20);
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
