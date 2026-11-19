// Send one message to all clients from a phone, by real taps, with impatient double taps (2026-11-19
// sweep): every client gets it exactly once, search narrows who is picked, and an empty message or no
// one picked says so. 320 and 390. usage: [ENGINE=webkit] node scratchpad/test-broadcast-taps.mjs (needs :8899, build-demo run)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const wk = process.env.ENGINE === 'webkit';
const b = await (wk ? pw.webkit : pw.chromium).launch(wk ? {} : { executablePath: '/opt/pw-browsers/chromium' });
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
for (const [w, h] of [[320, 568], [390, 844]]) {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: !wk, serviceWorkers: 'block' })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 150))); page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.addInitScript(() => { try { localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":false}' : '{"ok":true,"data":{},"clients":[],"events":[]}' }));
  await page.goto('http://localhost:8899/slickchart-provider-demo.html'); await page.waitForTimeout(2500);
  const n = await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach(m => m.remove()); const db = document.getElementById('sc-demo-banner'); if (db) db.remove();
    for (let i = 0; i < 6; i++) CL['bx' + i] = { name: 'Broad Cast' + i, email: 'b' + i + '@ex.com', phone: '555' + i }; window.__sent = []; window._sendAutomationMsg = async (cid, msg) => { __sent.push(cid); await new Promise(r => setTimeout(r, 150)); return 'sent'; }; nav('messages'); return Object.keys(CL).length; });
  const open = page.locator('button[onclick*="_composeBroadcast"]').first(); ok(`${w}: Send to clients is on Messages`, await open.count() > 0);
  await open.tap(); await page.waitForTimeout(400);
  ok(`${w}: Send is off with nothing typed and no one picked`, await page.locator('#ss-send').isDisabled());
  await page.locator('#ss-msg').tap(); await page.keyboard.type('Holiday hours: closed Thursday. Happy Thanksgiving!');
  ok(`${w}: Send is still off with no one picked`, await page.locator('#ss-send').isDisabled());
  await page.locator('#ss-all').tap(); await page.waitForTimeout(200);
  const picked = await page.evaluate(() => Object.keys(_ssSel).filter(k => _ssSel[k]).length);
  ok(`${w}: select all picks everyone (${picked} of ${n})`, picked === n, { picked, n });
  await page.locator('#ss-send').tap(); await page.locator('#ss-send').tap({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(400);
  const conf = page.locator('.modal-bg button:has-text("Send"), [role=dialog] button:has-text("Send")').last();
  ok(`${w}: asks before sending to ${n}`, await conf.count() > 0);
  if (await conf.count()) { await conf.dblclick().catch(() => {}); }
  await page.waitForTimeout(n * 150 + 1500);
  const sent = await page.evaluate(() => __sent);
  const dup = sent.filter((x, i) => sent.indexOf(x) !== i);
  ok(`${w}: every client got it exactly once (${sent.length} sends)`, sent.length === n && !dup.length, { sent: sent.length, dup });
  ok(`${w}: no page errors`, !errs.length, errs);
  await page.context().close();
}
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
