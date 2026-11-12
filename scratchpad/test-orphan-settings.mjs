// "Paid but no account" (2026-11-03): Ashley's two wait settings, the founder list, and the hourly
// email job reading those settings. Real Postgres (PGlite), real auth tokens.
//   PGLITE=<dir with node_modules/@electric-sql/pglite> node scratchpad/test-orphan-settings.mjs
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const PGL = process.env.PGLITE || '/tmp/pgl';
const { PGlite } = await import(pathToFileURL(path.join(PGL, 'node_modules/@electric-sql/pglite/dist/index.js')));
const db = new PGlite(); globalThis.__db = db;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orph-'));
for (const d of ['api/admin', 'lib']) fs.mkdirSync(path.join(dir, d), { recursive: true });
fs.copyFileSync(path.join(SRC, 'api/admin/orphans.js'), path.join(dir, 'api/admin/orphans.js'));
fs.copyFileSync(path.join(SRC, 'api/cron-orphan-checkout.js'), path.join(dir, 'api/cron-orphan-checkout.js'));
for (const f of ['founder-settings.js', 'auth.js', 'app-launch-log.js']) fs.copyFileSync(path.join(SRC, 'lib', f), path.join(dir, 'lib', f));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(dir, 'api/feedback.js'), 'export async function monitorKeyOk(req){return String(req.headers.authorization||"")==="Monitor good";}');
fs.writeFileSync(path.join(dir, 'lib/db.js'), `
export function dbEnabled(){return true;} export async function ensureProvidersTable(){}
export function sql(){ return async (strs, ...v) => { let t=''; strs.forEach((s,i)=>{t+=s+(i<v.length?'$'+(i+1):'');}); const r = await globalThis.__db.query(t, v); return r.rows; }; }`);
fs.writeFileSync(path.join(dir, 'lib/nurture.js'), `export async function ensureNurtureTables(q){
  await q\`CREATE TABLE IF NOT EXISTS nurture_sends (email text NOT NULL, seq text NOT NULL, step int NOT NULL, sent_at timestamptz DEFAULT now(), UNIQUE(email, seq, step))\`;
  await q\`CREATE TABLE IF NOT EXISTS nurture_optout (email text PRIMARY KEY, ts timestamptz DEFAULT now())\`; }`);
fs.writeFileSync(path.join(dir, 'lib/email.js'), 'export async function sendEmail(m){(globalThis.__mail=globalThis.__mail||[]).push(m);} export function trustedOrigin(){return "https://slickchart.app";}');
fs.writeFileSync(path.join(dir, 'lib/fcm.js'), 'export async function pushFounders(m){(globalThis.__push=globalThis.__push||[]).push(m);}');
fs.writeFileSync(path.join(dir, 'lib/cron-runs.js'), 'export function withCronRun(n,h){return h;}');
process.env.SESSION_SECRET = 'test-secret'; process.env.FOUNDER_EMAILS = 'boss@sc.com'; process.env.CRON_SECRET = 'cron'; process.env.OWNER_EMAIL = 'boss@sc.com';
const { signToken } = await import(pathToFileURL(path.join(dir, 'lib/auth.js')));
await db.exec(`
CREATE TABLE providers (id text PRIMARY KEY, email text UNIQUE NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE sessions (id text PRIMARY KEY, provider_id text, revoked boolean DEFAULT false, last_seen_at timestamptz DEFAULT now());
CREATE TABLE subscriptions (email text PRIMARY KEY, stripe_customer_id text, stripe_subscription_id text, status text, updated_at timestamptz DEFAULT now());
CREATE TABLE login_attempts (id bigserial PRIMARY KEY, email text NOT NULL, ts timestamptz DEFAULT now());
INSERT INTO providers (id,email) VALUES ('boss','boss@sc.com'),('pp','paying@has.com');
INSERT INTO subscriptions (email,stripe_subscription_id,status,updated_at) VALUES
 ('paying@has.com','sub_a','active',now()-interval '9 days'),
 ('jill@stuck.com','sub_b','active',now()-interval '5 hours'),
 ('bell@stuck.com','sub_c','active',now()-interval '60 hours'),
 ('new@stuck.com','sub_d','active',now()-interval '1 hour'),
 ('road@map.com',NULL,'active',now()-interval '10 hours');
INSERT INTO login_attempts (email) SELECT 'jill@stuck.com' FROM generate_series(1,6);
`);
const res = () => { const r = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; return r; };
const orphans = (await import(pathToFileURL(path.join(dir, 'api/admin/orphans.js')))).default;
const cron = (await import(pathToFileURL(path.join(dir, 'api/cron-orphan-checkout.js')))).default;
const call = async (h, method, auth, body, query) => { const r = res(); await h({ method, headers: { authorization: auth }, body, query: query || {} }, r); return r; };
const founderTok = 'Bearer ' + signToken({ u: 'boss', e: 'boss@sc.com' }, 'test-secret');
const otherTok = 'Bearer ' + signToken({ u: 'pp', e: 'paying@has.com' }, 'test-secret');
const results = []; const ok = (p, n, d) => results.push({ p: !!p, n, d });

