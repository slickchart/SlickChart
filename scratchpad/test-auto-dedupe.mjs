// Duplicate copies of the same Square customer fold themselves away once her list has arrived, with
// nothing lost, nobody wrongly merged, and the survivor never purged. Built from her case: 47 real
// clients + 47 copies from the booking import (Ashley, 2026-10-15).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const acct = {};
for (let i = 0; i < 47; i++) {
  acct['sq_sq' + i] = { name: 'Booker Person' + i, squareId: 'SQ' + i, phone: '(555) 010-00' + String(i).padStart(2, '0'), notes: i % 5 === 0 ? 'Real note ' + i : '', submittedForms: i === 3 ? [{ formId: 'intake', date: 'Oct 1' }] : undefined };
  acct['cdup' + i] = { name: 'Booker Person' + i, squareId: 'SQ' + i, phone: '555010' + '00'.slice(0) + String(i).padStart(2, '0'), source: 'square', treatment: 'New client', skin: '—', _uAt: Date.now() };
}
// a copy that holds something the original lacks: should be carried over, not lost
acct.cdup7.email = 'only-on-copy@x.test';
// two copies with DIFFERENT notes: must be left alone for her
acct.sq_sqx = { name: 'Conflict Case', squareId: 'SQX', notes: 'Allergic to latex' };
acct.cdupx = { name: 'Conflict Case', squareId: 'SQX', notes: 'Prefers mornings' };
// two different people, same name, different Square ids: never merged
acct.sq_sqa = { name: 'Jamie Lee', squareId: 'SQA' }; acct.sq_sqb = { name: 'Jamie Lee', squareId: 'SQB' };
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
const toasts = []; await p.exposeFunction('__toast', t => toasts.push(t));
await p.addInitScript(() => { const iv = setInterval(() => { if (typeof proToast === 'function' && !window.__tw) { window.__tw = 1; const o = proToast; window.proToast = function (m) { try { window.__toast(String(m)); } catch (e) {} return o.apply(this, arguments); }; clearInterval(iv); } }, 5); });
let pushed = null;
await p.route('**/api/**', async r => { const u = r.request().url();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && r.request().method() === 'GET') { await new Promise(z => setTimeout(z, 3000)); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sc_clients: JSON.stringify(acct), sc_hide_sample: '1' } }) }); }
  if (u.includes('/api/store') && r.request().method() !== 'GET') { try { const it = JSON.parse(r.request().postData() || '{}').items || {}; if (it.sc_clients) pushed = it.sc_clients; } catch (e) {} }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(16000);
const st = await p.evaluate(() => { const v = Object.entries(CL); const by = n => v.filter(([, c]) => c.name === n);
  return { bookers: v.filter(([, c]) => /^Booker Person/.test(c.name)).length, b0: by('Booker Person0').map(([k, c]) => [k, c.notes]), b3forms: (by('Booker Person3')[0] || [, {}])[1].submittedForms, b7email: (by('Booker Person7')[0] || [, {}])[1].email,
    conflict: by('Conflict Case').length, jamie: by('Jamie Lee').length, keptIds: v.filter(([, c]) => /^Booker Person/.test(c.name)).every(([k]) => /^sq_/.test(k)), last: localStorage.getItem('sc_dupes_last') }; });
check('47 copies folded away: one record per person', st.bookers === 47, JSON.stringify({ n: st.bookers }));
check('the real record (Square id) is the one kept', st.keptIds);
check('notes on the real record kept', JSON.stringify(st.b0) === '[["sq_sq0","Real note 0"]]', JSON.stringify(st.b0));
check('forms on the real record kept', Array.isArray(st.b3forms) && st.b3forms.length === 1, JSON.stringify(st.b3forms));
check('something only the copy had is carried over', st.b7email === 'only-on-copy@x.test', st.b7email);
check('two copies with different notes are left for her', st.conflict === 2, String(st.conflict));
check('two different people with the same name are never merged', st.jamie === 2, String(st.jamie));
check('no "bookings added" or other alarming toast', !toasts.some(t => /bookings? added|booked online/i.test(t)), toasts.join(' | '));
check('the cleanup reached the account (copies gone from what is pushed)', pushed && !/cdup1"/.test(pushed) && /sq_sq1"/.test(pushed), pushed ? 'pushed ' + (pushed.match(/cdup/g) || []).length + ' copies' : 'nothing pushed');
// survives a relaunch, and nothing is purged afterwards
await p.reload(); await p.waitForTimeout(9000);
const st2 = await p.evaluate(() => ({ bookers: Object.values(CL).filter(c => /^Booker Person/.test(c.name)).length, b0: Object.values(CL).filter(c => c.name === 'Booker Person0').length }));
check('after a relaunch every client is still there, once', st2.bookers === 47 && st2.b0 === 1, JSON.stringify(st2));
// manual merge of two copies of the same Square customer must not make the survivor disappear
const man = await p.evaluate(() => { CL.sq_sqm = { name: 'Manual Merge', squareId: 'SQM' }; CL.cman = { name: 'Manual Merge', squareId: 'SQM', phone: '555' };
  _mergeClientRecords('sq_sqm', 'cman'); _purgeRemovedClients(); return { kept: !!CL.sq_sqm, phone: CL.sq_sqm && CL.sq_sqm.phone, copy: !!CL.cman }; });
check('Review & merge of two copies keeps the survivor (was purged before)', man.kept && !man.copy && man.phone === '555', JSON.stringify(man));
check('no page errors', !errs.length, errs.join(' | '));
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 220) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
