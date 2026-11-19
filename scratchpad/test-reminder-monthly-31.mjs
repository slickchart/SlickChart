// REGRESSION (2026-11-18): a monthly reminder on the 29th-31st. "Done" stepped setMonth(), so Jan 31
// became Mar 3 and stayed "the 3rd" for good, and the cron then derived its days from the moved date.
// App: _remDone keeps the day (dom/domUtc), clamped to short months. Server: dueOccurrence reads domUtc.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execFileSync } from 'child_process'; import fs from 'fs';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const engine = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const b = await engine.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const p = await (await b.newContext({ timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' })).newPage();
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await p.goto('http://localhost:' + (process.env.PORT || 8899) + '/slickchart.html'); await p.waitForTimeout(4000);
const seq = await p.evaluate(() => {
  const real = Date.now; const out = [];
  // 9pm on Jan 31 in Los Angeles is Feb 1 in UTC: the hardest case for the day.
  reminders = [{ id: 'r31', title: 'Pay rent', at: new Date(2027, 0, 31, 21, 0).getTime(), repeat: 'monthly' }];
  const fmt = t => { const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
  for (const nowD of [new Date(2027, 1, 1, 8), new Date(2027, 2, 1, 8), new Date(2027, 3, 1, 8), new Date(2027, 4, 1, 8)]) {
    Date.now = () => nowD.getTime(); try { _remDone('r31'); } catch (e) { out.push('ERR ' + e); }
    const r = reminders.find(x => x.id === 'r31'); out.push({ at: fmt(r.at), atMs: r.at, dom: r.dom, domUtc: r.domUtc });
  }
  Date.now = real; return out;
});
ok(seq.map(x => x.at).join(', ') === '2/28 21:00, 3/31 21:00, 4/30 21:00, 5/31 21:00', 'app: Done keeps it on the last day / the 31st: ' + seq.map(x => x.at).join(', '));
// Editing the date sets a new day of the month.
const ed = await p.evaluate(() => { _remEdit('r31'); document.getElementById('rem-date').value = '2027-06-15'; _remSaveFromSheet(); const r = reminders.find(x => x.id === 'r31'); return { dom: r.dom, domUtc: r.domUtc, d: new Date(r.at).getDate() }; });
ok(!ed.dom && !ed.domUtc && ed.d === 15, 'app: editing the date clears the kept day ' + JSON.stringify(ed));
await b.close();
// Server: the cron's occurrence for the moved reminder (Feb 28 21:00 PST = Mar 1 05:00 UTC) in late March/April.
const src = fs.readFileSync(ROOT + 'api/cron-provider-reminders.js', 'utf8');
const fn = src.slice(src.indexOf('function _validTz') >= 0 ? src.indexOf('function _validTz') : src.indexOf('export function dueOccurrence'), src.indexOf('\n}\n', src.indexOf('export function dueOccurrence')) + 3).replace('export function', 'function');
const occ = (rem, now) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', 'const HOUR=3600*1000,DAY=24*HOUR,STALE_AFTER=2*DAY;\n' + fn + `\nconsole.log(JSON.stringify(dueOccurrence(${JSON.stringify(rem)}, ${now})));`], { env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8' }));
const moved = { at: seq[0].atMs, repeat: 'monthly', dom: seq[0].dom, domUtc: seq[0].domUtc };
const apr1 = Date.UTC(2027, 3, 1, 5, 0) + 60e3;   // Mar 31 22:01 PDT
const got = occ(moved, apr1);
ok(new Date(got).toISOString() === '2027-04-01T05:00:00.000Z', 'cron: after Done the March occurrence is Mar 31 9pm, not the 28th (' + new Date(got).toISOString() + ')');
const legacy = occ({ at: Date.UTC(2027, 0, 15, 17), repeat: 'monthly' }, Date.UTC(2027, 4, 15, 18));
ok(new Date(legacy).toISOString() === '2027-05-15T17:00:00.000Z', 'cron: a reminder with no kept day is unchanged');
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
