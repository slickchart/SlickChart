// "Changes couldn't back up to the cloud yet" showed 4 times in one hour on Ashley's Android phone
// (2026-11-19, provider watch) while she only took room photos: each time the app was in the background
// (camera open) or had just come back, when the phone's network is paused. Requires:
//  A. a save failing while the app is in the background: no message, the save stays queued, the reason is logged
//  B. the first 10 s after coming back: no message
//  C. a save still failing 10 s after coming back: the message shows (a real failure is still told)
//  D. once the network answers, the queued save goes up
// PORT (default 8900) serves slickchart-vercel/. ENGINE=webkit for Safari.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900, ENGINE = process.env.ENGINE || 'chromium';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const TOK = b64({ u: 'prov_ash' }) + '.sig';
const acct = { sc_hide_sample: '1', sc_bizinfo: JSON.stringify({ name: 'Glow', ownerName: 'Ashley Test' }) };
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
await p.addInitScript(([a, t]) => { localStorage.setItem('sc_token', t); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1');
  for (const k of Object.keys(a)) localStorage.setItem(k, a[k]); }, [acct, TOK]);
let down = false, posted = [];
await p.route('**/api/**', async r => { const u = r.request().url().replace(/^https?:\/\/[^/]+/, '');
  const ok = body => r.fulfill({ status: 200, contentType: 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) });
  if (u.startsWith('/api/store') && r.request().method() !== 'GET') { if (down) return r.abort('internetdisconnected'); posted.push(r.request().postData() || ''); return ok('{"ok":true}'); }
  if (u.includes('cloud-status')) return ok('{"enabled":true}');
  if (u.startsWith('/api/store')) return ok({ data: acct });
  if (u.includes('/api/build-id')) return ok({ build: 'x' });
  return ok('{"ok":true,"data":{},"clients":[],"events":[]}'); });
await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForTimeout(3500);
await p.evaluate(() => { window.__toasts = []; const orig = window.proToast; window.proToast = function (m) { window.__toasts.push(String(m)); return orig.apply(this, arguments); };
  window.__vis = 'visible'; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis }); });
const setVis = v => p.evaluate(v => { window.__vis = v; document.dispatchEvent(new Event('visibilitychange')); }, v);
const backupToasts = () => p.evaluate(() => window.__toasts.filter(m => /back up to the cloud/.test(m)).length);
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
down = true;
await setVis('hidden');
await p.evaluate(() => { Cloud.set ? Cloud.set('sc_test_room', 'photo-1') : localStorage.setItem('sc_test_room', 'photo-1'); });
await p.evaluate(() => { localStorage.setItem('sc_test_room2', 'photo-2'); Cloud._flush && Cloud._flush(1); });
await p.waitForTimeout(2500);
ok(await backupToasts() === 0, 'A. failing in the background: no message');
const log = await p.evaluate(() => JSON.stringify((typeof _alLog !== 'undefined' && _alLog) || (typeof _alEvents !== 'undefined' && _alEvents) || []));
ok(/store-retry/.test(log) || await p.evaluate(() => _cloudSyncFailLogAt > 0), 'A. the reason is logged (store-retry)');
await setVis('visible');
await p.evaluate(() => _cloudSyncToast('Changes couldn’t back up to the cloud yet, test', 'network'));
ok(await backupToasts() === 0, 'B. just came back: no message');
await p.evaluate(() => { _cloudSyncShownAt = Date.now() - 11000; _cloudSyncToastAt = 0; Cloud._flush(1); });
await p.waitForTimeout(2000);
ok(await backupToasts() >= 1, 'C. still failing 10 s after coming back: message shows');
down = false; const before = posted.length;
await p.evaluate(() => { localStorage.setItem('sc_test_room3', 'photo-3'); window.dispatchEvent(new Event('online')); Cloud._flush(0); });
await p.waitForTimeout(3000);
ok(posted.length > before && posted.slice(before).some(x => /sc_test_room2/.test(x)), 'A+D. the save made in the background stayed queued and goes up once the network answers');
await b.close();
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
