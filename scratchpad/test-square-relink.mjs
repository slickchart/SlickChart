// REGRESSION (2026-11-18): reconnecting a different Square account re-links charts, never duplicates
// them, and never folds a family member sharing an email onto the wrong chart. Needs :8899.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const kv = { sc_hide_sample: '1', sc_onboarded: '1', sc_clients: JSON.stringify({
  c_pat: { name: 'Pat Lee', email: 'pat@x.com', phone: '5555550100', squareId: 'OLD_PAT', notes: 'her real chart' },
  c_mom: { name: 'Dana Ray', email: 'fam@x.com', phone: '5555550122', squareId: 'OLD_DANA', notes: 'mom' },
  c_live: { name: 'Lu Live', email: 'lu@x.com', phone: '5555550133', squareId: 'NEW_LU', notes: 'live' } }) };
const cust = [{ id: 'NEW_PAT', name: 'Pat Lee', email: 'pat@x.com', phone: '+15555550100' }, { id: 'NEW_KID', name: 'Kai Ray', email: 'fam@x.com', phone: '+15555550122' },
  { id: 'NEW_LU', name: 'Lu Live', email: 'lu@x.com' }, { id: 'NEW_LU2', name: 'Lu Live', email: 'lu@x.com' }];
const b = await (process.env.PW_ENGINE === 'webkit' ? pw.webkit.launch() : pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })); const p = await (await b.newContext({ serviceWorkers: 'block' })).newPage();
await p.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('sc_token', 'T'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
await p.route('**/api/**', r => { const u = r.request().url(), m = r.request().method(); const J = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (u.includes('cloud-status')) return J({ enabled: true }); if (u.includes('/api/store') && m === 'GET') return J({ data: kv });
  if (u.includes('/api/square/customers')) return J({ customers: cust }); if (u.includes('/api/square/')) return J({ appointments: [], retail: [], services: [] }); return J({ ok: true, data: {}, clients: [], events: [] }); });
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce, null, { timeout: 30000 }); await p.waitForTimeout(1500);
await p.evaluate(() => _autoSyncCustomers({ force: true })); await p.waitForTimeout(1500);
const r = await p.evaluate(() => Object.fromEntries(Object.keys(CL).map(k => [k, CL[k].squareId + '|' + (CL[k].notes || '')])));
if (process.env.DBG) console.log(JSON.stringify(r));
ok(r.c_pat === 'NEW_PAT|her real chart' && !Object.values(r).some(v => v.startsWith('NEW_PAT|') && v !== 'NEW_PAT|her real chart'), 'Pat keeps her chart, re-linked to the new Square account, no second chart');
ok(r.c_mom === 'OLD_DANA|mom' && Object.values(r).some(v => v.startsWith('NEW_KID|')), 'a family member sharing the email gets her own chart, mom\'s chart untouched');
ok(r.c_live === 'NEW_LU|live', 'a chart with a LIVE Square link is never moved to another customer');
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
