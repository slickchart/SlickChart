// Provider app, end to end with mocked server:
//  A) client submits a form (flagged contraindication) -> chart, pending cleared, notif, flag
//  B) provider re-sends the same form -> payload to client carries a NEW assignedAt
//  C) guide re-send: does the payload carry anything that lets the client tell it is a re-send?
//  D) booking request -> suggest -> client accepts (new request) -> confirm -> client blob
//   node scratchpad/sweep3-forms-provider-flow.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; const check = (n, p, d) => results.push({ n, p: !!p, d: d === undefined ? '' : (typeof d === 'string' ? d : JSON.stringify(d)) });
const day = new Date(Date.now() + 9 * 86400000); const ymd = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
const srv = { kv: { sc_hide_sample: '1', sc_onboarded: '1', sc_clients: JSON.stringify({ c1: { id: 'c1', name: 'Dana Client', email: 'd@x.com', _token: 't_c1', pendingForms: [{ formId: 'intake', assignedAt: 1000 }] } }) }, events: [], posts: [] };
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); localStorage.setItem('sc_cloud_seeded', '1'); });
await p.route('**/api/**', async r => {
  const u = r.request().url(), m = r.request().method();
  const ok = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (u.includes('cloud-status')) return ok({ enabled: true });
  if (u.includes('/api/store')) {
    if (m === 'GET') return ok({ data: Object.assign({}, srv.kv) });
    let bd = {}; try { bd = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    Object.entries(bd.items || {}).forEach(([k, v]) => { srv.kv[k] = v == null ? null : String(v); });
    return ok({ ok: true });
  }
  if (u.includes('/api/clients')) {
    if (m === 'GET') return ok({ ok: true, clients: [{ id: 'c1', name: 'Dana Client', email: 'd@x.com', token: 't_c1', opened_at: new Date().toISOString() }], events: srv.events.slice().reverse() });
    let bd = {}; try { bd = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    (bd.clients || []).forEach(c => srv.posts.push({ at: Date.now(), id: c.id, data: c.data }));
    return ok({ ok: true, saved: 1, clients: [{ id: 'c1', token: 't_c1' }], failed: [] });
  }
  return ok({ ok: true, data: {}, clients: [], events: [], customers: [], bookings: [], messages: [] });
});
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce && !Cloud._booting, null, { timeout: 30000 }).catch(() => {});
await sleep(2000);
const lastData = () => { const x = srv.posts.filter(q => q.id === 'c1'); return x.length ? x[x.length - 1].data : null; };

// A) form submission
srv.events.push({ id: 'ev_f1', client_id: 'c1', kind: 'form', created_at: new Date().toISOString(),
  payload: { formId: 'intake', title: 'New client intake', answers: { q1: 'Penicillin' }, flagged: ['Accutane in the last 6 months'], signed: true, date: 'Oct 16, 2026', qs: [{ id: 'q1', label: 'Allergies', type: 'Short text' }] } });
await p.evaluate(() => syncClientEvents());
await sleep(1500);
const A = await p.evaluate(() => { const c = CL.c1; return { sub: (c.submittedForms || []).map(f => f.evId + ':' + f.title), pend: (c.pendingForms || []).length, signed: c.signedForms, flag: c.flaggedContra && c.flaggedContra.items, notif: notifFeed.filter(n => n.formEvId === 'ev_f1').length }; });
check('A: submitted form lands on the chart, pending cleared, signed, flagged, notified', A.sub.length === 1 && A.pend === 0 && A.signed && A.flag && A.notif === 1, A);
// re-poll must not duplicate
await p.evaluate(() => syncClientEvents()); await sleep(800);
const A2 = await p.evaluate(() => ({ sub: (CL.c1.submittedForms || []).length, notif: notifFeed.filter(n => n.formEvId === 'ev_f1').length }));
check('A: a second poll does not duplicate the form or its notification', A2.sub === 1 && A2.notif === 1, A2);

// B) re-send the same form
await p.evaluate(() => { _assignFormsToClient(CL.c1, ['intake']); saveClients(); });
const B = await p.evaluate(() => _assembleClientData('c1').pendingForms.map(f => ({ formId: f.formId, assignedAt: f.assignedAt, n: (f.qs || []).length })));
check('B: re-sent form goes to the client with a fresh assignedAt and its questions', B.length === 1 && B[0].assignedAt > 1000 && B[0].n > 0, B);
// the reconcile pass (runs every poll over ALL events) must not strip the re-sent instance
await p.evaluate(() => syncClientEvents()); await sleep(800);
const B2 = await p.evaluate(() => (CL.c1.pendingForms || []).length);
check('B: next poll leaves the re-sent form pending (reconcile does not eat it)', B2 === 1, B2);

// C) guide send then re-send: what reaches the client?
const C = await p.evaluate(() => {
  const g = (typeof resources !== 'undefined' && resources[0]) || null; if (!g) return { noGuide: true };
  _assignPending(CL.c1.pendingGuides = CL.c1.pendingGuides || [], 'guideId', g.id);
  const first = JSON.stringify(_assembleClientData('c1').pendingGuides);
  const at1 = CL.c1.pendingGuides[0].assignedAt;
  const t0 = Date.now(); while (Date.now() - t0 < 5) {}
  _assignPending(CL.c1.pendingGuides, 'guideId', g.id);
  const second = JSON.stringify(_assembleClientData('c1').pendingGuides);
  return { at1, at2: CL.c1.pendingGuides[0].assignedAt, payloadChanged: first !== second, sample: JSON.parse(second)[0] && Object.keys(JSON.parse(second)[0]) };
});
check('C: a guide RE-SEND is invisible to the client (payload identical, no assignedAt sent)', C.noGuide || (C.at2 > C.at1 && C.payloadChanged), C);

// D) booking request -> suggest -> accept -> confirm
srv.events.push({ id: 'ev_bk1', client_id: 'c1', kind: 'booking', created_at: new Date().toISOString(), payload: { treatment: 'Facial', date: ymd, dateLabel: 'x', time: '10:00 AM', note: '', client: 'Dana Client' } });
await p.evaluate(() => syncClientEvents()); await sleep(1200);
const D0 = await p.evaluate(() => (SlickBridge.getBookings() || []).filter(x => x.id === 'ev_bk1').map(x => x.status));
check('D: booking request arrives as pending', D0[0] === 'pending', D0);
srv.posts.length = 0;
await p.evaluate(() => { nav('requests'); });
await sleep(400);
await p.evaluate((ymd) => { openSuggest('ev_bk1'); const d = document.getElementById('sug-date-ev_bk1'), t = document.getElementById('sug-time-ev_bk1'); if (d) d.value = ymd; if (t) t.value = '14:30'; sendSuggestion('ev_bk1'); }, ymd);
await sleep(3500);
const D1 = lastData();
check('D: the suggestion reaches the client blob', D1 && D1.suggestedBooking && D1.suggestedBooking.time === '2:30 PM', D1 && D1.suggestedBooking);
// client accepts -> a new booking request for the suggested slot
srv.events.push({ id: 'ev_bk2', client_id: 'c1', kind: 'booking', created_at: new Date().toISOString(), payload: { treatment: 'Facial', date: ymd, dateLabel: 'x', time: '2:30 PM', note: '', client: 'Dana Client' } });
await p.evaluate(() => syncClientEvents()); await sleep(1200);
srv.posts.length = 0;
await p.evaluate(() => { confirmBooking('ev_bk2'); });
await sleep(4000);
const D2 = lastData();
const D2s = await p.evaluate(() => ({ list: (SlickBridge.getBookings() || []).map(x => x.id + ':' + x.status), nv: CL.c1.nextVisit, sug: CL.c1.suggestedBooking }));
check('D: confirm clears the suggestion and the client blob carries the new next visit', D2 && !D2.suggestedBooking && /2:30/.test((D2.profile || {}).nextVisit || ''), { posted: D2 && { sug: D2.suggestedBooking, nv: D2.profile && D2.profile.nextVisit }, local: D2s });
check('no page errors', errs.length === 0, errs.slice(0, 5));
let bad = 0; for (const x of results) { if (!x.p) bad++; console.log((x.p ? 'PASS ' : 'FAIL ') + x.n + (x.d ? '  — ' + String(x.d).slice(0, 500) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`);
await b.close();
