// "remove demo products from everything everywhere" (2026-10-13). A real account: the starter/sample
// products the app seeded and she never adopted leave her list, every client's recommendations and the
// picker; one she filled in (has a link) stays; her own products stay; nothing new is seeded; the
// removal is on the delete record so the shrink can sync. The public demo is checked separately.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await page.waitForTimeout(2500);
const r = await page.evaluate(() => {
  const starters = Object.keys(_STARTER_PRODUCT_IDS);
  const sA = starters.find(x => !/^a\d$/.test(x)), sB = starters.filter(x => !/^a\d$/.test(x))[1];
  affiliateLinks = [
    { id: sA, name: 'Starter Unadopted', active: true },
    { id: sB, name: 'Starter She Adopted', site: 'https://her.shop/x', active: true },
    { id: 'a1', name: 'Sample a1', active: true },
    { id: 'mine1', name: 'Avène Thermal Spring Water - 10 fl. oz.', brand: 'Retail · $20', active: true } ];
  clientRecs.aw = [sA, 'mine1', 'a1']; CL.aw = { name: 'Ashley Watson' };
  const pickerBefore = _prodPickerRows('nobody', '');
  const n = _purgeDemoProducts();
  const tomb = (() => { try { return JSON.parse(localStorage.getItem('sc_deleted_products') || '{}'); } catch (e) { return {}; } })();
  affiliateLinks.length = affiliateLinks.length; // no-op
  const keptNames = affiliateLinks.map(a => a.name);
  // a brand-new account: nothing seeded
  const saved = affiliateLinks; affiliateLinks = []; try { localStorage.removeItem('sc_affiliate_custom'); } catch (e) {}
  _reseedShopIfDefault(); const fresh = affiliateLinks.length; affiliateLinks = saved;
  return { n, keptNames, recs: clientRecs.aw, tombKeys: Object.keys(tomb), sA, pickerHadStarter: /Starter Unadopted/.test(pickerBefore), fresh };
});
check('picker never offers an unadopted starter', !r.pickerHadStarter);
check('two unadopted demo products removed', r.n === 2, r.n);
check('her own product and the starter she adopted stay', JSON.stringify(r.keptNames) === JSON.stringify(['Starter She Adopted', 'Avène Thermal Spring Water - 10 fl. oz.']), JSON.stringify(r.keptNames));
check('removed from the client\'s recommendations, hers kept', JSON.stringify(r.recs) === '["mine1"]', JSON.stringify(r.recs));
check('removal is on the delete record (so it syncs)', r.tombKeys.length >= 1, JSON.stringify(r.tombKeys));
check('a new account is not seeded with demo products', r.fresh === 0, r.fresh);
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail !== '' ? '  — ' + x.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
