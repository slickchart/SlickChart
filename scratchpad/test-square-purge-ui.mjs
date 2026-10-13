// The restored "Clean up Square customers" screen (Admin tools → _openSquarePurge), 2026-10-13.
// Square has NO undo, so this checks what reaches /api/square/delete-customers, not just what renders:
//   - the row is in Admin tools for the founder and nowhere for anyone else
//   - booked/paid clients can never be selected, in any mode, by any filter
//   - newsletter signups are subscribers, so they are hidden until Review ALL, and the screen says so
//   - a burst day narrows to exactly that day; select-all sends exactly those ids, in chunks <= 200
//   - a roster client carrying the Square id in squareId is removed and tombstoned in ONE batch
//   - the only admin endpoint touched is the read-only square-foreign GET
//
//   python3 -m http.server 8899   (from slickchart-vercel/)
//   node scratchpad/test-square-purge-ui.mjs [file.html]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';
const results = [];
const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });

const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e && e.message || e)));
await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });

// 300 bot signups on one day (subscribed, one source), 4 older non-subscribers, 2 paid real clients
// (one of them ON the burst day and subscribed, so only the paid shield can save her), one real client
// who is in the roster by email.
const BURST = '2026-10-01T15:00:00Z';
const custs = [];
for (let i = 0; i < 300; i++) custs.push({ id: 'BOT' + String(i).padStart(6, '0') + 'XYZ', name: 'Bot ' + i, email: 'bot' + i + '@x.test', phone: '', createdAt: BURST, creationSource: 'TEST_FORM', subscribed: true });
for (let i = 0; i < 4; i++) custs.push({ id: 'OLD' + i + 'AAAAAAAA', name: 'Old Lead ' + i, email: '', phone: '+1925555000' + i, createdAt: '2025-03-0' + (i + 1) + 'T10:00:00Z', creationSource: 'DIRECTORY', subscribed: false });
custs.push({ id: 'PAID1AAAAAAAA', name: 'Paid Burst Day', email: 'paid1@x.test', createdAt: BURST, creationSource: 'TEST_FORM', subscribed: true });
custs.push({ id: 'PAID2AAAAAAAA', name: 'Paid Old', email: '', phone: '+19255551234', createdAt: '2024-01-01T10:00:00Z', creationSource: 'APPOINTMENTS', subscribed: false });
custs.push({ id: 'ROSTERAAAAAAA', name: 'In My List', email: 'mine@x.test', createdAt: '2024-05-01T10:00:00Z', creationSource: 'DIRECTORY', subscribed: false });

