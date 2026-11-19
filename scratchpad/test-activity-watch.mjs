// The hourly provider-activity watch (api/admin/activity-watch.js, 2026-11-19), run against a REAL
// Postgres (PGlite). Seeds the trouble actually seen in live logs on 2026-11-18 (saves refused as too
// large on repeat, someone refused at sign-in twice then asking for a reset, a phone signed out by the
// app, "did not work" messages, a new account stuck in setup, a refused sign-up) next to a healthy
// provider, and requires: each one flagged at the right level with a stable key, nothing older than
// `since` reported, the healthy account silent, a sign-out she asked for not flagged, and no full
// email anywhere in the reply.
//   PGLITE=<dir containing node_modules/@electric-sql/pglite> node scratchpad/test-activity-watch.mjs
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const PGL = process.env.PGLITE || '/tmp/claude-0/9264-pgl';
const { PGlite } = await import(pathToFileURL(path.join(PGL, 'node_modules/@electric-sql/pglite/dist/index.js')));
const db = new PGlite();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-'));
for (const d of ['api/admin', 'lib']) fs.mkdirSync(path.join(dir, d), { recursive: true });
for (const f of ['activity-watch.js', 'health-sweep.js']) fs.copyFileSync(path.join(SRC, 'api/admin', f), path.join(dir, 'api/admin', f));
for (const f of ['cron-runs.js', 'app-build.js', 'app-launch-log.js', 'auth.js', 'founder-settings.js', 'trial-outcomes.js', 'device-report.js']) fs.copyFileSync(path.join(SRC, 'lib', f), path.join(dir, 'lib', f));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(dir, 'lib/referral.js'), 'export async function stripeApi(){ return {}; }');
fs.writeFileSync(path.join(dir, 'api/feedback.js'), 'export async function monitorKeyOk(){return true;}');
fs.writeFileSync(path.join(dir, 'lib/db.js'), `
export function dbEnabled(){return true;} export async function ensureProvidersTable(){}
export function sql(){ return async (strs, ...v) => { let t=''; strs.forEach((s,i)=>{t+=s+(i<v.length?'$'+(i+1):'');}); const r = await globalThis.__db.query(t, v); return r.rows; }; }`);
globalThis.__db = db;
const H = 3600 * 1000, now = Date.now(), since = now - 2 * H;
await db.exec(`
CREATE TABLE providers (id text PRIMARY KEY, email text UNIQUE NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE sessions (id text PRIMARY KEY, provider_id text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE kv (owner text, k text, v text, PRIMARY KEY(owner,k));
CREATE TABLE login_attempts (email text, ts timestamptz DEFAULT now());
CREATE TABLE signup_problems (email text, kind text, match text, detail text, alerted boolean, at timestamptz DEFAULT now());
`);
const P = [['p_ok', 'happyprovider@gmail.com', 300], ['p_big', 'rosalind@yahoo.com', 300], ['p_new', 'newbie@gmail.com', 4], ['p_fresh', 'fresh@gmail.com', 0.3]];
for (const [id, e, h] of P) await db.query('INSERT INTO providers VALUES ($1,$2,$3)', [id, e, new Date(now - h * H).toISOString()]);
await db.exec(`INSERT INTO sessions VALUES ('s1','p_ok'),('s2','p_big'),('s3','p_new'); INSERT INTO kv VALUES ('p_ok','sc_onboarded','true'),('p_big','sc_onboarded','true');`);
await db.query(`INSERT INTO signup_problems (email, kind, detail, at) VALUES ('tahoo@tahoo.com','checkout-typo','paid as ...@tahoo.com', $1), ('old@x.com','signup-refused','409 old', $2), ('moved@x.com','moved','Ashley moved the payment', $1)`, [new Date(now - 0.5 * H).toISOString(), new Date(now - 30 * H).toISOString()]);
for (let i = 0; i < 4; i++) await db.query('INSERT INTO login_attempts VALUES ($1,$2)', ['stuck@gmail.com', new Date(now - (1 + i * 0.1) * H).toISOString()]);
await db.query('INSERT INTO login_attempts VALUES ($1,$2)', ['longago@gmail.com', new Date(now - 20 * H).toISOString()]);
// Failed 3x, then made her account (a session after the failures): not stuck.
for (let i = 0; i < 3; i++) await db.query('INSERT INTO login_attempts VALUES ($1,$2)', ['fresh@gmail.com', new Date(now - 0.5 * H).toISOString()]);
await db.query("INSERT INTO sessions VALUES ('s4','p_fresh', $1)", [new Date(now - 0.3 * H).toISOString()]);
await db.query('INSERT INTO login_attempts VALUES ($1,$2)', ['longago@gmail.com', new Date(now - 21 * H).toISOString()]);

