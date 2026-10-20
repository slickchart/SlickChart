// Ashley 2026-10-20: "my client Cooper Howard keeps getting lost from client list". He was live on the
// server and on the account's delete record, next to sample clients she did delete. Bring back ONE.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_login_email', 'a@b.c'); localStorage.setItem('sc_deleted_clients', JSON.stringify({ coop1: 1, maya: 1 })); } catch (e) {} });
const posts = [];
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.route('**/api/admin/client-recover*', r => {
  if (r.request().method() === 'POST') { const j = JSON.parse(r.request().postData() || '{}'); posts.push(j); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j.unDeleteIds ? { ok: true, unDeleted: j.unDeleteIds.length } : { ok: true, addedToRoster: 1, clients: [] }) }); }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' });
});
await page.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  _recoverState = { ok: true, provider: { email: 'a@b.c' }, clients: [{ id: 'coop1', name: 'Cooper Howard', deleted: false, has: {} }, { id: 'maya', name: 'Maya Rodriguez', deleted: false, has: {} }],
    nestedUnder: {}, counts: { rosterIds: 1 }, ghosts: [{ id: 'coop1', name: 'Cooper Howard' }, { id: 'maya', name: 'Maya Rodriguez' }], typed: {}, history: [], kv: {}, deletedRecordIds: [], missingFromRoster: [],
    libraries: {}, junk: { removed: [], deleted: [], stranger: [], kept: [], keptTotal: 0, rosterReadable: true, squareCounts: { removed: 0, deleted: 0, stranger: 0 } } };
  _recoverPick = {}; _recQ = ''; nav('client-recover'); renderClientRecover();
});
await page.waitForTimeout(300);
check('each client being deleted again has its own Bring back', await page.locator('button.rec-unghost').count() === 2);
await page.evaluate(() => document.querySelector('button.rec-unghost').click()); await page.waitForTimeout(200);
await page.evaluate(() => { const ms = document.querySelectorAll('#confirm-modal'); const m = ms[ms.length - 1]; Array.from(m.querySelectorAll('button')).find(x => /Bring back/.test(x.textContent)).click(); });
await page.waitForTimeout(800);
const un = posts.find(p => p.unDeleteIds), rr = posts.find(p => p.repairRoster);
check('only Cooper comes off the delete record', un && JSON.stringify(un.unDeleteIds) === '["coop1"]', JSON.stringify(posts));
check('and he is added to her list (adds only, that id)', rr && JSON.stringify(rr.onlyIds) === '["coop1"]', JSON.stringify(rr));
const loc = await page.evaluate(() => ({ del: Object.keys(_deletedClientIds), un: Object.keys(JSON.parse(localStorage.getItem('sc_undeleted_clients') || '{}')) }));
check('this device stops deleting him too; Maya stays deleted', !loc.del.includes('coop1') && loc.del.includes('maya') && loc.un.includes('coop1'), JSON.stringify(loc));
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail !== '' ? '  — ' + x.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