let r = await call(orphans, 'GET', otherTok); ok(r.code === 403, 'a non-founder provider is refused');
r = await call(orphans, 'POST', otherTok, { orphan_email_hours: 1 }); ok(r.code === 403, 'a non-founder cannot change the setting');
r = await call(orphans, 'GET', ''); ok(r.code === 403, 'no sign-in is refused');
r = await call(orphans, 'POST', 'Monitor good', { orphan_email_hours: 1 }); ok(r.code === 403, 'the monitor key can read but never write');
r = await call(orphans, 'GET', founderTok);
ok(r.code === 200 && r.body.settings.orphan_email_hours === 3 && r.body.settings.orphan_alert_hours === 48 && r.body.settings.orphan_alert_on === 0, 'defaults are 3 h, 48 h, alert off', JSON.stringify(r.body && r.body.settings));
const em = (r.body.people || []).map(p => p.email).sort();
ok(JSON.stringify(em) === JSON.stringify(['bell@stuck.com', 'jill@stuck.com', 'new@stuck.com']), 'lists exactly the paid-with-no-account people (not the roadmap buyer, not the one with an account)', JSON.stringify(em));
const jill = (r.body.people || []).find(p => p.email === 'jill@stuck.com') || {};
ok(jill.failedSignIns === 6 && /due/.test(jill.status), 'shows failed sign-ins and that the email is due', JSON.stringify(jill));
const nw = (r.body.people || []).find(p => p.email === 'new@stuck.com') || {};
ok(/waiting \(2h/.test(nw.status), 'someone who paid 1 h ago shows the wait left', nw.status);
r = await call(orphans, 'GET', 'Monitor good');
ok(r.code === 200 && (r.body.people || []).every(p => /…/.test(p.email)) && !JSON.stringify(r.body).includes('jill@stuck'), 'the monitor key sees masked emails only');

// The job with defaults: jill (5h) and bell (60h) get the email, new (1h) does not; bell is escalated.
globalThis.__mail = []; globalThis.__push = [];
r = await call(cron, 'GET', 'Bearer cron');
ok(r.body && r.body.emailed === 2 && r.body.escalated === 0 && r.body.graceHours === 3 && !globalThis.__push.length && !globalThis.__mail.some(m => m.to === 'boss@sc.com'), 'job: 2 emailed with defaults, and Ashley is NOT alerted (alert off by default, 2026-11-11)', JSON.stringify(r.body));
r = await call(orphans, 'POST', founderTok, { orphan_alert_on: 1 });
ok(r.code === 200 && r.body.settings.orphan_alert_on === 1, 'she can switch the alert back on', JSON.stringify(r.body && r.body.settings));
r = await call(cron, 'GET', 'Bearer cron');
ok(r.body.emailed === 0 && r.body.escalated === 1 && globalThis.__push.length === 1, 'with it on, the 60 h one is escalated once (no second provider email)', JSON.stringify(r.body));
r = await call(orphans, 'POST', founderTok, { orphan_alert_on: 0 });
ok(r.code === 200 && r.body.settings.orphan_alert_on === 0, 'and off again', JSON.stringify(r.body && r.body.settings));
ok(globalThis.__mail.some(m => m.to === 'jill@stuck.com' && /signup=1&email=jill%40stuck.com/.test(m.text)) && !globalThis.__mail.some(m => m.to === 'new@stuck.com' || m.to === 'road@map.com'), 'right people emailed, with the sign-up link for their own email');
ok(globalThis.__mail.every(m => !/\bour fault\b|\bwe\b/i.test(m.text || '')), 'the email speaks as "I", not "we"');
r = await call(cron, 'GET', 'Bearer cron'); ok(r.body.emailed === 0 && r.body.escalated === 0, 'a second run sends nothing again');

// She changes the wait to 1 hour: the next run emails the 1-hour-old payer.
r = await call(orphans, 'POST', founderTok, { orphan_email_hours: 1, orphan_alert_hours: 24 });
ok(r.code === 200 && r.body.settings.orphan_email_hours === 1 && r.body.settings.orphan_alert_hours === 24, 'she saves 1 h / 24 h', JSON.stringify(r.body));
await db.exec(`UPDATE subscriptions SET updated_at = now()-interval '70 minutes' WHERE email='new@stuck.com'`);
globalThis.__mail = [];
r = await call(cron, 'GET', 'Bearer cron');
ok(r.body.emailed === 1 && r.body.graceHours === 1 && globalThis.__mail[0] && globalThis.__mail[0].to === 'new@stuck.com', 'the job follows her new wait', JSON.stringify(r.body));
// Bad values are clamped, never break the job.
r = await call(orphans, 'POST', founderTok, { orphan_email_hours: -5, orphan_alert_hours: 'abc' });
ok(r.body.settings.orphan_email_hours === 1 && r.body.settings.orphan_alert_hours === 24, 'a negative is clamped to the minimum, text is ignored', JSON.stringify(r.body.settings));
r = await call(orphans, 'POST', founderTok, { orphan_email_hours: 50, orphan_alert_hours: 10 });
ok(r.body.settings.orphan_alert_hours > r.body.settings.orphan_email_hours, 'the alert never comes before the email', JSON.stringify(r.body.settings));
r = await call(orphans, 'GET', founderTok);
const j2 = (r.body.people || []).find(p => p.email === 'jill@stuck.com') || {};
ok(j2.emailedAt && j2.status === 'emailed', 'the list shows when the email went', JSON.stringify(j2));
r = await call(cron, 'GET', 'Bearer nope'); ok(r.code === 401, 'the job refuses a caller without the cron secret');

let all = true; for (const x of results) { console.log((x.p ? 'PASS ' : 'FAIL ') + x.n + (x.p ? '' : ' :: ' + (x.d || ''))); all = all && x.p; }
console.log(all ? 'ALL PASS' : 'FAILURES'); process.exit(all ? 0 : 1);
