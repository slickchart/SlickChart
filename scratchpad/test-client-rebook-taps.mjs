// A client asks for an appointment by real taps on a small phone (2026-11-19 sweep): open the request
// screen from the bottom menu path, pick a day, a time, type a note, tap Send, and the request that
// reaches the server carries exactly that. Every control must be tappable (nothing covering it).
// 320, 390 and sideways. usage: [PW_ENGINE=chromium] node scratchpad/test-client-rebook-taps.mjs (needs :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const cr = process.env.PW_ENGINE === 'chromium';
const b = await (cr ? pw.chromium : pw.webkit).launch(cr ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
for (const [w, h] of [[320, 568], [390, 844], [844, 390]]) {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: cr, serviceWorkers: 'block' })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
  const log = [];
  await mockApi(page, { log, records: { TOK: clientRecord('c1', 'Jo Rivera', { providerName: 'Ashley', services: ['Facial', 'Dermaplane'] }) } });
  await page.goto(BASE + '?c=TOK'); await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await page.waitForTimeout(1200);
  await page.evaluate(() => { try { _dismissAppNudge(); } catch (e) {} });
  const reqBtn = page.locator('button:has-text("Request an appointment")').first();
  ok(`${w}x${h}: Request an appointment on Home`, await reqBtn.count() > 0);
  await reqBtn.scrollIntoViewIfNeeded(); await reqBtn.tap(); await page.waitForTimeout(600);
  const day = page.locator('[onclick^="selectRebookDate("]').nth(2); await day.scrollIntoViewIfNeeded(); await day.tap(); await page.waitForTimeout(600);
  const tbtn = page.locator('.time-btn').first(); ok(`${w}x${h}: times show after picking a day`, await tbtn.count() > 0);
  if (await tbtn.count()) { await tbtn.scrollIntoViewIfNeeded(); await tbtn.tap(); }
  const note = page.locator('#S textarea').first(); if (await note.count()) { await note.scrollIntoViewIfNeeded(); await note.tap(); await page.keyboard.type('Running from work, might be 5 min late'); }
  const st = await page.evaluate(() => ({ date: rebookState.date, time: rebookState.time }));
  const send = page.locator('button[onclick="submitRebook()"]').first(); await send.scrollIntoViewIfNeeded(); await send.tap(); await page.waitForTimeout(1500);
  const sub = log.filter(x => /client-submit/.test(x.path) && x.method === 'POST').map(x => x.body).join(' ');
  ok(`${w}x${h}: request reached the server with the day and time picked`, sub.includes(st.date) && sub.includes(st.time), { st, sub: sub.slice(0, 300) });
  ok(`${w}x${h}: note went with it`, /might be 5 min late/.test(sub), sub.slice(0, 200));
  ok(`${w}x${h}: client sees it was sent`, /sent|request/i.test(await page.evaluate(() => S.innerText.slice(0, 200))), await page.evaluate(() => S.innerText.slice(0, 120)));
  ok(`${w}x${h}: no page errors`, !errs.length, errs);
  await page.context().close();
}
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
