// Pre-visit check-in RE-REQUEST. The client keys "check-in done" on _ciSig = nextDate (+ checkinReqAt).
// Only sendFirstVisitPackage bumps checkinReqAt; the ordinary "Pre-visit check-in" send (sendCheckin)
// does not. So for a client with no appointment on file (nextVisit "Not scheduled" -> nextDate ''), one
// completed check-in marks EVERY later check-in done: the provider texts a fresh check-in link and the
// client's app just says "Check-in complete". Same for a second request for the same appointment date.
// Part 1 (provider): sendCheckin leaves checkinReqAt unchanged. Part 2 (client): the old mark hides it.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
// Part 1 — provider app
{
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); localStorage.setItem('sc_cloud_seeded', '1'); });
  const kv = { sc_hide_sample: '1', sc_clients: JSON.stringify({ c1: { id: 'c1', name: 'Dana Client', _token: 't_c1', nextVisit: 'Not scheduled', checkinReqAt: 111 } }) };
  await p.route('**/api/**', r => { const u = r.request().url(); const ok = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('cloud-status')) return ok({ enabled: true }); if (u.includes('/api/store') && r.request().method() === 'GET') return ok({ data: kv });
    return ok({ ok: true, clients: [], events: [] }); });
  await p.goto('http://localhost:8899/slickchart.html');
  await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce && !Cloud._booting, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => { const before = CL.c1.checkinReqAt; try { sendCheckin('c1'); _uSendDone(); } catch (e) {} return { before, after: CL.c1.checkinReqAt, sheet: !!document.querySelector('#send-sheet,#sendsheet,[id*=send]') }; });
  check('provider: "Pre-visit check-in" send does not refresh checkinReqAt', r.before === r.after, r);
}
// Part 2 — client app: a check-in done earlier (no appointment on file) hides the new request
{
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.addInitScript(() => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('sc_checkin_done', JSON.stringify({ jess: 'Not scheduled|111' })); } });
  const rec = clientRecord('c1', 'Cara Client', { checkinReqAt: 111, checkinCfg: { skinQ: [{ id: 's1', label: 'Any skin changes?' }], extraNotes: true } });
  await mockApi(page, { records: { TOK: rec } });
  await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ done: !!activeProvider().checkinDone, row: (document.getElementById('S').innerText.match(/Check-in complete|Pre-visit check-in/) || [''])[0] }));
  check('client: newly requested check-in shows as already complete (previous one, same/no appointment)', r.done, r);
}
await browser.close();
finish();
