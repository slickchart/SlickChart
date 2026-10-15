// SWEEP 2 / appointments in the provider app.
//
//   node scratchpad/sweep2-square-appts-client.mjs
//
// A) Same visit as a Square booking AND a manual entry (the "Not added to Square -> Book in Square"
//    path leaves both). The calendar (_allApptsUnified) dedupes by client+time; Today's / This week's
//    / Home (_realApptsMerged) do not, so the visit shows twice and counts twice.
// B) A Square load that fails once (squareAppts=null) while she adds a manual appointment rebuilds
//    the subscribed Google/Apple feed WITHOUT her Square bookings. The next successful load returns
//    the same set, the fingerprint matches the pre-error one, so the feed is never rebuilt: every
//    Square booking stays missing from her subscribed calendar until some booking changes.
// C) _stampClientNextVisit matches Square bookings by NAME only: two clients with the same name both
//    get the visit; a chart whose name differs from the Square customer's ("Jen" vs "Jennifer") gets none,
//    although the booking carries the Square customer id and the chart has it as squareId.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ n, pass: !!p, d: d || '' });
const now = new Date(); const at = new Date(now.getTime() + 3 * 864e5); at.setUTCHours(22, 0, 0, 0); // 3pm PDT in 3 days
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(at);
let appts = [
  { id: 'BK1', startAt: at.toISOString(), customerName: 'Pat Lee', customerId: 'SQPAT', durationMinutes: 60, serviceName: 'Facial', status: 'ACCEPTED' },
  { id: 'BK2', startAt: new Date(at.getTime() + 2 * 3600e3).toISOString(), customerName: 'Jennifer Moss', customerId: 'SQJEN', durationMinutes: 60, serviceName: 'Facial', status: 'ACCEPTED' }];
let failAppts = false;
const kv = { sc_hide_sample: '1', sc_onboarded: '1',
  sc_manual_appts: JSON.stringify([{ id: 'ma_dup', client: 'Pat Lee', tx: 'Facial', date: day, time: '3:00 PM', _ts: 1 }]),
  sc_clients: JSON.stringify({
    c_pat: { name: 'Pat Lee', squareId: 'SQPAT', nextVisit: 'Not scheduled' },
    c_pat2: { name: 'Pat Lee', squareId: 'SQOTHERPAT', nextVisit: 'Not scheduled' },
    c_jen: { name: 'Jen Moss', squareId: 'SQJEN', nextVisit: 'Not scheduled' } }) };
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ timezoneId: 'America/Los_Angeles', viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...kv } }) });
  if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(kv, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  if (u.includes('/api/square/appointments')) { if (failAppts) return r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"bad gateway"}' }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: appts }) }); }
  if (u.includes('/api/square/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"customers":[],"retail":[],"services":[],"invoices":[]}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce, null, { timeout: 30000 });
await p.evaluate(() => _loadSquareAppts(true)); await p.waitForTimeout(2500);

// A
const A = await p.evaluate((ts) => {
  const t = new Date(ts); const same = a => a.at && Math.abs(a.at.getTime() - t.getTime()) < 60000;
  const merged = _realApptsMerged().filter(same).length;
  const cal = _allApptsUnified().filter(a => Math.abs(a.when.getTime() - t.getTime()) < 60000).length;
  return { merged, cal, live: _apptsLive() };
}, at.toISOString());
check('A calendar shows the Pat Lee 3pm visit once (sanity)', A.cal === 1, JSON.stringify(A));
check('A Today/This week/Home (_realApptsMerged) show it once', A.merged === 1, JSON.stringify(A));

// C
const C = await p.evaluate(() => ({ pat: CL.c_pat && CL.c_pat.nextVisit, pat2: CL.c_pat2 && CL.c_pat2.nextVisit, jen: CL.c_jen && CL.c_jen.nextVisit }));
check('C the OTHER Pat Lee (different Square customer) is not given this visit', /Not scheduled/.test(C.pat2 || ''), JSON.stringify(C));
check('C Jen Moss (squareId SQJEN = the booking\'s customer) gets her next visit', !/Not scheduled/.test(C.jen || ''), JSON.stringify(C));

// B
const feedHasSq = () => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('sc_calendar_feed') || '[]').filter(e => /^sq-/.test(e.uid)).length; } catch (e) { return -1; } });
const before = await feedHasSq();
failAppts = true; await p.evaluate(() => _loadSquareAppts(true)); await p.waitForTimeout(800);
await p.evaluate((d) => { manualAppts.unshift({ id: 'ma_new', client: 'Walk In', tx: 'Brow', date: d, time: '11:00 AM', _ts: Date.now() }); _saveManualAppts(); _rebuildCalendarFeed(); }, day);
failAppts = false; await p.evaluate(() => _loadSquareAppts(true)); await p.waitForTimeout(1500);
const after = await feedHasSq();
check('B feed still lists her Square bookings after one failed load + a manual add', after === before && before > 0, `Square events in feed: before=${before} after=${after}`);
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'SOUND        ' : 'CONFIRMED-BUG') + '  ' + x.n + '  — ' + x.d); }
console.log(`\n${results.length - bad}/${results.length} sound`); process.exit(bad ? 1 : 0);
