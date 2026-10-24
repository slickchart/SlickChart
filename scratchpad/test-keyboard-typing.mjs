// Typing in the "Add to the routine" search must not move the page (Ashley, 2026-10-23: "when
// typing in the 'add to the routine' section the page is jumping when I type"). With the iPhone
// keyboard faked as in test-keyboard-visible.mjs, type a word one key at a time and require the
// search box to stay the SAME element, keep focus, stay above the keyboard and not move.
//   node scratchpad/test-keyboard-typing.mjs [page] [clientId]   (serve slickchart-vercel on :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PAGE = process.argv[2] || 'slickchart-provider-demo.html';
const CID = process.argv[3] || 'maya';
const KB = 380, H = 844;
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: H }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
await page.addInitScript(([KB, H]) => {
  try { localStorage.setItem('sc_onboarded', '1'); } catch (e) {}
  const vv = new EventTarget(); vv.height = H; vv.offsetTop = 0; vv.scale = 1; vv.width = 390; vv.offsetLeft = 0; vv.pageTop = 0;
  Object.defineProperty(window, 'visualViewport', { get: () => vv, configurable: true });
  window.__kb = { up() { vv.height = H - KB; vv.dispatchEvent(new Event('resize')); } };
}, [KB, H]);
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.goto('http://localhost:8899/' + PAGE, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const opened = await page.evaluate((CID) => { nav('client', CID); _setClientTab(CID, 'homecare'); _hcPickerSheet(CID, 'profile', ''); const q = document.getElementById('hc-pick-q'); if (!q) return false; q.focus(); window.__q = q; window.__kb.up(); return true; }, CID);
await page.waitForTimeout(500);
const pos = async () => page.evaluate(() => { const q = document.getElementById('hc-pick-q'); const r = q.getBoundingClientRect(); const vv = window.visualViewport;
  return { same: q === window.__q, focused: document.activeElement === q, top: Math.round(r.top), visible: r.top >= vv.offsetTop && r.bottom <= vv.offsetTop + vv.height, rows: document.querySelectorAll('#hc-picker [data-hc-aid]').length, value: q.value }; });
const start = await pos(); const steps = [];
for (const ch of 'serumzz') { await page.keyboard.type(ch); await page.waitForTimeout(120); steps.push(await pos()); }
await browser.close();
let bad = !opened || errs.length > 0;
for (const s of [start, ...steps]) { const moved = Math.abs(s.top - start.top) > 2; const ok = s.same && s.focused && s.visible && !moved; if (!ok) bad = true;
  console.log((ok ? 'ok    ' : 'JUMPED') + ` "${s.value}" box top ${s.top} (start ${start.top}) rows ${s.rows}` + (s.same ? '' : ' [box redrawn]') + (s.focused ? '' : ' [lost focus]') + (s.visible ? '' : ' [behind keyboard]')); }
if (errs.length) console.log(errs.join('\n'));
console.log(bad ? 'FAIL' : 'PASS: the search box never moved while typing');
process.exit(bad ? 1 : 0);
