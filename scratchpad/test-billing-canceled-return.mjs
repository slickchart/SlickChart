// REGRESSION (2026-11-26 sweep): coming back from Stripe's cancel page (?billing=canceled) said
// nothing, and until Stripe's webhook landed the billing screen still read "Active / Next billing
// date", so a provider who had just cancelled went back to Billing to check. Now: a toast says it
// worked, and Billing shows "Ending / Access until" until the account's copy catches up.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const SIZE = process.env.SIZE || 'phone';
const VP = { mac: { width: 1440, height: 900 }, ipad: { width: 1032, height: 1376 }, phone: { width: 390, height: 844 } }[SIZE];
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = p === '/slickchart' ? path.join(ROOT, 'slickchart.html') : path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : /\.woff2$/.test(f) ? 'font/woff2' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const engine = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const browser = await engine.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + '[' + SIZE + '] ' + m); if (!c) fails++; };
const seed = { sc_onboarded: '1', sc_professions: JSON.stringify(['esthetician']) };
const active = { status: 'active', current_period_end: 1800000000, plan_amount: 1000 };
const ending = { ...active, cancel_at_period_end: true };
async function run(url, subs) {
  const ctx = await browser.newContext({ viewport: VP, serviceWorkers: 'block' }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_login_email', 'new@spa.com'); localStorage.setItem('sc_hide_sample', '1'); } catch (e) {}
    window.__said = []; const iv = setInterval(() => { if (typeof proToast === 'function' && !window.__tw) { window.__tw = 1; const o = proToast; window.proToast = function (m) { window.__said.push(String(m)); return o.apply(this, arguments); }; clearInterval(iv); } }, 20); });
  let n = 0, live = false;
  await page.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
    if (u.includes('billing-status')) { const sub = live ? subs[n] : active; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, subscription: sub }) }); }
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: seed }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"appointments":[],"items":[]}' }); });
  await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await page.goto('http://localhost:' + PORT + url, { waitUntil: 'load' }); await page.waitForTimeout(7000);
  const said = await page.evaluate(() => window.__said.join(' | '));
  const left = await page.evaluate(() => location.search);
  const texts = []; live = true;
  for (let i = 0; i < subs.length; i++) { n = i; await page.evaluate(() => nav('home')); await page.waitForTimeout(300); await page.evaluate(() => nav('security-billing')); await page.waitForTimeout(1800);
    texts.push(await page.evaluate(() => (document.getElementById('billing-body') || document.body).innerText.replace(/\s+/g, ' '))); }
  await ctx.close(); return { said, left, texts, errs };
}
// 1. Back from cancelling; Stripe's webhook has not landed yet (server still says plain active), then it lands.
let r = await run('/slickchart?billing=canceled', [active, ending, active]);
ok(/Your plan is canceled/.test(r.said), 'a toast says the cancel worked (' + r.said.slice(0, 90) + ')');
ok(!/billing=/.test(r.left), 'the ?billing= flag is taken off the address');
ok(/Ending/.test(r.texts[0]) && /Access until/.test(r.texts[0]) && !/Next billing date/.test(r.texts[0]), 'before the webhook lands, Billing says Ending / Access until');
ok(/Ending/.test(r.texts[1]), 'after it lands, still Ending');
ok(/Active/.test(r.texts[2]) && /Next billing date/.test(r.texts[2]), 'once the server has confirmed, the server wins again (a later renew reads Active)');
ok(!r.errs.length, 'no page errors ' + r.errs.join(';'));
// 2. Ordinary open, paying provider: unchanged.
r = await run('/slickchart', [active]);
ok(!/canceled/i.test(r.said), 'no cancel toast on an ordinary open');
ok(/Active/.test(r.texts[0]) && /Next billing date/.test(r.texts[0]), 'a paying provider still sees Active / Next billing date');
await browser.close(); srv.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
