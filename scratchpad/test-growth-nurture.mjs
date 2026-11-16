// Trial emails that follow what she has done + the trial-ending email + pause/yearly offer (2026-11-16).
// Real SQL (PGlite), email and Stripe stubbed.
//   PGLITE=<dir with @electric-sql/pglite> node scratchpad/test-growth-nurture.mjs
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const { PGlite } = await import(pathToFileURL(path.join(process.env.PGLITE || '/tmp/claude-0/pgl', 'node_modules/@electric-sql/pglite/dist/index.js')));
const db = new PGlite(); globalThis.__db = db;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grow-')); fs.mkdirSync(dir + '/lib');
fs.writeFileSync(dir + '/package.json', '{"type":"module"}');
for (const f of ['nurture.js', 'referral.js', 'founder-settings.js', 'stripe-safe.js', 'pricing.js', 'growth.js']) fs.copyFileSync(SRC + '/lib/' + f, dir + '/lib/' + f);
fs.writeFileSync(dir + '/lib/db.js', `export function dbEnabled(){return true;} export async function ensureProvidersTable(){}
export function sql(){ return async (strs, ...v) => { let t=''; strs.forEach((s,i)=>{t+=s+(i<v.length?'$'+(i+1):'');}); return (await globalThis.__db.query(t, v)).rows; }; }`);
fs.writeFileSync(dir + '/lib/email.js', `export const SENT=[]; export async function sendEmail(m){ SENT.push(m); return {ok:true}; } export function appOrigin(){return 'https://slickchart.app';}`);
process.env.NURTURE_START = '2026-01-01';
process.env.STRIPE_SECRET_KEY = 'sk_test';

const DAY = 86400000, now = Date.now();
const ago = d => new Date(now - d * DAY).toISOString();
await db.exec(`CREATE TABLE providers (id text PRIMARY KEY, email text, name text, created_at timestamptz);
CREATE TABLE kv (owner text, k text, v text, updated_at timestamptz DEFAULT now(), PRIMARY KEY(owner,k));
CREATE TABLE square_connections (provider_id text PRIMARY KEY, access_token text);
CREATE TABLE client_events (id text PRIMARY KEY, client_id text, provider_id text, kind text, payload jsonb, created_at bigint);
CREATE TABLE trial_outcomes (sub_id text PRIMARY KEY, email text, trial_start timestamptz, trial_end timestamptz, outcome text, first_paid_at timestamptz, plan_amount int, plan_interval text);
CREATE TABLE subscriptions (email text PRIMARY KEY, stripe_customer_id text, stripe_subscription_id text, status text, plan_amount int, plan_interval text, cancel_at_period_end boolean DEFAULT false, paused_until timestamptz, pause_starts_at timestamptz, paid_notified_at timestamptz, current_period_end timestamptz, updated_at timestamptz);`);
const clients = n => JSON.stringify(Object.fromEntries(Array.from({ length: n }, (_, i) => ['c' + i, { id: 'c' + i, name: 'C' + i }])));
// new1: joined 1.5 days ago, no clients -> gets "Bring your clients in"
// new2: joined 1.5 days ago, 12 clients -> step skipped, nothing sent
// new3: joined 1.5 days ago, Square connected, 0 clients -> skipped
// old:  joined 20 days ago (before the new step existed is simulated by since) -> covered below
// d4a:  joined 4.2 days ago, a form back -> day-4 email says "already have a form back"
await db.query(`INSERT INTO providers VALUES ('p1','new1@x.com','Nina One',$1),('p2','new2@x.com','Tess Two',$1),('p3','new3@x.com','Sam Three',$1),('p4','d4a@x.com','Dee Four',$2),('p5','d4b@x.com','Bea Five',$2)`, [ago(1.5), ago(4.2)]);
await db.query(`INSERT INTO kv (owner,k,v) VALUES ('p2','sc_clients',$1),('p4','sc_clients',$2)`, [clients(12), clients(2)]);
await db.exec(`INSERT INTO square_connections VALUES ('p3','tok');
INSERT INTO client_events VALUES ('e1','c0','p4','form','{}',0);`);
// p4/p5 have had their day-2 email already (step index 0) so the day-4 step (index 1) is the due one.
const { runNurture, ensureNurtureTables, PROVIDER_SEQUENCE, trialEndEmail } = await import(pathToFileURL(dir + '/lib/nurture.js'));
const { SENT } = await import(pathToFileURL(dir + '/lib/email.js'));
const q = (await import(pathToFileURL(dir + '/lib/db.js'))).sql();
await ensureNurtureTables(q);
await db.exec(`INSERT INTO nurture_sends (email,seq,step,sent_at) VALUES ('d4a@x.com','founder',0,now()-interval '2 days'),('d4b@x.com','founder',0,now()-interval '2 days');`);

