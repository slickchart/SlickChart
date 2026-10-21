// In the phone app the founder test re-links THIS phone first and says what the phone did.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FILE = new URL('../../slickchart-vercel/slickchart.html', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function scenario(perm, tokenPostStatus) {
  const p = await b.newPage();
  const posts = []; let order = [];
  await p.route('**/api/**', r => {
    const u = r.request().url();
    if (u.includes('/api/native-push')) { posts.push(r.request().postDataJSON()); order.push('register'); return r.fulfill({ status: tokenPostStatus, contentType: 'application/json', body: '{"ok":true}' }); }
    if (u.includes('/api/admin/test-push')) { order.push('test'); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sent: 1, devices: 2, message: 'Sent to 1.' }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await p.goto('file://' + FILE); await p.waitForTimeout(2500);
  const got = await p.evaluate(async (perm) => {
    const L = {};
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { PushNotifications: {
      checkPermissions: async () => ({ receive: perm }), requestPermissions: async () => ({ receive: perm }),
      addListener: (n, f) => { L[n] = f; }, register: async () => { setTimeout(() => L.registration && L.registration({ value: 'tok-main-phone' }), 50); } } } };
    try { Cloud.token = 'sess'; } catch (e) {}
    let out = null; window.confirmModal = (o) => { out = o; };
    const row = document.createElement('div'); row.innerHTML = '<div>a</div><div>b</div>';
    await _founderTestPush(row, 0); return out;
  }, perm);
  await p.close(); return { got, posts, order };
}
let r = await scenario('granted', 200);
ok(r.posts.some(x => x.token === 'tok-main-phone'), 'the phone re-sends its push address before the test');
ok(r.order.indexOf('register') > -1 && r.order.indexOf('register') < r.order.indexOf('test'), 'linking happens before the test push: ' + r.order);
ok(r.got && /This phone is linked for alerts\. Sent to 1\./.test(r.got.body), 'popup says the phone is linked: ' + (r.got && r.got.body));
r = await scenario('denied', 200);
ok(r.got && /notifications turned OFF/.test(r.got.body) && !r.posts.length, 'notifications off: says how to turn them on, sends nothing');
r = await scenario('granted', 401);
ok(r.got && /could not save its push address: failed \(401\)/.test(r.got.body), 'a failed save is named: ' + (r.got && r.got.body));
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
