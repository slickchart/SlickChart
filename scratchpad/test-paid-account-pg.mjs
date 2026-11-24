// test-paid-account-pg: paying MAKES the account (2026-11-23, lib/account-setup.js, api/account-setup.js).
// Real PostgreSQL 16, the real api/ + lib/ files copied next to stubs (same harness as
// test-signup-rescue-pg). Covers: the account made at checkout, the "Get set up" email and its one-tap
// link, coming back from Stripe, sign in / reset / Create account on a waiting account, the orphans list,
// the founder "move payment", the hourly reminder + one-time catch-up, and that nothing crosses accounts.
// CONTROL=1 switches off making the account at payment (the old behaviour) and MUST fail.
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
const VERCEL = new URL('../slickchart-vercel', import.meta.url).pathname+'';
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pares-'));
const sock = fs.mkdtempSync(path.join(os.tmpdir(), 'pasock-'));
const PORT = '55541';
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
for (const f of ['auth.js', 'totp.js', 'stripe-subs.js', 'pricing.js', 'setup-email.js', 'account-setup.js', 'signup-rescue.js', 'founder-settings.js', 'notify-log.js', 'app-launch-log.js', 'cron-runs.js']) fs.copyFileSync(VERCEL + '/lib/' + f, lib + '/' + f);
if (process.env.CONTROL) fs.writeFileSync(lib + '/account-setup.js', fs.readFileSync(lib + '/account-setup.js', 'utf8').replace('export async function ensurePaidAccount(q, rawEmail, rawName) {', 'export async function ensurePaidAccount(q, rawEmail, rawName) { return null;'));
fs.writeFileSync(lib + '/email.js', `export async function sendEmail(m){ globalThis.__MAIL.push(m); return {}; } export function trustedOrigin(){ return 'https://slickchart.app'; } export async function addToAudience(){} export function welcomeEmailHtml(o){return 'welcome '+o.link;} export function welcomeEmailText(o){return 'welcome '+o.link;}`);
fs.writeFileSync(lib + '/fcm.js', `export function founderPushConfigured(){ return true; } export async function pushFoundersReport(p){ globalThis.__PUSH.push(p); return { devices: 2, sent: 2, providerIds: ['p_f'], results: [] }; } export async function pushFounders(p){ globalThis.__PUSH.push(p); return {}; }`);
fs.writeFileSync(lib + '/nurture.js', `import { sql } from './db.js'; export async function ensureNurtureTables(q){ q=q||sql(); await q\`CREATE TABLE IF NOT EXISTS nurture_sends (email text NOT NULL, seq text NOT NULL, step int NOT NULL, sent_at timestamptz DEFAULT now(), UNIQUE(email, seq, step))\`; await q\`CREATE TABLE IF NOT EXISTS nurture_optout (email text PRIMARY KEY, ts timestamptz DEFAULT now())\`; }`);
fs.writeFileSync(api + '/feedback.js', `export async function monitorKeyOk(req){ return (req.headers.authorization||'') === 'Monitor KEY'; }`);
globalThis.__MAIL = []; globalThis.__PUSH = [];
for (const f of ['signup.js', 'login.js', 'request-reset.js', 'reset.js', 'account-setup.js', 'cron-orphan-checkout.js']) { try { fs.copyFileSync(VERCEL + '/api/' + f, api + '/' + f); } catch (e) {} }
fs.copyFileSync(VERCEL + '/api/admin/orphans.js', api + '/admin/orphans.js');
if (asRoot) sh('chown -R ' + USER + ' ' + root);
const FOUNDER = 'founder@test.example';
process.env.SESSION_SECRET = 'sess'; process.env.DATABASE_URL = 'stub'; process.env.STRIPE_SECRET_KEY = 'sk_test'; process.env.REQUIRE_PAYMENT = 'true';
process.env.FOUNDER_EMAILS = FOUNDER; process.env.OWNER_EMAIL = FOUNDER; process.env.FOUNDER_NOTIFY_EMAIL = 'alerts@test.example'; process.env.CRON_SECRET = 'cron';
const now = () => Math.floor(Date.now() / 1000);
const SESSIONS = {
  cs_live_aaaaaaaaaaaaPAID1: { status: 'complete', mode: 'subscription', created: now() - 60, customer_details: { email: 'Back.From@Stripe.com', name: 'Bea Back' }, customer: 'cus_B', subscription: 'sub_B' },
  cs_live_aaaaaaaaaaaaOPEN1: { status: 'open', mode: 'subscription', created: now() - 60, customer_details: { email: 'open@x.com' } },
  cs_live_aaaaaaaaaaaaBUILD: { status: 'complete', mode: 'payment', created: now() - 60, customer_details: { email: 'build@x.com' } },
  cs_live_aaaaaaaaaaaaOLD01: { status: 'complete', mode: 'subscription', created: now() - 10 * 86400, customer_details: { email: 'old@x.com' } },
  cs_live_aaaaaaaaaaaaREADY: { status: 'complete', mode: 'subscription', created: now() - 60, customer_details: { email: 'ready@x.com' } },
};
globalThis.fetch = async (url) => {
  const u = new URL(url); const ok = j => ({ ok: true, json: async () => j, text: async () => '' });
  const m = u.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/);
  if (m) return SESSIONS[m[1]] ? ok(SESSIONS[m[1]]) : { ok: false, json: async () => ({}) };
  // Stripe's view for the "truly still stuck" check in the hourly job (Ashley 2026-11-23)
  const LIVE = { 'stuck@old.com': ['cus_S', 'Sam Stuck', 'trialing'], 'fresh@pro.com': ['cus_Q', 'Fay Fresh', 'active'], 'gone@old.com': ['cus_G', 'Gina Gone', 'canceled'], 'other@addr.com': ['cus_O', 'Rae Ready', 'active'], 'patience.maasey@gmail.com': ['cus_P', 'Pat', 'trialing'] };
  if (u.pathname === '/v1/customers') { const e = u.searchParams.get('email'); return ok({ data: LIVE[e] ? [{ id: LIVE[e][0] }] : [] }); }
  if (u.pathname === '/v1/subscriptions') { const c = u.searchParams.get('customer'); const hit = Object.values(LIVE).find(x => x[0] === c); return ok({ data: hit ? [{ id: 'sub_' + c, status: hit[2], customer: c }] : [] }); }
  const cm = u.pathname.match(/^\/v1\/customers\/(.+)$/); if (cm) { const hit = Object.values(LIVE).find(x => x[0] === cm[1]); return hit ? ok({ id: cm[1], name: hit[1] }) : { ok: false, json: async () => ({}) }; }
  return { ok: false, json: async () => ({}), text: async () => '' };
};
const D = await import(lib + '/db.js'); const A = await import(lib + '/auth.js');
const S = await import(lib + '/setup-email.js'); const AS = await import(lib + '/account-setup.js');
const SIGNUP = (await import(api + '/signup.js')).default;
const LOGIN = (await import(api + '/login.js')).default;
const RESET = (await import(api + '/request-reset.js')).default;
const DORESET = (await import(api + '/reset.js')).default;
const SETUP = (await import(api + '/account-setup.js')).default;
const CRON = (await import(api + '/cron-orphan-checkout.js')).default;
const ORPH = (await import(api + '/admin/orphans.js')).default;
const q = D.sql();
await D.ensureProvidersTable();
await q`CREATE TABLE IF NOT EXISTS subscriptions (email text PRIMARY KEY, stripe_customer_id text, stripe_subscription_id text, status text, updated_at timestamptz DEFAULT now(), paid_notified_at timestamptz)`.catch(() => {});
const call = async (h, method, { body, query, headers } = {}) => { const r = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() {}, send(b) { this.body = b; } };
  await h({ method, headers: Object.assign({ 'user-agent': 'x', 'x-real-ip': '1.2.3.4' }, headers || {}), query: query || {}, body: body || {} }, r); return r; };
