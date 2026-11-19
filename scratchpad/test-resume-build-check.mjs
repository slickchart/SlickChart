// Coming back to the app after hours away picks up a new build (2026-11-19, provider watch: a provider's
// iPhone stayed on 2026-11-17d for two days, only ever suspended, and kept retrying a save the fix had
// cured). Requires:
//  A. back after 7 hours, nothing in progress, a newer build is live: the page reloads once
//  B. back after 7 hours with text typed in a box: no reload
//  C. back after 20 minutes: no reload (the boot check is still latched)
//  D. back after 7 hours, same build live: no reload
//  E. a save still waiting to go up: no reload
// PORT (default 8900) serves slickchart-vercel/. ENGINE=webkit for Safari.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900, ENGINE = process.env.ENGINE || 'chromium';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const TOK = b64({ u: 'prov_ash' }) + '.sig';
const acct = { sc_hide_sample: '1', sc_bizinfo: JSON.stringify({ name: 'Glow', ownerName: 'Ashley Test' }) };
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch();

async function run({ awayMs, typed = false, liveSame = false, queued = false }) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.addInitScript(([a, t]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sc_token', t); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1');
    for (const k of Object.keys(a)) localStorage.setItem(k, a[k]); }, [acct, TOK]);
  let loads = 0; p.on('load', () => { loads++; });
  let live = null;
  await p.route('**/api/**', async r => { const u = r.request().url().replace(/^https?:\/\/[^/]+/, '');
    const ok = body => r.fulfill({ status: 200, contentType: 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) });
    if (u.includes('cloud-status')) return ok('{"enabled":true}');
    if (u.startsWith('/api/store') && r.request().method() === 'GET') return ok({ data: acct });
    if (u.includes('/api/build-id')) return ok({ build: live || 'x' });
    return ok('{"ok":true,"data":{},"clients":[],"events":[]}'); });
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForTimeout(3000);
  const mine = await p.evaluate(() => APP_BUILD);
  live = mine;                      // boot check sees the same build, so it latches without reloading
  await p.waitForTimeout(500);
  const before = loads;
  live = liveSame ? mine : mine + '-newer';
  await p.evaluate(([away, typed, queued]) => {
    if (typed) { const t = document.createElement('textarea'); t.id = 'tt'; document.body.appendChild(t); t.value = 'half a note'; }
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    _buildResumeHiddenAt = Date.now() - away;
    if (queued) { Cloud._queue.sc_test_pending = '1'; clearTimeout(Cloud._timer); }   // a save that failed while away, re-queued
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, [awayMs, typed, queued]);
  await p.waitForTimeout(2500);
  const reloaded = loads > before;
  await ctx.close();
  return reloaded;
}
const H = 3600e3;
check('A. back after 7 hours, idle, newer build live: reloads', await run({ awayMs: 7 * H }));
check('B. back after 7 hours with text typed: no reload', !(await run({ awayMs: 7 * H, typed: true })));
check('C. back after 20 minutes: no reload', !(await run({ awayMs: 20 * 60e3 })));
check('D. back after 7 hours, same build live: no reload', !(await run({ awayMs: 7 * H, liveSame: true })));
check('E. a save still waiting: no reload', !(await run({ awayMs: 7 * H, queued: true })));
await b.close();
let fail = 0; for (const r of results) { console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? ' :: ' + r.detail : '')); if (!r.pass) fail++; }
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
