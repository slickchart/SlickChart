// Does an AUTOMATIC duplicate merge (_autoMergeSquareDuplicates -> _mergeClientRecords) carry
// EVERYTHING keyed by the dropped client's id onto the survivor?
// Pair 1 (SQ1): the copy "cdup1" holds data in every per-client store; the canonical "sq_sq1" is kept.
// Pair 2 (SQ2): BOTH records hold a virtual-consult submission (the real {photos:[..]} object shape),
//               and the copy also has messages + a check-in queued after vcSubmissions in
//               _mergeSideStores, to show the throw aborts the rest of the carry.
// Run: node scratchpad/sweep-dup-carry-stores.mjs   (local server on :8899 serving slickchart-vercel/)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const T = Date.now();
const acct = {
  sq_sq1: { name: 'Carry Keep', squareId: 'SQ1', phone: '5550100001',
    summaries: [{ _draftDate: '2026-09-01', ts: T - 9e8, date: 'Sep 1', title: 'Keep visit', note: 'k' }] },
  cdup1: { name: 'Carry Keep', squareId: 'SQ1', phone: '5550100001', source: 'square', _uAt: T,
    summaries: [{ _draftDate: '2026-10-01', ts: T - 1e8, date: 'Oct 1', title: 'Copy visit', note: 'd' }] },
  sq_sq2: { name: 'Vc Keep', squareId: 'SQ2' },
  cdup2: { name: 'Vc Keep', squareId: 'SQ2', source: 'square', _uAt: T },
};
const vcObj = (lbl) => ({ photos: [{ label: lbl, src: 'data:image/png;base64,AAAA' }], goals: 'g-' + lbl, date: 'Oct 2', kind: 'skin' });
const sent = { name: 'Copy routine', items: ['a'], products: [], date: 'Oct 1', ts: T };
const data = {
  sc_clients: JSON.stringify(acct), sc_hide_sample: '1',
  sc_body_maps: JSON.stringify({ cdup1: { side: 'front', pin: { x: 1, y: 2 }, area: 'Left cheek', ts: T } }),
  sc_summary_guides: JSON.stringify({ cdup1: [{ kind: 'guide', id: 'g_copy' }] }),
  sc_summary_guide_optout: JSON.stringify({ cdup1: ['g_auto'] }),
  sc_sent_routines: JSON.stringify({ esty: { cdup1: sent }, hair: { cdup1: sent }, brow: { cdup1: sent }, barber: { cdup1: sent } }),
  sc_summary_drafts: JSON.stringify({ note: { cdup1: 'half-typed note on the copy' }, obs: {}, _ts: { note: { cdup1: T }, obs: {} } }),
  sc_pro_vc_subs: JSON.stringify({ cdup1: vcObj('copy1'), sq_sq2: vcObj('keep2'), cdup2: vcObj('copy2') }),
  sc_manual_appts: JSON.stringify([{ id: 'ma_copy1', clientId: 'cdup1', client: 'Carry Keep', tx: 'Facial', date: '2026-10-20', time: '10:00', _ts: T }]),
  sc_reminders: JSON.stringify([{ id: 'rm_copy1', clientId: 'cdup1', text: 'Call about peel', due: '2026-10-20', done: 0, off: 0 }]),
  sc_msgstore: JSON.stringify({ cdup2: [{ from: 'client', text: 'hi from copy2', ts: T - 5000, time: '1m' }] }),
  sc_checkins: JSON.stringify([{ id: 'ci_copy2', clientId: 'cdup2', client: 'Vc Keep', ts: T - 4000 }]),
};
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
const pushed = {};
await p.route('**/api/**', async r => { const u = r.request().url();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && r.request().method() === 'GET') { await new Promise(z => setTimeout(z, 1500)); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) }); }
  if (u.includes('/api/store') && r.request().method() !== 'GET') { try { const it = JSON.parse(r.request().postData() || '{}').items || {}; Object.assign(pushed, it); } catch (e) {} }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(16000);