const { ensureAppLaunchTable } = await import(pathToFileURL(path.join(dir, 'lib/app-launch-log.js')));
await ensureAppLaunchTable();
const ev = (mins, e, d = '') => ({ t: now - mins * 60000, e, d });
const logs = [
  ['dev_ok', 'happyprovider@gmail.com', 'ios', [ev(50, 'launch'), ev(49, 'screen', 'home'), ev(30, 'signout'), ev(30, 'token-dropped', 'Object.logout < _doLogout'), ev(600, 'error', 'old error before since')]],
  ['dev_big', 'rosalind@yahoo.com', 'ios', [ev(40, 'store-413', 'sc_autos 5748KB of 1 keys'), ev(39, 'store-413', 'sc_autos 8622KB of 1 keys'), ev(38, 'store-413', 'sc_autos 11497KB of 1 keys'),
    ev(30, 'toast-err', 'clients: Could not save 3 photos'), ev(29, 'toast-err', 'clients: Could not save 5 photos'), ev(28, 'toast-err', 'clients: Could not save 2 photos'), ev(20, 'token-dropped', '_pullInner')]],
  ['dev_door', null, 'ios', [ev(80, 'launch'), ev(80, 'signin-screen', 'welcome'), ev(79, 'signin-screen', 'login'), ev(79, 'signin-refused', 'Email or password is incorrect.'),
    ev(70, 'signin-refused', 'Email or password is incorrect.'), ev(69, 'signin-screen', 'reset'), ev(68, 'signin-screen', 'sent')]],
  ['dev_web', 'newbie@gmail.com', 'web-mac', [ev(10, 'error', 'TypeError: x is undefined at renderCal'), ev(9, 'prev-launch-cut-off'), ev(5, 'prev-launch-cut-off'), ev(4, 'camera-fail', 'NotAllowedError')]],
];
for (const [k, e, plat, events] of logs) await db.query(`INSERT INTO app_launch_logs (device_key, email, platform, build, events, updated_at) VALUES ($1,$2,$3,'2026-11-18f',$4::jsonb, now())`, [k, e, plat, JSON.stringify(events)]);
await db.query(`INSERT INTO app_launch_logs (device_key, email, platform, build, events, updated_at) VALUES ('dev_stale','happyprovider@gmail.com','ios','x','[{"t":1,"e":"error","d":"ancient"}]'::jsonb, now() - interval '3 days')`);
const { ensureDeviceReportsTable } = await import(pathToFileURL(path.join(dir, 'lib/device-report.js')));
await ensureDeviceReportsTable();
await db.query(`INSERT INTO device_reports VALUES ('p_big','dev_big',$1::jsonb, now())`, [JSON.stringify({ platform: 'ios', kind: 'app', memOnly: 1, idbWorks: false, unsent: 7 })]);
await db.query(`INSERT INTO device_reports VALUES ('p_ok','dev_ok',$1::jsonb, now())`, [JSON.stringify({ platform: 'ios', kind: 'app', unsent: 1, idbWorks: true })]);

