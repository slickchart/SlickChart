// Booked appointments show the service that was BOOKED, never the chart's "New client" placeholder.
//
//   (serve slickchart-vercel on $PORT, default 8899)   node scratchpad/test-booked-service-labels.mjs
//
// Ashley, 2026-10-23: "client file NEXT APPOINTMENT is still showing "new client" for everybody (also
// shows in session summary when doing treatment notes) even though calendar has them booked under a
// treatment from the service menu." Every chart starts with treatment:'New client' and no booking ever
// changes it; the cards fell back to it whenever they could not read the service off the booking.
// CONTROL=1 swaps in the old _nextApptForClient-style fallback (c.treatment) and must fail.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ n, pass: !!p, d: d || '' });
const now = new Date();
const inDays = (n, h) => { const d = new Date(now); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d; };
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const later = inDays(5, 15), today = inDays(0, 23), manualDay = inDays(8, 12);
const appts = [
  // Square name differs from the chart ("Jennifer" vs "Jen"); the customer id links them.
  { id: 'BK1', startAt: later.toISOString(), customerName: 'Jennifer Moss', customerId: 'SQJEN', durationMinutes: 60, serviceName: 'Signature Facial', status: 'ACCEPTED' },
  { id: 'BK2', startAt: new Date(later.getTime() + 2 * 3600e3).toISOString(), customerName: 'Pat Lee', customerId: 'SQPAT', durationMinutes: 60, serviceName: 'Brow & Lash Tint', status: 'ACCEPTED' },
  // Today's visit for Pat, and a later one: today's service heads the notes, the later one is "next".
  { id: 'BK3', startAt: today.toISOString(), customerName: 'Pat Lee', customerId: 'SQPAT', durationMinutes: 60, serviceName: 'Dermaplane', status: 'ACCEPTED' },
];
const kv = { sc_hide_sample: '1', sc_onboarded: '1',
  sc_manual_appts: JSON.stringify([{ id: 'ma_1', clientId: 'c_mo', client: 'Mo Diaz', tx: 'Lash Lift', date: iso(manualDay), time: '12:00 PM', _ts: 1 }]),
  sc_clients: JSON.stringify({
    c_jen: { name: 'Jen Moss', squareId: 'SQJEN', treatment: 'New client', nextVisit: 'Not scheduled' },
    c_pat: { name: 'Pat Lee', squareId: 'SQPAT', treatment: 'New client', nextVisit: 'Not scheduled' },
    c_mo: { name: 'Mo Diaz', treatment: 'New client', nextVisit: 'Not scheduled' } }) };
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('pageerror', e.message));
await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
let sqDown = false;
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...kv } }) });
  if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(kv, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  if (u.includes('/api/square/appointments')) { if (sqDown) return r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"down"}' }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: appts }) }); }
  if (u.includes('/api/square/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"customers":[],"retail":[],"services":[],"invoices":[]}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce, null, { timeout: 30000 });
if (process.env.CONTROL) await p.evaluate(() => { const o = _nextApptForClient; window._nextApptForClient = function (id) { const r = o(id); if (r) r.treatment = CL[id].treatment; return r; }; });
await p.evaluate(() => _loadSquareAppts(true)); await p.waitForTimeout(2500);

const text = () => p.evaluate(() => document.getElementById('screen')?.innerText || document.body.innerText);
const nextCard = () => p.evaluate(() => { const el = [...document.querySelectorAll('div')].find(d => /^Next appointment$/i.test((d.textContent || '').trim()) && d.parentElement); return el ? el.parentElement.innerText : ''; });

for (const [id, svc] of [['c_jen', 'Signature Facial'], ['c_pat', 'Brow & Lash Tint'], ['c_mo', 'Lash Lift']]) {
  const na = await p.evaluate(i => _nextApptForClient(i), id);
  check(`${id}: next appointment names the booked service`, na && na.treatment === svc, JSON.stringify(na));
  await p.evaluate(i => nav('client', i), id); await p.waitForTimeout(400);
  const card = await nextCard();
  check(`${id}: client file Next appointment card shows "${svc}", not New client`, card.includes(svc) && !/New client/.test(card), card.replace(/\s+/g, ' ').slice(0, 160));
  const prof = await p.evaluate(i => _assembleClientData(i).profile.treatment, id);
  check(`${id}: the client's own app is sent the booked service`, prof === svc || (id === 'c_pat' && prof === 'Dermaplane'), prof);
  await p.evaluate(i => nav('session-summary', i), id); await p.waitForTimeout(400);
  const ss = await text();
  const blk = (ss.split(/Next appointment/i)[1] || '').slice(0, 200);
  check(`${id}: session summary Next appointment shows "${svc}"`, blk.includes(svc) && !/New client/.test(blk), blk.replace(/\s+/g, ' ').slice(0, 120));
}
// Pat is booked today for Dermaplane: the treatment notes and summary headers say so.
await p.evaluate(() => nav('notes', 'c_pat')); await p.waitForTimeout(400);
let t = await text();
check('treatment notes header shows today\'s booked service', /Dermaplane/.test(t) && !/New client/.test(t.slice(0, 400)), t.replace(/\s+/g, ' ').slice(0, 160));
// Client list line
await p.evaluate(() => nav('clients')); await p.waitForTimeout(500);
t = await text();
check('client list does not say "Next: ... · New client"', !/Next:[^\n]*New client/.test(t), (t.match(/Next:[^\n]*/g) || []).join(' | '));
// Square down on the next launch: the stamped service still names Jen's visit.
const stamped = await p.evaluate(() => ({ nv: CL.c_jen.nextVisit, tx: CL.c_jen.nextVisitTx }));
check('the stamp keeps the booked service with the date', stamped.tx === 'Signature Facial', JSON.stringify(stamped));
await p.evaluate(() => { squareAppts.length = 0; });
const fb = await p.evaluate(() => _nextApptForClient('c_jen'));
check('with no appointment list loaded, the fallback still names the service', fb && fb.treatment === 'Signature Facial', JSON.stringify(fb));
// A client with no booking and no service of her own: no "New client" on a next-appointment line.
await p.evaluate(() => { CL.c_new = { name: 'Nia New', treatment: 'New client', nextVisit: 'Not scheduled' }; });
check('a client with nothing booked has no next appointment', (await p.evaluate(() => _nextApptForClient('c_new'))) === null);
// Her Edit treatment for today wins over the booking.
await p.evaluate(() => { _loadSquareAppts(true); });
await p.waitForTimeout(1500);
await p.evaluate(() => { changeTreatment('c_pat', 'notes'); document.getElementById('treatment-input').value = 'Hydrafacial'; saveTreatment('c_pat', 'notes'); });
await p.waitForTimeout(300);
t = await text();
check('her own Edit treatment for today wins over the booked one', /Hydrafacial/.test(t) && !/Dermaplane/.test(t.slice(0, 400)), t.replace(/\s+/g, ' ').slice(0, 160));
// 2026-10-24: "Client friendly" on a regular client began "it was great meeting you today Sarah".
// The AI was told "Treatment: New client". It now gets the booked service and whether she is returning.
const prompts = await p.evaluate(async () => {
  const seen = [];
  window._aiComplete = async (msgs) => { seen.push(msgs[0].content); return 'Your skin looked great today.'; };
  window.aiEnabled = true; try { aiEnabled = true; } catch (e) {}
  const lastWk = Date.now() - 14 * 864e5;
  CL.c_sarah = { name: 'Sarah Reg', treatment: 'New client', lastVisit: '—', nextVisit: 'Not scheduled' };
  sessionSummaries.c_sarah = [{ date: 'Oct 10', treatment: 'Facial', note: 'old', ts: lastWk }];
  CL.c_fresh = { name: 'Fran Fresh', treatment: 'New client', lastVisit: '—', nextVisit: 'Not scheduled' };
  for (const id of ['c_sarah', 'c_fresh', 'c_pat']) {
    summaryNoteDraft[id] = 'Did a facial, skin calm.';
    nav('session-summary', id); await new Promise(r => setTimeout(r, 300));
    const btn = document.getElementById('ai-friendly-btn') || document.createElement('button');
    await aiClientFriendly(id, btn);
  }
  return seen;
});
check('Client friendly: a returning client is described to the AI as returning', /RETURNING/.test(prompts[0] || '') && !/New client/.test(prompts[0] || ''), (prompts[0] || '').split('\n').slice(-5).join(' | ').slice(0, 220));
check('Client friendly: a brand-new client is not called returning', prompts[1] && !/RETURNING/.test(prompts[1]) && !/New client/.test(prompts[1]), (prompts[1] || '').split('\n').slice(-4).join(' | ').slice(0, 200));
check('Client friendly: the AI is given the service booked today', /Treatment: Hydrafacial|Treatment: Dermaplane/.test(prompts[2] || ''), (prompts[2] || '').split('\n').slice(-5).join(' | ').slice(0, 200));
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS' : 'FAIL') + '  ' + x.n + '  — ' + x.d); }
console.log(`\n${results.length - bad}/${results.length} pass`); process.exit(bad ? 1 : 0);
