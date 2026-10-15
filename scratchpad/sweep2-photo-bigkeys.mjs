// sweep2-photo-bigkeys: client-sent photos ride WHOLE synced kv keys as base64 —
//   sc_checkins       (every check-in in the log keeps ci.photos, no cap)
//   sc_pro_vc_subs    (latest consult per client, every photo + reference photo)
// Each key is pushed as ONE value. Vercel rejects a request body over 4.5MB with 413, and Cloud._flush's
// 413 branch drops the biggest key and toasts "A photo was too large...". Once a busy provider's log
// crosses that line, the key never reaches the account again: a new phone / second device never sees
// later check-ins or consults. Also measures the background photo-backup loop while uploads fail.
//   node scratchpad/sweep2-photo-bigkeys.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const LIMIT = 4.5 * 1024 * 1024;   // Vercel serverless request-body ceiling
const results = []; const check = (n, p, d) => results.push({ n, p: !!p, d: d || '' });
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext(); const p = await ctx.newPage();
const toasts = []; await p.exposeFunction('__toast', t => toasts.push(t));
await p.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
await p.addInitScript(() => { const iv = setInterval(() => { if (typeof proToast === 'function' && !window.__tw) { window.__tw = 1; const o = proToast; window.proToast = function (m) { try { window.__toast(String(m)); } catch (e) {} return o.apply(this, arguments); }; clearInterval(iv); } }, 5); });
const kv = { sc_clients: JSON.stringify({ c1: { id: 'c1', name: 'Dana Client' } }), sc_hide_sample: '1' };
const got413 = []; let fileOffline = false; const filePuts = [];
await p.route('**/api/**', async r => {
  const u = r.request().url(), m = r.request().method(), body = r.request().postData() || '';
  const ok = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (u.includes('cloud-status')) return ok({ enabled: true });
  if (u.includes('/api/store')) {
    if (m === 'GET') return ok({ data: kv });
    if (body.length > LIMIT) { let keys = []; try { keys = Object.keys(JSON.parse(body).items || {}); } catch (e) {} got413.push({ len: body.length, keys }); return r.fulfill({ status: 413, body: 'Request Entity Too Large' }); }
    try { Object.assign(kv, JSON.parse(body).items || {}); } catch (e) {}
    return ok({ ok: true });
  }
  if (u.includes('/api/guide-file') && m === 'PUT') { filePuts.push(Date.now()); if (fileOffline) return r.abort('internetdisconnected'); return ok({ ok: true }); }
  return ok({ ok: true, data: {}, clients: [], events: [] });
});
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce && !Cloud._booting, null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(2500);

// A month of pre-visit check-ins, each with three 1000px photos (~150KB of base64 each).
await p.evaluate(() => {
  const img = 'data:image/jpeg;base64,' + 'C'.repeat(150000);
  for (let i = 0; i < 12; i++) checkins.unshift({ id: 'ev_ci_' + i, providerId: 'me', clientId: 'c1', client: 'Dana Client', dateLabel: 'Oct ' + (i + 1), time: '10:00', treatment: 'Facial', groups: [], flagged: [], notes: '', photos: [img, img, img], read: false, at: Date.now() - i * 86400000 });
  _persistCheckinsNow();
});
await p.waitForTimeout(9000);
const ciLocal = await p.evaluate(() => (_lsGet('sc_checkins') || '').length);
const ciAcct = (kv.sc_checkins || '').length;
check('sc_checkins with photos reaches the account', ciAcct > 0 && ciAcct >= ciLocal * 0.9,
  'local ' + ciLocal + ' chars, account ' + ciAcct + ' chars; 413s: ' + JSON.stringify(got413.map(x => x.keys)) + '; toasts: ' + JSON.stringify(toasts.filter(t => /large|photo/i.test(t))));

// Consults from 6 clients, 6 photos each.
got413.length = 0; toasts.length = 0;
await p.evaluate(() => {
  const img = 'data:image/jpeg;base64,' + 'V'.repeat(140000);
  for (let i = 0; i < 6; i++) vcSubmissions['cv' + i] = { photos: [0, 1, 2, 3, 4, 5].map(n => ({ label: 'P' + n, src: img })), refs: null, goals: 'g', date: 'Oct 1', kind: 'skin', title: 'Photo consult' };
  persistVcState();
});
await p.waitForTimeout(9000);
const vcAcct = (kv.sc_pro_vc_subs || '').length;
check('sc_pro_vc_subs (consult photos) reaches the account', vcAcct > 4000000,
  'account ' + vcAcct + ' chars; 413s: ' + JSON.stringify(got413.map(x => x.keys)) + '; toasts: ' + JSON.stringify(toasts.filter(t => /large|photo/i.test(t))));

// Background photo backup while offline: 9 photos waiting, every upload fails.
fileOffline = true; filePuts.length = 0;
await p.evaluate(() => {
  capturedPhotos.c1 = capturedPhotos.c1 || [];
  for (let i = 0; i < 9; i++) capturedPhotos.c1.push({ url: 'data:image/jpeg;base64,' + 'P'.repeat(5000) + i, ts: Date.now() + i, phase: 'reference', angle: '' });
  persistCapturedPhotos();
});
await p.waitForTimeout(30000);
const n = filePuts.length;
check('offline: photo backup does not spin forever (bounded attempts in 30s)', n <= 40, n + ' PUT /api/guide-file attempts in 30s while offline (9 photos)');
fileOffline = false;

let bad = 0; for (const x of results) { if (!x.p) bad++; console.log((x.p ? 'PASS ' : 'FAIL ') + x.n + (x.d ? '  — ' + String(x.d).slice(0, 500) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`);
await b.close();
