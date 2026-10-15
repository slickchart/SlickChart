// Part 2 of the duplicate-carry sweep.
// (a) What _mergeClientRecords DOES carry (product plan, homecare, reasons, visit summaries, photos,
//     healing stage, messages, threads, payments) — confirmed onto the survivor AND pushed.
// (b) What happens to an entry it does NOT carry (sc_body_maps / sc_summary_guides) after a relaunch:
//     the dropped id is now on sc_deleted_clients, so _mergeClientMap's _goneClientIds prunes it
//     from both sides — the copy's entry is destroyed on the device AND on the account.
// The fake account here is LIVE: every push is written into it, and the relaunch pulls it back.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const T = Date.now();
const account = {
  sc_hide_sample: '1',
  sc_clients: JSON.stringify({
    sq_sq3: { name: 'Sound Keep', squareId: 'SQ3' },
    cdup3: { name: 'Sound Keep', squareId: 'SQ3', source: 'square', _uAt: T },
  }),
  sc_client_recs: JSON.stringify({ sq_sq3: ['p_keep'], cdup3: ['p_copy'] }),
  sc_client_homecare: JSON.stringify({ cdup3: ['SPF daily'] }),
  sc_rec_reasons: JSON.stringify({ cdup3: { p_copy: 'because copy' } }),
  sc_session_summaries: JSON.stringify({ sq_sq3: [{ ts: T - 9e8, date: 'Sep 1', _draftDate: '2026-09-01' }], cdup3: [{ ts: T - 1e8, date: 'Oct 1', _draftDate: '2026-10-01' }] }),
  sc_healing_stage: JSON.stringify({ cdup3: 2 }),
  sc_msgstore: JSON.stringify({ cdup3: [{ from: 'client', text: 'copy msg', ts: T - 1000, time: '1m' }] }),
  sc_threads: JSON.stringify([{ id: 'cdup3', name: 'Sound Keep', last: 'copy msg', ts: T - 1000 }]),
  sc_payments: JSON.stringify([{ id: 'pay_copy3', clientId: 'cdup3', clientName: 'Sound Keep', amount: 50, status: 'paid', date: '2026-10-01', _ts: T }]),
  sc_body_maps: JSON.stringify({ cdup3: { side: 'front', pin: { x: 1, y: 2 }, area: 'Left cheek', ts: T } }),
  sc_summary_guides: JSON.stringify({ cdup3: [{ kind: 'guide', id: 'g_copy' }] }),
};
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
await p.route('**/api/**', async r => { const u = r.request().url();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && r.request().method() === 'GET') { await new Promise(z => setTimeout(z, 1500)); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: account }) }); }
  if (u.includes('/api/store') && r.request().method() !== 'GET') { try { const it = JSON.parse(r.request().postData() || '{}').items || {}; Object.assign(account, it); } catch (e) {} }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(16000);
// Photos are device-only (IndexedDB) so seed them in memory and merge by hand on a second pair.
const ph = await p.evaluate(() => {
  CL.sq_sq9 = { name: 'Photo Keep', squareId: 'SQ9' }; CL.cdup9 = { name: 'Photo Keep', squareId: 'SQ9' };
  capturedPhotos.cdup9 = [{ pid: 'ph_copy9', url: 'data:image/png;base64,AAAA', ts: 1, phase: 'before' }];
  _mergeClientRecords('sq_sq9', 'cdup9');
  return new Promise(z => setTimeout(z, 1500)).then(() => ({ keep: (capturedPhotos.sq_sq9 || []).map(x => x.pid), drop: !!capturedPhotos.cdup9, idx: (JSON.parse(localStorage.getItem('sc_photo_index') || '{}').sq_sq9 || []).map(x => x.pid) }));
});
const st = await p.evaluate(() => ({
  merged: !CL.cdup3 && !!CL.sq_sq3,
  recs: clientRecs.sq_sq3, home: clientHomecare.sq_sq3, reasons: recReasons.sq_sq3, summ: (sessionSummaries.sq_sq3 || []).map(s => s.date),
  heal: clientHealingStage.sq_sq3, msgs: (msgStore.sq_sq3 || []).map(m => m.text), thr: threads.filter(t => t && (t.id === 'sq_sq3' || t.id === 'cdup3')).map(t => t.id),
  pay: (_payments || []).filter(x => x.id === 'pay_copy3').map(x => x.clientId),
}));
const A = k => { try { return JSON.parse(account[k] || 'null'); } catch (e) { return null; } };
check('auto-merge ran', st.merged);
check('product plan unioned onto survivor + on account', JSON.stringify(st.recs) === '["p_keep","p_copy"]' && JSON.stringify((A('sc_client_recs') || {}).sq_sq3) === '["p_keep","p_copy"]', JSON.stringify([st.recs, (A('sc_client_recs') || {}).sq_sq3]));
check('homecare carried + on account', JSON.stringify(st.home) === '["SPF daily"]' && !!(A('sc_client_homecare') || {}).sq_sq3, JSON.stringify(st.home));
check('rec reasons carried + on account', st.reasons && st.reasons.p_copy && !!(A('sc_rec_reasons') || {}).sq_sq3, JSON.stringify(st.reasons));
check('provider-side session summaries concatenated + on account', st.summ.length === 2 && ((A('sc_session_summaries') || {}).sq_sq3 || []).length === 2, JSON.stringify(st.summ));
check('healing stage carried', st.heal === 2, String(st.heal));
check('messages carried', st.msgs.includes('copy msg'), JSON.stringify(st.msgs));
check('thread re-pointed', JSON.stringify(st.thr) === '["sq_sq3"]', JSON.stringify(st.thr));
check('payment re-pointed + on account', st.pay[0] === 'sq_sq3' && (A('sc_payments') || []).some(x => x.id === 'pay_copy3' && x.clientId === 'sq_sq3'), JSON.stringify(st.pay));
check('photos carried + photo index re-derived under survivor', JSON.stringify(ph.keep) === '["ph_copy9"]' && !ph.drop && ph.idx.includes('ph_copy9'), JSON.stringify(ph));
// relaunch against the live account
await p.reload(); await p.waitForTimeout(14000);
const r2 = await p.evaluate(() => ({ bmKeep: !!bodyMaps.sq_sq3, bmDrop: !!bodyMaps.cdup3, sgKeep: !!summaryGuides.sq_sq3, sgDrop: !!summaryGuides.cdup3, recs: clientRecs.sq_sq3 }));
const bmAcct = A('sc_body_maps') || {}; const sgAcct = A('sc_summary_guides') || {};
check('after relaunch: product plan still unioned', JSON.stringify(r2.recs) === '["p_keep","p_copy"]', JSON.stringify(r2.recs));
check('after relaunch: the copy\'s body-map placement still exists somewhere (device or account)', r2.bmKeep || r2.bmDrop || bmAcct.sq_sq3 || bmAcct.cdup3, JSON.stringify({ dev: r2, acct: Object.keys(bmAcct) }));
check('after relaunch: the copy\'s summary guides still exist somewhere', r2.sgKeep || r2.sgDrop || sgAcct.sq_sq3 || sgAcct.cdup3, JSON.stringify({ acct: Object.keys(sgAcct) }));
check('no page errors', !errs.length, errs.join(' | '));
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 240) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
