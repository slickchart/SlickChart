// Square-linked records that do NOT live under the sq_<id> key.
//  1. "New client" (ncSaveBasic) pushes her to Square, which sets c.squareId on a c… record. The next
//     directory poll (_autoSyncCustomers) only checks CL['sq_'+id], so it adds a second chart.
//  2. Deleting a client whose id is not sq_… tombstones only that id. The directory poll and the
//     booking upsert check the tombstone under the sq_ key only, so she comes straight back.
//  3. Booking upsert matches by squareId then NAME only: an existing client whose booking name
//     differs ("Jen" vs "Jennifer") but whose email/phone match is duplicated.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const acct = {
  real1: { name: 'Ashley Watson', email: 'a@x.com' },
  cJEN: { name: 'Jennifer Smith', email: 'jen@x.com', phone: '(555) 222-3333', notes: 'typed' },
};
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
let customers = [];
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sc_clients: JSON.stringify(acct), sc_hide_sample: '1' } }) });
  if (u.includes('/api/square/customers') && m === 'POST') { customers.push({ id: 'MANSQ1', name: 'Nora Manual', email: 'nora@x.com', phone: '' }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ customer: { id: 'MANSQ1' } }) }); }
  if (u.includes('/api/square/customers')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ customers }) });
  if (u.includes('/api/square/appointments')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: [] }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(9000);

if (process.env.FIX) await p.evaluate(() => {
  // proposed: purge never strips the record a Square key was merged INTO
  const P = _purgeRemovedClients;
  window._purgeRemovedClients = function () {
    const saved = {}; Object.keys(CL).forEach(id => { const c = CL[id]; if (!c || !c.squareId) return; const k = _sqLocalId(c.squareId);
      if (k !== id && !_deletedClientIds[id] && !mergedSquareIds[id] && _resolveClientId(k) === id) saved[id] = c; });
    P(); Object.keys(saved).forEach(id => { if (!CL[id]) CL[id] = saved[id]; });
  };
  // proposed: deleting one of two copies of the same Square customer routes to the other; deleting the
  // only copy also tombstones its sq_ key so directory/booking sync cannot bring her back
  const D = deleteClient;
  window.deleteClient = function (id) { const c = CL[id]; const sq = c && c.squareId ? String(c.squareId) : '';
    const sib = sq ? Object.keys(CL).find(k => k !== id && CL[k] && String(CL[k].squareId || '') === sq) : null;
    const fn = window.confirmModal; window.confirmModal = (o, go) => fn(o, () => {
      if (sib) { _mergedInto[id] = sib; _mergedInto[_sqLocalId(sq)] = sib; _saveMergedInto(); }
      else if (sq) { _deletedClientIds[_sqLocalId(sq)] = Date.now(); _saveDeletedClients(); }
      go(); });
    try { D(id); } finally { window.confirmModal = fn; } };
});
// 1. manual add, pushed to Square, then the directory poll
await p.evaluate(async () => { nav('new-client'); await new Promise(z => setTimeout(z, 300));
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('nc-name', 'Nora Manual'); set('nc-email', 'nora@x.com'); ncSaveBasic(); await new Promise(z => setTimeout(z, 1500)); });
const s1a = await p.evaluate(() => Object.keys(CL).filter(k => CL[k].name === 'Nora Manual').map(k => k + ':' + CL[k].squareId));
await p.evaluate(async () => { await _autoSyncCustomers({ force: true }); });
const s1 = await p.evaluate(() => Object.keys(CL).filter(k => CL[k].name === 'Nora Manual'));
check('manual "New client" then Square directory poll: still one chart', s1.length === 1, 'after add: ' + JSON.stringify(s1a) + ' after poll: ' + JSON.stringify(s1));

