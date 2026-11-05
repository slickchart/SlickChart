// The reply box on the Messages screen must sit fully ABOVE the bottom menu, and right on top of the
// keyboard when it is up (Ashley, 2026-11-04: "the reply box at the bottom was mostly hidden by the
// navigation bar at the bottom and was very hard to click into"). An iPhone's menu is taller than in a
// desktop browser because it also clears the home bar (env(safe-area-inset-bottom) = 34px), which
// headless Chromium/WebKit report as 0, so this adds those 34px to the menu itself.
//   node scratchpad/test-chat-compose-above-nav.mjs     (serves slickchart-vercel itself)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = '/home/user/SlickChart/slickchart-vercel';
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(b); }); }).listen(0);
const PORT = srv.address().port;
const ENGINE = process.env.ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const H = 844, KB = 380, HOMEBAR = 34;
const browser = await ENGINE.launch(process.env.ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium' });
let fail = 0;
for (const [label, file, open] of [
  ['provider app', 'slickchart-provider-demo.html', `nav('chat','maya')`],
  ['client app', 'slickchart-client.html', `nav('messages')`],
]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: H }, hasTouch: true, isMobile: process.env.ENGINE !== 'webkit', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message || e)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.addInitScript(([KB, H, HOMEBAR]) => {
    try { localStorage.setItem('sc_onboarded', '1'); } catch (e) {}
    const vv = new EventTarget(); vv.height = H; vv.offsetTop = 0; vv.scale = 1; vv.width = 390; vv.offsetLeft = 0; vv.pageTop = 0;
    Object.defineProperty(window, 'visualViewport', { get: () => vv, configurable: true });
    window.__kb = { up() { vv.height = H - KB; vv.dispatchEvent(new Event('resize')); }, down() { vv.height = H; vv.dispatchEvent(new Event('resize')); } };
    document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = `.shell>.nav{padding-bottom:calc(${HOMEBAR}px + 10px)!important;}`; document.head.appendChild(st); });
  }, [KB, H, HOMEBAR]);
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":false}' : '{"ok":true,"data":{},"clients":[],"events":[]}' }));
  await page.goto(`http://localhost:${PORT}/${file}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(js => { try { document.querySelectorAll('.modal-bg').forEach(m => m.remove()); } catch (e) {} eval(js); }, open);
  await page.waitForTimeout(600);
  const measure = () => page.evaluate(() => {
    const ta = document.getElementById('cinput'); if (!ta) return { missing: true };
    const bar = document.getElementById('chat-compose') || ta.closest('div[style*="position:absolute"]');
    const nav = document.querySelector('.shell>.nav');
    const b = bar.getBoundingClientRect(), t = ta.getBoundingClientRect();
    const navVisible = nav && getComputedStyle(nav).display !== 'none';
    const navTop = navVisible ? nav.getBoundingClientRect().top : null;
    // What a tap in the middle of the reply box actually lands on.
    const hit = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
    return { barTop: Math.round(b.top), barBottom: Math.round(b.bottom), navTop: navTop == null ? null : Math.round(navTop), navH: navVisible ? Math.round(nav.offsetHeight) : 0, tapHitsBox: hit === ta, shellBottom: Math.round(document.querySelector('.shell').getBoundingClientRect().bottom) };
  });
  const down = await measure();
  const okDown = !down.missing && down.tapHitsBox && Math.abs(down.barBottom - down.navTop) <= 1;
  console.log(`${okDown ? 'PASS' : 'FAIL'} ${label} · keyboard down:`, JSON.stringify(down));
  if (!okDown) fail++;
  await page.evaluate(() => { document.getElementById('cinput').focus(); window.__kb.up(); });
  await page.waitForTimeout(500);
  const up = await measure();
  const okUp = !up.missing && up.tapHitsBox && up.navTop === null && Math.abs(up.barBottom - up.shellBottom) <= 1 && up.barBottom <= H - KB + 1;
  console.log(`${okUp ? 'PASS' : 'FAIL'} ${label} · keyboard up:  `, JSON.stringify(up));
  if (!okUp) fail++;
  await page.evaluate(() => { document.getElementById('cinput').blur(); window.__kb.down(); });
  await page.waitForTimeout(500);
  const back = await measure();
  const okBack = back.tapHitsBox && Math.abs(back.barBottom - back.navTop) <= 1;
  console.log(`${okBack ? 'PASS' : 'FAIL'} ${label} · keyboard closed again:`, JSON.stringify(back));
  if (!okBack) fail++;
  if (errs.length) { console.log('  page errors:', errs.slice(0, 3)); }
  await ctx.close();
}
await browser.close(); srv.close();
console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
