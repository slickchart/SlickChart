// sc_calendar_feed (the Google/Apple subscribed calendar, served from the account) is rebuilt only
// when the Square appointment fingerprint changes (_loadSquareAppts) or an appointment is edited.
// On launch Home asks Square before the account pull lands, so the feed is built from THIS DEVICE'S
// manualAppts (empty on a new phone, stale on an old one) and uploaded. When the pull then brings the
// real manual appointments in, nothing rebuilds the feed (_reloadAll does not, and the Square
// fingerprint is unchanged), so the account's subscribed calendar loses her manual appointments
// until the next edit or Square change.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const d = new Date(Date.now() + 4 * 86400000); const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const manual = [{ id: 'ma_her1', client: 'Manual Booking', tx: 'Facial', date: ds, time: '10:00 AM', _ts: Date.now() - 86400000 }];
const appts = [{ id: 'ap1', customerName: 'Square Booker', customerId: 'SQB', startAt: new Date(Date.now() + 2 * 86400000).toISOString(), status: 'ACCEPTED' }];
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const kv = { sc_manual_appts: JSON.stringify(manual), sc_hide_sample: '1', sc_onboarded: '1' };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') { const snap = JSON.stringify({ data: { ...kv } }); await new Promise(z => setTimeout(z, 3000)); return r.fulfill({ status: 200, contentType: 'application/json', body: snap }); }
  if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(kv, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  if (u.includes('/api/square/appointments')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: appts }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForTimeout(16000);
const dev = await p.evaluate(() => ({ manual: (manualAppts || []).map(a => a.client), feed: JSON.parse(localStorage.getItem('sc_calendar_feed') || '[]').map(e => e.title) }));
let acctFeed = []; try { acctFeed = JSON.parse(kv.sc_calendar_feed || '[]').map(e => e.title); } catch (e) {}
check('device has her manual appointment after the pull', dev.manual.includes('Manual Booking'), JSON.stringify(dev.manual));
check('the subscribed-calendar feed (device) includes her manual appointment', dev.feed.some(t => /Manual Booking/.test(t)), JSON.stringify(dev.feed));
check('the subscribed-calendar feed (account) includes her manual appointment', acctFeed.some(t => /Manual Booking/.test(t)), JSON.stringify(acctFeed));
await ctx.close(); await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 300) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
