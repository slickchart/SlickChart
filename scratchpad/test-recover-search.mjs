// Recover clients screen search (2026-10-13): one box filters every list by name, lists each record
// with where it stands and what is filed under its id, offers "Put back" for one missing from the
// list (narrowed to that id), and the "never in their list" group can no longer be ticked.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
let posted = null;
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.route('**/api/admin/client-recover*', r => {
  if (r.request().method() === 'POST') { posted = JSON.parse(r.request().postData() || '{}'); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"addedToRoster":1,"clients":[{"id":"coop1","name":"Cooper Howard"}]}' }); }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' });
});
await page.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await page.waitForTimeout(2500);
const many = Array.from({ length: 900 }, (_, i) => ({ id: 'j' + i, name: 'Junk ' + i, deleted: false, has: {} }));
await page.evaluate(m => {
  _recoverState = { ok: true, provider: { email: 'a@b.c' },
    clients: m.concat([{ id: 'coop1', name: 'Cooper Howard', deleted: false, has: {} }, { id: 'coop2', name: 'Cooper Howard', deleted: false, has: {} }, { id: 'real', name: 'Real One', deleted: false, has: { summaries: 1 } }]).concat(Array.from({ length: 10 }, (_, i) => ({ id: 'cx' + i, name: 'Cooper Howard', deleted: false, has: {} }))),
    nestedUnder: {}, counts: { rosterIds: 1 }, ghosts: [], typed: {}, history: [], kv: {}, deletedRecordIds: [],
    missingFromRoster: m.map(x => ({ id: x.id, name: x.name })).concat([{ id: 'coop1', name: 'Cooper Howard' }, { id: 'coop2', name: 'Cooper Howard' }]),
    libraries: { sc_session_summaries: { onServer: true, clients: 1, entries: 3, bytes: 900, byClient: { coop1: 3 } } },
    junk: { removed: [], deleted: [], stranger: [{ id: 'coop2', name: 'Cooper Howard', holds: [] }, { id: 'j1', name: 'Junk 1', holds: [] }], kept: [], keptTotal: 0, rosterReadable: true, squareCounts: { removed: 0, deleted: 0, stranger: 0 } } };
  _recoverPick = {}; _recQ = ''; nav('client-recover');
  try { renderClientRecover(); } catch (e) { window.__err = String(e); }
}, many);
await page.waitForTimeout(300);
check('search box is on the screen', await page.evaluate(() => !!document.getElementById('rec-q')));
check('the never-in-list group cannot be ticked', await page.evaluate(() => { const b = document.getElementById('pg-stranger'); return !!b && b.disabled && !b.checked; }));
await page.fill('#rec-q', 'cooper');
await page.waitForTimeout(700);
const t = await page.evaluate(() => document.getElementById('S').innerText);
check('results say 12 records named like cooper', /12 records named like “cooper”/.test(t), (t.match(/\d+ records? named[^\n]*/) || [''])[0]);
check('the one with summaries says so', /saved under this id: 3 summaries/.test(t));
check('both say NOT in their list', (t.match(/NOT in their list/g) || []).length >= 2);
check('lists below are filtered: no junk names shown', !/Junk 5/.test(t), (t.match(/Junk \d+/) || [''])[0]);
check('focus stays in the search box', await page.evaluate(() => document.activeElement && document.activeElement.id === 'rec-q'));
check('one Fix button for the name', /Fix Cooper Howard/.test(t));
await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#S button')).find(x => /Put back in their list/.test(x.textContent)); b.click(); });
await page.waitForTimeout(200);
await page.evaluate(() => { const ms = document.querySelectorAll('#confirm-modal'); const m = ms[ms.length - 1]; const b = Array.from(m.querySelectorAll('button')).find(x => /Put back/.test(x.textContent)); b.click(); });
await page.waitForTimeout(600);
check('put back sends only that id', posted && posted.repairRoster === true && JSON.stringify(posted.onlyIds) === '["coop1"]', JSON.stringify(posted));
posted = null;
await page.evaluate(() => { document.querySelectorAll('#confirm-modal').forEach(m => m.remove()); const b = Array.from(document.querySelectorAll('#S button')).find(x => /Fix Cooper Howard/.test(x.textContent)); b.click(); });
await page.waitForTimeout(600);
check('Fix sends the name with removed records included, never ids', posted && posted.consolidateName === 'Cooper Howard' && posted.includeRemoved === true && !posted.onlyIds, JSON.stringify(posted));
check('no page errors', errs.length === 0 && !(await page.evaluate(() => window.__err)), errs.join(' | '));
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail !== '' ? '  — ' + x.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