const deleteBodies = [], clientDeletes = [], adminCalls = [];
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.route('**/api/cloud-status*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }));
await page.route('**/api/admin/**', r => { adminCalls.push(r.request().method() + ' ' + new URL(r.request().url()).pathname); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
await page.route('**/api/admin/square-foreign*', r => { adminCalls.push(r.request().method() + ' /api/admin/square-foreign'); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"foreignIds":[],"foreignCount":0}' }); });
await page.route('**/api/square/customers*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: custs.length, customers: custs, truncated: false }) }));
await page.route('**/api/square/customer-map*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ activeCustomerIds: ['PAID1AAAAAAAA', 'PAID2AAAAAAAA'] }) }));
await page.route('**/api/square/delete-customers', r => {
  const b = JSON.parse(r.request().postData() || '{}'); deleteBodies.push(b.ids || []);
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, deleted: b.ids, deletedCount: b.ids.length, failed: [] }) });
});
await page.route('**/api/clients', r => {
  if (r.request().method() === 'POST') { try { const b = JSON.parse(r.request().postData() || '{}'); if ((b.deletedIds || []).length) clientDeletes.push(b.deletedIds); } catch (e) {} }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"clients":[],"events":[]}' });
});

await page.goto('http://localhost:8899/' + FILE, { waitUntil: 'load' });
await page.waitForTimeout(2600);

// --- founder gating of the row
const rowFor = async (founder) => page.evaluate((f) => { _isFounder = f; nav('account'); return !!Array.from(document.querySelectorAll('[onclick]')).find(e => (e.getAttribute('onclick') || '') === '_openSquarePurge()'); }, founder);
check('row NOT shown to a non-founder', !(await rowFor(false)));
check('row shown in Admin tools for the founder', await rowFor(true));

// Roster: one client added in SlickChart that carries a bot's Square id in squareId, one real client.
await page.evaluate(() => {
  CL['c_pushed'] = { name: 'Bot 7', squareId: 'BOT000007XYZ', email: 'bot7@x.test' };
  CL['c_real'] = { name: 'In My List', email: 'mine@x.test' };
});
await page.evaluate(() => _openSquarePurge());
await page.waitForTimeout(800);
const txt = () => page.evaluate(() => (document.getElementById('sqp') || {}).innerText || '');
const shown = () => page.evaluate(() => (_sqpShownIds || []).slice());

let t = await txt();
check('loads 307 customers', /307 customers/.test(t), t.slice(0, 200));
check('2 booked/paid locked', /2 have booked or paid/.test(t));
let ids = await shown();
check('default view hides the subscribed bots', !ids.some(x => x.startsWith('BOT')), ids.length + ' shown');
check('default view shows the 4 non-subscribers only', ids.length === 4 && ids.every(x => x.startsWith('OLD')), JSON.stringify(ids));
check('roster-matched real client never shown by default', !ids.includes('ROSTERAAAAAAA'));
check('screen explains newsletter signups are hidden as subscribers', /newsletter/i.test(t));

// --- Review ALL
await page.evaluate(() => _sqp_toggleReviewAll());
ids = await shown();
check('Review ALL shows the bots', ids.filter(x => x.startsWith('BOT')).length === 300, ids.length + ' shown');
check('Review ALL never shows a paid client', !ids.includes('PAID1AAAAAAAA') && !ids.includes('PAID2AAAAAAAA'));
t = await txt();
check('unfiltered: warns to narrow before select all', /Narrow the list before selecting all/.test(t));
check('burst day chip offered with its count', /Oct 1, 26 · 300/.test(t), (t.match(/Oct[^\n]*· \d+/) || [''])[0]);

// --- source chip narrows but does not unlock select-all on its own
await page.evaluate(() => _sqp_setSrc('TEST_FORM'));
ids = await shown(); t = await txt();
check('source chip narrows to that source', ids.length === 300 && ids.every(x => x.startsWith('BOT')), ids.length);
check('source alone still says narrow first', /Narrow the list before selecting all/.test(t));
await page.evaluate(() => _sqp_setSrc('TEST_FORM')); // toggle off
ids = await shown();
check('tapping the source again clears it (300 bots + 4 old + the LIST-tagged roster client)', ids.length === 305, ids.length);

// --- search a paid client's name: still not selectable
await page.evaluate(() => { _sqpQuery = 'Paid'; _sqp_render(); });
ids = await shown();
check('searching a paid client finds nothing selectable', ids.length === 0, JSON.stringify(ids));
await page.evaluate(() => { _sqpQuery = ''; _sqp_render(); });

// --- burst day → select all → delete
await page.evaluate(() => _sqp_pickDay('2026-10-01'));
ids = await shown();
check('day pick isolates exactly the 300 bots', ids.length === 300 && ids.every(x => x.startsWith('BOT')), ids.length);
await page.evaluate(() => _sqp_all(1));
check('select all = 300', (await page.evaluate(() => _sqpSel.size)) === 300);
t = await txt();
check('button says Delete 300 from Square', /Delete 300 from Square/.test(t));
await page.evaluate(() => _sqp_confirm());
t = await txt();
check('confirm says Square has no undo', /Square has no undo/.test(t));
check('go button disabled until DELETE typed', await page.evaluate(() => document.getElementById('sqp-go').disabled));
await page.fill('#sqp-confirm', 'delete');
check('typing DELETE enables it', !(await page.evaluate(() => document.getElementById('sqp-go').disabled)));
await page.evaluate(() => _sqp_execute());
await page.waitForTimeout(1200);

const sent = deleteBodies.flat();
check('exactly the 300 bot ids sent to Square', sent.length === 300 && new Set(sent).size === 300 && sent.every(x => x.startsWith('BOT')), sent.length);
check('no paid or roster client ever sent', !sent.some(x => /PAID|ROSTER|OLD/.test(x)));
check('chunks of at most 200', deleteBodies.every(b => b.length <= 200), deleteBodies.map(b => b.length).join(','));
t = await txt();
check('result: 300 deleted from Square', /300 deleted from Square/.test(t), t.slice(0, 160));

const after = await page.evaluate(() => ({ pushed: !!CL['c_pushed'], real: !!CL['c_real'], tomb: !!_deletedClientIds['c_pushed'], tombSq: !!_deletedClientIds[_sqLocalId('BOT000007XYZ')], realTomb: !!_deletedClientIds['c_real'] }));
check('roster client carrying the bot squareId removed', !after.pushed);
check('…and tombstoned, with its sq_ key', after.tomb && after.tombSq);
check('real roster client untouched', after.real && !after.realTomb);
const cd = clientDeletes.flat();
check('server rows dropped in batches, not one request per id', clientDeletes.length <= 4 && cd.includes('c_pushed'), clientDeletes.length + ' requests, ' + cd.length + ' ids');
check('only admin call is the read-only square-foreign GET', adminCalls.length > 0 && adminCalls.every(c => c === 'GET /api/admin/square-foreign'), JSON.stringify(adminCalls));
check('no page errors', errs.length === 0, errs.join(' | '));

await browser.close();
let bad = 0;
for (const r of results) { if (!r.pass) bad++; console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail !== '' ? '  — ' + r.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
