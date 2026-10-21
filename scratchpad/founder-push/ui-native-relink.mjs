// Every signed-in phone stays linked: sign-in after launch, coming back to the front, and sign-out.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FILE = new URL('../../slickchart-vercel/slickchart.html', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const p = await b.newPage();
const calls = [];
await p.route('**/api/**', r => { const u = r.request().url(); if (u.includes('/api/native-push')) calls.push({ m: r.request().method(), auth: r.request().headers()['authorization'] || '', body: r.request().postDataJSON() }); if (u.includes('/api/cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
await p.addInitScript(() => {
  const L = {}; let n = 0; window.__L = L; window.__regs = () => n;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    PushNotifications: { checkPermissions: async () => ({ receive: 'granted' }), requestPermissions: async () => ({ receive: 'granted' }),
      addListener: (k, f) => { L['pn:' + k] = f; }, register: async () => { n++; setTimeout(() => L['pn:registration'] && L['pn:registration']({ value: 'tok-main' }), 20); } },
    App: { addListener: (k, f) => { L['app:' + k] = f; }, getLaunchUrl: async () => ({}) }, StatusBar: {} } };
});
await p.goto('file://' + FILE); await p.waitForTimeout(3000);
// Signed out at launch: the front door started registration and is holding the address.
const held = await p.evaluate(() => ({ init: _nativeProviderInit, tok: !!(window._nativePushTok && window._nativePushTok.value), cloud: !!Cloud.token }));
ok(held.init && held.tok && !held.cloud, 'signed out at launch: registration started, address held: ' + JSON.stringify(held));
ok(!calls.length, 'nothing sent while signed out');
// She signs in (no reload): the held address is saved to her account.
await p.evaluate(() => { Cloud.token = 'sess-main'; });
await p.waitForTimeout(3600);
ok(calls.some(c => c.m === 'POST' && c.body.token === 'tok-main' && /sess-main/.test(c.auth)), 'after sign-in without a reload, the phone links to her account');
// Back to the front after 30+ min: re-registers.
const before = await p.evaluate(() => window.__regs());
await p.evaluate(() => { window._nativePushReRegAt = Date.now() - 31 * 60000; window.__L['app:appStateChange']({ isActive: true }); });
await p.waitForTimeout(300);
ok(await p.evaluate(() => window.__regs()) === before + 1, 'coming back to the front re-registers');
await p.evaluate(() => { window.__L['app:appStateChange']({ isActive: true }); });
await p.waitForTimeout(200);
ok(await p.evaluate(() => window.__regs()) === before + 1, 'but not again within 30 minutes');
// Sign out: the phone is unlinked from the account first.
await p.evaluate(() => { window.location.reload = () => {}; try { Object.defineProperty(window.location, 'reload', { value: () => {} }); } catch (e) {} });
calls.length = 0;
await p.evaluate(async () => { try { await Promise.race([_doLogout(), new Promise(r => setTimeout(r, 4000))]); } catch (e) {} });
ok(calls.some(c => c.m === 'DELETE' && c.body.token === 'tok-main' && /sess-main/.test(c.auth)), 'signing out unlinks this phone from the account: ' + JSON.stringify(calls.map(c => c.m)));
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
