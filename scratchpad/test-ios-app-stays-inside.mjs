// The iPhone app (Capacitor iOS) keeps a page inside itself ONLY when its address starts with the app's
// start address, https://slickchart.app/slickchart; any other top-level page is handed to Safari.
// So "/client" from inside the app threw the person out to Safari, and a phone holding a client
// sign-in did it at EVERY launch, before the sign-in screen drew (2026-10-22, a new provider:
// "the app keeps kicking me out, Safari works"). This drives the real page with that rule applied.
//   node scratchpad/test-ios-app-stays-inside.mjs        (FILE=<path> to test another copy)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = [new URL('../slickchart-vercel/', import.meta.url).pathname, new URL('../../slickchart-vercel/', import.meta.url).pathname].find(d => fs.existsSync(d));
const APP = process.env.FILE || path.join(ROOT, 'slickchart.html');
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  let f = p === '/slickchart' ? APP : (p === '/slickchart-space' || p === '/client' || p.startsWith('/client/')) ? path.join(ROOT, 'slickchart-client.html') : path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : 'application/octet-stream'); s.end(fs.readFileSync(f));
}).listen(PORT);
const launch = () => (pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }));
const b = await launch();
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const START = 'http://localhost:' + PORT + '/slickchart';
async function open({ native = true, seed = {}, after } = {}) {
  const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); const out = []; const L = {};
  ctx.on('request', q => { if (q.isNavigationRequest() && q.frame() === p.mainFrame() && !q.url().startsWith(START)) out.push(q.url()); });
  await p.route('**/api/**', r => { const u = r.request().url();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/client-code')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"token":"ctok-code"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await p.addInitScript(([seed, native]) => {
    if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); for (const k in seed) localStorage.setItem(k, seed[k]); }
    if (!native) return;
    const L = {}; window.__L = L;
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: () => false, Plugins: {
      App: { addListener: (k, f) => { (L[k] = L[k] || []).push(f); }, getLaunchUrl: async () => ({}) }, StatusBar: {} } };
  }, [seed, native]);
  await p.goto(START); await p.waitForFunction(() => !!document.getElementById('login-screen') || !/\/slickchart$/.test(location.pathname), null, { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(800);
  if (after) { try { await after(p); } catch (e) { out.push('test step failed: ' + e.message.split('\n')[0]); } }
  const res = { kicked: out.slice(), url: p.url(), screen: await p.evaluate(() => { const l = document.getElementById('login-screen'); return l ? l.innerText.replace(/\s+/g, ' ').slice(0, 200) : document.body.innerText.replace(/\s+/g, ' ').slice(0, 120); }).catch(() => '') };
  await ctx.close(); return res;
}
// 1. A phone that once signed in as a client (her own test client) and never as a provider.
let r = await open({ seed: { sc_client_token: 'ctok-1' } });
ok(!r.kicked.length, 'client sign-in on this phone: the app opens without sending her to Safari ' + JSON.stringify(r.kicked));
ok(/I'm a provider/.test(r.screen) && /Continue to your care space/.test(r.screen), 'she sees the chooser, with provider sign-in AND the care space: ' + r.screen);
r = await open({ seed: { sc_client_token: 'ctok-1' }, after: async p => { await p.evaluate(() => _setLoginMode('login')); await p.waitForTimeout(300); } });
ok(!r.kicked.length && /Log in/i.test(r.screen), 'and "I\'m a provider" gets her to the sign-in screen inside the app');
// 2. Continue to the care space: stays in the app and the client page loads.
r = await open({ seed: { sc_client_token: 'ctok-1' }, after: async p => { await Promise.all([p.waitForNavigation().catch(() => {}), p.evaluate(() => { [...document.querySelectorAll('#login-screen button')].find(x => /care space/.test(x.textContent)).click(); })]); await p.waitForTimeout(1500); } });
ok(!r.kicked.length && /\/slickchart-space$/.test(r.url), 'Continue to your care space opens inside the app: ' + r.url + ' ' + JSON.stringify(r.kicked));
// 3. Client sign-in with a code, inside the app.
r = await open({ after: async p => { await p.evaluate(() => { _setLoginMode('client'); }); await p.waitForTimeout(200);
  await p.evaluate(() => { document.getElementById('client-email').value = 'me@x.com'; _clientSendCode(); }); await p.waitForTimeout(500);
  await Promise.all([p.waitForNavigation().catch(() => {}), p.evaluate(() => { document.getElementById('client-code').value = '123456'; _clientVerifyCode(); })]); await p.waitForTimeout(1500); } });
ok(!r.kicked.length && /\/slickchart-space$/.test(r.url), 'client code sign-in lands in the care space inside the app: ' + r.url + ' ' + JSON.stringify(r.kicked));
// 4. A tapped client link (Universal Link) while the app is open.
r = await open({ after: async p => { await Promise.all([p.waitForNavigation().catch(() => {}), p.evaluate(() => { (window.__L.appUrlOpen || []).forEach(f => f({ url: 'https://slickchart.app/client/tok-abc?s=1' })); })]); await p.waitForTimeout(1500); } });
ok(!r.kicked.length && /\/slickchart-space\?(s=1&)?c=tok-abc$/.test(r.url), 'a tapped client link opens that client\'s space inside the app: ' + r.url + ' ' + JSON.stringify(r.kicked));
// 5. A provider (has signed in before) is unaffected: straight to sign-in.
r = await open({ seed: { sc_login_email: 'laura@x.com' } });
ok(!r.kicked.length && /Log in/i.test(r.screen), 'a returning provider goes straight to sign-in');
// 6. The browser is unchanged: a client still goes straight to /client.
r = await open({ native: false, seed: { sc_client_token: 'ctok-1' } });
ok(/\/client$/.test(r.kicked[0] || ''), 'in a browser a client still goes straight to /client: ' + JSON.stringify(r.kicked));
await b.close(); srv.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
