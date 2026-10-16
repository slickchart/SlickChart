// 2026-10-13 batch: (1) every recommended product on the client is shoppable, with "Buy in office" +
// her Shop when it has no link; (2) products a client BOUGHT join their homecare once, retail only,
// and stay off once she removes them; (3) the photo-consult invite state lives on the top row and
// the duplicate "waiting on" card is gone.
//   node scratchpad/test-shop-homecare.mjs   (server on :8899 from slickchart-vercel/)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ---- client app
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.goto('http://localhost:8899/slickchart-client.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const p = activeProvider(); p.products = []; p.amazonStore = '';
    p.catalog = [{ name: 'Cicalfate+ Restorative Protective Cream 1.3 fl. oz.', site: 'https://shop.test/cica' }];
    p.summaries = [{ date: 'Oct 13th, 2026', note: 'x', homecare: [], products: ['Avène Thermal Spring Water - 10 fl. oz.', 'Cicalfate+ Restorative Protective Cream 1.3 fl. oz.'] }];
    _summaryIdx = 0; renderLatestSummary();
    const buys = Array.from(document.querySelectorAll('#S button')).filter(b => /^\s*Buy\s*$/.test(b.textContent));
    const out = { buys: buys.length };
    buys[0].click(); out.sheet1 = (document.getElementById('buy-sheet') || {}).innerText || ''; closeBuySheet();
    buys[1].click(); out.sheet2 = (document.getElementById('buy-sheet') || {}).innerText || ''; closeBuySheet();
    return out;
  });
  check('client: both summary products have a Buy button', r.buys === 2, r.buys);
  check('client: no-link product offers Buy in office AND her Shop', /Buy in office/.test(r.sheet1) && /Shop/.test(r.sheet1), r.sheet1.replace(/\n/g, ' | '));
  check('client: a name found in her catalog keeps its store link', /Buy from/i.test(r.sheet2) && !/Buy in office/.test(r.sheet2), r.sheet2.replace(/\n/g, ' | '));
  check('client: no page errors', errs.length === 0, errs.join(' | '));
  await page.close();
}

// ---- provider app
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
  let orderCalls = 0;
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[],"events":[]}' }));   // cloud-status as production answers
  await page.route('**/api/square/orders*', r => { orderCalls++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, orders: [
    { items: [{ name: 'Avène Thermal Spring Water - 10 fl. oz.' }, { name: 'Signature Facial' }] },
    { items: [{ name: 'avène thermal spring water - 10 fl. oz.' }, { name: 'Daily SPF' }] } ] }) }); });
  await page.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  await page.evaluate(() => {
    CL.aw = { name: 'Ashley Watson', squareId: 'SQAW000000001', skin: '—', concerns: 'acne', allergies: 'retinol', fitz: '—', treatment: 'New client', sessions: 0 };
    affiliateLinks.push({ id: 'p_spring', name: 'Avène Thermal Spring Water - 10 fl. oz.', active: true }, { id: 'p_spf', name: 'Daily SPF', active: true });
    clientHomecare.aw = ['Daily SPF — every morning'];
    vcInvites.aw = { invited: true };
    nav('client', 'aw');
  });
  await page.waitForTimeout(2200);
  let st = await page.evaluate(() => ({ hc: (clientHomecare.aw || []).slice(), auto: (CL.aw._hcAuto || []).slice(), txt: document.getElementById('S') ? document.getElementById('S').innerText : '' }));
  check('provider: bought retail product added to homecare once', st.hc.filter(x => /Thermal Spring Water/i.test(x)).length === 1, JSON.stringify(st.hc));
  check('provider: a service on the same order is not added', !st.hc.some(x => /Facial/.test(x)), JSON.stringify(st.hc));
  check('provider: a product already there (with her note) is not duplicated', st.hc.filter(x => /Daily SPF/.test(x)).length === 1, JSON.stringify(st.hc));
  check('provider: top row says invited and waiting', /Invited · waiting on Ashley/.test(st.txt), (st.txt.match(/Photo consult[^\n]*\n[^\n]*/) || [''])[0]);
  check('provider: duplicate "waiting on" card is gone', !/Photo consult · waiting on/i.test(st.txt));
  // she removes it; a later session must not put it back
  await page.evaluate(() => { clientHomecare.aw = clientHomecare.aw.filter(x => !/Thermal Spring/.test(x)); delete _hcAutoChecked.aw; });
  await page.evaluate(() => _autoHomecareFromPurchases('aw'));
  await page.waitForTimeout(600);
  st = await page.evaluate(() => ({ hc: (clientHomecare.aw || []).slice() }));
  check('provider: a product she removed is not re-added', !st.hc.some(x => /Thermal Spring/.test(x)), JSON.stringify(st.hc));
  await page.evaluate(() => { vcInvites.aw = { invited: true, submitted: true }; renderClient('aw'); });
  const t2 = await page.evaluate(() => document.getElementById('S').innerText);
  check('provider: once photos are in, top row says tap to review', /Photos are in · tap to review/.test(t2));
  check('provider: no page errors', errs.length === 0, errs.join(' | '));
  await page.close();
}
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail !== '' ? '  — ' + x.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
