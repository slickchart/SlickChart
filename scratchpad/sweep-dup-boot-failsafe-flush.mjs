// The 6s _bootFailsafe calls Cloud.bootDone() while the account pull is still in flight. bootDone()
// flushes everything boot queued (loaders' default write-backs, plus the 2.5s Square catalog sync and
// the 3.2s Square customer sync), and with Cloud._serverSeen still null both the "identical to the
// account" filter and _dropBootShrinks() let all of it through. /api/store is last-writer-wins for
// these keys, so a slow launch (new phone, weak signal, cold DB) uploads this device's starter copy
// over the account BEFORE the account has been read. Simulates the server's kv with LWW semantics.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const PULL_DELAY = +(process.env.PULL_DELAY || 10000);
// PULL_FAIL=1: the slow pull then drops (signal lost, or she closes the app while it spins). Nothing
// ever merges the account copy back, so whatever the failsafe uploaded is what the account keeps.
const PULL_FAIL = process.env.PULL_FAIL === '1';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const kv = {
  sc_clients: JSON.stringify({ c1: { name: 'Jane Real', notes: 'her notes', _uAt: Date.now() - 86400000 }, c2: { name: 'Mia Real', _uAt: Date.now() - 86400000 } }),
  sc_affiliate_links: JSON.stringify([{ id: 'her1', name: 'Her Own Serum', url: 'https://example.com/serum', price: 48, _ts: Date.now() - 86400000 }]),
  sc_affiliate_custom: '1', sc_hide_sample: '1', sc_onboarded: '1',
};
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
  localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); });
const t0 = Date.now(); let pullAnsweredAt = 0; const early = [];
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') { const snap = JSON.stringify({ data: { ...kv } }); await new Promise(z => setTimeout(z, PULL_DELAY)); pullAnsweredAt = Date.now(); if (PULL_FAIL) return r.abort('connectionreset'); return r.fulfill({ status: 200, contentType: 'application/json', body: snap }); }
  if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); const items = j.items || (j.key ? { [j.key]: j.value } : {});
      if (!pullAnsweredAt) early.push(...Object.keys(items).map(k => k + '@' + ((Date.now() - t0) / 1000).toFixed(1) + 's'));
      Object.assign(kv, items); } catch (e) {}
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  if (u.includes('/api/square/catalog')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ retail: [{ id: 'sqr1', name: 'Square Cleanser', price: 20 }], services: [] }) });
  if (u.includes('/api/square/customers')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ customers: [] }) });
  if (u.includes('/api/square/appointments')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: [] }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForTimeout(PULL_DELAY + 15000);
const dev = await p.evaluate(() => ({ products: (affiliateLinks || []).map(a => a.name), clients: Object.values(CL).map(c => c.name) }));
let acctProducts = []; try { acctProducts = JSON.parse(kv.sc_affiliate_links || '[]').map(a => a.name); } catch (e) {}
let acctClients = []; try { acctClients = Object.values(JSON.parse(kv.sc_clients || '{}')).map(c => c.name); } catch (e) {}
check('nothing is uploaded to the account before the account has been read', !early.length, early.length + ' key upload(s) before the pull answered: ' + early.slice(0, 14).join(', '));
check('her own product is still on the account afterwards', acctProducts.includes('Her Own Serum'), 'account sc_affiliate_links=' + JSON.stringify(acctProducts) + ' device=' + JSON.stringify(dev.products));
check('her clients are still on the account afterwards', acctClients.includes('Jane Real') && acctClients.includes('Mia Real'), JSON.stringify(acctClients));
await ctx.close(); await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 400) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
