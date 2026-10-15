// Research rule E1: never show "no clients" / "no messages" while the account is still loading.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); });
const clients = { a1: { name: 'Amber Lee' }, a2: { name: 'Sue Park' } };
await p.route('**/api/**', async r => { const u = r.request().url();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && r.request().method() === 'GET') { await new Promise(z => setTimeout(z, 6000)); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sc_clients: JSON.stringify(clients) } }) }); }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[]}' }); });
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(1500);
const during = await p.evaluate(() => { const r = {}; for (const s of ['home', 'clients', 'messages']) { try { nav(s); } catch (e) {} r[s] = document.getElementById('S').innerText.replace(/\s+/g, ' ').slice(0, 260); } return r; });
await p.evaluate(() => nav('clients'));
await p.waitForTimeout(6500);
const after = await p.evaluate(() => { nav('clients'); return document.getElementById('S').innerText; }).then(t => t.replace(/\s+/g, ' ').slice(0, 200));
const res = [];
res.push(['while loading, clients says Loading (not "No clients yet")', /Loading your clients/.test(during.clients) && !/No clients yet/.test(during.clients), during.clients.slice(0, 160)]);
res.push(['while loading, Home hides "0 of 4 done"', !/0 of 4 done/.test(during.home), '']);
res.push(['once loaded, the client list shows her clients', /Amber Lee/.test(after) && /Sue Park/.test(after), after.slice(0, 120)]);
let bad = 0; for (const [n, ok, d] of res) { if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  — ' + d : '')); }
console.log(`\n${res.length - bad}/${res.length} passed`); process.exitCode = bad ? 1 : 0;
await b.close();
