// SWEEP 2 / calendars: where a manual appointment lands in Google Calendar.
//
//   node scratchpad/sweep2-square-gcal-tz.mjs
//
// Provider's phone is in Los Angeles. She adds "Pat — Facial, Tue Oct 20, 10:00 AM" by hand.
// 1) The app builds the push body with _gcalAppts() (browser, America/Los_Angeles).
// 2) The SHIPPED server eventBody() (lib/google-cal.js, extracted) turns it into the Google event,
//    run in a UTC child process like Vercel.
// The event must start at 2026-10-20T17:00:00Z (10:00 PDT).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs'; import { execFileSync } from 'child_process';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ n, pass: !!p, d: d || '' });
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ timezoneId: 'America/Los_Angeles', viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await p.addInitScript(() => { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1');
  localStorage.setItem('sc_manual_appts', JSON.stringify([{ id: 'ma_x1', client: 'Pat', tx: 'Facial', date: '2026-10-20', time: '10:00 AM', dur: 60 }])); });
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForTimeout(2500);
const appts = await p.evaluate(() => _gcalAppts());
const inApp = await p.evaluate(() => _apptWhen('2026-10-20', '10:00 AM').toISOString());
await b.close();
check('app: the calendar itself places it at 17:00Z (sanity)', inApp === '2026-10-20T17:00:00.000Z', inApp);
check('app: _gcalAppts sends the day she picked (2026-10-20)', appts[0] && appts[0].dateISO === '2026-10-20', JSON.stringify(appts[0]));

// Server side, UTC, the shipped eventBody.
const src = fs.readFileSync('/home/user/SlickChart/slickchart-vercel/lib/google-cal.js', 'utf8');
const i = src.indexOf('function eventBody'); let d = 0, j = src.indexOf('{', i);
for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; }
const fn = src.slice(i, j + 1);
const run = (a) => JSON.parse(execFileSync(process.execPath, ['-e', `const TAG_KEY='slickchartApptId';${fn};console.log(JSON.stringify(eventBody(${JSON.stringify(a)},false)))`], { env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8' }));
const ev = run(appts[0]);
check('server: Google event starts 10:00 PDT Oct 20 (2026-10-20T17:00:00Z) for what the app sends', ev.start.dateTime === '2026-10-20T17:00:00.000Z', 'got ' + ev.start.dateTime);
const ev2 = run({ ...appts[0], dateISO: '2026-10-20' });
check('server alone (even with the right date): 10:00 AM is 10:00 PDT, not 10:00 UTC', ev2.start.dateTime === '2026-10-20T17:00:00.000Z', 'got ' + ev2.start.dateTime + ' = ' + new Date(ev2.start.dateTime).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) + ' Pacific');

let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'SOUND        ' : 'CONFIRMED-BUG') + '  ' + x.n + '  — ' + x.d); }
console.log(`\n${results.length - bad}/${results.length} sound`); process.exit(bad ? 1 : 0);
