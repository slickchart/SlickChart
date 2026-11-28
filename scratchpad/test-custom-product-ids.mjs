// A custom product made on a later launch got the same id as one made earlier ("cust1" every time,
// the same fault as the form question ids, 2026-11-26/28): the client's plan showed the OLDER product and
// the next load kept only one of the two. Now each gets its own id, and a list saved with two different
// products on one old id is split on load (the first keeps the id the plans point at).
//   PORT=8899 node scratchpad/test-custom-product-ids.mjs   (serve slickchart-vercel on that port)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const ENGINE = process.env.ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const b = await ENGINE.launch({});
const res = []; const ok = (n, v, d) => res.push([n, !!v, d]);
const route = async p => p.route('**/api/**', r => { const u = r.request().url();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
const boot = async (p) => { await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(8000); };
const make = (p, name) => p.evaluate(nm => {
  ['cust-name', 'cust-brand', 'cust-icon', 'cust-url', 'cust-site', 'cust-amazon', 'cust-site-code', 'cust-url-code'].forEach(id => { let e = document.getElementById(id); if (!e) { e = document.createElement('input'); e.id = id; document.body.appendChild(e); } e.value = ''; });
  document.getElementById('cust-name').value = nm;
  const before = affiliateLinks.length; createCustomProd('cl1'); const a = affiliateLinks[affiliateLinks.length - 1];
  return { id: a.id, added: affiliateLinks.length === before + 1 };
}, name);
// ── a product today, another after a fresh launch
{ const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 800 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); await route(p);
  await p.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); } });
  await boot(p);
  const a = await make(p, 'Day one serum');
  await boot(p);
  const kept = await p.evaluate(id => affiliateLinks.some(x => x.id === id && x.name === 'Day one serum'), a.id);
  ok('the first product is still there after a fresh launch', kept, a.id);
  const c = await make(p, 'Day two cream');
  ok('a product made after a fresh launch gets its own id', a.added && c.added && a.id !== c.id && /^cust/.test(c.id), a.id + ' / ' + c.id);
  await boot(p);
  const st = await p.evaluate(([x, y]) => ({ one: (affiliateLinks.find(l => l.id === x) || {}).name, two: (affiliateLinks.find(l => l.id === y) || {}).name, plan: (clientRecs.cl1 || []).join(), saved: (JSON.parse(localStorage.getItem('sc_affiliate_links') || '[]')).filter(l => l.id === x || l.id === y).length }), [a.id, c.id]);
  ok('after another launch both products are there under their own names', st.one === 'Day one serum' && st.two === 'Day two cream', JSON.stringify(st));
  ok('the plan points at both, each to the right product', st.plan === a.id + ',' + c.id, JSON.stringify(st));
  ok('both are saved to the shop products list too', st.saved === 2, JSON.stringify(st));
  ok('no page errors', !errs.length, errs.join(' | '));
  await ctx.close(); }
// ── a list saved before the fix with two different products on "cust1"
{ const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 800 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); await route(p);
  await p.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1');
    const L = [{ id: 'cust1', name: 'Serum', custom: true, active: true }, { id: 'cust1', name: 'Cream', custom: true, active: true }];
    localStorage.setItem('sc_affiliate_links', JSON.stringify(L));
    localStorage.setItem('sc_workspace', JSON.stringify({ clientRecs: { cl1: ['cust1'] }, recReasons: {}, clientHomecare: {}, customProducts: L, inOffice: {}, codes: {} })); } });
  await boot(p);
  const st = await p.evaluate(() => ({ ids: affiliateLinks.filter(a => a.custom).map(a => a.id + ':' + a.name).join(','), plan: (clientRecs.cl1 || []).join() }));
  ok('two different products on one old id are both kept, the second under its own id', /cust1:Serum/.test(st.ids) && /cust1_2:Cream/.test(st.ids) && (st.ids.match(/cust1:/g) || []).length === 1, st.ids);
  ok('the plan still points at the product it always showed', st.plan === 'cust1', st.plan);
  ok('merge: the account copy with the shared id loses neither product', await p.evaluate(() => { if (typeof _healCustProdStr !== 'function') return false;
    const L = JSON.stringify([{ id: 'cust1', name: 'Serum' }, { id: 'cust1', name: 'Cream' }]);
    const h = JSON.parse(_healCustProdStr(L)); return h.length === 2 && h[1].id === 'cust1_2' && _healCustProdStr(JSON.stringify(h)) === JSON.stringify(h);
  }));
  ok('no page errors', !errs.length, errs.join(' | '));
  await ctx.close(); }
await b.close();
let bad = 0; for (const [n, v, d] of res) { console.log((v ? 'PASS ' : 'FAIL ') + n + (v ? '' : '  ' + String(d || '').slice(0, 400))); if (!v) bad++; }
console.log(bad ? bad + ' FAILED' : 'ALL PASS'); process.exit(bad ? 1 : 0);
