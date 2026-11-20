// Checkout: a Square service with no set price comes into the line items at $0 (often filled in from
// today's visit). She types the price in Amount and every button said "Add line items or an amount first"
// (a provider, 3 times in one minute, 2026-11-19, provider watch). Requires:
//  A. one $0 line + amount typed: the amount is charged, and that line carries the price
//  B. same with tax on: the total charged is what she typed (within a cent)
//  C. two $0 lines: nothing is guessed, and the message names the lines that need a price
//  D. a line that has its own price is never changed by the amount box
//  E. no lines, amount typed: unchanged (the amount)
// PORT (default 8900) serves slickchart-vercel/. ENGINE=webkit for Safari.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900, ENGINE = process.env.ENGINE || 'chromium';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const TOK = b64({ u: 'prov_ash' }) + '.sig';
const acct = { sc_hide_sample: '1', sc_bizinfo: JSON.stringify({ name: 'Glow', ownerName: 'Ashley Test' }) };
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
await p.addInitScript(([a, t]) => { localStorage.setItem('sc_token', t); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1');
  for (const k of Object.keys(a)) localStorage.setItem(k, a[k]); }, [acct, TOK]);
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : r.request().url().includes('/api/store') ? JSON.stringify({ data: acct }) : '{"ok":true,"data":{},"clients":[],"events":[],"items":[]}' }));
await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForTimeout(3000);
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const run = (items, typed, tax) => p.evaluate(([items, typed, tax]) => {
  CL['c_t'] = { id: 'c_t', name: 'Test Client', email: 't@example.com' };
  renderCheckout('c_t'); _taxRate = tax || 0; _squareTaxRate = null;
  _coItems = items.map(x => Object.assign({ qty: 1, kind: 'service', taxable: true, note: '' }, x));
  _coRenderItems(); document.getElementById('co-amt').value = typed;
  const its = _coValidItems(); const amt = _coAmount();
  _coMarkPaid('c_t'); const msg = (document.getElementById('co-result') || {}).textContent || '';
  return { amt, prices: its.map(i => i.price), msg };
}, [items, typed, tax]);
let r = await run([{ name: 'Facial', price: 0, variationId: 'v1' }], '85');
ok(r.amt === 85 && r.prices[0] === 85 && !/Add line items/.test(r.msg), 'A. one $0 line + amount typed: charges 85 (' + JSON.stringify(r) + ')');
r = await run([{ name: 'Facial', price: 0, variationId: 'v1' }], '85', 10);
ok(Math.abs(r.amt - 85) <= 0.01, 'B. with 10% tax the total is what she typed (' + r.amt + ')');
r = await run([{ name: 'Facial', price: 0, variationId: 'v1' }, { name: 'Peel', price: 0, variationId: 'v2' }], '85');
ok(r.amt === 0 && /Facial/.test(r.msg) && /Peel/.test(r.msg) && !/Add line items/.test(r.msg), 'C. two $0 lines: nothing guessed, message names them (' + r.msg.slice(0, 120) + ')');
r = await run([{ name: 'Facial', price: 60, variationId: 'v1' }, { name: 'Add-on', price: 0, variationId: 'v2' }], '85');
ok(r.prices[0] === 60 && r.prices[1] === 0 && r.amt === 60, 'D. a priced line is never changed by the amount box (' + JSON.stringify(r.prices) + ')');
r = await run([], '42.5');
ok(r.amt === 42.5, 'E. no lines: the typed amount (' + r.amt + ')');
await b.close();
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
