// A new barber (or any non-esthetician) must get their profession's pre-visit check-in questions, not the
// esthetician's "Any changes to your skincare routine?". The boot seed used to save the esthetician set
// before onboarding picked the profession, and the saved copy then won on every later launch.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : /\.woff2$/.test(f) ? 'font/woff2' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const engine = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const browser = await engine.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + JSON.stringify(d))); if (!c) fails++; };
const URL0 = 'http://localhost:' + PORT + '/slickchart.html';
async function fresh(store) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e.message)));
  const pushed = {};
  await page.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: store || {} }) });
    if (u.includes('/api/store') && m !== 'GET') { try { const b = JSON.parse(r.request().postData() || '{}'); Object.assign(pushed, b.items || {}); if (b.key) pushed[b.key] = b.value; } catch (e) {} }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"clients":[],"events":[]}' }); });
  await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  return { ctx, page, errs, pushed };
}
const labels = page => page.evaluate(() => checkinCfg.skinQ.map(q => q.label));
const BARBER = 'Any changes to how you want your fade or cut?';
// 1) Brand-new barber on this device: onboarding picks barber, then the app is opened again.
{
  const { ctx, page, errs } = await fresh();
  await page.goto(URL0, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  await page.evaluate(() => { selectedProfessions = ['barber']; _persistOnboarding(); localStorage.setItem('sc_onboarded', '1'); });
  let l = await labels(page); ok(l[0] === BARBER, 'right after onboarding: barber questions', l);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3500);
  l = await labels(page); ok(l[0] === BARBER && !l.some(x => /skincare/.test(x)), 'next launch: still the barber questions', l);
  ok(!errs.length, 'no page errors', errs);
  await ctx.close();
}
// 2) A barber's account that already holds the untouched esthetician seed (made by the old build).
{
  const def = await (async () => { const { ctx, page } = await fresh(); await page.goto(URL0, { waitUntil: 'load' }); await page.waitForTimeout(1500); const d = await page.evaluate(() => _CI_DEFAULT_JSON || null).catch(() => null); await ctx.close(); return d; })();
  ok(!!def, 'default snapshot exists');
  const { ctx, page, pushed } = await fresh({ sc_professions: JSON.stringify(['barber']), sc_onboarded: '1', sc_checkin_cfg: def });
  await page.addInitScript(() => { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_token', 'T'); localStorage.setItem('sc_login_email', 'b@x.com'); });
  await page.goto(URL0, { waitUntil: 'load' }); await page.waitForTimeout(6000);
  const l = await labels(page); ok(l[0] === BARBER, 'old untouched seed is replaced with the barber questions', l);
  ok(pushed.sc_checkin_cfg && JSON.parse(pushed.sc_checkin_cfg).skinQ[0].label === BARBER, 'and the account gets the barber set', Object.keys(pushed));
  await ctx.close();
}
// 3) A barber who EDITED and saved her questions keeps them, on every launch.
{
  const { ctx, page } = await fresh();
  await page.goto(URL0, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  await page.evaluate(() => { selectedProfessions = ['barber']; _persistOnboarding(); localStorage.setItem('sc_onboarded', '1'); checkinCfg.skinQ[0].label = 'My own question'; saveCheckinCfg(); });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3500);
  let l = await labels(page); ok(l[0] === 'My own question', 'her saved question is kept', l);
  await page.evaluate(() => { try { applyProfessionConfig(); loadCheckinCfg(); } catch (e) {} });
  l = await labels(page); ok(l[0] === 'My own question', 'and survives another profession pass', l);
  await ctx.close();
}
// 3b) An OLDER build loaded the automatic copy, she edited a question there and saved: the copy still
// carries the mark, but its content no longer matches it, so it is hers and stays.
{
  const { ctx, page } = await fresh();
  await page.goto(URL0, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  await page.evaluate(() => { selectedProfessions = ['barber']; _persistOnboarding(); localStorage.setItem('sc_onboarded', '1');
    const o = JSON.parse(localStorage.getItem('sc_checkin_cfg')); o.skinQ[1].label = 'Edited on the old build'; localStorage.setItem('sc_checkin_cfg', JSON.stringify(o)); });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3500);
  const l = await labels(page); ok(l[1] === 'Edited on the old build', 'an edit saved by an older build is kept', l);
  await ctx.close();
}
// 4) An esthetician still gets the esthetician set.
{
  const { ctx, page } = await fresh();
  await page.goto(URL0, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  await page.evaluate(() => { selectedProfessions = ['esty']; _persistOnboarding(); localStorage.setItem('sc_onboarded', '1'); });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3500);
  const l = await labels(page); ok(/skin changes/.test(l[0]), 'esthetician: skin questions', l);
  await ctx.close();
}
await browser.close(); srv.close();
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
