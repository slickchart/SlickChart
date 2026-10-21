// A phone whose address Google refuses at link time fetches a fresh one by itself.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FILE = new URL('../../slickchart-vercel/slickchart.html', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function run(badTokens) {
  const p = await b.newPage(); const posts = [];
  await p.route('**/api/**', r => { const u = r.request().url();
    if (u.includes('/api/cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/native-push')) { const tk = r.request().postDataJSON().token; posts.push(tk); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(badTokens.includes(tk) ? { ok: true, invalid: true, reason: 'Google rejected this device address (404 NOT_FOUND)' } : { ok: true }) }); }
    if (u.includes('/api/admin/test-push')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"sent":1,"devices":1,"message":"Sent."}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await p.addInitScript(() => { const L = {}; let n = 0, un = 0; window.__un = () => un;
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { App: { addListener() {}, getLaunchUrl: async () => ({}) }, StatusBar: {},
      PushNotifications: { checkPermissions: async () => ({ receive: 'granted' }), requestPermissions: async () => ({ receive: 'granted' }), addListener: (k, f) => { L[k] = f; },
        unregister: async () => { un++; }, register: async () => { const t = 'tok-' + (un ? 'fresh' + un : 'stale'); setTimeout(() => L.registration && L.registration({ value: t }), 20); } } } }; });
  await p.goto('file://' + FILE); await p.waitForTimeout(1500);
  await p.evaluate(() => { Cloud.token = 'sess'; }); await p.waitForTimeout(4000);
  const st = await p.evaluate(() => ({ post: window._nativePushState.post, un: window.__un() }));
  const pop = await p.evaluate(async () => { let o = null; window.confirmModal = (x) => { o = x; }; const row = document.createElement('div'); row.innerHTML = '<div>a</div><div>b</div>'; await _founderTestPush(row, 0); return o; });
  await p.close(); return { posts, st, pop };
}
let r = await run(['tok-stale']);
ok(r.posts[0] === 'tok-stale' && r.posts.includes('tok-fresh1'), 'refused address -> phone asks Google for a fresh one and saves it: ' + r.posts);
ok(r.st.post === 'ok' && r.st.un === 1, 'ends linked, one unregister: ' + JSON.stringify(r.st));
ok(r.pop && /This phone is linked for alerts/.test(r.pop.body), 'test popup: linked');
r = await run(['tok-stale', 'tok-fresh1', 'tok-fresh2']);
ok(r.pop && /Google refused this phone’s notification address, even after the phone asked for a new one \(Google rejected this device address \(404 NOT_FOUND\)\)/.test(r.pop.body), 'still refused after a fresh one: says so plainly: ' + (r.pop && r.pop.body));
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
