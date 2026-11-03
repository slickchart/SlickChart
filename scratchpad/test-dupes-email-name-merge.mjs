// Same person twice, hand-added (no Square id) and from Square: same name AND same email.
// Ashley chose to merge these on 2026-11-03. The automatic merge must:
//  - fold the hand-added copy into the sq_ record, carrying notes/forms/messages/appointments
//  - leave a pair whose fields CLASH for her (Merge Duplicates)
//  - leave a group with TWO Square copies alone
//  - never touch: different name same email (family), same name different email, a removed copy,
//    an animal, a copy that already has a different Square id
//  - tell the server (merge pairs) and the device report (counts + field names only, no names)
// Run: node scratchpad/test-dupes-email-name-merge.mjs   (local server on :8899 serving slickchart-vercel/)
// CONTROL=1 removes the new pass and MUST fail.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const T = Date.now();
const acct = {
  // 1. the common case: merges
  sq_A: { name: 'Amy Pond', email: 'amy@x.com', squareId: 'A', phone: '5550000001' },
  hA: { name: 'amy  pond', email: 'AMY@x.com ', notes: 'Sensitive to retinol', phone: '(555) 000-0001', submittedForms: [{ formId: 'f1', date: 'Sep 1', title: 'Intake' }] },
  // 2. clash: different allergies text -> left for her
  sq_B: { name: 'Bea Lee', email: 'bea@x.com', squareId: 'B', allergies: 'None' },
  hB: { name: 'Bea Lee', email: 'bea@x.com', allergies: 'Latex' },
  // 3. two Square copies + one hand-added -> left alone
  sq_C1: { name: 'Cat Doe', email: 'cat@x.com', squareId: 'C1' },
  sq_C2: { name: 'Cat Doe', email: 'cat@x.com', squareId: 'C2' },
  hC: { name: 'Cat Doe', email: 'cat@x.com' },
  // 4. family: same email, different name -> untouched
  sq_D: { name: 'Dana Fox', email: 'fox@x.com', squareId: 'D' },
  hD: { name: 'Dory Fox', email: 'fox@x.com' },
  // 5. same name, different email -> untouched
  sq_E: { name: 'Eve Gray', email: 'eve1@x.com', squareId: 'E' },
  hE: { name: 'Eve Gray', email: 'eve2@x.com' },
  // 6. hand-added copy is REMOVED -> untouched
  sq_F: { name: 'Fay Hart', email: 'fay@x.com', squareId: 'F' },
  hF: { name: 'Fay Hart', email: 'fay@x.com' },
  // 7. no email at all -> untouched
  sq_G: { name: 'Gia Ivy', squareId: 'G' },
  hG: { name: 'Gia Ivy' },
  // 8. two hand-added copies + one Square -> both fold in
  sq_H: { name: 'Hal Jay', email: 'hal@x.com', squareId: 'H' },
  hH1: { name: 'Hal Jay', email: 'hal@x.com', notes: 'Likes mint' },
  hH2: { name: 'Hal Jay', email: 'hal@x.com', dob: '1990-01-01' },
  // 9. the client opened both links -> left for her
  sq_J: { name: 'Jo Kim', email: 'jo@x.com', squareId: 'J', appJoined: true },
  hJ: { name: 'Jo Kim', email: 'jo@x.com', appJoined: true },
  // 10. only the hand-added link was opened -> merges (the server hands that link to the survivor)
  sq_K: { name: 'Kit Lu', email: 'kit@x.com', squareId: 'K' },
  hK: { name: 'Kit Lu', email: 'kit@x.com', appJoined: true },
};
const data = {
  sc_clients: JSON.stringify(acct), sc_hide_sample: '1',
  sc_deleted_clients: JSON.stringify({ hF: T - 1e6 }),
  sc_msgstore: JSON.stringify({ hA: [{ from: 'client', text: 'hi from hand copy', ts: T - 5000, time: '1m' }] }),
  sc_manual_appts: JSON.stringify([{ id: 'ma_A', clientId: 'hA', client: 'Amy Pond', tx: 'Facial', date: '2026-11-20', time: '10:00', _ts: T }]),
};
const SRC = process.env.CONTROL ? 'slickchart-control.html' : 'slickchart.html';
if (process.env.CONTROL) {
  let s = fs.readFileSync('slickchart-vercel/slickchart.html', 'utf8');
  const a = s.indexOf('    const _dl=(typeof _deletedClientIds'); const z = s.indexOf('    }finally{', a);
  s = s.slice(0, a) + s.slice(z); fs.writeFileSync('slickchart-vercel/' + SRC, s);
}
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
const pushed = {}; const merges = []; const reports = [];
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') { await new Promise(z => setTimeout(z, 1500)); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) }); }
  if (u.includes('/api/store') && m !== 'GET') { try { Object.assign(pushed, JSON.parse(r.request().postData() || '{}').items || {}); } catch (e) {} }
  if (u.includes('/api/clients') && m === 'POST') { try { const j = JSON.parse(r.request().postData() || '{}'); (j.merged || []).forEach(x => merges.push(x)); } catch (e) {} }
  if (u.includes('/api/device-report')) { try { reports.push(JSON.parse(r.request().postData() || '{}').report); } catch (e) {} }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/' + SRC); await p.waitForTimeout(16000);
