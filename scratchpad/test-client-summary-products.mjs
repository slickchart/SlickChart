// Client app, session summary: products saved on a summary are NAMES (strings). The screen read
// p.name, so each drew as an empty row with only the bag icon. Checks names show, a name that matches
// a live recommendation keeps its Buy button, and empty homecare/products cards are hidden.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart-client.html';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
await page.goto('http://localhost:8899/' + FILE, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const run = async (summary, live) => page.evaluate(([summary, live]) => {
  const p = activeProvider(); p.summaries = [summary]; p.products = live; _summaryIdx = 0;
  renderLatestSummary();
  const t = document.getElementById('S').innerText;
  return { t, buy: Array.from(document.querySelectorAll('#S button')).filter(b => /Buy/.test(b.textContent)).length };
}, [summary, live]);
let r = await run({ date: 'Oct 13th, 2026', note: 'Lovely to see you', homecare: [], products: ['Avène Thermal Spring Water - 10 fl. oz.', 'Cicalfate+ Restorative Protective Cream 1.3 fl. oz.'] }, []);
check('summary product names show', /Thermal Spring Water - 10 fl\. oz\./.test(r.t) && /Cicalfate\+ Restorative Protective Cream/.test(r.t), r.t.slice(0, 400));
check('empty homecare card hidden', !/Your homecare routine/i.test(r.t));
r = await run({ date: 'Oct 13th, 2026', note: 'x', homecare: ['SPF daily'], products: [] }, [{ name: 'Avène Thermal Spring Water - 10 fl. oz.', site: 'https://shop.test/a' }]);
check('homecare shows when there is some', /SPF daily/.test(r.t));
check('live recommendation used when the summary has none, with Buy', /Thermal Spring Water/.test(r.t) && r.buy >= 1, JSON.stringify(r.buy));
r = await run({ date: 'Oct 13th, 2026', note: 'x', homecare: [], products: [] }, []);
check('no products at all: card hidden', !/Recommended for you/i.test(r.t));
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail !== '' ? '  — ' + x.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
