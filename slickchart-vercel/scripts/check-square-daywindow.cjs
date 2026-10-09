#!/usr/bin/env node
// A booking day is a day in the SHOP's timezone, never the server's.
//
// Vercel runs in UTC. api/square/availability.js used to build its search window with
// `new Date('2026-10-10T00:00:00')`, which parsed there means midnight UTC — 5pm the PREVIOUS day
// in Pacific. Asking Square for "Saturday" actually asked for Friday 5pm through Saturday 4:59pm:
// every Saturday evening slot silently missing, and Friday evening's slots offered as Saturday's.
// Ashley hit the second half of that on 2026-10-09 (SESSION-HANDOFF §2ap).
//
// The fix solves the wall-clock-to-UTC conversion by iteration. A single offset sampled once and
// applied to both ends of the day is wrong on the two days a year the offset changes — the first
// attempt made a 25-hour day come out 24 hours long and started the spring day an hour early.
// Both DST days are asserted below, because that is the part that looked right and was not.
//
// Runs the SHIPPED code: the helpers are extracted from lib/square.js every run, never copied,
// so this cannot pass against a stale duplicate. lib/square.js imports @neondatabase/serverless,
// which is not installed in the scratch env (CLAUDE.md §3), hence extraction rather than import.
const fs = require('fs'), path = require('path'), vm = require('vm');

const SRC = path.join(__dirname, '..', 'lib', 'square.js');
const src = fs.readFileSync(SRC, 'utf8');

function grab(sig) {
  const i = src.indexOf(sig);
  if (i < 0) { console.error('check-square-daywindow: not found in lib/square.js: ' + sig); process.exit(1); }
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  console.error('check-square-daywindow: unbalanced braces after ' + sig); process.exit(1);
}

const code = ['function tzOffsetAt', 'function zonedWallToUtc',
  'export function zonedDayRange', 'export function zonedDateKey']
  .map(grab).join('\n').replace(/^export /gm, '');
const ctx = { Intl, Date, String, Number, Object };
vm.createContext(ctx);
vm.runInContext(code + '\n;({zonedDayRange, zonedDateKey});', ctx);
const { zonedDayRange, zonedDateKey } = vm.runInContext('({zonedDayRange, zonedDateKey})', ctx);

let fails = 0;
const wall = (d, tz) => d.toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function eq(label, got, want) {
  if (got === want) return;
  fails++;
  console.error('  FAIL ' + label + '\n        got  ' + got + '\n        want ' + want);
}
const LA = 'America/Los_Angeles';

// A day starts at local midnight and ends at local 23:59:59, wherever the shop is.
for (const [tz, day] of [[LA, '2026-10-10'], ['Australia/Sydney', '2026-10-10'], ['Europe/London', '2026-06-15'], ['Asia/Kolkata', '2026-10-10']]) {
  const r = zonedDayRange(day, tz);
  eq(tz + ' starts at local midnight', wall(r.start, tz), wall(new Date(day + 'T00:00:00Z'), 'UTC').replace(/12:00 AM/, '12:00 AM'));
  eq(tz + ' ends at local 11:59pm', wall(r.end, tz).slice(-8), '11:59 PM');
}

// The two days a year the offset changes. A day is not always 24 hours long.
let r = zonedDayRange('2026-11-01', LA);       // fall back: 25 hours
eq('fall-back day starts at local midnight', wall(r.start, LA), 'Sun, Nov 1, 12:00 AM');
eq('fall-back day is 25 hours', ((r.end - r.start) / 3600000).toFixed(2), '25.00');
r = zonedDayRange('2026-03-08', LA);           // spring forward: 23 hours
eq('spring-forward day starts at local midnight', wall(r.start, LA), 'Sun, Mar 8, 12:00 AM');
eq('spring-forward day is 23 hours', ((r.end - r.start) / 3600000).toFixed(2), '23.00');

// Unknown timezone keeps the old UTC behaviour rather than guessing an offset.
r = zonedDayRange('2026-10-10', null);
eq('no tz falls back to UTC', r.start.toISOString(), '2026-10-10T00:00:00.000Z');
eq('no tz reports null', String(r.tz), 'null');

// A slot from the neighbouring day must be recognisable as such, so it can be dropped.
eq('01:00Z is the previous day in LA', zonedDateKey('2026-10-10T01:00:00Z', LA), '2026-10-09');
eq('next-day 01:00Z is the requested day in LA', zonedDateKey('2026-10-11T01:00:00Z', LA), '2026-10-10');

// The regression itself: an evening appointment must fall inside the searched window.
r = zonedDayRange('2026-10-10', LA);
for (const h of [0, 9, 14, 16, 18, 20, 23]) {
  const t = new Date('2026-10-10T' + String(h).padStart(2, '0') + ':00:00-07:00');
  if (!(t >= r.start && t <= r.end)) { fails++; console.error('  FAIL ' + wall(t, LA) + ' is outside the searched window'); }
}

if (fails) { console.error('\ncheck-square-daywindow: ' + fails + ' failure(s)'); process.exit(1); }
console.log('square day window: ok (local midnight to 23:59:59, both DST days, 4 timezones, UTC fallback)');
