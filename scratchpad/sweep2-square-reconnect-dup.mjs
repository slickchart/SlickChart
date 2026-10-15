// SWEEP 2 / disconnect + reconnect a DIFFERENT Square account -> every client is duplicated.
//
//   node scratchpad/sweep2-square-reconnect-dup.mjs
//
// Her charts carry squareId = customer ids from the OLD merchant. The new merchant has the same people
// under new ids. _sqChartFor refuses to contact-match a chart "tied to a different Square customer",
// so _autoSyncCustomers creates a fresh sq_ chart for every one of them. _sqDisconnect clears the
// catalog and products but leaves every chart's old squareId in place.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const kv = { sc_hide_sample: '1', sc_onboarded: '1', sc_clients: JSON.stringify({
  c_pat: { name: 'Pat Lee', email: 'pat@x.com', phone: '5555550100', squareId: 'OLDMERCH_PAT', notes: 'her real chart' },
  c_amy: { name: 'Amy Cho', email: 'amy@x.com', phone: '5555550111', squareId: 'OLDMERCH_AMY', notes: 'her real chart' } }) };
const newMerchant = [{ id: 'NEWMERCH_PAT', name: 'Pat Lee', email: 'pat@x.com', phone: '+15555550100' }, { id: 'NEWMERCH_AMY', name: 'Amy Cho', email: 'amy@x.com', phone: '+15555550111' }];
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...kv } }) });
  if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(kv, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  if (u.includes('/api/square/customers')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ customers: newMerchant }) });
  if (u.includes('/api/square/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"appointments":[],"retail":[],"services":[],"invoices":[]}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce, null, { timeout: 30000 });
await p.waitForTimeout(1500);
await p.evaluate(() => _autoSyncCustomers({ force: true })); await p.waitForTimeout(1500);
const r = await p.evaluate(() => Object.keys(CL).filter(k => /pat@x|amy@x/.test(CL[k].email || '')).map(k => k + ':' + CL[k].squareId));
await b.close();
const ok = r.length === 2;
console.log((ok ? 'SOUND        ' : 'CONFIRMED-BUG') + '  after reconnecting a different Square account, Pat and Amy are still one chart each  — ' + JSON.stringify(r));
process.exit(ok ? 0 : 1);