// 2. delete a Square-linked c… client; directory poll + booking poll must not bring her back
await p.evaluate(() => { Object.keys(CL).filter(k => CL[k].name === 'Nora Manual' && k.startsWith('sq_')).forEach(k => delete CL[k]);
  CL.cDEL = { name: 'Dana Deleted', email: 'dana@x.com', squareId: 'DELSQ1', notes: 'x' }; saveClients(); });
await p.evaluate(() => { window.confirmModal = (o, fn) => fn(); deleteClient('cDEL'); });
customers = customers.concat([{ id: 'DELSQ1', name: 'Dana Deleted', email: 'dana@x.com' }]);
await p.evaluate(async () => { await _autoSyncCustomers({ force: true }); });
const s2a = await p.evaluate(() => Object.keys(CL).filter(k => CL[k].name === 'Dana Deleted'));
await p.evaluate(() => { Object.keys(CL).filter(k => CL[k].name === 'Dana Deleted').forEach(k => delete CL[k]);
  _upsertClientsFromSquare([{ id: 'apD', customerName: 'Dana Deleted', customerId: 'DELSQ1', startAt: new Date(Date.now() + 864e5).toISOString() }]); });
const s2b = await p.evaluate(() => Object.keys(CL).filter(k => CL[k].name === 'Dana Deleted'));
check('deleted Square-linked client is not re-added by the directory poll', s2a.length === 0, JSON.stringify(s2a));
check('deleted Square-linked client is not re-added by the booking upsert', s2b.length === 0, JSON.stringify(s2b));

// 3. booking under a different spelling of her name, same email + phone
await p.evaluate(() => { _upsertClientsFromSquare([{ id: 'apJ', customerName: 'Jen Smith', customerId: 'JENSQ', customerEmail: 'jen@x.com', customerPhone: '+15552223333', startAt: new Date(Date.now() + 864e5).toISOString() }]); });
const s3 = await p.evaluate(() => Object.keys(CL).filter(k => /Smith/.test(CL[k].name)).map(k => k + ':' + CL[k].name));
check('booking with a different name spelling but the same email/phone reuses her chart', s3.length === 1, JSON.stringify(s3));
// 4. the natural reaction to case 1: she deletes the extra sq_ copy. The purge then removes EVERY
//    record whose squareId maps to that key, which includes her real c… chart.
await p.evaluate(() => { CL.cREAL = { name: 'Rita Real', email: 'rita@x.com', squareId: 'RITASQ1', notes: 'her real notes' };
  CL.sq_ritasq1 = { name: 'Rita Real', email: 'rita@x.com', squareId: 'RITASQ1', source: 'square', skin: '\u2014' }; saveClients();
  window.confirmModal = (o, fn) => fn(); deleteClient('sq_ritasq1'); _purgeRemovedClients(); });
const s4 = await p.evaluate(() => Object.keys(CL).filter(k => CL[k].name === 'Rita Real'));
check('deleting the extra Square copy keeps her real chart', s4.length === 1 && s4[0] === 'cREAL', JSON.stringify(s4));
// 5. Same thing through "Merge Duplicates", choosing to KEEP her c… chart (the one with her notes) and
//    fold the sq_ copy into it: _mergeClientRecords tombstones dropId = sq_…, and the purge then strips
//    the survivor because its squareId maps to that tombstoned key.
await p.evaluate(() => { CL.cKEEP = { name: 'Mona Merge', email: 'mona@x.com', squareId: 'MONASQ1', notes: 'her real notes' };
  CL.sq_monasq1 = { name: 'Mona Merge', email: 'mona@x.com', squareId: 'MONASQ1', source: 'square' }; saveClients();
  _mergeClientRecords('cKEEP', 'sq_monasq1'); _purgeRemovedClients(); });
const s5 = await p.evaluate(() => Object.keys(CL).filter(k => CL[k].name === 'Mona Merge'));
check('merge keeping the c… chart and dropping the same-customer sq_ copy keeps the survivor', s5.length === 1 && s5[0] === 'cKEEP', JSON.stringify(s5));
await ctx.close(); await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 260) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
