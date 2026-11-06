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
const CUR = (fs.readFileSync(path.join(SRC, 'lib/app-build.js'), 'utf8').match(/APP_BUILD = '([^']+)'/) || [])[1];
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
CREATE TABLE client_events (id text PRIMARY KEY, client_id text NOT NULL, provider_id text NOT NULL, kind text NOT NULL, payload jsonb DEFAULT '{}'::jsonb, seen int DEFAULT 0, created_at bigint);
CREATE TABLE login_attempts (id bigserial PRIMARY KEY, email text NOT NULL, ts timestamptz DEFAULT now());
CREATE TABLE app_launch_logs (device_key text PRIMARY KEY, provider_id text, email text, platform text, os text, build text, events jsonb NOT NULL DEFAULT '[]'::jsonb, updated_at timestamptz DEFAULT now());
CREATE TABLE native_push_log (owner_id text NOT NULL, at timestamptz NOT NULL DEFAULT now(), platform text, ends text, shape text, outcome text, reason text);
CREATE TABLE clients (id text PRIMARY KEY, provider_id text NOT NULL, token text UNIQUE NOT NULL, name text, email text, phone text, data jsonb DEFAULT '{}'::jsonb, invited_at bigint, opened_at bigint, created_at bigint, updated_at bigint, deleted_at bigint);
INSERT INTO providers (id,email,created_at) VALUES ('good','healthy@ok.com', now()-interval '60 days'),('bad','trouble@x.com', now()-interval '60 days'),('new1','fresh@new.com', now()-interval '2 days'),('other','other@x.com', now()-interval '60 days');
INSERT INTO sessions (id,provider_id,last_seen_at) VALUES ('s1','good',now()),('s2','bad',now()),('s3','new1',now());
INSERT INTO kv VALUES ('good','sc_onboarded','1'),('good','sc_clients','${'x'.repeat(5000)}'),('good','sc_bizinfo','{"name":"Glow"}'),
  ('bad','sc_onboarded','1'),('bad','sc_clients','[]'),('bad','sc_availability','null'),('good','sc_availability','{}'),('bad','sc_deleted_clients','{"c_dead":${now}}');
INSERT INTO client_events (id,client_id,provider_id,kind,payload,created_at) SELECT 'bev'||g,'c1','bad','checkin',jsonb_build_object('photos',jsonb_build_array(repeat('A',500000))),g FROM generate_series(1,10) g;
INSERT INTO client_events (id,client_id,provider_id,kind,payload,created_at) VALUES ('gev1','c2','good','form','{"title":"Intake"}',1);
INSERT INTO kv_history (owner,k,bytes,items,reason,saved_at) VALUES ('bad','sc_clients',40153,120,'shrink',now()-interval '2 hours'),('good','sc_clients',5100,20,'shrink',now()-interval '2 hours'),('new1','sc_courses',977,3,'shrink',now()-interval '2 hours');
INSERT INTO square_connections (provider_id,merchant_id,expires_at) VALUES ('good','M_GOOD',now()+interval '20 days'),('bad','M_SHARED',now()-interval '1 day'),('other','M_SHARED',now()+interval '20 days');
INSERT INTO notify_log (kind,subject,skipped,devices,sent,at) VALUES ('paid-signup','someone@new.com','',2,2,now()-interval '3 hours'),('provider-signup','someone@new.com','already announced by the paid-provider ping',0,0,now()-interval '3 hours'),('feedback','trouble@x.com','no push transport configured',0,0,now()-interval '3 hours');
INSERT INTO feedback (provider_id,message,ts) VALUES ('bad','it broke',now()-interval '5 hours');
INSERT INTO device_reports VALUES ('good','dev-good-1','{"build":"${CUR}","platform":"iPhone","kind":"installed app","unsent":2,"idbWorks":true}',now()),
  ('bad','dev-bad-1','{"build":"2026-10-10a","platform":"Android","kind":"browser","unsent":7,"idbWorks":false,"reloadFails":"loadForms"}',now());
