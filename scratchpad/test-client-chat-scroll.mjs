// A client's chat opens at the NEWEST message, follows a new message only when she is already at the
// end, and keeps her place while she reads older ones. (2026-11-19 phone sweep: a long chat opened on
// its oldest message because the scroll was set on the list, which does not scroll, and nav then reset
// the page to the top.)  usage: [ENGINE=chromium] node scratchpad/test-client-chat-scroll.mjs  (needs :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const eng = process.env.ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const b = await eng.launch(process.env.ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: true, hasTouch: true, serviceWorkers: 'block' }); const page = await ctx.newPage();
  const rec = clientRecord('c1', 'Jo Rivera', { providerName: 'Ashley' });
  await mockApi(page, { records: { TOK: rec }, messages: { TOK: Array.from({ length: 150 }, (_, i) => ({ id: 'm' + i, from: i % 2 ? 'client' : 'provider', text: 'Msg ' + i, ts: Date.now() - (150 - i) * 3600000 })) } });
  await page.goto(BASE + '?c=TOK'); await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await page.waitForTimeout(1200);
  await page.evaluate(() => { try { _dismissAppNudge(); } catch (e) {} }); await page.waitForTimeout(300);
  await page.locator('text=Messages').last().tap(); await page.waitForTimeout(800);
  const vis = () => page.evaluate(() => { const bs = document.querySelectorAll('#chat-body .bub-me,#chat-body .bub-them'); const l = bs[bs.length - 1]; const r = l.getBoundingClientRect(); const comp = document.getElementById('chat-compose').getBoundingClientRect(); return { text: l.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), composeTop: Math.round(comp.top), S: S.scrollTop }; });
  let v = await vis(); ok(vp.width + ': opens on the newest message, above the message box', v.text === 'Msg 149' && v.top > 0 && v.bottom <= v.composeTop, v);
  await page.evaluate(() => { S.scrollTop = 0; }); await page.waitForTimeout(100);
  await page.evaluate(() => { const ap = activeProvider(); (ap.messages || client.messages || messages).push({ id: 'new1', from: 'them', text: 'New one', ts: Date.now() }); renderMessages(); });
  v = await vis(); ok(vp.width + ': reading older messages, a new one does not yank her down', v.S < 50, v);
  await page.evaluate(() => { S.scrollTop = S.scrollHeight; renderMessages(); }); v = await vis();
  ok(vp.width + ': at the end, a redraw keeps the newest in view', v.bottom <= v.composeTop && v.top > 0, v);
  await page.fill('#cinput', 'Running late'); await page.locator('[aria-label="Send message"]').tap(); await page.waitForTimeout(800); v = await vis();
  ok(vp.width + ': her sent message is in view', /Running late/.test(v.text) && v.top > 0 && v.bottom <= v.composeTop, v);
  await page.locator('text=Home').last().tap(); await page.waitForTimeout(400);
  ok(vp.width + ': other screens still open at the top', await page.evaluate(() => S.scrollTop === 0));
  await ctx.close();
}
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