let fails = 0; const check = (name, cond, detail) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(detail))); if (!cond) fails++; };
const PW = 'Secret123!';
await q`INSERT INTO providers (id,email,name,pass_hash,verified) VALUES ('p_f',${FOUNDER},'F',${A.hashPassword(PW)},true),('p_r','ready@x.com','R',${A.hashPassword(PW)},true),('p_twin','patience.massey@gmail.com','P',${A.hashPassword(PW)},true)`;
const pay = async (email, sub) => { await q`INSERT INTO subscriptions (email, stripe_customer_id, stripe_subscription_id, status, updated_at) VALUES (${email}, ${'cus_' + sub}, ${'sub_' + sub}, 'active', now()) ON CONFLICT (email) DO UPDATE SET status='active'`; };
const linkIn = m => { const x = /slickchart\?setup=([A-Za-z0-9_-]+)/.exec((m && m.html) || ''); return x ? x[1] : null; };

// 1. Checkout completes (what the webhook does: subscription row, account, email)
__MAIL.length = 0;
await pay('new@pro.com', 'N');
const acct = await AS.ensurePaidAccount(q, 'New@Pro.com', 'Nina New');
const res1 = await S.sendSetupEmailNow(q, 'new@pro.com', 'Nina New');
const row = (await q`SELECT name, needs_setup, verified FROM providers WHERE email='new@pro.com'`)[0];
check('paying makes the account at once, waiting for a password', acct && acct.created && row && row.needs_setup === true && row.name === 'Nina New', [acct, row]);
const mail = __MAIL.find(m => m.to === 'new@pro.com');
check('the "Get set up" email goes right away', res1 === 'sent' && mail && /Get set up/.test(mail.subject) && />Get set up</.test(mail.html), [res1, mail && mail.subject]);
const tok = linkIn(mail);
check('its button is a one-tap set-up link (no "use the same email" step)', !!tok && !/signup=1/.test(mail.html) && !/same email address/i.test(mail.text), mail && mail.html);
check('a second checkout event does not email again', (await S.sendSetupEmailNow(q, 'new@pro.com')) === 'already' && __MAIL.filter(m => m.to === 'new@pro.com').length === 1);
check('founder address is never given a made account', (await AS.ensurePaidAccount(q, FOUNDER, 'x')) === null);
check('an address that already has a real account is left alone', (await AS.ensurePaidAccount(q, 'ready@x.com')).needsSetup === false && (await S.sendSetupEmailNow(q, 'ready@x.com')) === 'has-account');