INSERT INTO subscriptions (email,stripe_subscription_id,status,updated_at) VALUES ('healthy@ok.com','sub_1','active',now()-interval '20 days'),('trouble@x.com','sub_2','past_due',now()),('ghost@paid.com','sub_3','active',now()-interval '5 hours');
CREATE TABLE nurture_sends (email text NOT NULL, seq text NOT NULL, step int NOT NULL, sent_at timestamptz DEFAULT now(), UNIQUE(email, seq, step));
CREATE TABLE nurture_optout (email text PRIMARY KEY, ts timestamptz DEFAULT now());
INSERT INTO nurture_sends (email,seq,step,sent_at) VALUES ('ghost@paid.com','orphan',0,now()-interval '2 hours');
INSERT INTO login_attempts (email,ts) SELECT 'locked@out.com', now()-interval '1 hour' FROM generate_series(1,5);
INSERT INTO app_launch_logs (device_key,provider_id,email,platform,build,events,updated_at) VALUES ('d1','bad','trouble@x.com','android','2026-10-24f','[{"t":${now - H},"e":"token-dropped","d":"x"},{"t":${now - H},"e":"screen","d":"home"}]',now()),
  ('d2','good','healthy@ok.com','ios','${CUR}','[{"t":${now - H},"e":"launch"},{"t":${now - H},"e":"prev-launch-cut-off"}]',now());
