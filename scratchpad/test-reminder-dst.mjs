// A repeating reminder keeps her clock time across a daylight-saving change (2026-11-19 sweep).
// Before: the app's Done and the server's cron both stepped 24 h of milliseconds, so "every day at
// 9am" set in October arrived at 8am from Nov 1 all winter. Now each reminder carries her time zone
// and repeats by calendar day at the same wall-clock time; old reminders with no tz are unchanged.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execFileSync } from 'child_process'; import fs from 'fs';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const engine = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const b = await engine.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const p = await (await b.newContext({ timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' })).newPage();
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await p.goto('http://localhost:' + (process.env.PORT || 8899) + '/slickchart.html'); await p.waitForTimeout(4000);
const app = await p.evaluate(() => {
  const real = Date.now; const fmt = t => { const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
  reminders = [];
  _remSave({ id: 'rd', title: 'Order retinol', at: new Date(2026, 9, 20, 9, 0).getTime(), repeat: 'daily' });
  _remSave({ id: 'rw', title: 'Check stock', at: new Date(2026, 9, 21, 9, 0).getTime(), repeat: 'weekly' });
  const tz = reminders.find(x => x.id === 'rd').tz;
  Date.now = () => new Date(2026, 10, 19, 10, 0).getTime();
  _remDone('rd'); _remDone('rw');
  Date.now = real;
  // An old reminder with no tz still gets one on Done.
  reminders.push({ id: 'old', title: 'x', at: new Date(2026, 9, 20, 9, 0).getTime(), repeat: 'daily' });
  Date.now = () => new Date(2026, 10, 19, 10, 0).getTime(); _remDone('old'); Date.now = real;
  return { tz, d: fmt(reminders.find(x => x.id === 'rd').at), w: fmt(reminders.find(x => x.id === 'rw').at), oldTz: reminders.find(x => x.id === 'old').tz };
});
await b.close();
ok(app.tz === 'America/Los_Angeles', 'app: a saved reminder carries her time zone (' + app.tz + ')');
ok(app.d === '11/20 9:00', 'app: Done on a daily 9am reminder after the clocks went back: next is 9:00, not 8:00 (' + app.d + ')');
ok(app.w === '11/25 9:00', 'app: Done on a weekly Wednesday 9am reminder: next Wednesday 9:00 (' + app.w + ')');
ok(app.oldTz === 'America/Los_Angeles', 'app: an old reminder picks up her time zone on Done');
const src = fs.readFileSync(ROOT + 'api/cron-provider-reminders.js', 'utf8');
const fn = src.slice(src.indexOf('function _validTz'), src.indexOf('\n}\n', src.indexOf('export function dueOccurrence')) + 3).replace('export function', 'function');
const occ = (rem, now) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', 'const HOUR=3600*1000,DAY=24*HOUR,STALE_AFTER=2*DAY;\n' + fn + `\nconsole.log(JSON.stringify(dueOccurrence(${JSON.stringify(rem)}, ${now})));`]).toString());
const iso = t => t ? new Date(t).toISOString() : String(t);
const oct20_9pdt = Date.UTC(2026, 9, 20, 16, 0);            // Oct 20 9:00 PDT
const nov19_930pst = Date.UTC(2026, 10, 19, 17, 30);         // Nov 19 9:30 PST
let g = occ({ at: oct20_9pdt, repeat: 'daily', tz: 'America/Los_Angeles' }, nov19_930pst);
ok(iso(g) === '2026-11-19T17:00:00.000Z', 'cron: daily 9am set in October fires 9:00 PST in November (' + iso(g) + ')');
g = occ({ at: oct20_9pdt, repeat: 'daily', tz: 'America/Los_Angeles' }, Date.UTC(2026, 10, 19, 16, 30));   // 8:30 PST
ok(iso(g) === '2026-11-18T17:00:00.000Z', 'cron: at 8:30 PST today\'s 9am has not fired yet; the latest is yesterday 9am (' + iso(g) + ')');
g = occ({ at: Date.UTC(2026, 9, 21, 16, 0), repeat: 'weekly', tz: 'America/Los_Angeles' }, nov19_930pst);  // Wednesdays 9am
ok(iso(g) === '2026-11-18T17:00:00.000Z', 'cron: weekly Wednesday 9am -> Wed Nov 18 9:00 PST (' + iso(g) + ')');
g = occ({ at: Date.UTC(2026, 9, 15, 16, 0), repeat: 'monthly', tz: 'America/Los_Angeles' }, Date.UTC(2026, 10, 15, 18, 0));  // the 15th 9am, seen at 10am
ok(iso(g) === '2026-11-15T17:00:00.000Z', 'cron: monthly on the 15th 9am -> Nov 15 9:00 PST (' + iso(g) + ')');
g = occ({ at: Date.UTC(2026, 9, 31, 4, 0), repeat: 'monthly', tz: 'America/Los_Angeles' }, Date.UTC(2027, 0, 31, 6, 0));  // Oct 30 9pm PDT, seen Jan 30 10pm PST
ok(iso(g) === '2027-01-31T05:00:00.000Z', 'cron: monthly on the 30th at 9pm stays the 30th at 9pm her time (Jan 30 9pm PST) (' + iso(g) + ')');
// Southern hemisphere: Auckland went to summer time on Sep 27.
g = occ({ at: Date.UTC(2026, 8, 1, 21, 0), repeat: 'daily', tz: 'Pacific/Auckland' }, Date.UTC(2026, 10, 19, 21, 0));  // Sep 2 9:00 NZST
ok(iso(g) === '2026-11-19T20:00:00.000Z', 'cron: Auckland daily 9am keeps 9am after their clocks went forward (' + iso(g) + ')');
// Unchanged for old data and bad input.
g = occ({ at: oct20_9pdt, repeat: 'daily' }, nov19_930pst);
ok(iso(g) === '2026-11-19T16:00:00.000Z', 'cron: a reminder with no tz behaves exactly as before');
g = occ({ at: oct20_9pdt, repeat: 'daily', tz: 'Not/AZone' }, nov19_930pst);
ok(iso(g) === '2026-11-19T16:00:00.000Z', 'cron: a bad tz falls back to the old behaviour');
g = occ({ at: oct20_9pdt, tz: 'America/Los_Angeles' }, oct20_9pdt + 3600e3);
ok(g === oct20_9pdt, 'cron: a one-off reminder is unchanged');
g = occ({ at: nov19_930pst + 3600e3, repeat: 'daily', tz: 'America/Los_Angeles' }, nov19_930pst);
ok(g === 0, 'cron: a reminder in the future does not fire');
g = occ({ at: Date.UTC(2026, 8, 1, 16), repeat: 'daily', tz: 'America/Los_Angeles', off: 0 }, Date.UTC(2026, 10, 19, 15, 0));  // 7am PST
ok(iso(g) === '2026-11-18T17:00:00.000Z', 'cron: at 7am the last occurrence of a September 9am reminder is yesterday 9am PST (' + iso(g) + ')');
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
