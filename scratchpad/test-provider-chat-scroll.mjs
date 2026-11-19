// The provider's conversation with a client opens at the NEWEST message, follows a new one only when
// she is at the end, and keeps her place while she reads older ones (2026-11-19 phone sweep: a long
// conversation opened on its oldest message). Uses the provider demo page (needs :8899, build-demo run).
// usage: [ENGINE=webkit] node scratchpad/test-provider-chat-scroll.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const eng = process.env.ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const b = await eng.launch(process.env.ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium' });
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 1440, height: 900 }]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: vp.width < 800, serviceWorkers: 'block' }); const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.addInitScript(() => { try { localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":false}' : '{"ok":true,"data":{},"clients":[],"events":[]}' }));
  await page.goto('http://localhost:8899/slickchart-provider-demo.html'); await page.waitForTimeout(2500);
  await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach(m => m.remove()); msgStore.maya = Array.from({ length: 150 }, (_, i) => ({ id: 'x' + i, text: 'Msg ' + i, from: i % 2 ? 'me' : 'them', time: '9:00' })); nav('chat', 'maya'); });
  await page.waitForTimeout(700);
  const vis = () => page.evaluate(() => { const bs = document.querySelectorAll('#chat-body .bub-me,#chat-body .bub-them'); const l = bs[bs.length - 1]; const r = l.getBoundingClientRect(); const comp = document.getElementById('chat-compose').getBoundingClientRect(); return { text: l.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), composeTop: Math.round(comp.top), S: S.scrollTop, y: scrollY }; });
  let v = await vis(); ok(vp.width + ': opens on the newest message, above the reply box', v.text === 'Msg 149' && v.top > 0 && v.bottom <= v.composeTop, v);
  await page.evaluate(() => { S.scrollTop = 0; msgStore.maya.push({ id: 'n1', text: 'New one', from: 'them', time: '9:01' }); renderChat('maya'); });
  v = await vis(); ok(vp.width + ': reading older messages, a new one does not yank her down', v.S < 50, v);
  await page.evaluate(() => { S.scrollTop = S.scrollHeight; renderChat('maya'); }); v = await vis();
  ok(vp.width + ': at the end, a redraw keeps the newest in view', v.top > 0 && v.bottom <= v.composeTop, v);
  await page.evaluate(() => nav('clients')); await page.waitForTimeout(300);
  ok(vp.width + ': other screens still open at the top', await page.evaluate(() => S.scrollTop === 0));
  await ctx.close();
}
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