INSERT INTO native_push_log (owner_id,outcome,reason,at) VALUES ('good','linked','',now()),('bad','send failed','UNREGISTERED',now());
INSERT INTO clients (id,provider_id,token,name,email,created_at) VALUES ('c_dead','bad','t1','Cooper Secretname','cooper@client.com',${now - 30 * 24 * H}),('c_ok','good','t2','Ann Private','ann@client.com',${now - H});
`);
// 'other' deleted 3 of 6 clients and 1 of 3 courses herself: the shrink says so (2026-11-03 fae… case).
{ const six = {}; for (let i = 0; i < 6; i++) six['oc' + i] = { name: 'x'.repeat(400) };
  const three = { oc0: six.oc0, oc1: six.oc1, oc2: six.oc2 };
  await db.query("INSERT INTO kv VALUES ('other','sc_clients',$1),('other','sc_deleted_clients',$2),('other','sc_courses',$3),('other','sc_hidden_courses',$4)",
    [JSON.stringify(three), JSON.stringify({ oc3: now, oc4: now, oc5: -now }), JSON.stringify([{ id: 'k1', t: 'y'.repeat(300) }, { id: 'k2', t: 'y'.repeat(300) }]), JSON.stringify({ k3: now })]);
  const oldC = JSON.stringify(six), oldK = JSON.stringify([{ id: 'k1', t: 'y'.repeat(300) }, { id: 'k2', t: 'y'.repeat(300) }, { id: 'k3', t: 'y'.repeat(900) }]);
  await db.query("INSERT INTO kv_history (owner,k,v,bytes,items,reason,saved_at) VALUES ('other','sc_clients',$1,$2,6,'shrink',now()-interval '1 hour'),('other','sc_courses',$3,$4,3,'shrink',now()-interval '1 hour')", [oldC, oldC.length, oldK, oldK.length]); }
// Note drafts (2026-11-05: three accounts read as alerts because the expiry record is "nd:<id>").
{ const pad = 'z'.repeat(700);
  const old = { nd1: { date: '2026-10-01', sections: { a: pad }, committed: true, ts: 1 }, oc3: { date: '2026-10-02', sections: { a: pad }, ts: 1 },
    nd3: { date: '2026-10-03', sections: { a: pad }, committed: true, ts: 1 }, nd4: { date: '2026-10-04', sections: { a: 'Hello world', b: pad }, ts: 1 }, keep: { date: '2026-11-05', sections: { a: 'x' }, ts: 2 } };
  const nowV = JSON.stringify({ keep: old.keep });
  await db.query("INSERT INTO kv VALUES ('other','sc_note_drafts',$1),('other','sc_deleted_note_drafts',$2)", [nowV, JSON.stringify({ 'nd:nd1': now })]);
  const allExp = { e1: { sections: { a: pad }, committed: true }, e2: { sections: { a: pad }, committed: true }, e3: { sections: { a: pad + pad }, committed: true } };
  await db.query("INSERT INTO kv VALUES ('ndonly','sc_note_drafts','{}'),('ndonly','sc_deleted_note_drafts',$1)", [JSON.stringify({ 'nd:e1': now, 'nd:e2': now, 'nd:e3': now })]);
  await db.query("INSERT INTO kv_history (owner,k,v,bytes,items,reason,saved_at) VALUES ('other','sc_note_drafts',$1,$2,5,'shrink',now()-interval '1 hour'),('ndonly','sc_note_drafts',$3,$4,3,'shrink',now()-interval '1 hour')", [JSON.stringify(old), JSON.stringify(old).length, JSON.stringify(allExp), JSON.stringify(allExp).length]); }
// 'dupe' has 26 same-name pairs: 10 old ones she sees twice in her list, 16 made this week where her
// list holds only one of the two (merged in the app, still a row on the server).
await db.query("INSERT INTO providers (id,email,created_at) VALUES ('dupe','dupes@x.com', now()-interval '60 days')");
{ const list = {};
  for (let i = 0; i < 26; i++) { const seen = i < 10; const t = seen ? now - 40 * 24 * H : now - 2 * 24 * H;
    for (const id of ['sq_D' + i, 'cD' + i]) await db.query('INSERT INTO clients (id,provider_id,token,name,email,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [id, 'dupe', 't' + id, 'Same Person' + i, 'same' + i + '@c.com', t]);
    list['sq_D' + i] = { name: 'x' }; if (seen) list['cD' + i] = { name: 'x' }; }
  await db.query("INSERT INTO kv VALUES ('dupe','sc_clients',$1)", [JSON.stringify(list)]);
  await db.query(`INSERT INTO device_reports VALUES ('dupe','dev-dupe','{"build":"2026-11-03a","dupesMerged":0,"dupesLeft":4,"dupesWhy":"notes 3, both links used 1"}',now())`); }
// shared emails: 'other' has 30 old ones (family members), 'bad' gets 6 made today (same person twice)
for (let i = 0; i < 30; i++) for (const n of ['Mum', 'Kid']) await db.query('INSERT INTO clients (id,provider_id,token,name,email,created_at) VALUES ($1,$2,$3,$4,$5,$6)', ['o' + i + n, 'other', 'to' + i + n, n + ' Fam' + i, 'fam' + i + '@home.com', now - 40 * 24 * H]);
for (let i = 0; i < 6; i++) for (const k of ['a', 'b']) await db.query('INSERT INTO clients (id,provider_id,token,name,email,created_at) VALUES ($1,$2,$3,$4,$5,$6)', ['b' + i + k, 'bad', 'tb' + i + k, 'Twice Person' + i, 'twice' + i + '@c.com', k === 'b' ? now - H : now - 20 * 24 * H]);
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
await db.query("INSERT INTO cron_runs (name, started_at, finished_at, status, ok) VALUES ('cron-events', now()-interval '3 hours', now()-interval '3 hours'+interval '4 seconds', 200, true)");
globalThis.__keyOk = false;
const denied = fakeRes(); await handler({ method: 'GET', headers: {} }, denied);
ok(denied.code === 403, 'no key, no founder session: refused');
globalThis.__keyOk = true;
const res = fakeRes(); await handler({ method: 'GET', headers: { authorization: 'Monitor x' } }, res);
const j = res.body; const by = Object.fromEntries(j.checks.map(c => [c.id, c]));
ok(res.code === 200 && j.checks.length === 16, 'all 16 checks reported', res.code + ' ' + (j.checks || []).length);
ok(j.checks.every(c => !(c.items[0] || '').startsWith('could not run')), 'every check ran against real SQL', JSON.stringify(j.checks.filter(c => (c.items[0] || '').startsWith('could not run')).map(c => c.id + ': ' + c.items[0])));
ok(by['isolation-square'].level === 'alert' && /2 accounts/.test(by['isolation-square'].items[0]), 'shared Square business is an ALERT');
ok(by['data-shrink'].level === 'alert' && by['data-shrink'].items.filter(i => !/oth…|…only/.test(i)).length === 2 && /fre…@new.com: sc_courses/.test(by['data-shrink'].items.join()) && /tro…@x.com: sc_clients went from 40153 to 2/.test(by['data-shrink'].items.filter(i => !/oth…|…only/.test(i))[0]), 'the big shrink is flagged (ALERT), a small one listed, the healthy one not', JSON.stringify(by['data-shrink'].items));
ok(by['settings-empty'].items.length === 1 && /sc_availability/.test(by['settings-empty'].items[0]), 'hours saved as null are flagged; hours never set ({}) are not');
ok(by['founder-alerts'].level === 'alert' && by['founder-alerts'].items.some(i => /feedback alert/.test(i)) && !by['founder-alerts'].items.some(i => /paid-signup|provider-signup/.test(i)), 'the skipped feedback alert is flagged; a good one and a deliberate de-dup are not', JSON.stringify(by['founder-alerts'].items));
ok(by['events-size'].level === 'warn' && by['events-size'].items.length === 1 && /tro…@x.com: newest 10 events weigh 5.0 MB \(over the 4.5 MB limit/.test(by['events-size'].items[0]), 'an account whose submissions are too big for one download is flagged; the small one is not', JSON.stringify(by['events-size'].items));
ok(/7 changes not yet saved/.test(by['device-health'].items.join()) && /storage not working/.test(by['device-health'].items.join()) && by['device-health'].items.length === 1, 'the failing device is flagged; 2 unsent (save in its delay) is not');
ok(by['scheduled-jobs'].level === 'alert' && by['scheduled-jobs'].items.some(i => /cron-checkins: no run recorded/.test(i)) && !by['scheduled-jobs'].items.some(i => /cron-reminders/.test(i)), 'a job with no run is flagged once recording has started', JSON.stringify(by['scheduled-jobs'].items));
ok(by['scheduled-jobs'].items.some(i => /cron-events: started 1x in the last day and never finished/.test(i)) && !by['scheduled-jobs'].items.some(i => /cron-events: no run recorded/.test(i)), 'a run that started and never finished is named as such', JSON.stringify(by['scheduled-jobs'].items));
{ const it = by['scheduled-jobs'].items.find(i => /cron-events: started/.test(i)) || '';
  ok(/started at \d\d:\d\d UTC/.test(it) && /the 1 that finished took 4s typically, 4s at most/.test(it), 'a run that never finished says when it started and how long the finished runs took', it); }
ok(by['square-tokens'].level === 'alert' && by['square-tokens'].items.length === 1 && /EXPIRED/.test(by['square-tokens'].items[0]), 'the expired Square sign-in is an ALERT');
ok(by['billing'].level === 'alert' && by['billing'].items.some(i => /past due/.test(i)) && by['billing'].items.some(i => /gho…@paid.com: paid but has no SlickChart account; setup email sent \w{3} \d\d \d\d:\d\d UTC/.test(i)), 'past-due-but-using and paid-with-no-account are flagged, with when the setup email went', JSON.stringify(by['billing'].items));
ok(by['sign-in'].items.length === 1 && /5 failed sign-ins/.test(by['sign-in'].items[0]), 'someone stuck at sign-in is flagged');
ok(by['app-logs'].items.length === 1 && /signed out by the app 1x/.test(by['app-logs'].items[0]), 'a sign-out in the launch log is flagged; one mid-launch close is not', JSON.stringify(by['app-logs'].items));
ok(by['stale-builds'].items.length === 1 && /2026-10-10a/.test(by['stale-builds'].items[0]), 'the device on an old build is flagged');
ok(by['phone-push'].items.length === 1 && /send failed: UNREGISTERED/.test(by['phone-push'].items[0]), 'a refused phone push is flagged, a link is not');
ok(/\(last [A-Z][a-z]{2} \d\d \d\d:\d\d UTC\)$/.test(by['phone-push'].items[0] || ''), 'a phone push failure says when it last happened', by['phone-push'].items[0]);
ok(by['new-setup'].items.length === 1 && /fre…@new.com/.test(by['new-setup'].items[0]), 'the new provider who never finished setup is flagged');
{ const f = by['data-shrink'].items.find(i => /oth…@x.com: sc_forms/.test(i)) || '';
  ok(/Shrank: tmpls 3\u21921 entries/.test(f) && /Forms: 2 gone \(1 deleted by her\), 1 edited much shorter/.test(f) && !/f_long|f_del|qqq/.test(f), 'a forms shrink says which part shrank and how many forms she deleted, with no ids or content', f); }
ok(by['duplicates'].items.length === 1 && /tro…@x.com: 6 emails newly on more than one client today \(6 with the same name\)/.test(by['duplicates'].items[0]) && /oth…@x.com 30 \(0 same name/.test(by['duplicates'].note || ''), 'shared emails warn only when new today; the standing family ones are a note, not a warning', JSON.stringify(by['duplicates']));
ok(by['deleted-but-live'].items.length === 1 && /1 client/.test(by['deleted-but-live'].items[0]), 'a deleted client still live on the server is flagged');
{ const n = by['duplicates'].note || '';
  ok(/dup…@x.com 26 \(26 same name: 10 both in her list, 16 only one in her list; newest copy: 16 this week, 0 this month, 10 older; id kinds c\+sq 26/.test(n), 'the standing same-name copies say how many she can see, when the newest was made, and what kind of ids', n);
  ok(/her app last merged 0, left 4 for her \(notes 3, both links used 1\)/.test(n), 'the note says what her app left for her at its last automatic merge, and why', n); }
{ const items = by['data-shrink'].items;
  const cl = items.find(i => /oth…@x.com: sc_clients/.test(i)) || '', co = items.find(i => /oth…@x.com: sc_courses/.test(i)) || '';
  ok(/Entries: 6 before, 3 now \(2 of the 3 gone were deleted by her\)/.test(cl), 'a clients shrink counts the ones she deleted (a put-back stamp does not count)', cl);
  ok(/Entries: 3 before, 2 now \(1 of the 1 gone were deleted by her\)/.test(co), 'a courses shrink (a list of {id}) counts the ones she hid', co); }
{ const items = by['data-shrink'].items;
  const nd = items.find(i => /oth…@x.com: sc_note_drafts/.test(i)) || '', ne = items.find(i => /…only: sc_note_drafts/.test(i)) || '';
  ok(/Entries: 5 before, 1 now \(3 of the 4 gone were deleted by her\)\. Gone: 1 expired \(visit saved\), 1 client removed or merged, 1 saved visit, 1 UNSAVED \(711 typed characters\)/.test(nd), 'a note-draft shrink sorts each gone draft: expired, client removed, saved visit, unsaved with its typed characters', nd);
  ok(/\(3 of the 3 gone were deleted by her\)\. Gone: 3 expired/.test(ne), 'drafts that all expired count as hers (the nd: record is read)', ne);
  ok(!/Hello world|zzzz/.test(JSON.stringify(items)), 'no draft text in the reply'); }
ok(!JSON.stringify(j).match(/healthy@ok|trouble@x|Cooper|Secretname|cooper@client|Ann Private|ann@client|fam0@home|twice0@c|Twice Person|locked@out|ghost@paid|M_SHARED|M_GOOD/), 'no client name, full email or full merchant id in the reply');
ok(j.problems.length > 0 && j.problems[0].startsWith('ALERT'), 'problems list is worst first');
ok(!JSON.stringify(j).match(/hea…@ok\.com/), 'the healthy account appears nowhere');
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
