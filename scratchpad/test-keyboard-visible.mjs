// The field being typed in must stay visible above the on-screen keyboard (Ashley, 2026-10-23:
// "when typing into the provider notes box, the screen jumps and keyboard comes up which blocks
// the box you are typing in"). Headless browsers have no software keyboard, so this fakes the
// iPhone one the way iOS reports it: the page height stays 844, window.visualViewport shrinks to
// 508 (a 336px keyboard), and the phone pans the page up (offsetTop) to look for the field.
// Then, for every text field on a list of screens, focus it and require it to sit inside the band
// above the keyboard with the top bar still on screen.
//   node scratchpad/test-keyboard-visible.mjs [page] [clientId]     (serve slickchart-vercel on :8899)
//   CONTROL=1 runs against the committed page from before this fix and MUST fail.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const PAGE = process.argv[2] || 'slickchart-provider-demo.html';
const CID = process.argv[3] || 'maya';
// 336 keyboard + 44 for the Previous/Next/Done bar iOS puts above it in the app.
const KB = 380, H = 844;
const PAN = process.env.NOPAN ? 0 : 1;  // NOPAN=1: the phone does not slide the page at all
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: H }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
page.on('dialog', d => d.dismiss().catch(() => {}));
await page.addInitScript(([KB, H]) => {
  try { localStorage.setItem('sc_onboarded', '1'); } catch (e) {}
  // A stand-in for iOS's visualViewport with a keyboard we can raise and lower.
  const vv = new EventTarget(); vv.height = H; vv.offsetTop = 0; vv.scale = 1; vv.width = 390; vv.offsetLeft = 0; vv.pageTop = 0;
  Object.defineProperty(window, 'visualViewport', { get: () => vv, configurable: true });
  window.__kb = {
    up(pan) { vv.height = H - KB; vv.offsetTop = pan || 0; vv.dispatchEvent(new Event('resize')); },
    down() { vv.height = H; vv.offsetTop = 0; vv.dispatchEvent(new Event('resize')); },
  };
  // iOS: scrolling the window back to the top also puts the visual viewport back.
  const st = window.scrollTo.bind(window);
  window.scrollTo = function (x, y) { if ((typeof x === 'object' ? x.top : y) === 0 && vv.offsetTop) { vv.offsetTop = 0; vv.dispatchEvent(new Event('scroll')); } return st.apply(window, arguments); };
}, [KB, H]);
await page.route('**/api/**', r => { const u = r.request().url(); if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false}' }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
let url = 'http://localhost:8899/' + PAGE;
if (process.env.CONTROL) { const old = 'control-' + PAGE; fs.writeFileSync('/home/user/SlickChart/slickchart-vercel/' + old, fs.readFileSync('/home/user/SlickChart/scratchpad/.control.html')); url = 'http://localhost:8899/' + old; }
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(2500);

// Screens to sweep: [label, setup js]. Every visible text field on each one is focused in turn.
const screens = [
  ['client file · visit (Private notes)', `nav('client','${CID}');_setClientTab('${CID}','visit')`],
  ['client file · journey', `nav('client','${CID}');_setClientTab('${CID}','journey')`],
  ['client file · home care', `nav('client','${CID}');_setClientTab('${CID}','homecare')`],
  ['client file · file', `nav('client','${CID}');_setClientTab('${CID}','file')`],
  ['treatment notes', `_notesFrom='profile';nav('notes','${CID}')`],
  ['session summary', `nav('session-summary','${CID}')`],
  ['new client', `nav('new-client')`],
  ['checkout', `nav('checkout','${CID}')`],
  ['messages', `nav('messages')`],
  ['clients search', `nav('clients')`],
  ['settings', `nav('account')`],
  ['write note (provider notes editor)', `nav('write-note','${CID}')`],
  ['client details (sheet)', `editVitals('${CID}')`],
  ['edit summary', `typeof editSavedSummary==='function'&&editSavedSummary('${CID}',0)`],
];
// The client app (slickchart-client-demo.html): the screens where a client types.
const CLIENT = /client/.test(PAGE);
if (CLIENT) screens.splice(0, screens.length,
  ['messages', `nav('messages')`], ['check-in', `nav('checkin')`], ['pre-visit', `nav('previsit')`],
  ['profile', `nav('profile')`], ['photo consult', `nav('virtual-submit')`], ['shop', `nav('shop')`], ['rebook', `nav('rebook')`]);
const results = [];
for (const [label, js] of screens) {
  const n = await page.evaluate((js) => { try { window.__kb.down(); document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch (e) { return -1; }
    try {
    document.querySelectorAll('body > div, .shell > div').forEach(d => { if (d.id && /sheet|modal|overlay|vitals|ov/i.test(d.id) && getComputedStyle(d).position === 'fixed') d.remove(); });
    eval(js);
    // The fields of whatever is on top: a sheet or modal when one opened, otherwise the screen.
    const ovs = Array.from(document.querySelectorAll('body *')).filter(d => getComputedStyle(d).position === 'fixed' && d.getBoundingClientRect().height > 400 && d.querySelector('textarea,input'));
    const scope = ovs.length ? ovs[ovs.length - 1] : document.getElementById('S');
    const f = Array.from(scope.querySelectorAll('textarea, input')).filter(el => { const t = (el.getAttribute('type') || 'text').toLowerCase(); return ['text', 'search', 'email', 'tel', 'url', 'number', 'password', ''].includes(t) && el.offsetParent && !el.disabled && !el.readOnly; });
    window.__fields = f; return f.length; } catch (e) { return -1; } }, js);
  // Let the screen settle (it moves focus to its own heading/back button after drawing).
  await page.waitForTimeout(400);
  if (n < 0) { results.push({ label, field: '(screen did not open)', ok: null }); continue; }
  for (let i = 0; i < n; i++) {
    await page.evaluate(([i, PAN]) => { window.__kb.down(); const S = document.getElementById('S'); S.scrollTop = 0; const el = window.__fields[i]; if (!el || !el.isConnected) return;
      // Bring the field on screen the way a tap would (she can only tap what she can see), then the
      // keyboard comes up and the phone pans the page to look for it.
      const r = el.getBoundingClientRect(); if (r.bottom > 780) { try { el.scrollIntoView({ block: 'end' }); } catch (e) {} }
      el.focus(); const r2 = el.getBoundingClientRect(); window.__kb.up(PAN ? Math.max(0, Math.min(380, r2.bottom - 450)) : 0); }, [i, PAN]);
    await page.waitForTimeout(480);
    const m = await page.evaluate((i) => { const el = window.__fields[i]; if (!el || !el.isConnected) return null;
      const vv = window.visualViewport; const r = el.getBoundingClientRect(); const tb = document.querySelector('.topbar');
      // What is on screen, in page coordinates: offsetTop .. offsetTop+height.
      const top = vv.offsetTop, bot = vv.offsetTop + vv.height;
      const visTop = Math.max(r.top, top), visBot = Math.min(r.bottom, bot);
      const shown = Math.max(0, visBot - visTop), need = Math.min(r.height, 44);
      return { name: (el.getAttribute('placeholder') || el.id || el.getAttribute('aria-label') || el.tagName).slice(0, 50), rTop: Math.round(r.top), rBot: Math.round(r.bottom), band: [top, bot],
        ok: shown >= need - 1 && document.activeElement === el && (!tb || tb.getBoundingClientRect().top >= top - 1), why: (document.activeElement === el ? '' : 'focus:' + (document.activeElement && document.activeElement.tagName)) + ' tb' + (tb ? Math.round(tb.getBoundingClientRect().top) : '-'), topbar: tb ? Math.round(tb.getBoundingClientRect().top - top) : null }; }, i);
    if (m) results.push({ label, ...m });
  }
}
// A long note: 30 lines typed into the provider notes editor, caret at the end. The line she is on
// (the bottom of the box) has to be above the keyboard.
const longNote = CLIENT ? { ok: true, skipped: 'client app' } : await page.evaluate(async (CID) => { window.__kb.down(); nav('write-note', CID);
  const el = Array.from(document.querySelectorAll('#S textarea')).filter(t => t.offsetParent)[0]; if (!el) return null;
  el.focus(); window.__kb.up(0); await new Promise(r => setTimeout(r, 450));
  el.value = Array.from({ length: 30 }, (_, i) => 'line ' + (i + 1)).join('\n'); el.setSelectionRange(el.value.length, el.value.length);
  el.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 300));
  const vv = window.visualViewport, r = el.getBoundingClientRect();
  return { rTop: Math.round(r.top), rBot: Math.round(r.bottom), band: [vv.offsetTop, vv.offsetTop + vv.height], ok: r.bottom <= vv.offsetTop + vv.height + 1 && r.bottom > vv.offsetTop + 30 }; }, CID);
console.log('long note: ' + JSON.stringify(longNote));
if (process.env.CONTROL) fs.unlinkSync('/home/user/SlickChart/slickchart-vercel/control-' + PAGE);
await browser.close();
let bad = 0;
for (const r of results) { if (r.ok === false) bad++; console.log((r.ok === null ? 'skip ' : r.ok ? 'ok   ' : 'HIDDEN') + ' ' + r.label.padEnd(36) + ' ' + String(r.name || r.field).padEnd(50) + (r.ok === false ? ' [' + r.why + ']' : '') + (r.rTop != null ? ` field ${r.rTop}..${r.rBot} visible ${r.band[0]}..${r.band[1]}` : '')); }
const fields = results.filter(r => r.ok !== null).length;
const gp = CLIENT ? { ok: true } : results.find(r => /Private notes/.test(r.label) && /Notes to yourself/.test(r.name || ''));
console.log(`\n${fields} fields, ${bad} hidden behind the keyboard; Private notes box: ${gp ? (gp.ok ? 'visible' : 'HIDDEN') : 'not found'}; page errors: ${errs.length}`);
if (errs.length) console.log(errs.slice(0, 5).join('\n'));
process.exit(bad || !gp || errs.length || !(longNote && longNote.ok) ? 1 : 0);