const st = await p.evaluate(() => {
  const g = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  return {
    merged: !CL.cdup1 && !!CL.sq_sq1, merged2: !CL.cdup2 && !!CL.sq_sq2, last: localStorage.getItem('sc_dupes_last'),
    summaries: (CL.sq_sq1 && CL.sq_sq1.summaries || []).map(s => s.title),
    bodyKeep: !!(typeof bodyMaps !== 'undefined' && bodyMaps.sq_sq1), bodyDrop: !!(typeof bodyMaps !== 'undefined' && bodyMaps.cdup1),
    guidesKeep: (summaryGuides.sq_sq1 || []).map(x => x.id), guidesDrop: (summaryGuides.cdup1 || []).map(x => x.id),
    optKeep: summaryGuideOptOut.sq_sq1 || null, optDrop: summaryGuideOptOut.cdup1 || null,
    sentKeep: !!currentSentRoutines().sq_sq1, sentDrop: !!currentSentRoutines().cdup1,
    draftKeepMem: summaryNoteDraft.sq_sq1 || null, draftKeepDisk: ((g('sc_summary_drafts') || {}).note || {}).sq_sq1 || null,
    draftDropDisk: ((g('sc_summary_drafts') || {}).note || {}).cdup1 || null,
    vc1: vcSubmissions.sq_sq1, vc1IsArray: Array.isArray(vcSubmissions.sq_sq1), vc1Photos: vcSubmissions.sq_sq1 && vcSubmissions.sq_sq1.photos ? vcSubmissions.sq_sq1.photos.length : 0,
    vc2: vcSubmissions.sq_sq2, vc2Drop: !!vcSubmissions.cdup2,
    msgs2Keep: (msgStore.sq_sq2 || []).map(m => m.text), msgs2Drop: (msgStore.cdup2 || []).length,
    ci2: (checkins || []).filter(c => c && c.id === 'ci_copy2').map(c => c.clientId),
    appt: (manualAppts || []).filter(a => a.id === 'ma_copy1').map(a => a.clientId),
    rem: (reminders || []).filter(r => r.id === 'rm_copy1').map(r => r.clientId),
  };
});
console.log(JSON.stringify(st, null, 1));
check('auto-merge folded both pairs', st.merged && st.merged2, st.last);
check('client-facing c.summaries from the copy carried onto the survivor', st.summaries.includes('Copy visit') && st.summaries.includes('Keep visit'), JSON.stringify(st.summaries));
check('sc_body_maps entry re-keyed to the survivor', st.bodyKeep && !st.bodyDrop, JSON.stringify({ keep: st.bodyKeep, drop: st.bodyDrop }));
check('sc_summary_guides entry re-keyed', st.guidesKeep.includes('g_copy') && !st.guidesDrop.length, JSON.stringify(st.guidesKeep));
check('sc_summary_guide_optout entry re-keyed', !!st.optKeep && !st.optDrop, JSON.stringify({ k: st.optKeep, d: st.optDrop }));
check('sc_sent_routines entry re-keyed', st.sentKeep && !st.sentDrop, JSON.stringify({ k: st.sentKeep, d: st.sentDrop }));
check('summary note draft re-keyed AND persisted to disk', st.draftKeepDisk && !st.draftDropDisk, JSON.stringify({ mem: st.draftKeepMem, disk: st.draftKeepDisk, dropDisk: st.draftDropDisk }));
check('consult (copy only) keeps its {photos} object shape on the survivor', !st.vc1IsArray && st.vc1Photos === 1, JSON.stringify(st.vc1).slice(0, 120));
check('consult on BOTH: side-store carry completes (copy consult folded, not left under the dropped id)', st.vc2 && !Array.isArray(st.vc2) && !st.vc2Drop, JSON.stringify({ keep: st.vc2 && st.vc2.goals, dropLeft: st.vc2Drop }));
check('messages after a both-sides consult still carried (no abort)', st.msgs2Keep.includes('hi from copy2') && !st.msgs2Drop, JSON.stringify({ k: st.msgs2Keep, d: st.msgs2Drop }));
check('manual appointment clientId re-pointed', st.appt[0] === 'sq_sq1', JSON.stringify(st.appt));
check('reminder clientId re-pointed', st.rem[0] === 'sq_sq1', JSON.stringify(st.rem));
// What reached the account
const pj = k => { try { return JSON.parse(pushed[k] || 'null'); } catch (e) { return null; } };
check('account sc_body_maps holds the placement under the survivor', !!(pj('sc_body_maps') || {}).sq_sq1, pushed.sc_body_maps ? pushed.sc_body_maps.slice(0, 120) : 'never pushed');
check('account sc_summary_drafts holds the draft under the survivor', !!(((pj('sc_summary_drafts') || {}).note) || {}).sq_sq1, pushed.sc_summary_drafts ? pushed.sc_summary_drafts.slice(0, 160) : 'never pushed');
const ws = pj('sc_workspace');
check('sc_workspace pushed after the merge (stale compound copy refreshed)', !!ws, ws ? 'pushed' : 'never pushed');
check('no page errors', !errs.length, errs.join(' | '));
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 220) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
