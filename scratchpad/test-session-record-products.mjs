// Provider Session Record (renderSessionDetail, Client summary tab) must show the same products the
// client's summary shows: live recommendations first, else the names saved on the summary.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.goto('http://localhost:8899/' + FILE, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const show = () => page.evaluate(() => { renderSessionDetail('aw:0'); switchSessionDetailTab('client'); return { t: document.getElementById('S').innerText, links: Array.from(document.querySelectorAll('#S a[target=_blank]')).map(a => a.getAttribute('href')) }; });
await page.evaluate(() => {
  CL.aw = { name: 'Ashley Watson' };
  affiliateLinks.push({ id: 'p1', name: 'Avène Thermal Spring Water - 10 fl. oz.', brand: 'Retail · $20', inOffice: true, active: true },
                      { id: 'p2', name: 'Cicalfate+ Restorative Protective Cream 1.3 fl. oz.', brand: 'Retail · $26', site: 'https://shop.test/cica', active: true },
                      { id: 'p3', name: 'Bad', site: 'javascript:alert(1)', active: true });
  sessionSummaries.aw = [{ date: 'Oct 13, 2026', note: 'Lovely to see you', products: [], productDetail: [], ts: 1 }];
  clientRecs.aw = ['p1', 'p2'];
});
const pv = await page.evaluate(() => { renderSessionDetail('aw:0'); switchSessionDetailTab('provider'); const t = document.getElementById('S').innerText;
  const card = Array.from(document.querySelectorAll('#S [role=button]')).find(x => /Thermal Spring Water/.test(x.textContent)); if (card) card.click();
  return { t, opened: !!document.getElementById('es-note') }; });
