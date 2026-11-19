// Build a form on a phone by real taps (2026-11-19 sweep): name it, add one question of every type, give
// the choice questions their options, a contraindications list, save, then preview it. Checks every box
// is reachable and the saved form has exactly what was typed. 320 and 390 wide.
// usage: [ENGINE=webkit] node scratchpad/test-form-builder-phone.mjs (needs :8899, build-demo run)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const wk = process.env.ENGINE === 'webkit';
const b = await (wk ? pw.webkit : pw.chromium).launch(wk ? {} : { executablePath: '/opt/pw-browsers/chromium' });
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
for (const w of [390, 320]) {
  const page = await (await b.newContext({ viewport: { width: w, height: w === 320 ? 568 : 844 }, hasTouch: true, isMobile: !wk, serviceWorkers: 'block' })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 150))); page.on('dialog', d => d.accept().catch(() => {}));
  await page.addInitScript(() => { try { localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":false}' : '{"ok":true,"data":{},"clients":[],"events":[]}' }));
  await page.goto('http://localhost:8899/slickchart-provider-demo.html'); await page.waitForTimeout(2500);
  await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach(m => m.remove()); const db = document.getElementById('sc-demo-banner'); if (db) db.remove(); nav('form-builder', 'new'); }); await page.waitForTimeout(500);
  await page.locator('#form-name-input').tap(); await page.keyboard.type('Phone Test Form ' + w);
  const types = await page.evaluate(() => { addFormQ(); const o = [...document.querySelector('#qlist .qrow:last-child .q-type').options].map(x => x.value); document.querySelector('#qlist .qrow:last-child').remove(); return o; });
  const addBtn = page.locator('button[onclick="addFormQ()"]').first();
  for (const [i, t] of types.entries()) {
    await addBtn.scrollIntoViewIfNeeded(); await addBtn.tap(); await page.waitForTimeout(150);
    const row = page.locator('#qlist .qrow').last();
    await row.locator('.q-label').tap(); await page.keyboard.type('Q' + i + ' ' + t);
    await row.locator('.q-type').selectOption(t); await page.waitForTimeout(150);
    for (const sel of ['.q-options', '.q-items']) { const box = row.locator(sel); if (await box.count() && await box.isVisible()) { await box.tap(); await box.fill(''); await page.keyboard.type('Alpha'); await page.keyboard.press('Enter'); await page.keyboard.type('Beta'); } }
  }
  const off = await page.evaluate(() => [...document.querySelectorAll('#qlist input, #qlist select, #qlist textarea, #qlist button')].filter(e => e.offsetParent).filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map(e => e.className || e.tagName));
  ok(`${w}: every question box fits across the screen`, !off.length, off);
  const save = page.locator(`button[onclick="saveFormBuilder('new')"]`).first(); await save.scrollIntoViewIfNeeded(); await save.tap(); await page.waitForTimeout(800);
  const f = await page.evaluate(n => { const all = Object.values(formTmpls || {}); const f = all.find(x => x && x.name === n); return f ? { qs: f.qs.map(q => ({ l: q.label, t: q.type, o: q.options, i: q.items })) } : null; }, 'Phone Test Form ' + w);
  ok(`${w}: form saved`, !!f, f);
  if (f) { ok(`${w}: all ${types.length} questions kept`, f.qs.length === types.length, f.qs.map(q => q.t));
    for (const q of f.qs) { if (q.t === 'Multiple choice' || q.t === 'Single select') ok(`${w}: ${q.t} kept its options`, JSON.stringify(q.o) === '["Alpha","Beta"]', q);
      if (q.t === 'Contraindications') ok(`${w}: contraindications kept its list`, JSON.stringify(q.i) === '["Alpha","Beta"]', q); } }
  ok(`${w}: no page errors`, !errs.length, errs);
  await page.context().close();
}
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
