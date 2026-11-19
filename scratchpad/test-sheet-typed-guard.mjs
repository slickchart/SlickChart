// A sheet with words she typed is never closed by a stray tap on the dark area outside it, or by
// Android's back, without asking (2026-11-19 phone sweep: a message to clients, a reminder note and
// feedback were thrown away). Escape already asked. Untyped sheets still close at once.
//   node scratchpad/test-sheet-typed-guard.mjs   (ENGINE=webkit with PLAYWRIGHT_BROWSERS_PATH for Safari; needs :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const ENGINE = process.env.ENGINE || 'chromium';
const res = []; const ok = (c, m, d) => { res.push(c); console.log((c ? 'PASS ' : 'FAIL ') + m + (d ? '  — ' + d : '')); };
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { localStorage.setItem('sc_token', 'T'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(4500);
const open = async () => { await p.evaluate(() => { nav('reminders'); _remEdit(''); }); await p.waitForTimeout(300); };
const st = () => p.evaluate(() => ({ sheet: !!document.getElementById('rem-sheet'), ask: !!document.getElementById('confirm-modal'), note: (document.getElementById('rem-note') || {}).value || '' }));
const outside = () => p.mouse.click(195, 60);   // the dark area above the sheet
// 1. untyped: a tap outside closes at once
await open(); await outside(); await p.waitForTimeout(300);
let s = await st(); ok(!s.sheet && !s.ask, 'an untouched sheet closes on a tap outside, no question', JSON.stringify(s));
// 2. typed: a tap outside asks; Cancel keeps the words
await open(); await p.click('#rem-note'); await p.keyboard.type('Call Jo about her peel');
await outside(); await p.waitForTimeout(300);
s = await st(); ok(s.sheet && s.ask, 'with typed words, a tap outside asks first', JSON.stringify(s));
await p.click('#_cf-cancel'); await p.waitForTimeout(300);
s = await st(); ok(s.sheet && !s.ask && s.note === 'Call Jo about her peel', 'Cancel keeps the sheet and every word', JSON.stringify(s));
// 3. Android back asks too
let ret = await p.evaluate(() => _scBack()); await p.waitForTimeout(300);
s = await st(); ok(ret === true && s.sheet && s.ask, "Android's back asks first", JSON.stringify(s));
await p.click('#_cf-cancel'); await p.waitForTimeout(300);
// 4. Escape still asks (unchanged)
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
s = await st(); ok(s.sheet && s.ask, 'Escape asks first (as before)', JSON.stringify(s));
// 5. confirming closes it, once
const btn = await p.$('#confirm-modal button:not(#_cf-cancel)'); await btn.click(); await p.waitForTimeout(400);
s = await st(); ok(!s.sheet && !s.ask, 'Close closes the sheet, with no second question', JSON.stringify(s));
// 6. back with typed words, confirm: closes
await open(); await p.click('#rem-note'); await p.keyboard.type('x');
await p.evaluate(() => _scBack()); await p.waitForTimeout(300);
await (await p.$('#confirm-modal button:not(#_cf-cancel)')).click(); await p.waitForTimeout(400);
s = await st(); ok(!s.sheet && !s.ask, 'back, then Close, closes the sheet', JSON.stringify(s));
// 7. the sheet's own Cancel/Save buttons are not held up
await open(); await p.click('#rem-title'); await p.keyboard.type('Order serum'); await p.click('#rem-note'); await p.keyboard.type('Saved note');
const saved = await p.evaluate(() => { const b = [...document.querySelectorAll('#rem-sheet button')].find(x => /^save/i.test(x.textContent.trim())); if (!b) return 'no save'; b.click(); return 'clicked'; }); await p.waitForTimeout(500);
s = await st(); ok(saved === 'clicked' && !s.ask && !s.sheet, 'Save inside the sheet is not held up by the question', saved + ' ' + JSON.stringify(s));
ok(!errs.length, 'no page errors', errs.join(' | '));
await b.close();
const f = res.filter(x => !x).length; console.log(f ? f + ' FAILED' : 'ALL PASS'); process.exit(f ? 1 : 0);
