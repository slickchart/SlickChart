// The daily health sweep (2026-10-29b), run against a REAL Postgres (PGlite) so every query is
// checked for real, not against a stub. Seeds one healthy provider and one of each past incident, and
// requires every check to run, the healthy account to raise nothing, each incident to be flagged, and
// no client name or full email to appear anywhere in the reply.
//   PGLITE=<dir containing node_modules/@electric-sql/pglite> node scratchpad/test-health-sweep.mjs
// Also proves withCronRun records a run with numbers only, and skips a refused (401) caller.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const PGL = process.env.PGLITE || '/tmp/claude-0/-home-user-SlickChart/69b4016b-0c9f-5f42-97d7-5785f421acd8/scratchpad/pgl';
const { PGlite } = await import(pathToFileURL(path.join(PGL, 'node_modules/@electric-sql/pglite/dist/index.js')));
const db = new PGlite();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-'));
for (const d of ['api/admin', 'lib']) fs.mkdirSync(path.join(dir, d), { recursive: true });
fs.copyFileSync(path.join(SRC, 'api/admin/health-sweep.js'), path.join(dir, 'api/admin/health-sweep.js'));
for (const f of ['cron-runs.js', 'app-build.js', 'app-launch-log.js', 'auth.js']) fs.copyFileSync(path.join(SRC, 'lib', f), path.join(dir, 'lib', f));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(dir, 'api/feedback.js'), 'export async function monitorKeyOk(){return globalThis.__keyOk;}');
fs.writeFileSync(path.join(dir, 'lib/db.js'), `
export function dbEnabled(){return true;} export async function ensureProvidersTable(){}
export function sql(){ return async (strs, ...v) => { let t=''; strs.forEach((s,i)=>{t+=s+(i<v.length?'$'+(i+1):'');}); const r = await globalThis.__db.query(t, v); return r.rows; }; }`);
globalThis.__db = db;
// app-launch-log imports db helpers; give it what it needs
const H = 3600 * 1000, now = Date.now();
await db.exec(`
CREATE TABLE providers (id text PRIMARY KEY, email text UNIQUE NOT NULL, name text, pass_hash text, verified boolean, created_at timestamptz DEFAULT now());
CREATE TABLE sessions (id text PRIMARY KEY, provider_id text NOT NULL, device text, location text, ip text, created_at timestamptz DEFAULT now(), last_seen_at timestamptz DEFAULT now(), revoked boolean DEFAULT false);
CREATE TABLE kv (owner text, k text, v text, PRIMARY KEY(owner,k));
CREATE TABLE kv_history (id bigserial PRIMARY KEY, owner text NOT NULL, k text NOT NULL, v text, bytes integer, items integer, reason text, saved_at timestamptz DEFAULT now());
CREATE TABLE square_connections (provider_id text PRIMARY KEY, access_token text, refresh_token text, expires_at timestamptz, merchant_id text, location_id text, updated_at timestamptz DEFAULT now());
CREATE TABLE notify_log (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), kind text, subject text, skipped text, devices int, sent int, detail text);
CREATE TABLE feedback (id bigserial PRIMARY KEY, provider_id text, email text, rating int, message text, kind text, time_saved text, ts timestamptz DEFAULT now());
CREATE TABLE device_reports (provider_id text NOT NULL, device_key text NOT NULL, report jsonb NOT NULL, updated_at timestamptz DEFAULT now(), PRIMARY KEY (provider_id, device_key));
CREATE TABLE subscriptions (email text PRIMARY KEY, stripe_customer_id text, stripe_subscription_id text, status text NOT NULL DEFAULT 'inactive', plan_amount int, current_period_end timestamptz, updated_at timestamptz DEFAULT now());
CREATE TABLE login_attempts (id bigserial PRIMARY KEY, email text NOT NULL, ts timestamptz DEFAULT now());
CREATE TABLE app_launch_logs (device_key text PRIMARY KEY, provider_id text, email text, platform text, os text, build text, events jsonb NOT NULL DEFAULT '[]'::jsonb, updated_at timestamptz DEFAULT now());
CREATE TABLE native_push_log (owner_id text NOT NULL, at timestamptz NOT NULL DEFAULT now(), platform text, ends text, shape text, outcome text, reason text);
CREATE TABLE clients (id text PRIMARY KEY, provider_id text NOT NULL, token text UNIQUE NOT NULL, name text, email text, phone text, data jsonb DEFAULT '{}'::jsonb, invited_at bigint, opened_at bigint, created_at bigint, updated_at bigint, deleted_at bigint);
INSERT INTO providers (id,email,created_at) VALUES ('good','healthy@ok.com', now()-interval '60 days'),('bad','trouble@x.com', now()-interval '60 days'),('new1','fresh@new.com', now()-interval '2 days'),('other','other@x.com', now()-interval '60 days');
INSERT INTO sessions (id,provider_id,last_seen_at) VALUES ('s1','good',now()),('s2','bad',now()),('s3','new1',now());
INSERT INTO kv VALUES ('good','sc_onboarded','1'),('good','sc_clients','${'x'.repeat(5000)}'),('good','sc_bizinfo','{"name":"Glow"}'),
  ('bad','sc_onboarded','1'),('bad','sc_clients','[]'),('bad','sc_availability','null'),('good','sc_availability','{}'),('bad','sc_deleted_clients','{"c_dead":${now}}');
INSERT INTO kv_history (owner,k,bytes,items,reason,saved_at) VALUES ('bad','sc_clients',40153,120,'shrink',now()-interval '2 hours'),('good','sc_clients',5100,20,'shrink',now()-interval '2 hours'),('new1','sc_courses',977,3,'shrink',now()-interval '2 hours');
INSERT INTO square_connections (provider_id,merchant_id,expires_at) VALUES ('good','M_GOOD',now()+interval '20 days'),('bad','M_SHARED',now()-interval '1 day'),('other','M_SHARED',now()+interval '20 days');
INSERT INTO notify_log (kind,subject,skipped,devices,sent,at) VALUES ('paid-signup','someone@new.com','',2,2,now()-interval '3 hours'),('provider-signup','someone@new.com','already announced by the paid-provider ping',0,0,now()-interval '3 hours'),('feedback','trouble@x.com','no push transport configured',0,0,now()-interval '3 hours');
INSERT INTO feedback (provider_id,message,ts) VALUES ('bad','it broke',now()-interval '5 hours');
INSERT INTO device_reports VALUES ('good','dev-good-1','{"build":"2026-10-29a","platform":"iPhone","kind":"installed app","unsent":2,"idbWorks":true}',now()),
  ('bad','dev-bad-1','{"build":"2026-10-10a","platform":"Android","kind":"browser","unsent":7,"idbWorks":false,"reloadFails":"loadForms"}',now());
INSERT INTO subscriptions (email,stripe_subscription_id,status,updated_at) VALUES ('healthy@ok.com','sub_1','active',now()-interval '20 days'),('trouble@x.com','sub_2','past_due',now()),('ghost@paid.com','sub_3','active',now()-interval '5 hours');
INSERT INTO login_attempts (email,ts) SELECT 'locked@out.com', now()-interval '1 hour' FROM generate_series(1,5);
INSERT INTO app_launch_logs (device_key,provider_id,email,platform,build,events,updated_at) VALUES ('d1','bad','trouble@x.com','android','2026-10-24f','[{"t":${now - H},"e":"token-dropped","d":"x"},{"t":${now - H},"e":"screen","d":"home"}]',now()),
  ('d2','good','healthy@ok.com','ios','2026-10-29a','[{"t":${now - H},"e":"launch"},{"t":${now - H},"e":"prev-launch-cut-off"}]',now());
INSERT INTO native_push_log (owner_id,outcome,reason,at) VALUES ('good','linked','',now()),('bad','send failed','UNREGISTERED',now());
INSERT INTO clients (id,provider_id,token,name,email,created_at) VALUES ('c_dead','bad','t1','Cooper Secretname','cooper@client.com',${now - 30 * 24 * H}),('c_ok','good','t2','Ann Private','ann@client.com',${now - H});
`);
let fail = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || !d ? '' : '  :: ' + d)); if (!c) fail++; };

