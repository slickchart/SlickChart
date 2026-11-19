// Leaving a page mid-typing (2026-11-19 phone sweep, LEAVE=1 crawl): a new protocol, a guide's tips, a
// vendor's notes... were gone after a tap on the bottom bar, Back, or Android's back. Those now ask
// first. Saving, an untouched page, and pages that keep their own draft never ask.
//   node scratchpad/test-leave-typed-guard.mjs   (ENGINE=webkit + PLAYWRIGHT_BROWSERS_PATH for Safari; needs :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const ENGINE = process.env.ENGINE || 'chromium';
const res = []; const ok = (c, m, d) => { res.push(c); console.log((c ? 'PASS ' : 'FAIL ') + m + (d ? '  — ' + d : '')); };
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { localStorage.setItem('sc_token', 'T'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(4500);
const st = () => p.evaluate(() => ({ scr: _navCur && _navCur.screen, ask: !!document.getElementById('confirm-modal'), name: (document.getElementById('pr-name') || {}).value || '' }));
const go = async (s) => { await p.evaluate(s => { nav('protocols'); nav(s); }, s); await p.waitForTimeout(400); };
// untouched: Home leaves at once
await go('new-protocol'); await p.click('#ni-home'); await p.waitForTimeout(400);
let s = await st(); ok(s.scr === 'home' && !s.ask, 'an untouched page leaves at once', JSON.stringify(s));
// typed: Home asks; Stay keeps every word
await go('new-protocol'); await p.click('#pr-name'); await p.keyboard.type('Spring Glow Protocol');
await p.click('#ni-home'); await p.waitForTimeout(400);
s = await st(); ok(s.scr === 'new-protocol' && s.ask, 'typed words: the bottom bar asks first', JSON.stringify(s));
await p.click('#_cf-cancel'); await p.waitForTimeout(300);
s = await st(); ok(s.scr === 'new-protocol' && !s.ask && s.name === 'Spring Glow Protocol', 'Cancel stays with every word', JSON.stringify(s));
// Back arrow asks too
const backShown = await p.evaluate(() => { const x = document.getElementById('topbar-back'); return x && getComputedStyle(x).display !== 'none'; });
if (backShown) { await p.click('#topbar-back'); await p.waitForTimeout(400); s = await st(); ok(s.ask, 'the Back arrow asks first', JSON.stringify(s)); await p.click('#_cf-cancel'); await p.waitForTimeout(300); }
// Android back asks
await p.evaluate(() => _scBack()); await p.waitForTimeout(400);
s = await st(); ok(s.scr === 'new-protocol' && s.ask, "Android's back asks first", JSON.stringify(s));
// Leave goes where she tapped, once
await (await p.$('#confirm-modal button:not(#_cf-cancel)')).click(); await p.waitForTimeout(500);
s = await st(); ok(s.scr !== 'new-protocol' && !s.ask, 'Leave leaves, with no second question', JSON.stringify(s));
// bottom bar, Leave: lands on the tab she tapped
await go('new-protocol'); await p.click('#pr-name'); await p.keyboard.type('X');
await p.click('#ni-clients'); await p.waitForTimeout(400); await (await p.$('#confirm-modal button:not(#_cf-cancel)')).click(); await p.waitForTimeout(500);
s = await st(); ok(s.scr === 'clients' && !s.ask, 'Leave from the bottom bar lands on the tab she tapped', JSON.stringify(s));
// Save: no question afterwards
// a Save that is refused (no steps yet) keeps protecting her words
await go('new-protocol'); await p.click('#pr-name'); await p.keyboard.type('Saved Protocol');
await p.click('#S button[onclick^="saveProtocol"]'); await p.waitForTimeout(400); await p.click('#ni-home'); await p.waitForTimeout(400);
s = await st(); ok(s.scr === 'new-protocol' && s.ask, 'a refused Save ("add a step") still asks before leaving', JSON.stringify(s));
await p.click('#_cf-cancel'); await p.waitForTimeout(300);
await p.evaluate(() => { _protoDraft.steps = [{ t: 'Cleanse', d: '5 min', n: '' }]; });
await p.evaluate(() => { const b = [...document.querySelectorAll('#S button')].find(x => /saveProtocol/.test(x.getAttribute('onclick') || '')); b && b.scrollIntoView(); });
await p.click('#S button[onclick^="saveProtocol"]'); await p.waitForTimeout(500);
await p.click('#ni-home'); await p.waitForTimeout(400);
s = await st(); ok(s.scr === 'home' && !s.ask, 'after Save, the bottom bar never asks', JSON.stringify(s));
const saved = await p.evaluate(() => JSON.stringify(typeof protocols !== 'undefined' ? protocols : null).includes('Saved Protocol')); ok(saved, 'the protocol was saved', String(saved));
// a page that keeps its own draft does not ask
await p.evaluate(() => nav('new-client')); await p.waitForTimeout(400);
const nc = await p.evaluate(() => { const el = [...document.querySelectorAll('#S input')].find(e => e.offsetParent && !/search/i.test(e.placeholder || '')); if (!el.id) el.id = '__nc'; return el.id; });
await p.click('#' + nc); await p.keyboard.type('Jo Rivera'); await p.click('#ni-home'); await p.waitForTimeout(400);
s = await st(); ok(s.scr === 'home' && !s.ask, 'New client (keeps its own draft) leaves without a question', JSON.stringify(s));
ok(!errs.length, 'no page errors', errs.join(' | '));
await b.close();
const f = res.filter(x => !x).length; console.log(f ? f + ' FAILED' : 'ALL PASS'); process.exit(f ? 1 : 0);