let fail = 0; const ok = (c, n, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' :: ' + d)); if (!c) fail++; };
const newIdx = PROVIDER_SEQUENCE.length - 1;
ok(PROVIDER_SEQUENCE[newIdx].day === 1 && PROVIDER_SEQUENCE[0].day === 2 && PROVIDER_SEQUENCE.length === 5, 'the new step is APPENDED (old step ids unchanged)', PROVIDER_SEQUENCE.map(s => s.day).join(','));

// The step's real start date is today (2026-11-16); move it back so these test sign-ups count as after it.
const realSince = PROVIDER_SEQUENCE[newIdx].since;
ok(realSince === Date.parse('2026-11-16T00:00:00Z'), 'the new step starts with sign-ups from 2026-11-16');
PROVIDER_SEQUENCE[newIdx].since = now - 3 * DAY;
let sum = await runNurture();
const to = e => SENT.filter(m => m.to === e);
ok(to('new1@x.com').length === 1 && /Bring your clients in/.test(to('new1@x.com')[0].subject), 'no clients, day 1: "Bring your clients in" goes out', JSON.stringify(to('new1@x.com').map(m => m.subject)));
ok(/n=go&i=import-clients/.test(to('new1@x.com')[0].html), 'it links straight to Import clients');
ok(to('new2@x.com').length === 0, '12 clients already: that email is skipped, nothing sent', JSON.stringify(to('new2@x.com').map(m => m.subject)));
ok(to('new3@x.com').length === 0, 'Square connected: skipped, nothing sent');
const st = (await db.query(`SELECT email, step FROM nurture_sends WHERE seq='founder' AND step=$1 ORDER BY email`, [newIdx])).rows.map(r => r.email).join(',');
ok(st === 'new1@x.com,new2@x.com,new3@x.com', 'skipped steps are marked done so they never go later', st);
ok(/already have a client form back/.test((to('d4a@x.com')[0] || {}).html || ''), 'day 4 with a form back: the email says so and drops that step', (to('d4a@x.com')[0] || {}).subject);
ok(/Send a client your consent/.test((to('d4b@x.com')[0] || {}).html || ''), 'day 4 with no form back: unchanged two-step email');
ok(to('d4a@x.com').length === 1 && to('d4b@x.com').length === 1, 'still one email per person per run');

// A provider who joined BEFORE the new step existed never gets it, even though it is "due".
await db.query(`INSERT INTO providers VALUES ('p6','old@x.com','Olga Old',$1)`, [ago(3.5)]);
await db.exec(`INSERT INTO nurture_sends (email,seq,step,sent_at) SELECT 'old@x.com','founder',g,now()-interval '3 days' FROM generate_series(0,3) g;`);
SENT.length = 0; await runNurture();
ok(to('old@x.com').length === 0, 'someone who joined before the new email existed is never sent it', JSON.stringify(to('old@x.com').map(m => m.subject)));