// 2. Sign in before setting a password: refused as before, the set-up email goes again
__MAIL.length = 0;
let r = await call(LOGIN, 'POST', { body: { email: 'new@pro.com', password: 'guess1234' } });
check('sign-in with a guessed password is refused with the usual words', r.code === 401 && r.body.error === 'Email or password is incorrect.', r.body);
const again = __MAIL.find(m => m.to === 'new@pro.com');
check('...and she is sent a fresh Get set up link', again && !!linkIn(again), __MAIL.map(m => [m.to, m.subject]));
r = await call(LOGIN, 'POST', { body: { email: 'new@pro.com', password: '' } });
check('an empty password never opens a waiting account', r.code === 401);

// 3. The link: GET shows her email, POST sets the password and signs her in
r = await call(SETUP, 'GET', { query: { token: tok } });
check('the link knows whose account it is', r.code === 200 && r.body.email === 'new@pro.com' && r.body.name === 'Nina New', r.body);
r = await call(SETUP, 'GET', { query: { token: 'nope' } });
check('a made-up link is refused', r.code === 400 && !r.body.email, r.body);
r = await call(SETUP, 'POST', { body: { token: tok, password: 'short' } });
check('a short password is refused', r.code === 400 && /8/.test(r.body.error));
__MAIL.length = 0;
r = await call(SETUP, 'POST', { body: { token: tok, password: 'MyNewPass1', name: 'Nina N' } });
const row2 = (await q`SELECT name, needs_setup, verified FROM providers WHERE email='new@pro.com'`)[0];
check('picking a password signs her straight in', r.code === 200 && !!r.body.token && r.body.email === 'new@pro.com', r.body);
check('the account is now a normal, verified one', row2.needs_setup === false && row2.verified === true && row2.name === 'Nina N', row2);
check('welcome email sent', __MAIL.some(m => m.to === 'new@pro.com' && /Welcome/.test(m.subject)));
r = await call(SETUP, 'POST', { body: { token: tok, password: 'Another123' } });
check('the link only works once', r.code === 400, r.body);
r = await call(LOGIN, 'POST', { body: { email: 'new@pro.com', password: 'MyNewPass1' } });
check('she can sign in with it after', r.code === 200 && !!r.body.token, r.body);
const older = again && linkIn(again);
r = await call(SETUP, 'POST', { body: { token: older, password: 'Hijack1234' } });
check('every older link for that account died with it', r.code === 400);
r = await call(LOGIN, 'POST', { body: { email: 'new@pro.com', password: 'MyNewPass1' } });
check('...and her password is unchanged', r.code === 200);

