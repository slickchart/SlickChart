// _autoSyncCustomers runs 3.2s after boot (and from renderClients / the 60s poll / visibilitychange)
// with NO roster-read guard. On a device whose roster has not arrived yet (fresh login, purged phone
// store, slow account answer) it re-creates every Square customer from the Square directory. Those
// records carry email/phone, so _isPlaceholderChart() does NOT treat them as placeholders, and
// saveClients() stamps _uAt=now — so in _mergeClients the fresh Square shell BEATS her real chart.
// Expect: after the account answers, sq_abc still holds the notes she typed.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const acct = {
  sq_abc: { name: 'Jane Real', email: 'jane@x.com', phone: '5551112222', squareId: 'ABC', source: 'square',
    notes: 'REAL NOTES she typed', skin: 'Oily, acne prone', allergies: 'Latex', concerns: 'Scarring', _uAt: Date.now() - 86400000 * 5 },
  cMANUAL1: { name: 'Mia Manual', email: 'mia@x.com', phone: '5553334444', notes: 'manual chart', _uAt: Date.now() - 86400000 * 5 },
};
const customers = [
  { id: 'ABC', name: 'Jane Real', email: 'jane@x.com', phone: '5551112222' },
  { id: 'MIASQ', name: 'Mia Manual', email: 'mia@x.com', phone: '5553334444' },   // same person as cMANUAL1, never linked
];
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [label, pullDelay] of [['fast account answer', 300], ['slow account answer (8s)', 8000]]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  if (process.env.FIX) await p.addInitScript(() => { const iv = setInterval(() => { if (typeof _autoSyncCustomers === 'function' && !window.__fx) { window.__fx = 1; const o = _autoSyncCustomers;
    // proposed fix: no directory import before her roster has been read
    window._autoSyncCustomers = function () { if (typeof _rosterNotReadYet === 'function' && _rosterNotReadYet()) return; return o.apply(this, arguments); }; clearInterval(iv); } }, 1); });
  const pushes = [];
  await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') { await new Promise(z => setTimeout(z, pullDelay)); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sc_clients: JSON.stringify(acct), sc_hide_sample: '1' } }) }); }
    if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); const d = j.items || j.data || j; if (d && d.sc_clients) pushes.push(d.sc_clients); } catch (e) {} }
    if (u.includes('/api/square/customers')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ customers }) });
    if (u.includes('/api/square/appointments')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: [] }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(pullDelay + 9000);
  const st = await p.evaluate(() => ({ jane: CL.sq_abc ? { notes: CL.sq_abc.notes, skin: CL.sq_abc.skin, allergies: CL.sq_abc.allergies } : null,
    mias: Object.keys(CL).filter(k => /Mia/.test(CL[k].name || '')), all: Object.keys(CL) }));
  const lastPush = pushes.length ? JSON.parse(pushes[pushes.length - 1]) : null;
  check(label + ': her typed notes on sq_abc survive', st.jane && st.jane.notes === 'REAL NOTES she typed' && st.jane.allergies === 'Latex', JSON.stringify(st.jane));
  check(label + ': account never receives the Square shell over her chart', !lastPush || !lastPush.sq_abc || lastPush.sq_abc.notes === 'REAL NOTES she typed', lastPush && JSON.stringify(lastPush.sq_abc));
  check(label + ': manual client with same email/phone is not duplicated by the Square directory', st.mias.length === 1, JSON.stringify(st.mias));
  await ctx.close();
}
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 260) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
