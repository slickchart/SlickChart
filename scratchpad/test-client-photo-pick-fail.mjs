// Client app: a picked file that won't open says so (it used to vanish), and the native camera
// says how to turn it on when refused, falls back to the web picker with no plugin, stays quiet on cancel.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const eng = process.env.PW_ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const browser = await eng.launch(process.env.PW_ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
await page.goto('http://localhost:8899/slickchart-client.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const bad = { name: 'scan.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not really a photo') };
const good = { name: 'a.png', mimeType: 'image/png', buffer: png };
await page.evaluate(() => { window.__got = null; window.__toasts = []; const o = showToast; window.showToast = function (m, k) { __toasts.push(m); return o(m, k); }; });
async function pick(files) {
  await page.evaluate(() => { __got = null; __toasts = []; });
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.evaluate(() => _pickImages(s => { __got = s.length; }))]);
  await fc.setFiles(files); await page.waitForTimeout(800);
  return page.evaluate(() => ({ got: __got, t: __toasts.slice() }));
}
let r = await pick([bad]);
ok(r.got === null && /couldn.t be opened/.test(r.t[0] || ''), 'one bad file: says it could not be opened ' + JSON.stringify(r));
r = await pick([good, bad]);
ok(r.got === 1 && /One photo couldn.t be opened/.test(r.t[0] || ''), 'good + bad: keeps the good one and says one was left out ' + JSON.stringify(r));
r = await pick([good]);
ok(r.got === 1 && r.t.length === 0, 'good file: no message ' + JSON.stringify(r));
// Native camera
async function native(err) {
  return page.evaluate(async (err) => {
    __got = null; __toasts = []; window.__webPick = 0;
    window._isNativeApp = () => true;
    window.Capacitor = { Plugins: err === 'no-plugin' ? {} : { Camera: { getPhoto: async () => { throw new Error(err); } } } };
    const ow = _pickImagesWeb; window._pickImagesWeb = () => { __webPick++; };
    _pickImages(s => { __got = s.length; }, true);
    await new Promise(r => setTimeout(r, 300));
    window._pickImagesWeb = ow;
    return { got: __got, t: __toasts.slice(), web: __webPick };
  }, err);
}
r = await native('User cancelled photos app'); ok(r.t.length === 0 && r.web === 0, 'native cancel: quiet ' + JSON.stringify(r));
r = await native('User denied access to camera'); ok(/turn on Camera/.test(r.t[0] || '') && r.web === 0, 'native denied: says how to turn it on ' + JSON.stringify(r));
r = await native('no-plugin'); ok(r.web === 1 && r.t.length === 0, 'no camera plugin: falls back to the web picker ' + JSON.stringify(r));
ok(errs.length === 0, 'no page errors ' + errs.join('|'));
await browser.close();
console.log(fails ? `FAILED ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