await p.evaluate(() => { try { _devRepAt = 0; } catch (e) {} return _sendDeviceReport(); });
await p.waitForTimeout(800);
const st = await p.evaluate(() => ({
  ids: Object.keys(CL).sort(), A: CL.sq_A, H: CL.sq_H, K: CL.sq_K, last: JSON.parse(localStorage.getItem('sc_dupes_last') || 'null'),
  msgs: (msgStore.sq_A || []).map(m => m.text), msgsDrop: (msgStore.hA || []).length,
  appt: (manualAppts || []).filter(a => a.id === 'ma_A').map(a => a.clientId),
  deleted: Object.keys(_deletedClientIds || {}).sort(), into: Object.assign({}, _mergedInto || {}),
  sqMerged: Object.keys(mergedSquareIds || {}),
}));
console.log(JSON.stringify({ ids: st.ids, last: st.last, deleted: st.deleted, merges, report: reports[reports.length - 1] }, null, 1));
check('hand-added Amy folded into sq_A', !st.ids.includes('hA') && st.ids.includes('sq_A'));
check('her note on the hand-added copy survives on sq_A', st.A && st.A.notes === 'Sensitive to retinol', st.A && st.A.notes);
check('forms from the hand-added copy carried', st.A && (st.A.submittedForms || []).some(f => f.formId === 'f1'));
check('Square name/email kept on survivor', st.A && st.A.name === 'Amy Pond' && st.A.squareId === 'A');
check('messages carried onto sq_A', st.msgs.includes('hi from hand copy') && !st.msgsDrop, JSON.stringify(st.msgs));
check('appointment re-pointed to sq_A', st.appt[0] === 'sq_A', JSON.stringify(st.appt));
check('both hand-added Hal copies folded, both fields kept', !st.ids.includes('hH1') && !st.ids.includes('hH2') && st.H && st.H.notes === 'Likes mint' && st.H.dob === '1990-01-01');
check('client used both links: left for her', st.ids.includes('hJ') && st.ids.includes('sq_J'));
check('only the hand-added link used: merged, survivor marked as having the app', !st.ids.includes('hK') && st.K && st.K.appJoined === true);
check('clashing Bea pair left for her', st.ids.includes('hB') && st.ids.includes('sq_B'));
check('two-Square Cat group untouched', ['sq_C1', 'sq_C2', 'hC'].every(x => st.ids.includes(x)));
check('family (same email, different name) untouched', st.ids.includes('hD') && st.ids.includes('sq_D'));
check('same name, different email untouched', st.ids.includes('hE') && st.ids.includes('sq_E'));
check('removed copy not merged (still removed, survivor untouched)', st.ids.includes('sq_F') && !st.into.hF);
check('no email: untouched', st.ids.includes('hG') && st.ids.includes('sq_G'));
check('survivors never marked merged-away in Square', !st.sqMerged.some(x => ['sq_A', 'sq_H', 'A', 'H'].includes(x)), JSON.stringify(st.sqMerged));
check('dropped copies are on the delete record and routed to the survivor', ['hA', 'hH1', 'hH2'].every(x => st.deleted.includes(x)) && st.into.hA === 'sq_A' && st.into.hH1 === 'sq_H');
check('device report says merged 4, left 2 (allergies, both links used), no names', (() => { const r = reports[reports.length - 1] || {}; return r.dupesMerged === 4 && r.dupesLeft === 2 && /allergies 1/.test(r.dupesWhy || '') && /both links used 1/.test(r.dupesWhy || '') && !/Bea|Lee/.test(JSON.stringify(r)); })(), JSON.stringify(reports[reports.length - 1] || {}).slice(0, 300));
check('account client list pushed without the dropped copies', (() => { try { const o = JSON.parse(pushed.sc_clients || 'null'); return o && !o.hA && !o.hH1 && o.sq_A && o.sq_A.notes === 'Sensitive to retinol'; } catch (e) { return false; } })());
check('server told to move the dropped copies onto the survivors', ['hA>sq_A','hH1>sq_H','hH2>sq_H','hK>sq_K'].every(k => merges.some(m => m.from + '>' + m.to === k)) && merges.length === 4, JSON.stringify(merges));
check('no page errors', !errs.length, errs.join(' | ').slice(0, 300));
await b.close();
if (process.env.CONTROL) fs.unlinkSync('slickchart-vercel/' + SRC);
let ok = true; for (const r of results) { console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)); ok = ok && r.pass; }
console.log(ok ? 'ALL PASS' : 'FAILURES'); process.exit(ok ? 0 : 1);