// A second run sends nothing new.
SENT.length = 0; await runNurture();
ok(SENT.filter(m => /new[123]@/.test(m.to) && /Bring/.test(m.subject)).length === 0, 'a second run does not repeat it');

// Unknown facts never skip: break the kv read for new4.
await db.query(`INSERT INTO providers VALUES ('p7','new4@x.com','Ivy Four',$1)`, [ago(1.2)]);
await db.query(`INSERT INTO kv (owner,k,v) VALUES ('p7','sc_clients','{not json')`);
SENT.length = 0; await runNurture();
ok(to('new4@x.com').length === 1 && /Bring/.test(to('new4@x.com')[0].subject), 'facts unreadable: the email goes out as before (never silently skipped)');

// ── Trial ending ──
await db.query(`INSERT INTO providers VALUES ('t1','few@x.com','Fay Few',$1),('t2','set@x.com','Sue Set',$1),('t3','far@x.com','Fran Far',$1),('t4','yr@x.com','Yan Year',$1)`, ['2026-11-01T00:00:00Z']);
await db.exec(`INSERT INTO nurture_sends (email,seq,step,sent_at) SELECT e,'founder',g,now()-interval '3 days' FROM unnest(ARRAY['few@x.com','set@x.com','far@x.com','yr@x.com']) e, generate_series(0,4) g;`);
await db.query(`INSERT INTO kv (owner,k,v) VALUES ('t2','sc_clients',$1),('t4','sc_clients',$2)`, [clients(30), clients(10)]);
await db.exec(`INSERT INTO square_connections VALUES ('t2','tok'); INSERT INTO client_events VALUES ('e2','c1','t2','checkin','{}',0),('e3','c2','t2','form','{}',0);`);
await db.query(`INSERT INTO trial_outcomes VALUES ('s1','few@x.com',$1,$2,'trialing',NULL,1700,'month'),('s2','set@x.com',$1,$2,'trialing',NULL,1700,'month'),('s3','far@x.com',$1,$3,'trialing',NULL,1700,'month'),('s4','yr@x.com',$1,$2,'trialing',NULL,17000,'year')`,
  [ago(12), new Date(now + 2 * DAY).toISOString(), new Date(now + 9 * DAY).toISOString()]);
SENT.length = 0; sum = await runNurture();
const few = to('few@x.com')[0] || {}, set = to('set@x.com')[0] || {}, yr = to('yr@x.com')[0] || {};
ok(/Want help bringing your clients in/.test(few.subject || '') && /reply to this email with that file/.test(few.html || ''), 'few clients: trial-ending email offers to bring them in', few.subject);
ok(/Cancel any time before then/.test(few.html || ''), 'it always says plainly how to cancel');
ok(/Your free trial ends/.test(set.subject || '') && /30 clients/.test(set.html) && /2 forms and check-ins/.test(set.html) && /Square connected/.test(set.html), 'set up: shows what she has done', set.html && set.html.slice(0, 0));
ok(/\$17 a month/.test(set.html || '') && /\$170/.test(set.html || ''), 'set up, monthly: says the price and offers yearly');
ok(/\$170 for the year/.test(yr.html || '') && !/Switch to yearly/.test(yr.html || ''), 'yearly trial: no yearly upsell');
ok(to('far@x.com').length === 0, 'a trial ending in 9 days (outside her 3) gets nothing yet');
ok(sum.trialend === 3, 'summary counts them', JSON.stringify(sum));
SENT.length = 0; await runNurture();
ok(SENT.filter(m => /trial ends/.test(m.subject)).length === 0, 'once per trial, ever');
// Her setting moves the window: 10 days now reaches far@.
await db.exec(`INSERT INTO founder_settings (k,v) VALUES ('grow_trial_end_days','10')`);
SENT.length = 0; await runNurture();
ok(to('far@x.com').length === 1, 'her "days before" setting is used', JSON.stringify(SENT.map(m => m.to)));
// Import offer off: the few-clients person gets the plain version.
const plain = trialEndEmail({ first: 'A', email: 'a@x.com', facts: { clients: 0 }, trialEnd: now + DAY, trial: { plan_amount: 1700, plan_interval: 'month' }, importBelow: 5, importOffer: false });
ok(!/bring your clients in for you/.test(plain.html) && /Your free trial ends/.test(plain.subject), 'import offer off: no "we will do it" promise');