// 2026-10-30: a forms shrink must say WHAT shrank (one form edited shorter, one she deleted, one gone).
{ const oldF = JSON.stringify({ tmpls: { f_long: { t: 'q'.repeat(9000) }, f_del: { t: 'a' }, f_gone: { t: 'b' } }, guides: {} });
  const nowF = JSON.stringify({ tmpls: { f_long: { t: 'short' } }, guides: {} });
  await db.query("INSERT INTO kv VALUES ('other','sc_forms',$1),('other','sc_hidden_forms',$2)", [nowF, JSON.stringify({ f_del: now })]);
  await db.query("INSERT INTO kv_history (owner,k,v,bytes,items,reason,saved_at) VALUES ('other','sc_forms',$1,$2,5,'shrink',now()-interval '1 hour')", [oldF, oldF.length]); }
const { default: handler, runSweep } = await import(pathToFileURL(path.join(dir, 'api/admin/health-sweep.js')));
const { withCronRun } = await import(pathToFileURL(path.join(dir, 'lib/cron-runs.js')));
// a recorded cron run (one OK, one failing) and a refused one
const fakeRes = () => { const r = { code: 200, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, setHeader() {} }; return r; };
await withCronRun('cron-reminders', async (req, res) => res.status(200).json({ ok: true, sent: 3, providers: ['a@b.com', 'c@d.com'], note: 'Ann Private' }))({ headers: {} }, fakeRes());
await withCronRun('cron-checkins', async (req, res) => res.status(401).json({ error: 'Unauthorized' }))({ headers: {} }, fakeRes());
// A run that started and never finished (the platform stopped it): only the START row exists.
await db.query("INSERT INTO cron_runs (name, started_at, finished_at) VALUES ('cron-events', now()-interval '2 hours', NULL)");
const runs = (await db.query('SELECT name, ok, status, summary FROM cron_runs WHERE finished_at IS NOT NULL')).rows;
ok(runs.length === 1 && runs[0].name === 'cron-reminders' && runs[0].ok, 'a cron run is recorded; a refused caller is not', JSON.stringify(runs));
ok(JSON.stringify(runs[0].summary) === JSON.stringify({ ok: true, sent: 3, providers_count: 2 }), 'the run record keeps numbers only (no emails or names)', JSON.stringify(runs[0].summary));