check('products show on the Provider notes tab too', /Recommended for you/i.test(pv.t) && /Thermal Spring Water/.test(pv.t), pv.t.slice(0, 200));
check('tapping a product opens the editor', pv.opened);
let r = await show();
check('live recommendations shown when the summary has none saved', /Thermal Spring Water/.test(r.t) && /Cicalfate\+/.test(r.t), r.t.slice(0, 300));
check('price/brand and in-office shown like the client', /Retail · \$20/.test(r.t) && /Available in office/.test(r.t));
check('store link present for the product that has one', r.links.some(h => /shop\.test\/cica/.test(h)), JSON.stringify(r.links));
await page.evaluate(() => { clientRecs.aw = []; sessionSummaries.aw[0].products = ['Avène Thermal Spring Water - 10 fl. oz.', 'Something Unlisted']; });
r = await show();
check('falls back to names saved on the summary', /Thermal Spring Water/.test(r.t) && /Something Unlisted/.test(r.t) && /Available in office/.test(r.t), r.t.slice(0, 300));
await page.evaluate(() => { clientRecs.aw = ['p3']; });
r = await show();
check('a javascript: link is never rendered', !r.links.some(h => /^javascript:/i.test(h)), JSON.stringify(r.links));
// Editable after treatment: opening the editor on a summary with nothing saved must NOT empty her live
// recommendations, saving writes them onto the summary, and a guide can be taken off.
const e = await page.evaluate(() => {
  clientRecs.aw = ['p1', 'p2'];
  sessionSummaries.aw = [{ date: 'Oct 13, 2026', note: 'Lovely', homecare: ['SPF'], products: [], productDetail: [], guides: [{ title: 'Peel aftercare' }, { title: 'Sun care' }], ts: 1 }];
  CL.aw.summaries = [{ date: 'Oct 13, 2026', title: 'Session', note: 'Lovely', products: [], guides: [{ title: 'Peel aftercare' }, { title: 'Sun care' }], ts: 1 }];
  editSavedSummary('aw', 0);
  const recsAfterOpen = (clientRecs.aw || []).slice();
  const hasGuideBoxes = !!document.getElementById('es-guide-1');
  document.getElementById('es-note').value = 'Edited after treatment';
  document.getElementById('es-guide-0').checked = false;
  _saveEditedSummary('aw', 0);
  const s = sessionSummaries.aw[0];
  return { recsAfterOpen, hasGuideBoxes, note: s.note, products: s.products, guides: s.guides.map(g => g.title), clientGuides: CL.aw.summaries[0].guides.map(g => g.title), clientNote: CL.aw.summaries[0].note };
});
check('edit: opening keeps her live recommendations', JSON.stringify(e.recsAfterOpen) === '["p1","p2"]', JSON.stringify(e.recsAfterOpen));
check('edit: save writes those products onto the summary', e.products.length === 2 && /Thermal/.test(e.products[0]), JSON.stringify(e.products));
check('edit: note edited after treatment, client copy too', e.note === 'Edited after treatment' && e.clientNote === 'Edited after treatment', JSON.stringify(e));
check('edit: guides can be taken off, client copy too', e.hasGuideBoxes && JSON.stringify(e.guides) === '["Sun care"]' && JSON.stringify(e.clientGuides) === '["Sun care"]', JSON.stringify(e));
// 2026-10-14c: A) match the client's own copy, B) autofill from the homecare plan, C) custom products.
const m = await page.evaluate(() => {
  clientRecs.aw = [];
  sessionSummaries.aw = [{ date: 'Oct 14, 2026', note: 'Hi', homecare: ['SPF'], products: [], productDetail: [], ts: 7 }];
  CL.aw.summaries = [{ date: 'Oct 14, 2026', title: 'Session', products: ['Avène Thermal Spring Water - 10 fl. oz.', 'Cicalfate+ Restorative Protective Cream 1.3 fl. oz.'], ts: 7 }];
  renderSessionDetail('aw:0'); switchSessionDetailTab('client');
  return document.getElementById('S').innerText;
});
check('A: record shows the client copy\'s products when its own list is empty', /Thermal Spring Water/.test(m) && /Cicalfate\+/.test(m), m.slice(0, 300));
const au = await page.evaluate(() => {
  clientRecs.aw = [];
  sessionSummaries.aw = [{ date: 'Oct 15, 2026', note: 'Hi', homecare: ['Mist with Avene thermal spring water morning and night', 'Cicalfate+ restorative protective cream on dry spots'], products: [], productDetail: [], ts: 8 }];
  CL.aw.summaries = [{ date: 'Oct 15, 2026', title: 'Session', products: [], ts: 8 }];
  renderSessionDetail('aw:0'); switchSessionDetailTab('client');
  return { t: document.getElementById('S').innerText, recs: (clientRecs.aw || []).slice(), saved: sessionSummaries.aw[0].products, client: CL.aw.summaries[0].products };
});
check('B: autofilled from the homecare plan, in plan order', JSON.stringify(au.recs) === '["p1","p2"]' && /Thermal Spring Water/.test(au.t), JSON.stringify(au));
check('B: autofill saved on the summary and the client copy', au.saved.length === 2 && au.client.length === 2, JSON.stringify(au));
const cu = await page.evaluate(() => {
  editSavedSummary('aw', 0);
  toggleProductPicker('aw');
  const q = document.getElementById('prod-picker-q'); q.value = 'cica'; _renderProdPickerList('aw', 'cica');
  const searchFinds = /No catalog products/.test(document.getElementById('prod-picker-list').innerText) || true;
  q.value = 'Office Peptide Serum'; _renderProdPickerList('aw', q.value);
  const opt = document.getElementById('pick-custom'); const optText = opt ? opt.innerText : '';
  if (opt) opt.click();
  const shown = document.getElementById('prod-recs').innerText;
  moveClientProd('aw', 0, 1);
  const order = (clientRecs.aw || []).slice();
  _saveEditedSummary('aw', 0);
  return { optText, shown, order, products: sessionSummaries.aw[0].products, client: CL.aw.summaries[0].products };
});
check('C: picker offers adding a product not in the catalog', /Office Peptide Serum/.test(cu.optText) && /not in your catalog/i.test(cu.optText), cu.optText);
check('C: custom product shows in the editor list', /Office Peptide Serum/.test(cu.shown) && /Not in your catalog/.test(cu.shown), cu.shown.slice(0, 300));
check('C: reorder + custom saved to summary and client copy', JSON.stringify(cu.order) === '["p2","p1"]' && cu.products[2] === 'Office Peptide Serum' && /Cicalfate/.test(cu.products[0]) && cu.client[2] === 'Office Peptide Serum', JSON.stringify(cu));
const rv = await page.evaluate(() => { renderSessionDetail('aw:0'); switchSessionDetailTab('client'); return document.getElementById('S').innerText; });
check('C: custom product shows on the record afterwards', /Office Peptide Serum/.test(rv) && /Cicalfate/.test(rv), rv.slice(0,300));
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail !== '' ? '  — ' + x.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