// ── Pause / yearly offer (pure) ──
const { offerFor, addMonths } = await import(pathToFileURL(dir + '/lib/growth.js'));
const S = { grow_pause_on: 1, grow_pause_max: 3, grow_pause_per_year: 1, grow_yearly_from: 2, grow_yearly_to: 5 };
const base = { status: 'active', plan_interval: 'month', cancel_at_period_end: false, paused_until: null };
const o3 = offerFor(base, S, { firstPaidMs: now - 45 * DAY, nowMs: now });
ok(o3.monthOfPaying === 2 && o3.showYearly && o3.canPause, 'month 2 of paying monthly: yearly card shows, pause allowed', JSON.stringify(o3));
ok(!offerFor(base, S, { firstPaidMs: now - 10 * DAY, nowMs: now }).showYearly, 'month 1: no yearly card yet');
ok(!offerFor(base, S, { firstPaidMs: now - 160 * DAY, nowMs: now }).showYearly, 'month 6: past her window, no card');
ok(offerFor(base, Object.assign({}, S, { grow_yearly_to: 8 }), { firstPaidMs: now - 160 * DAY, nowMs: now }).showYearly, 'her window setting is used');
ok(!offerFor(Object.assign({}, base, { plan_interval: 'year' }), S, { firstPaidMs: now - 45 * DAY, nowMs: now }).showYearly, 'already yearly: no card');
ok(!offerFor(base, S, { onTrial: true, firstPaidMs: 0, nowMs: now }).canPause, 'on the free trial: no pause (nothing to skip)');
ok(offerFor(base, S, { firstPaidMs: now - 45 * DAY, pausesThisYear: 1, nowMs: now }).pauseWhy === 'used this year', 'one pause a year (her setting)');
ok(!offerFor(base, Object.assign({}, S, { grow_pause_on: 0 }), { firstPaidMs: now - 45 * DAY, nowMs: now }).canPause, 'pauses off: none offered');
const pz = offerFor(Object.assign({}, base, { paused_until: new Date(now + 20 * DAY).toISOString() }), S, { firstPaidMs: now - 45 * DAY, nowMs: now });
ok(pz.paused && !pz.canPause && !pz.showYearly, 'while paused: says so, no second pause, no yearly card');
const pend = (st) => offerFor(Object.assign({}, base, { paused_until: new Date(now + 40 * DAY).toISOString(), pause_starts_at: st }), S, { firstPaidMs: now - 45 * DAY, nowMs: now });
ok(!pend(new Date(now + 5 * DAY).toISOString()).locked, 'paused, still inside the time she paid for: not locked yet');
ok(pend(new Date(now - 1 * DAY).toISOString()).locked, 'paused months have begun: LOCKED (no free use)');
ok(pend(null).locked, 'paused with no start on record: locked, never free');
ok(!offerFor(Object.assign({}, base, { paused_until: new Date(now - DAY).toISOString(), pause_starts_at: new Date(now - 40 * DAY).toISOString() }), S, { firstPaidMs: now - 45 * DAY, nowMs: now }).locked, 'pause over: open again');
ok(new Date(addMonths(Date.parse('2027-01-31T00:00:00Z'), 1)).toISOString().slice(0, 10) === '2027-02-28', 'month math: Jan 31 + 1 month = Feb 28');

