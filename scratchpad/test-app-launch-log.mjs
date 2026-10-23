// The installed app keeps its own launch log and sends it, signed in or not (lib/app-launch-log.js),
// so a phone that "keeps kicking her out" can be read without asking anyone. Drives the real page.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = [new URL('../slickchart-vercel/', import.meta.url).pathname, new URL('../../slickchart-vercel/', import.meta.url).pathname].find(d => fs.existsSync(d));
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = q.url.split('?')[0]; const f = p === '/slickchart' ? path.join(ROOT, 'slickchart.html') : path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function run(native, loginStatus) {
  const ctx = await b.newContext({ serviceWorkers: 'block' }); const p = await ctx.newPage(); const posts = [];
  await p.route('**/api/**', r => { const u = r.request().url();
    if (u.includes('/api/app-launch')) { posts.push({ auth: r.request().headers()['authorization'] || '', body: r.request().postDataJSON() }); }
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/login')) return r.fulfill({ status: loginStatus, contentType: 'application/json', body: loginStatus === 200 ? '{"token":"tok-1","email":"l@x.com"}' : '{"error":"Email or password is incorrect."}' });
    if (u.includes('/api/store') && r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"sc_onboarded":"1"}}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await p.addInitScript((native) => { if (native) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: () => false, Plugins: { App: { addListener() {}, getLaunchUrl: async () => ({}) }, StatusBar: {} } }; }, native);
  await p.goto('http://localhost:' + PORT + '/slickchart'); await p.waitForFunction(() => !!document.getElementById('login-screen'), null, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => { _setLoginMode('login'); }); await p.waitForTimeout(200);
  await p.evaluate(() => { document.getElementById('login-email').value = 'l@x.com'; document.getElementById('login-pw').value = 'pw123456'; doLogin(); });
  await p.waitForTimeout(8000);
  await p.evaluate(() => { try { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); } catch (e) {} document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(500);
  await p.reload(); await p.waitForTimeout(7000);
  await ctx.close(); return posts;
}
let posts = await run(true, 200);
const evs = posts.length ? posts[posts.length - 1].body.events.map(e => e.e) : [];
ok(posts.some(x => /tok-1/.test(x.auth)), 'and with the session once signed in, so it is tied to her account');
ok(['launch', 'signin-screen', 'signin-tap', 'signin-ok', 'screen', 'hidden'].every(e => evs.includes(e)), 'it records launch, sign-in screen, sign-in, screens and background: ' + evs.join(','));
ok(posts.every(x => x.body.platform === 'ios' && x.body.device), 'each post names the platform and the phone\'s own random key');
ok(!JSON.stringify(posts).includes('pw123456') && !JSON.stringify(posts).includes('l@x.com'), 'no password or email in the log');
posts = await run(true, 401);
ok(posts.some(x => x.body.events.some(e => e.e === 'signin-refused' && /incorrect/.test(e.d))), 'a refused sign-in is recorded with the reason the app showed');
ok(posts.some(x => !x.auth), 'and it is sent with nobody signed in');
posts = await run(false, 200);
ok(!posts.length, 'a browser sends nothing (installed app only)');
await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