const { runWatch, shape } = await import(pathToFileURL(path.join(dir, 'api/admin/activity-watch.js')));
const r = await runWatch(db.query ? (strs, ...v) => { let t = ''; strs.forEach((s, i) => { t += s + (i < v.length ? '$' + (i + 1) : ''); }); return db.query(t, v).then(x => x.rows); } : null, since);
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const find = (kind, acct) => r.problems.filter(p => p.kind === kind && (!acct || p.account.startsWith(acct)));
console.log(JSON.stringify(r.counts), r.problems.map(p => p.level + ' ' + p.kind + ' ' + p.account + ': ' + p.detail).join('\n'));
ok(r.errors.length === 0, 'no section failed: ' + r.errors.join('; '));
ok(find('save-refused', 'ros')[0]?.level === 'urgent', 'saves refused as too large is urgent');
ok(find('didnt-work', 'ros').length === 1 && find('didnt-work', 'ros')[0].count === 3 && find('didnt-work', 'ros')[0].level === 'fix', '"Could not save N photos" x3 grouped into one fix');
ok(find('signed-out', 'ros')[0]?.level === 'urgent', 'app signing her out is urgent');
ok(find('signed-out', 'hap').length === 0, 'a sign-out she asked for is not flagged');
ok(!r.problems.some(p => p.account.startsWith('hap')), 'healthy provider raises nothing (old error, 1 unsent, stale device ignored)');
const door = find('stuck-at-door', '(not');
ok(door.length === 1 && door[0].level === 'urgent' && /reset/.test(door[0].detail), 'refused twice + reset asked = urgent stuck at the door');
ok(find('script-error', 'new')[0]?.level === 'fix', 'script error on a computer flagged');
ok(find('launch-cut-off', 'new').length === 0, 'a closed browser tab is not a crash');
ok(find('camera', 'new').length === 1, 'camera failure flagged');
ok(find('storage', 'ros').length === 1 && find('not-saving', 'ros').length === 1, 'device report: storage broken + 7 unsaved flagged');
ok(find('failed-sign-in', 'stu')[0]?.level === 'urgent', '4 failed sign-ins in the window is urgent');
ok(find('failed-sign-in', 'fre').length === 0, 'failed 3x then got in another way is not stuck');
ok(find('failed-sign-in', 'lon').length === 0, 'failed sign-ins before since are not reported');
ok(find('setup-stuck', 'new')[0]?.level === 'fix', 'account 4h old, setup never finished');
ok(find('setup-stuck', 'fre').length === 0, 'account 20 minutes old is given time');
ok(find('signup:checkout-typo').length === 1 && find('signup:signup-refused').length === 0, 'sign-up problems inside the window only');
ok(find('signup:moved')[0]?.level === 'watch', 'a payment Ashley moved herself is not urgent');
ok(Math.abs(find('save-refused', 'ros')[0].last - (now - 38 * 60000)) < 1000, 'last = when the trouble happened, not the device\'s newest event');
ok(r.problems[0].level === 'urgent', 'worst first');
const keys = r.problems.map(p => p.key); ok(new Set(keys).size === keys.length, 'every key is unique');
const r2 = await runWatch((strs, ...v) => { let t = ''; strs.forEach((s, i) => { t += s + (i < v.length ? '$' + (i + 1) : ''); }); return db.query(t, v).then(x => x.rows); }, since);
ok(JSON.stringify(r2.problems.map(p => p.key)) === JSON.stringify(keys), 'keys are stable across runs');
ok(shape('Could not save 3 photos') === shape('Could not save 12 photos'), 'message shape ignores numbers');
const txt = JSON.stringify(r);
ok(!/rosalind@|happyprovider@|newbie@|stuck@gmail|tahoo@tahoo|moved@x/.test(txt), 'no full email anywhere in the reply');
console.log(fail ? fail + ' FAILED' : 'ALL PASS');
process.exit(fail ? 1 : 0);