// ── Pause through Stripe ──
const { pauseSubscription } = await import(pathToFileURL(dir + '/lib/growth.js'));
await db.query(`INSERT INTO subscriptions (email, stripe_customer_id, stripe_subscription_id, status, plan_amount, plan_interval, cancel_at_period_end, paid_notified_at, updated_at) VALUES ('pay@x.com','cus1','sub_pay','active',1700,'month',false,$1,now())`, [ago(50)]);
const calls = [];
const pe = Math.floor((now + 10 * DAY) / 1000);
globalThis.fetch = async (url, opt) => { calls.push({ url: String(url), body: opt && opt.body, method: opt && opt.method });
  if (opt && opt.method === 'POST') return { ok: true, json: async () => ({ id: 'sub_pay' }) };
  return { ok: true, json: async () => ({ id: 'sub_pay', status: 'active', current_period_end: pe, items: { data: [{ price: { recurring: { interval: 'month' } } }] } }) }; };
const sub = (await db.query(`SELECT * FROM subscriptions WHERE email='pay@x.com'`)).rows[0];
let r = await pauseSubscription(q, 'pay@x.com', sub, 9);
ok(!r.ok && /1 to 3/.test(r.error), 'more months than her limit is refused', JSON.stringify(r));
r = await pauseSubscription(q, 'pay@x.com', sub, 2);
const post = calls.find(c => c.method === 'POST');
const want = Math.floor(addMonths(pe * 1000, 2) / 1000);
ok(r.ok && post && /subscriptions\/sub_pay$/.test(post.url) && decodeURIComponent(post.body).includes('pause_collection[behavior]=void') && decodeURIComponent(post.body).includes('pause_collection[resumes_at]=' + want), 'pause = skip the next 2 bills after the paid-up period', JSON.stringify(post));
const row = (await db.query(`SELECT paused_until FROM subscriptions WHERE email='pay@x.com'`)).rows[0];
ok(row.paused_until && Math.abs(new Date(row.paused_until).getTime() - want * 1000) < 1000, 'her row says paused until then');
const sub2 = (await db.query(`SELECT * FROM subscriptions WHERE email='pay@x.com'`)).rows[0];
r = await pauseSubscription(q, 'pay@x.com', Object.assign({}, sub2, { paused_until: null }), 1);
ok(!r.ok, 'a second pause in the same year is refused', JSON.stringify(r));
const row2 = (await db.query(`SELECT pause_starts_at FROM subscriptions WHERE email='pay@x.com'`)).rows[0];
ok(row2.pause_starts_at && Math.abs(new Date(row2.pause_starts_at).getTime() - pe * 1000) < 1000, 'the lock starts when the paid-up time ends');

// ── Resume: free before the lock, charged today once locked ──
const { unpauseSubscription } = await import(pathToFileURL(dir + '/lib/growth.js'));
calls.length = 0;
r = await unpauseSubscription(q, 'pay@x.com', Object.assign({}, sub2, { paused_until: new Date(now + 40 * DAY), pause_starts_at: new Date(now + 5 * DAY) }));
let up = calls.find(c => c.method === 'POST');
ok(r.ok && !r.charged && !/billing_cycle_anchor/.test(decodeURIComponent(up.body)), 'cancelling the pause before it starts charges nothing', up && up.body);
calls.length = 0;
r = await unpauseSubscription(q, 'pay@x.com', Object.assign({}, sub2, { paused_until: new Date(now + 40 * DAY), pause_starts_at: new Date(now - 5 * DAY) }));
up = calls.find(c => c.method === 'POST');
ok(r.ok && r.charged && /billing_cycle_anchor=now/.test(decodeURIComponent(up.body)) && /proration_behavior=none/.test(decodeURIComponent(up.body)), 'resuming while locked bills today', up && up.body);
const row3 = (await db.query(`SELECT paused_until, pause_starts_at FROM subscriptions WHERE email='pay@x.com'`)).rows[0];
ok(!row3.paused_until && !row3.pause_starts_at, 'resumed: her row is clear');

console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
