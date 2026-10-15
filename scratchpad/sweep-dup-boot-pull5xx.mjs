// The account pull ANSWERS, but with an error (500 from a Neon hiccup, or Vercel's 504 HTML page on a
// cold start). Cloud.pull() never checks r.ok: j={} so data={}, keys=[], it sets _pulledOnce=true and
// returns 0 — "the account is empty". Callers then:
//   - doLogin()/doLoginTotp(): `if(n===0) await Cloud.pushAllLocal()` — a whole-blob PUT of this device's
//     defaults over the real account (no sc_cloud_seeded check, no shrink guard; pushAllLocal bypasses it).
//   - _cloudInit on a device not yet seeded: the same pushAllLocal.
//   - _rosterNotReadYet() now says "read" (pulledOnce) while CL is empty, so the Square booking import
//     re-creates every booker who is already her client, and toasts "N new online bookings added".
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const N = 12; const acct = {}; const appts = [];
for (let i = 0; i < N; i++) { acct['sq_' + i] = { name: 'Booker Person' + i, squareId: 'SQ' + i, source: 'square', notes: 'real chart ' + i };
  appts.push({ id: 'ap' + i, customerName: 'Booker Person' + i, customerId: 'SQ' + i, startAt: new Date(Date.now() + 86400000 * (i + 1)).toISOString(), status: 'ACCEPTED' }); }
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function run(label, { viaLogin, status, body, ctype }) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  await p.addInitScript(([viaLogin]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sc_hide_sample', '1');
    if (!viaLogin) { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } }, [viaLogin]);
  const toasts = []; await p.exposeFunction('__toast', t => toasts.push(t));
  await p.addInitScript(() => { const iv = setInterval(() => { if (typeof proToast === 'function' && !window.__tw) { window.__tw = 1; const o = proToast; window.proToast = function (m) { try { window.__toast(String(m)); } catch (e) {} return o.apply(this, arguments); }; clearInterval(iv); } }, 5); });
  const puts = []; let gets = 0;
  await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/login')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'TESTTOKEN', email: 'p@x.com' }) });
    if (u.includes('/api/store') && m === 'GET') { gets++; return r.fulfill({ status, contentType: ctype, body }); }
    if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); puts.push(j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} }
    if (u.includes('/api/square/appointments')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: appts }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForTimeout(2500);
  if (viaLogin) {
    // The sign-in form, filled in: doLogin() only reads these two fields.
    await p.evaluate(() => { for (const [id, v] of [['login-email', 'p@x.com'], ['login-pw', 'password123']]) { let el = document.getElementById(id); if (!el) { el = document.createElement('input'); el.id = id; document.body.appendChild(el); } el.value = v; } doLogin(); });
    await p.waitForTimeout(3000);
    await p.evaluate(() => { try { _loadSquareAppts(true); } catch (e) {} });   // Home asks Square for bookings
  }
  await p.waitForTimeout(12000);
  const st = await p.evaluate(() => ({ pulledOnce: !!Cloud._pulledOnce, notYet: _rosterNotReadYet(), bookers: Object.values(CL).filter(c => /^Booker Person/.test(c.name)).length, seeded: localStorage.getItem('sc_cloud_seeded') }));
  const bigPut = puts.filter(x => Object.keys(x).length >= 10);
  const clientsPut = puts.filter(x => x.sc_clients).map(x => x.sc_clients);
  check(label + ': an error answer is not treated as "this account is empty" (no whole-workspace upload)', !bigPut.length, bigPut.length ? (bigPut.length + ' upload(s) of ' + Object.keys(bigPut[0]).length + ' keys') : '');
  check(label + ': account client list is not overwritten with this device\'s list', !clientsPut.some(v => !/real chart/.test(v)), clientsPut.map(v => String(v).slice(0, 80)).join(' | '));
  check(label + ': bookers who are already her clients are not re-created', st.bookers === 0, JSON.stringify(st));
  const bad = toasts.filter(t => /bookings? added|booked online|synced from Square/.test(t));
  check(label + ': no "N new … added" toast', !bad.length, bad.join(' | '));
  await ctx.close();
}
await run('boot, 500 JSON, new device', { viaLogin: false, status: 500, body: '{"error":"db timeout"}', ctype: 'application/json' });
await run('boot, 504 HTML, new device', { viaLogin: false, status: 504, body: '<html>An error occurred with this application. FUNCTION_INVOCATION_TIMEOUT</html>', ctype: 'text/html' });
await run('sign-in, 500 JSON', { viaLogin: true, status: 500, body: '{"error":"db timeout"}', ctype: 'application/json' });
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 260) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
