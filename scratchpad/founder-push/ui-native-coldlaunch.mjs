// A phone that opens the app ALREADY signed in links itself for alerts with no taps; a refused
// address at launch is replaced by a fresh one; the 6-hour timer re-registers while the app stays open.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FILE = new URL('../../slickchart-vercel/slickchart.html', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function run(refuseFirst) {
  const p = await b.newPage();
  const calls = [], reports = [];
  await p.route('**/api/**', r => { const u = r.request().url();
    if (u.includes('/api/native-push')) { const body = r.request().postDataJSON(); calls.push({ m: r.request().method(), auth: r.request().headers()['authorization'] || '', body });
      const bad = refuseFirst && body.token === 'tok-1';
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bad ? { ok: true, invalid: true, reason: 'Google rejected this device address (404 NOT_FOUND)' } : { ok: true, checked: true }) }); }
    if (u.includes('/api/device-report')) { try { reports.push(r.request().postDataJSON().report); } catch (e) {} }
    if (u.includes('/api/cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await p.addInitScript(() => {
    try { localStorage.setItem('sc_token', 'sess-main'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {}
    const L = {}; let n = 0; window.__L = L; window.__regs = () => n;
    const ivs = []; const si = window.setInterval; window.setInterval = (f, ms, ...a) => { if (ms >= 3600000) ivs.push(f); return si(f, ms, ...a); }; window.__ivs = ivs;
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
      PushNotifications: { checkPermissions: async () => ({ receive: 'granted' }), requestPermissions: async () => ({ receive: 'granted' }),
        addListener: (k, f) => { L['pn:' + k] = f; }, unregister: async () => {},
        register: async () => { n++; const v = 'tok-' + n; setTimeout(() => L['pn:registration'] && L['pn:registration']({ value: v }), 20); } },
      App: { addListener: (k, f) => { L['app:' + k] = f; }, getLaunchUrl: async () => ({}) }, StatusBar: {} } };
  });
  await p.goto('file://' + FILE); await p.waitForTimeout(11000);
  const st = await p.evaluate(() => ({ st: window._nativePushState, regs: window.__regs(), ivs: window.__ivs.length }));
  return { p, calls, st, reports };
}
let r = await run(false);
ok(r.calls.some(c => c.m === 'POST' && c.body.token === 'tok-1' && /sess-main/.test(c.auth)), 'cold launch signed in: phone links to her account by itself');
ok(r.st.st && r.st.st.post === 'ok', 'phone records it is linked: ' + JSON.stringify(r.st.st));
ok(r.reports.some(x => x.pushPerm === 'granted' && x.pushPost === 'ok' && x.pushEnds === 'tok-1'.slice(-6)), 'the phone reports its own alert link to the server: ' + JSON.stringify(r.reports.map(x => [x.pushPerm, x.pushPost, x.pushEnds])));
ok(r.st.ivs >= 1, 'a long timer is set to re-register while the app stays open');
const before = await r.p.evaluate(() => window.__regs());
await r.p.evaluate(() => window.__ivs.forEach(f => { try { f(); } catch (e) {} }));
await r.p.waitForTimeout(500);
ok(await r.p.evaluate(() => window.__regs()) > before, 'the timer re-registers');
await r.p.close();
r = await run(true);
ok(r.calls.some(c => c.body.token === 'tok-1') && r.calls.some(c => c.m === 'POST' && c.body.token === 'tok-2'), 'refused at launch: fetches a fresh address and saves it: ' + r.calls.map(c => c.body.token));
ok(r.st.st && r.st.st.post === 'ok', 'ends linked: ' + JSON.stringify(r.st.st));
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
