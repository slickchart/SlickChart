// Tap EVERY clickable thing on every tab of the client file, one at a time on a freshly drawn screen,
// and report: page errors, and taps that changed nothing at all (no nav, no sheet, no toast, no DOM change).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PAGE = process.argv[2] || 'slickchart-provider-demo.html';
const CID = process.argv[3] || 'maya';
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
let errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
let dialogs = []; page.on('dialog', d => { dialogs.push(d.type() + ':' + d.message().slice(0, 80)); d.dismiss().catch(() => {}); });
await page.addInitScript(() => { try { localStorage.setItem('sc_onboarded', '1'); if (!location.pathname.includes('demo')) localStorage.setItem('sc_token', 'TESTTOKEN'); } catch (e) {}
  window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return null; }; });
await page.route('**/api/**', r => { const u = r.request().url(); if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await page.goto('http://localhost:8899/' + PAGE, { waitUntil: 'load' });
await page.waitForTimeout(3000);
if (process.argv[4]) await page.evaluate(process.argv[4]);
const tabs = ['visit', 'journey', 'photos', 'homecare', 'file'];
const report = [];
for (const tab of tabs) {
  const n = await page.evaluate(([cid, tab]) => { nav('client', cid); _setClientTab(cid, tab);
    const pane = document.querySelector('.ctab[data-tab="' + tab + '"]'); if (!pane) return -1;
    window.__els = Array.from(pane.querySelectorAll('button,[onclick],a[href],[role=button],input[type=checkbox],select')).filter(e => !e.closest('[hidden]'));
    return window.__els.length; }, [CID, tab]);
  for (let i = 0; i < n; i++) {
    errs = []; dialogs = [];
    const before = await page.evaluate(([cid, tab, i]) => {
      document.querySelectorAll('body > div').forEach(d => { if (d.id !== 'app' && getComputedStyle(d).position === 'fixed' && d.id && /sheet|modal|overlay|picker|ov/i.test(d.id)) d.remove(); });
      nav('client', cid); _setClientTab(cid, tab);
      const pane = document.querySelector('.ctab[data-tab="' + tab + '"]');
      const els = Array.from(pane.querySelectorAll('button,[onclick],a[href],[role=button],input[type=checkbox],select')).filter(e => !e.closest('[hidden]'));
      const el = els[i]; if (!el) return null;
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 70);
      const act = (el.getAttribute('onclick') || el.getAttribute('href') || el.getAttribute('onchange') || '').slice(0, 90);
      window.__navs = 0; if (!window.__navWrapped) { const o = window.nav; window.nav = function () { window.__navs++; return o.apply(this, arguments); }; window.__navWrapped = 1; }
      window.__opened = [];
      window.__snap = { tt: document.getElementById('tt').textContent, s: document.getElementById('S').innerHTML.length + ':' + document.getElementById('S').innerHTML.slice(0, 2000), kids: document.body.children.length, tab: _clientTab };
      window.__navs = 0;
      try { el.scrollIntoView(); el.click(); } catch (e) { return { label, act, threw: String(e.message) }; }
      return { label, act, tag: el.tagName };
    }, [CID, tab, i]);
    if (!before) continue;
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => { const s = window.__snap; const S = document.getElementById('S');
      const toast = Array.from(document.querySelectorAll('body *')).filter(e => /toast/i.test(e.id || e.className || '') && e.offsetParent).map(e => e.textContent.trim()).join(' | ').slice(0, 80);
      return { nav: window.__navs, ttChanged: document.getElementById('tt').textContent !== s.tt, sChanged: (S.innerHTML.length + ':' + S.innerHTML.slice(0, 2000)) !== s.s, overlays: document.body.children.length - s.kids, tabChanged: _clientTab !== s.tab, opened: window.__opened.slice(), toast }; });
    const effect = after.nav || after.ttChanged || after.sChanged || after.overlays > 0 || after.tabChanged || after.opened.length || after.toast || dialogs.length || before.tag === 'A' || before.tag === 'SELECT' || before.tag === 'INPUT';
    report.push({ tab, i, ...before, effect: !!effect, after, errs: errs.slice(), dialogs: dialogs.slice() });
  }
}
await browser.close();
const bad = report.filter(r => r.errs.length || r.threw || !r.effect);
console.log('tapped ' + report.length + ' controls across ' + tabs.length + ' tabs');
for (const r of report) console.log((r.errs.length || r.threw ? 'ERROR ' : r.effect ? 'ok    ' : 'NOOP  ') + r.tab.padEnd(8) + ' #' + String(r.i).padEnd(3) + ' ' + r.label.padEnd(45) + ' ' + r.act + (r.errs.length ? '  !! ' + r.errs.join(' ; ') : '') + (r.threw ? ' threw ' + r.threw : ''));
console.log('\nproblems: ' + bad.length);
