// Ashley's Android, 2026-11-12: the app opened signed out, went to the back a second later, she signed
// in 14 minutes later and used it all afternoon, and the phone never linked (permission ''). The
// permission call at launch never answered. Coming back to the front must finish the setup on its own.
// Also: a 401 on the pull records the server's reason in the launch log (token-dropped).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const eng = process.env.ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const FILE = new URL('../../slickchart-vercel/slickchart.html', import.meta.url).pathname;
const b = await eng.launch(process.env.ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const ctx = await b.newContext({ serviceWorkers: 'block' });
const p = await ctx.newPage();
const calls = [], reports = [];
await p.route('**/api/**', r => { const u = r.request().url();
  if (u.includes('/api/native-push')) { calls.push(r.request().postDataJSON()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"checked":true}' }); }
  if (u.includes('/api/device-report')) { try { reports.push(r.request().postDataJSON().report); } catch (e) {} }
  if (u.includes('/api/cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
await p.addInitScript(() => {
  try { localStorage.setItem('sc_token', 'sess-main'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {}
  const L = {}; let n = 0, checks = 0; window.__L = L; window.__regs = () => n;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    // The FIRST permission call never answers (the app was paused); later ones do.
    PushNotifications: { checkPermissions: () => (++checks === 1 ? new Promise(() => {}) : Promise.resolve({ receive: 'granted' })), requestPermissions: async () => ({ receive: 'granted' }),
      addListener: (k, f) => { (L['pn:' + k] = L['pn:' + k] || []).push(f); }, unregister: async () => {},
      register: async () => { n++; const v = 'tok-' + n; setTimeout(() => (L['pn:registration'] || []).forEach(f => f({ value: v })), 20); } },
    App: { addListener: (k, f) => { (L['app:' + k] = L['app:' + k] || []).push(f); }, getLaunchUrl: async () => ({}) }, StatusBar: {} } };
});
await p.goto(process.env.ENGINE === 'webkit' ? 'http://localhost:8899/slickchart.html' : 'file://' + FILE);
await p.waitForFunction(() => (window.__L['app:appStateChange'] || []).length > 0, null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(3000);
let st = await p.evaluate(() => ({ st: window._nativePushState, regs: window.__regs() }));
ok(st.st.perm === '' && calls.length === 0, 'reproduced: the permission call hangs and the phone is not linked: ' + JSON.stringify(st));
await p.evaluate(() => (window.__L['app:appStateChange'] || []).forEach(f => f({ isActive: true })));
await p.waitForTimeout(4000);
st = await p.evaluate(() => ({ st: window._nativePushState, regs: window.__regs(), lpn: (window.__L['pn:registration'] || []).length }));
ok(st.st.perm === 'granted', 'coming back to the front asks again: ' + st.st.perm);
ok(calls.some(c => c.token === 'tok-1'), 'and the phone links itself: ' + JSON.stringify(calls));
ok(st.st.post === 'ok', 'phone records it is linked');
ok(st.lpn === 1, 'listeners added once, not twice: ' + st.lpn);
await p.evaluate(() => (window.__L['app:appStateChange'] || []).forEach(f => f({ isActive: true })));
await p.waitForTimeout(1500);
ok(await p.evaluate(() => (window.__L['pn:registration'] || []).length) === 1, 'a second return does not set it up again');
ok(reports.some(x => x.pushPerm === 'granted' && x.pushEnds === 'tok-1'), 'its report now says linked: ' + JSON.stringify(reports.map(x => [x.pushPerm, x.pushPost, x.pushEnds])));
// 401 reason in the launch log
const why = await p.evaluate(async () => { Cloud.token = 'sess-x'; window.fetch = async () => new Response(JSON.stringify({ error: 'x', reason: 'revoked' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  window.__al = []; const o = window._alAdd; window._alAdd = (e, d) => { window.__al.push([e, d]); };
  try { window.Cloud._takePrefetch = async () => null; } catch (e) {}
  await Cloud._pullInner(); return window.__al.filter(x => x[0] === 'token-dropped').map(x => x[1]); });
ok(why.length === 1 && /server said revoked/.test(why[0]), 'a sign-out by the server logs why: ' + JSON.stringify(why));
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