// 4. Back from Stripe
r = await call(SETUP, 'POST', { body: { sessionId: 'cs_live_aaaaaaaaaaaaPAID1' } });
check('coming back from Stripe hands her a set-up screen for the address she paid with', r.code === 200 && !!r.body.setupToken && r.body.email === 'back.from@stripe.com' && r.body.name === 'Bea Back', r.body);
check('...even if the webhook has not arrived yet (subscription row + account made)', (await q`SELECT status FROM subscriptions WHERE email='back.from@stripe.com'`)[0].status === 'active' && (await q`SELECT needs_setup FROM providers WHERE email='back.from@stripe.com'`)[0].needs_setup === true);
const st = r.body.setupToken;
r = await call(SETUP, 'POST', { body: { token: st, password: 'BeaPass123' } });
check('she picks a password and is in', r.code === 200 && !!r.body.token);
check('an address only Stripe vouched for stays unverified (verify email sent)', (await q`SELECT verified FROM providers WHERE email='back.from@stripe.com'`)[0].verified === false && __MAIL.some(m => m.to === 'back.from@stripe.com' && /verify=/.test(m.text)));
r = await call(SETUP, 'POST', { body: { sessionId: 'cs_live_aaaaaaaaaaaaPAID1' } });
check('the same Stripe page again only says "you have an account"', r.code === 200 && r.body.hasAccount === true && !r.body.setupToken, r.body);
for (const [id, why] of [['cs_live_aaaaaaaaaaaaOPEN1', 'not paid'], ['cs_live_aaaaaaaaaaaaBUILD', 'a Build sale'], ['cs_live_aaaaaaaaaaaaOLD01', 'old'], ['cs_live_zzzzzzzzzzzzzzzzz', 'unknown'], ['../../v1/customers', 'not an id']]) {
  r = await call(SETUP, 'POST', { body: { sessionId: id } });
  check('no account from a checkout that is ' + why, r.code === 202 && !r.body.setupToken, r.body);
}
check('...and none of them made an account', !(await q`SELECT 1 FROM providers WHERE email IN ('open@x.com','build@x.com','old@x.com')`).length);
r = await call(SETUP, 'POST', { body: { sessionId: 'cs_live_aaaaaaaaaaaaREADY' } });
check('a payment by someone with a real account never touches it', r.code === 200 && r.body.hasAccount && !r.body.setupToken);

// 5. Create account / reset on a waiting account
await pay('claim@pro.com', 'C'); await AS.ensurePaidAccount(q, 'claim@pro.com', 'Cee');
r = await call(SIGNUP, 'POST', { body: { email: 'claim@pro.com', password: 'ClaimPass1', name: 'Cee Claim' } });
check('Create account still works on a waiting account (no "already exists")', r.code === 200 && !!r.body.token && (await q`SELECT needs_setup FROM providers WHERE email='claim@pro.com'`)[0].needs_setup === false, r.body);
r = await call(SIGNUP, 'POST', { body: { email: 'claim@pro.com', password: 'Other12345', name: 'X' } });
check('but not twice', r.code === 409);
await pay('reset@pro.com', 'R'); await AS.ensurePaidAccount(q, 'reset@pro.com');
__MAIL.length = 0;
await call(RESET, 'POST', { body: { email: 'reset@pro.com' } });
const rt = /reset=([A-Za-z0-9_-]+)/.exec((__MAIL.find(m => m.to === 'reset@pro.com') || {}).html || '');
r = rt ? await call(DORESET, 'POST', { body: { token: rt[1], password: 'ResetPass1' } }) : { code: 0 };
const rr = (await q`SELECT needs_setup, verified FROM providers WHERE email='reset@pro.com'`)[0];
check('"Forgot password" also finishes a waiting account', r.code === 200 && rr.needs_setup === false && rr.verified === true, [r.body, rr]);
check('...and she can sign in', (await call(LOGIN, 'POST', { body: { email: 'reset@pro.com', password: 'ResetPass1' } })).code === 200);

