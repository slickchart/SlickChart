// Service worker behaviour with the split build: offline launch, slow-network launch (3s cap), and a
// cached page whose code file is missing (must wait for the network, never draw blank).
import fs from 'fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const URL0 = 'http://localhost:' + (process.env.PORT || 8899) + '/slickchart.html';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); });
let shellDelay = 0; const setDelay = ms => fs.writeFileSync('/tmp/claude-0/shell-delay', String(ms));
setDelay(0);
await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[]}' }));
await ctx.route('**/slickchart.html', async r => { if (shellDelay) await new Promise(z => setTimeout(z, shellDelay)); return r.continue(); });
const home = () => p.waitForFunction(() => /Good (morning|afternoon|evening)/.test((document.getElementById('S') || {}).innerText || ''), null, { timeout: 15000 }).then(() => true).catch(() => false);
await p.goto(URL0); await home(); await p.waitForTimeout(1500);
const ctl = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active); });
await p.reload(); await home(); await p.waitForTimeout(1000);
check('service worker installed', ctl);
const cached = await p.evaluate(async () => { const ks = await caches.keys(); const out = []; for (const k of ks) { const c = await caches.open(k); (await c.keys()).forEach(q => out.push(new URL(q.url).pathname)); } return out; });
check('page and its code file are saved', cached.includes('/slickchart.html') && cached.some(x => /\/assets\/app-[a-f0-9]+\.js/.test(x)), cached.join(' '));
await ctx.setOffline(true); let t0 = Date.now(); await p.reload().catch(() => {}); const offOk = await home(); const offMs = Date.now() - t0; await ctx.setOffline(false);
check('opens with no signal', offOk, offMs + 'ms');
setDelay(6000); t0 = Date.now(); await p.reload().catch(() => {}); const slowOk = await home(); const slowMs = Date.now() - t0; setDelay(0);
check('on a 6s network stall it opens from the saved copy in about 3s', slowOk && slowMs < 5000, slowMs + 'ms');
// drop the code file from the cache: the saved page must not be used (blank screen risk)
await p.evaluate(async () => { for (const k of await caches.keys()) { const c = await caches.open(k); for (const q of await c.keys()) if (/\/assets\/app-/.test(q.url)) await c.delete(q); } });
setDelay(1500); t0 = Date.now(); await p.reload().catch(() => {}); const missOk = await home(); const missMs = Date.now() - t0; setDelay(0);
check('saved page without its code file waits for the network instead of drawing blank', missOk && missMs >= 1400, missMs + 'ms');
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 200) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
