// "Send now" pre-claims the scheduled automation occurrence it replaces (api/automation-claim) using
// the app's _autoNextOcc(); the cron sends using api/cron-automations dueOccurrence(). If the two
// compute different `occ` for the same moment, the claim key differs and the client gets BOTH.
//
//   TZ=America/Los_Angeles node scratchpad/sweep2-cron-autoclaim.mjs
//
// (The app runs in the provider's local timezone; Vercel functions run in UTC — this script runs the
// app's function in this process's TZ and the server's in a UTC child process.)
import fs from 'fs';
import { execFileSync } from 'child_process';

const html = fs.readFileSync('/home/user/SlickChart/slickchart-vercel/slickchart.html', 'utf8');
const _s0 = html.indexOf('function _autoWall('); const _s1 = html.indexOf('function _autoNextOcc(a){');
const src = html.slice(_s1);
const body = html.slice(_s0, _s1) + src.slice(0, src.indexOf('\n}\n') + 2);
const _autoNextOcc = new Function(body + '\nreturn _autoNextOcc;')();

// The server's function, lifted verbatim from api/cron-automations.js (importing it pulls in the Neon driver).
const cronSrc = fs.readFileSync('/home/user/SlickChart/slickchart-vercel/api/cron-automations.js', 'utf8');
const SERVER_SRC = 'const HOUR = 3600 * 1000;\nconst GRACE = 48 * HOUR;\n' + cronSrc.slice(cronSrc.indexOf('function _autoWall('), cronSrc.indexOf('export default async function handler'));
function serverOcc(auto, now) {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e',
    SERVER_SRC + `\nconsole.log(JSON.stringify(dueOccurrence(${JSON.stringify(auto)}, ${now})));`],
    { env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8' });
  return JSON.parse(out.trim());
}
const realNow = Date.now;
function report(name, bug, d) { console.log((bug ? 'CONFIRMED-BUG  ' : 'SOUND          ') + name + '\n               ' + JSON.stringify(d)); }
console.log('app TZ =', Intl.DateTimeFormat().resolvedOptions().timeZone);

// A) Monthly automation created in winter (9:00 PST), "Send now" pressed the day before April's send.
{
  const base = new Date('2026-02-10T09:00:00').getTime();      // local (LA) 9am
  const auto = { id: 'm1', sendAt: base, repeatEvery: 'monthly', msg: 'x', on: true, tz: 'America/Los_Angeles' };
  Date.now = () => new Date('2026-04-09T12:00:00').getTime();
  const claimed = _autoNextOcc(auto);
  Date.now = realNow;
  // cron fires within the first hour after the server's own occurrence
  let fired = null;
  for (let h = 14; h <= 20 && fired == null; h++) {
    const t = Date.UTC(2026, 3, 10, h, 15);
    const o = serverOcc(auto, t);
    if (o != null && t - o < 3600e3) fired = o;
  }
  report('monthly automation across DST: app pre-claims ' + new Date(claimed).toISOString() + ', cron sends occ ' + (fired && new Date(fired).toISOString()),
    fired != null && fired !== claimed, { claimed, fired });
}
// B) Weekly automation: "Send now" pressed AFTER this week's time but before the cron tick (≤1h gap).
{
  const base = new Date('2026-10-01T09:00:00').getTime();
  const auto = { id: 'w1', sendAt: base, repeatEvery: 'weekly', msg: 'x', on: true, tz: 'America/Los_Angeles' };
  const press = new Date('2026-10-15T09:05:00').getTime();      // 5 min after this week's 9:00
  Date.now = () => press;
  const claimed = _autoNextOcc(auto);
  Date.now = realNow;
  const cronAt = new Date('2026-10-15T09:15:00').getTime() + 0; // next :15 tick (cron-automations is "15 * * * *")
  const fired = serverOcc(auto, cronAt);
  report('weekly automation: Send-now at 9:05 claims ' + new Date(claimed).toISOString() + ' but the 9:15 cron sends occ ' + (fired && new Date(fired).toISOString()),
    fired != null && fired !== claimed, { claimed, fired });
}
