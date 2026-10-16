// sweep3: the client app's routine checklist across midnight while the app stays open (a phone PWA
// left in memory), plus routine edits arriving by poll.
// loadEng() resets the day's checklist ONLY at launch. homecareChecked (= provider.checked) is never
// cleared when the date changes, so yesterday's ticks are still on today's checklist, and one tap the
// next day completes "today" and bumps the streak without doing the routine.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.clock.install({ time: new Date('2026-10-16T20:00:00') });
const rec = clientRecord('c1', 'Cara Client', { aftercare: ['Cleanse', 'Vitamin C serum', 'SPF 50'] });
const opts = { records: { TOK: rec } };
await mockApi(page, opts);
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(3000);
if (process.env.FIX) await page.evaluate(() => {
  window._engRollover = function () { if (_eng.day === _engToday()) return; _eng.steps = {}; _eng.day = _engToday();
    (client.providers || []).forEach(p => { if (p && p.checked) Object.keys(p.checked).forEach(k => { p.checked[k] = false; }); }); };
  const t = toggleHomecareStep; window.toggleHomecareStep = function () { _engRollover(); return t.apply(this, arguments); };
  const r = renderHomecare; window.renderHomecare = function () { _engRollover(); return r.apply(this, arguments); };
});
await page.evaluate(() => nav('homecare'));
// Evening: does all three steps.
await page.evaluate(() => { ['Cleanse', 'Vitamin C serum', 'SPF 50'].forEach(k => toggleHomecareStep(k)); });
const day1 = await page.evaluate(() => ({ streak: _eng.streak, last: _eng.lastDoneDay, checked: JSON.stringify(homecareChecked) }));
check('day 1 streak is 1', day1.streak !== 1, day1);
// Phone stays open overnight; next morning (app resumes, poll runs).
await page.clock.setSystemTime(new Date('2026-10-17T08:10:00'));
await page.evaluate(() => { try { _pollRealClient(); } catch (e) {} try { nav('homecare'); } catch (e) {} });
await page.waitForTimeout(1500);
const morning = await page.evaluate(() => ({ today: _engToday(), engDay: _eng.day, done: (activeProvider().homecare || []).filter(s => homecareChecked[s.key]).length,
  heading: (document.querySelector('#S') || {}).innerText.slice(0, 160) }));
check('next morning, the open app still shows yesterday\'s steps as done', morning.done > 0, morning);
// She taps one step (the toggle UNchecks it since it shows checked) and taps it again
await page.evaluate(() => { toggleHomecareStep('Cleanse'); toggleHomecareStep('Cleanse'); });
const after = await page.evaluate(() => ({ streak: _eng.streak, last: _eng.lastDoneDay, today: _engToday() }));
check('two taps on ONE step completes the next day and bumps the streak', after.streak === 2 && after.last === after.today, after);
// Same scenario from a fresh launch next day for contrast
const p2 = await ctx.newPage();
await p2.clock.install({ time: new Date('2026-10-17T08:05:00') });
await mockApi(p2, opts);
await p2.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await p2.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await p2.waitForTimeout(3000);
const fresh = await p2.evaluate(() => ({ done: (activeProvider().homecare || []).filter(s => homecareChecked[s.key]).length }));
check('(contrast) a FRESH launch the next day starts with nothing ticked', fresh.done !== 0, fresh);
console.log('errors:', errs.slice(0, 3));
await browser.close();
finish();
