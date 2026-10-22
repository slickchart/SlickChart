// Ashley 2026-10-22: the first-visit package message and the pre-visit check-in message say the
// client's appointment date and time. Drives the real provider app with mocked /api/**.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium, webkit } = pw;
const engine = process.env.ENGINE === 'webkit' ? webkit : chromium;
const browser = await engine.launch(process.env.ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0; const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  ' + JSON.stringify(d))); if (!ok) fails++; };
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); localStorage.setItem('sc_cloud_seeded', '1'); });
const clients = {
  c1: { id: 'c1', name: 'Dana Client', _token: 't_c1', nextVisit: 'Not scheduled' },
  c2: { id: 'c2', name: 'Sam Square', _token: 't_c2', squareId: 'SQ2', nextVisit: 'Not scheduled' },
  c3: { id: 'c3', name: 'Nora None', _token: 't_c3', nextVisit: 'Not scheduled' },
  c4: { id: 'c4', name: 'Fay Fallback', _token: 't_c4', nextVisit: 'Thursday, December 3 · 11:00 AM' },
  c5: { id: 'c5', name: 'Pat Past', _token: 't_c5', nextVisit: 'Not scheduled' },
};
const kv = { sc_hide_sample: '1', sc_clients: JSON.stringify(clients), sc_bizinfo: JSON.stringify({ name: 'Botanical Aesthetics' }) };
await p.route('**/api/**', r => { const u = r.request().url(); const ok = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (u.includes('cloud-status')) return ok({ enabled: true }); if (u.includes('/api/store') && r.request().method() === 'GET') return ok({ data: kv });
  return ok({ ok: true, clients: [], events: [] }); });
await p.goto('http://localhost:8899/slickchart.html');
await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce && !Cloud._booting, null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(1500);
const r = await p.evaluate(async () => {
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const tmr = new Date(Date.now() + 86400000);
  const later = new Date(Date.now() + 3 * 3600000); later.setSeconds(0, 0);
  const earlier = new Date(Date.now() - 2 * 3600000);
  manualAppts.length = 0;
  manualAppts.push({ id: 'ma1', client: 'Dana Client', clientId: 'c1', date: ymd(tmr), time: '2:30 PM' });
  manualAppts.push({ id: 'ma2', client: 'Dana Client', clientId: 'c1', date: ymd(new Date(Date.now() + 9 * 86400000)), time: '9:00 AM' });
  window.squareAppts = undefined;
  squareAppts = [{ client: 'Different Name', sqcid: 'SQ2', at: later }, { client: 'Pat Past', at: earlier }];
  const fmtDay = d => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const exp = {
    c1: fmtDay(tmr) + ' at 2:30 PM',
    c2: fmtDay(later) + ' at ' + later.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
  const out = { exp };
  for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    out[id] = { ci: _checkinMsg(id).msg };
    CL[id].pendingForms = [{ formId: 'intake', assignedAt: Date.now() }];
    document.getElementById('invite-sheet')?.remove();
    inviteClientToApp(id);
    out[id].fvp = (document.getElementById('invite-msg-text') || {}).value || '';
    document.getElementById('invite-sheet')?.remove();
  }
  return out;
});
console.log(JSON.stringify(r, null, 1));
check('check-in: booked appointment date + time', r.c1.ci.includes('before your visit on ' + r.exp.c1 + ' so'), r.c1.ci);
check('first-visit: booked appointment date + time', r.c1.fvp.includes('your visit at Botanical Aesthetics on ' + r.exp.c1 + ' —'), r.c1.fvp);
check('Square visit later today, matched by customer id', r.c2.ci.includes(r.exp.c2) && r.c2.fvp.includes(r.exp.c2), r.c2);
check('no appointment: no date, message still reads', !/ on /.test(r.c3.ci) && /before|check-in so/.test(r.c3.ci) && r.c3.fvp.includes('Getting you ready for your visit at Botanical Aesthetics —'), r.c3);
check('saved next visit used when calendar has none', r.c4.ci.includes('on Thursday, December 3 at 11:00 AM') && r.c4.fvp.includes('on Thursday, December 3 at 11:00 AM'), r.c4);
check('appointment already over today is not used', !/ on /.test(r.c5.ci) && !/ on /.test(r.c5.fvp), r.c5);
await browser.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