ok((await db.query("SELECT count(*)::int AS n FROM cron_runs WHERE name='cron-checkins'")).rows[0].n === 0, 'a refused caller leaves no start row behind');
globalThis.__keyOk = false;
const denied = fakeRes(); await handler({ method: 'GET', headers: {} }, denied);
ok(denied.code === 403, 'no key, no founder session: refused');
globalThis.__keyOk = true;
const res = fakeRes(); await handler({ method: 'GET', headers: { authorization: 'Monitor x' } }, res);
const j = res.body; const by = Object.fromEntries(j.checks.map(c => [c.id, c]));
ok(res.code === 200 && j.checks.length === 15, 'all 15 checks reported', res.code + ' ' + (j.checks || []).length);
ok(j.checks.every(c => !(c.items[0] || '').startsWith('could not run')), 'every check ran against real SQL', JSON.stringify(j.checks.filter(c => (c.items[0] || '').startsWith('could not run')).map(c => c.id + ': ' + c.items[0])));
ok(by['isolation-square'].level === 'alert' && /2 accounts/.test(by['isolation-square'].items[0]), 'shared Square business is an ALERT');
ok(by['data-shrink'].level === 'alert' && by['data-shrink'].items.filter(i => !/oth…/.test(i)).length === 2 && /fre…@new.com: sc_courses/.test(by['data-shrink'].items.join()) && /tro…@x.com: sc_clients went from 40153 to 2/.test(by['data-shrink'].items.filter(i => !/oth…/.test(i))[0]), 'the big shrink is flagged (ALERT), a small one listed, the healthy one not', JSON.stringify(by['data-shrink'].items));
ok(by['settings-empty'].items.length === 1 && /sc_availability/.test(by['settings-empty'].items[0]), 'hours saved as null are flagged; hours never set ({}) are not');
ok(by['founder-alerts'].level === 'alert' && by['founder-alerts'].items.some(i => /feedback alert/.test(i)) && !by['founder-alerts'].items.some(i => /paid-signup|provider-signup/.test(i)), 'the skipped feedback alert is flagged; a good one and a deliberate de-dup are not', JSON.stringify(by['founder-alerts'].items));
ok(/7 changes not yet saved/.test(by['device-health'].items.join()) && /storage not working/.test(by['device-health'].items.join()) && by['device-health'].items.length === 1, 'the failing device is flagged; 2 unsent (save in its delay) is not');
ok(by['scheduled-jobs'].level === 'alert' && by['scheduled-jobs'].items.some(i => /cron-checkins: no run recorded/.test(i)) && !by['scheduled-jobs'].items.some(i => /cron-reminders/.test(i)), 'a job with no run is flagged once recording has started', JSON.stringify(by['scheduled-jobs'].items));
ok(by['scheduled-jobs'].items.some(i => /cron-events: started 1x in the last day and never finished/.test(i)) && !by['scheduled-jobs'].items.some(i => /cron-events: no run recorded/.test(i)), 'a run that started and never finished is named as such', JSON.stringify(by['scheduled-jobs'].items));
ok(by['square-tokens'].level === 'alert' && by['square-tokens'].items.length === 1 && /EXPIRED/.test(by['square-tokens'].items[0]), 'the expired Square sign-in is an ALERT');
ok(by['billing'].level === 'alert' && by['billing'].items.some(i => /past due/.test(i)) && by['billing'].items.some(i => /gho…@paid.com: paid but has no SlickChart account/.test(i)), 'past-due-but-using and paid-with-no-account are flagged', JSON.stringify(by['billing'].items));
ok(by['sign-in'].items.length === 1 && /5 failed sign-ins/.test(by['sign-in'].items[0]), 'someone stuck at sign-in is flagged');
ok(by['app-logs'].items.length === 1 && /signed out by the app 1x/.test(by['app-logs'].items[0]), 'a sign-out in the launch log is flagged; one mid-launch close is not', JSON.stringify(by['app-logs'].items));
ok(by['stale-builds'].items.length === 1 && /2026-10-10a/.test(by['stale-builds'].items[0]), 'the device on an old build is flagged');
ok(by['phone-push'].items.length === 1 && /send failed: UNREGISTERED/.test(by['phone-push'].items[0]), 'a refused phone push is flagged, a link is not');
ok(by['new-setup'].items.length === 1 && /fre…@new.com/.test(by['new-setup'].items[0]), 'the new provider who never finished setup is flagged');
{ const f = by['data-shrink'].items.find(i => /oth…@x.com: sc_forms/.test(i)) || '';
  ok(/Shrank: tmpls 3\u21921 entries/.test(f) && /Forms: 2 gone \(1 deleted by her\), 1 edited much shorter/.test(f) && !/f_long|f_del|qqq/.test(f), 'a forms shrink says which part shrank and how many forms she deleted, with no ids or content', f); }
ok(by['deleted-but-live'].items.length === 1 && /1 client/.test(by['deleted-but-live'].items[0]), 'a deleted client still live on the server is flagged');
ok(!JSON.stringify(j).match(/healthy@ok|trouble@x|Cooper|Secretname|cooper@client|Ann Private|ann@client|locked@out|ghost@paid|M_SHARED|M_GOOD/), 'no client name, full email or full merchant id in the reply');
ok(j.problems.length > 0 && j.problems[0].startsWith('ALERT'), 'problems list is worst first');
ok(!JSON.stringify(j).match(/hea…@ok\.com/), 'the healthy account appears nowhere');
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
