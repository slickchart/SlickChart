// The Shop's Buy button counts the same choices its sheet shows (2026-11-19 phone sweep: a product with
// no links said "Buy · 0 ways to get it" while the sheet offered Buy in office and her Shop).
// usage: [PW_ENGINE=chromium] node scratchpad/test-client-buy-count.mjs (needs :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const eng = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const b = await eng.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
const prods = [{ id: 'a', name: 'No links' }, { id: 'b', name: 'In office only', inOffice: true }, { id: 'c', name: 'Store link', site: 'https://example.com/a' }, { id: 'd', name: 'All', inOffice: true, site: 'https://example.com/a', url: 'https://brand.example.com/b', amazon: 'https://amazon.com/dp/X' }];
await mockApi(page, { records: { TOK: clientRecord('c1', 'Jo Rivera', { providerName: 'Ashley', products: prods }) } });
await page.goto(BASE + '?c=TOK'); await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await page.waitForTimeout(1000);
await page.evaluate(() => nav('shop')); await page.waitForTimeout(600);
const res = await page.evaluate(() => [...document.querySelectorAll('button[onclick^="openBuyOptions("]')].map(bt => { const label = bt.textContent.trim(); bt.click(); const sh = document.getElementById('buy-sheet'); const rows = sh ? [...sh.querySelectorAll("a[href], button[onclick]")].filter(e => e.tagName === "A" || !(/close/i.test(e.getAttribute("aria-label") || "") || /^\s*closeBuySheet\(\);?\s*$/.test(e.getAttribute("onclick") || ""))).length : 0; try { closeBuySheet(); } catch (e) { sh && sh.remove(); } return { label, rows }; }));
ok('every product has a Buy button', res.length === 4, res);
for (const r of res) { const n = +(r.label.match(/(\d+) way/) || [])[1]; ok('"' + r.label + '" matches the ' + r.rows + ' choices in its sheet', n === r.rows && n > 0, r); }
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