// 6. Orphans: a waiting account still counts as "paid but no account"; Ashley's move takes it along
await pay('wait@pro.com', 'W'); await AS.ensurePaidAccount(q, 'wait@pro.com');
await pay('typo@gmial.com', 'T'); await AS.ensurePaidAccount(q, 'typo@gmial.com');
const founderTok = (await call(LOGIN, 'POST', { body: { email: FOUNDER, password: PW } })).body.token;
await pay(FOUNDER, 'F');
r = await call(ORPH, 'GET', { headers: { authorization: 'Bearer ' + founderTok } });
const ppl = (r.body.people || []).map(p => p.email);
check('Paid but no account lists waiting accounts, not finished ones', ppl.includes('wait@pro.com') && !ppl.includes('new@pro.com') && !ppl.includes('claim@pro.com'), ppl);
__MAIL.length = 0;
r = await call(ORPH, 'POST', { headers: { authorization: 'Bearer ' + founderTok }, body: { move: { from: 'typo@gmial.com', to: 'typo@gmail.com' } } });
const mvd = await q`SELECT email, needs_setup FROM providers WHERE email IN ('typo@gmial.com','typo@gmail.com')`;
check('moving a payment moves the waiting account with it', r.code === 200 && mvd.length === 1 && mvd[0].email === 'typo@gmail.com', [r.body, mvd]);
check('...and the set-up email goes to the right address', __MAIL.some(m => m.to === 'typo@gmail.com' && !!linkIn(m)), __MAIL.map(m => m.to));

// 7. Hourly job: reminder carries the one-tap link; one-time catch-up for people stuck before today
//    (their earlier emails said "create your account"); never to a typo twin of a real account.
await q`INSERT INTO subscriptions (email, stripe_customer_id, stripe_subscription_id, status, updated_at) VALUES
  ('stuck@old.com','cus_S','sub_S','active', now() - interval '10 days'),
  ('patience.maasey@gmail.com','cus_P','sub_P','active', now() - interval '1 day'),
  ('fresh@pro.com','cus_Q','sub_Q','active', now() - interval '5 hours'),
  ('gone@old.com','cus_G','sub_G','active', now() - interval '10 days'),
  ('other@addr.com','cus_O','sub_O','active', now() - interval '10 days')`;
await q`UPDATE providers SET name = 'Rae Ready' WHERE id = 'p_r'`;
await D.ensureProvidersTable();
const N = (await import(lib + '/nurture.js')); await N.ensureNurtureTables(q);
await q`INSERT INTO nurture_sends (email, seq, step, sent_at) VALUES ('stuck@old.com','orphan',0, now() - interval '9 days'),('patience.maasey@gmail.com','orphan',0, now() - interval '20 hours'),('patience.maasey@gmail.com','setup',0, now() - interval '1 day')`;
__MAIL.length = 0;
r = await call(CRON, 'GET', { headers: { authorization: 'Bearer cron' } });
const to = e => __MAIL.filter(m => m.to === e);
check('stuck before today: one catch-up email with the one-tap link', to('stuck@old.com').length === 1 && !!linkIn(to('stuck@old.com')[0]), [r.body, __MAIL.map(m => [m.to, m.subject])]);
check('...and that made her account so the link works', (await q`SELECT needs_setup FROM providers WHERE email='stuck@old.com'`)[0].needs_setup === true);
check('a typo twin of a real account is never emailed', to('patience.maasey@gmail.com').length === 0);
check('cancelled in Stripe (our row not updated yet): not emailed', to('gone@old.com').length === 0);
check('paid under one address, already in under another with the same name: not emailed', to('other@addr.com').length === 0);
check('the reminder after the wait carries the one-tap link, once', to('fresh@pro.com').length === 1 && !!linkIn(to('fresh@pro.com')[0]) && /Reminder/.test(to('fresh@pro.com')[0].subject), to('fresh@pro.com').map(m => m.subject));
__MAIL.length = 0;
await call(CRON, 'GET', { headers: { authorization: 'Bearer cron' } });
check('the next run sends nothing again', __MAIL.filter(m => ['stuck@old.com', 'fresh@pro.com', 'wait@pro.com'].includes(m.to)).length === 0, __MAIL.map(m => m.to));

// 8. Isolation: one account's link cannot reach another
const tA = await AS.issueSetupToken(q, (await q`SELECT id FROM providers WHERE email='wait@pro.com'`)[0].id);
r = await call(SETUP, 'POST', { body: { token: tA, password: 'WaitPass12', email: 'ready@x.com', providerId: 'p_r' } });
check('a set-up link only ever sets ITS account (request fields ignored)', r.code === 200 && r.body.email === 'wait@pro.com' && (await call(LOGIN, 'POST', { body: { email: 'ready@x.com', password: PW } })).code === 200, r.body);
const rtok = await AS.issueSetupToken(q, 'p_r');
r = await call(SETUP, 'POST', { body: { token: rtok, password: 'Takeover12' } });
check('a set-up link can never change the password of an account that has one', r.code === 409 && (await call(LOGIN, 'POST', { body: { email: 'ready@x.com', password: PW } })).code === 200, r.body);

console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
process.exit(fails ? 1 : 0);
