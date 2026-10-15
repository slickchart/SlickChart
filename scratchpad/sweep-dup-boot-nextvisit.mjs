// Home draws before the account pull (so the app is not blank), and renderHome() kicks
// _loadSquareAppts() on a 0ms timer. Square usually answers before /api/store (a ~1.5MB workspace).
// _loadSquareAppts -> _stampClientNextVisit(true) writes nextVisit onto THIS DEVICE'S copy of each
// booked client and saveClients() -> _stampClientChanges() gives every one of them _uAt = now.
// _mergeClients takes the whole record with the newer _uAt, so when the pull lands this device's
// stale copy beats the account's newer one: notes typed on the computer since this phone last opened
// are dropped and the stale record is pushed back to the account. No guard: _stampClientNextVisit
// never asks _rosterNotReadYet().
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const now = Date.now();
const STALE = { c1: { name: 'Jane Real', notes: 'old notes from last week', nextVisit: 'Not scheduled', _uAt: now - 7 * 86400000 } };
const ACCT = { c1: { name: 'Jane Real', notes: 'NEW notes typed on the computer this morning', nextVisit: 'Not scheduled', _uAt: now - 3600000 } };
const appts = [{ id: 'ap1', customerName: 'Jane Real', customerId: 'SQJ', startAt: new Date(now + 3 * 86400000).toISOString(), status: 'ACCEPTED' }];
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const delay of [1500, 8000]) {
  const kv = { sc_clients: JSON.stringify(ACCT), sc_hide_sample: '1', sc_onboarded: '1' };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  await p.addInitScript(([s]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); localStorage.setItem('sc_cloud_seeded', '1'); localStorage.setItem('sc_clients', JSON.stringify(s)); }, [STALE]);
  await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') { const snap = JSON.stringify({ data: { ...kv } }); await new Promise(z => setTimeout(z, delay)); return r.fulfill({ status: 200, contentType: 'application/json', body: snap }); }
    if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(kv, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    if (u.includes('/api/square/appointments')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: appts }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForTimeout(delay + 10000);
  const dev = await p.evaluate(() => CL.c1 && CL.c1.notes);
  let acct = ''; try { acct = JSON.parse(kv.sc_clients).c1.notes; } catch (e) {}
  check('pull after ' + delay + 'ms: the device shows the account\'s newer notes', /NEW notes/.test(dev || ''), 'device notes=' + dev);
  check('pull after ' + delay + 'ms: the account keeps its newer notes', /NEW notes/.test(acct), 'account notes=' + acct);
  await ctx.close();
}
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 300) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
