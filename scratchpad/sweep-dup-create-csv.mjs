// CSV / platform import (_importClientsFromRows) mints DETERMINISTIC ids: 'imp_' + first 14 alnum chars
// of the email (or the name). Two consequences:
//  1. Remove an imported client, later import her again -> same id -> already in sc_deleted_clients ->
//     _purgeRemovedClients strips her on the next render. The import says "added", she never appears.
//  2. The id is the PRIMARY KEY of the server `clients` table shared by every account. Two providers
//     who both import the same person (same email, or same name without email) mint the same id; the
//     second account's upsert matches no row of hers and throws id_taken (lib/clients.js), so that
//     client never gets a link token. (Shown here by printing both ids; the server half is a code trace.)
//  3. Phone-only duplicate: an existing client with the same phone but a differently-spelled name and
//     no email is imported as a second chart.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const acct = { real1: { name: 'Ashley Watson', email: 'a@x.com' }, cPH: { name: 'Katie Lee', phone: '(555) 777-8888', notes: 'typed' } };
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sc_clients: JSON.stringify(acct), sc_hide_sample: '1' } }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"customers":[],"appointments":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(8000);
const r1 = await p.evaluate(() => {
  const a = _importClientsFromRows([{ name: 'Jane Doe', email: 'jane.doe@gmail.com' }]);
  window.confirmModal = (o, fn) => fn(); deleteClient(a.ids[0]);
  const b2 = _importClientsFromRows([{ name: 'Jane Doe', email: 'jane.doe@gmail.com' }]);
  _purgeRemovedClients();
  return { firstId: a.ids[0], second: b2, nowInList: Object.keys(CL).filter(k => CL[k].name === 'Jane Doe') };
});
check('re-importing a client she removed earlier actually adds her', r1.nowInList.length === 1, JSON.stringify(r1));
const r2 = await p.evaluate(() => _importClientsFromRows([{ name: 'Sarah Johnson', email: '' }]).ids);
check('imported id is not a guessable shared value (other accounts importing "Sarah Johnson" mint the same server primary key)', !/^imp_sarahjohnson$/.test(r2[0] || ''), JSON.stringify(r2));
const r3 = await p.evaluate(() => { _importClientsFromRows([{ name: 'Kate Lee', phone: '555-777-8888' }]); return Object.keys(CL).filter(k => /Lee$/.test(CL[k].name)); });
check('import of a phone already on file (name spelled differently) does not add a second chart', r3.length === 1, JSON.stringify(r3));
// 4. the everyday version of case 1: Import -> "Undo" (wrong file / wrong columns) -> import the right file
const r4 = await p.evaluate(() => {
  const rows = [{ name: 'Una Undo', email: 'una@x.com' }, { name: 'Ivy Import', email: 'ivy@x.com' }];
  const a = _importClientsFromRows(rows);
  try { _loadImpBatches(); _impBatches.push({ id: 'bt1', at: Date.now(), imported: a.ids, source: 'csv' }); } catch (e) {}
  const undone = _impUndo('bt1');
  const again = _importClientsFromRows(rows); _purgeRemovedClients();
  return { undone, again, inList: Object.keys(CL).filter(k => /Una Undo|Ivy Import/.test(CL[k].name)) };
});
check('import -> Undo -> import again leaves the clients in her list', r4.inList.length === 2, JSON.stringify(r4));
await ctx.close(); await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 260) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
