// "Combine into one <name>" (2026-10-13): the last few real records of one person. The missing ones
// go back into her list in one call, land on this device, and the app's Merge sheet opens with all
// of them ticked and the in-list record kept. Another account's list is never touched on this device.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function run(loginEmail) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
  await page.addInitScript(e => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_login_email', e); } catch (x) {} }, loginEmail);
  let posted = null;
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
  await page.route('**/api/admin/client-recover*', r => { if (r.request().method() === 'POST') { posted = JSON.parse(r.request().postData() || '{}'); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"addedToRoster":2}' }); } return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }); });
  await page.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    CL.keepme = { name: 'Cooper Howard', email: 'c@x.test' }; CL.other = { name: 'Cooper Howard' };
    _recoverState = { ok: true, provider: { email: 'ashley@x.test' }, nestedUnder: {}, counts: {}, ghosts: [], typed: {}, history: [], kv: {}, deletedRecordIds: [], libraries: {},
      clients: [{ id: 'keepme', name: 'Cooper Howard', deleted: false, has: { forms: 1, profileFilled: 2 } }, { id: 'other', name: 'Cooper Howard', deleted: false, has: {} },
                { id: 'sub9', name: 'Cooper Howard', deleted: false, has: {} }, { id: 'sub1', name: 'Cooper Howard', deleted: false, has: {} }],
      missingFromRoster: [{ id: 'sub9', name: 'Cooper Howard' }, { id: 'sub1', name: 'Cooper Howard' }], junk: null };
    _recQ = 'cooper howard'; nav('client-recover'); renderClientRecover();
  });
  await page.waitForTimeout(300);
  const has = await page.evaluate(() => /Combine into one Cooper Howard/.test(document.getElementById('S').innerText));
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#S button')).find(x => /Combine into one/.test(x.textContent)); b.click(); });
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => ({ cl: Object.keys(CL).filter(k => /Cooper/.test((CL[k] || {}).name || '')), sheet: !!document.getElementById('merge-sheet'), keep: window._mergeKeep, group: window._mergeGroupIds }));
  await page.close();
  return { has, posted, st, errs };
}
let r = await run('ashley@x.test');
check('button offered for a few real records', r.has);
check('only the two missing ones are put back', r.posted && JSON.stringify(r.posted.onlyIds) === '["sub9","sub1"]', JSON.stringify(r.posted));
check('all four on this device', ['keepme', 'other', 'sub9', 'sub1'].every(k => r.st.cl.includes(k)), JSON.stringify(r.st.cl));
check('merge sheet opens with all four, keeping the in-list one', r.st.sheet && r.st.keep === 'keepme' && r.st.group.length === 4, JSON.stringify(r.st));
check('no page errors', r.errs.length === 0, r.errs.join(' | '));
r = await run('someone.else@x.test');
check('signed in as another account: nothing added on this device, no sheet', !r.st.cl.includes('sub9') && !r.st.sheet, JSON.stringify(r.st));
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail !== '' ? '  — ' + x.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
