// sweep3: client app product surfaces (real slickchart-client.html, mocked /api/**, 390px).
//  A. Renamed product: the summary saved the OLD name, the live plan has the NEW name -> the client's
//     latest summary lists it twice (old name treated as a "not in catalog" custom product).
//  B. Product deleted from her library: the old name on the summary comes back as a custom product.
//  C. "Your Visit" landing reads the summary snapshot FIRST, the summary screen and the provider's record
//     read the live plan first -> a product she took off the plan still shows on the landing, a product
//     she added does not.
//  D. A product with no link and not in office reads "Buy · 0 way to get it".
//  E. History tab can never show anything for a real client (recLog is forced to []).
//  F. Unsafe links blocked; 390px no horizontal overflow on Shop + buy sheet.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const NEW = { name: 'Glow Serum 2.0', brand: 'Acme', icon: '🧴', why: 'Nightly', image: '', url: 'javascript:alert(1)', site: 'shop.example.com/serum', siteCode: 'GLOW10', urlCode: '', inOffice: true, amazon: '', amazonCode: '' };
const ADDED = { name: 'Barrier Cream', brand: 'Acme', icon: '🫙', why: '', image: '', url: '', site: '', siteCode: '', urlCode: '', inOffice: false, amazon: '', amazonCode: '' };
const KEPT = { name: 'Mineral SPF', brand: 'Acme', icon: '☀️', why: '', image: '', url: '', site: '', siteCode: '', urlCode: '', inOffice: false, amazon: '', amazonCode: '' };
const summary = { date: 'Oct 1', title: 'Facial', note: 'Great visit', homecare: ['Cleanse'], products: ['Glow Serum', 'Old Toner', 'Mineral SPF'], ts: 1759300000000 };
const rec = clientRecord('c1', 'Cara Client', {
  // live plan: Glow Serum was RENAMED to Glow Serum 2.0; Old Toner deleted from her library;
  // Mineral SPF taken OFF the plan (still in catalog); Barrier Cream ADDED.
  products: [NEW, ADDED],
  catalog: [NEW, ADDED, KEPT, { name: 'Long Name '.repeat(8).trim(), brand: 'B'.repeat(60), icon: '🧴', inOffice: false, site: 'x.example.com/' + 'a'.repeat(120), siteCode: 'CODE'.repeat(12) }],
  summaries: [summary]
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await mockApi(page, { records: { TOK: rec } });
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1500);
// A + B on the summary screen
await page.evaluate(() => { _summaryIdx = 0; nav('summary'); });
await page.waitForTimeout(400);
const sumNames = await page.evaluate(() => _buyProducts.map(p => p.name));
check('A: renamed product shows twice on the latest summary (new name + old name)', sumNames.includes('Glow Serum 2.0') && sumNames.includes('Glow Serum'), sumNames);
check('B: product deleted from her library comes back on the latest summary as a custom product', sumNames.includes('Old Toner'), sumNames);
// C landing
const land = await page.evaluate(() => { renderMagicLanding(); return _buyProducts.map(p => p.name); });
check('C: "Your Visit" landing shows a product she took OFF the plan (Mineral SPF) / misses one she ADDED (Barrier Cream), unlike the summary screen', land.includes('Mineral SPF') || !land.includes('Barrier Cream'), { landing: land, summary: sumNames });
// D Shop recommended labels
await page.evaluate(() => { shopView = 'recommended'; nav('shop'); });
await page.waitForTimeout(300);
const labels = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /^Buy/.test(t)));
check('D: a product with no link and not in office reads "Buy · 0 way to get it"', labels.some(t => /0 way\b/.test(t)), labels);
// E History
await page.evaluate(() => { shopView = 'history'; renderShop(); });
const hist = await page.evaluate(() => document.getElementById('content') ? '' : (document.body.innerText.match(/recommendation history will appear[^.]*\./) || [''])[0]);
check('E: History tab is empty for a real client even with a past visit that recommended products', /appear/.test(hist), hist);
// F unsafe link + overflow
await page.evaluate(() => { shopView = 'recommended'; renderShop(); openBuyOptions(0); });
await page.waitForTimeout(200);
const hrefs = await page.evaluate(() => [...document.querySelectorAll('#buy-sheet a')].map(a => a.getAttribute('href')));
check('F: javascript: brand link is dropped from the buy sheet', hrefs.some(h => /^javascript:/i.test(h || '')), hrefs);
await page.evaluate(() => { closeBuySheet(); shopView = 'all'; renderShop(); openBuyOptions(3); });
await page.waitForTimeout(200);
const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sheet: (() => { const s = document.querySelector('#buy-sheet > div'); return s ? s.scrollWidth - s.clientWidth : -1; })() }));
const wide = await page.evaluate(() => { const s=document.querySelector('#buy-sheet > div'); if(!s) return []; const W=s.getBoundingClientRect().right; return Array.from(s.querySelectorAll('*')).filter(e=>e.getBoundingClientRect().right>W+1).slice(0,6).map(e=>e.tagName+'.'+(e.getAttribute('style')||'').slice(0,120)+' | '+(e.textContent||'').slice(0,60)); });
console.log('WIDE', JSON.stringify(wide,null,1));
check('F: 390px horizontal overflow on Shop all / buy sheet with a long name + code', ov.sw > ov.cw || ov.sheet > 2, ov);
await page.screenshot({ path: '/home/user/SlickChart/scratchpad/sweep3-recs-client-shop.png' });
check('no page errors', errs.length > 0, errs);
await browser.close();
finish();
