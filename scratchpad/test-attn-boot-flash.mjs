// Home must never flash "Needs your attention" cards she already cleared while the app is still
// loading (Ashley, 2026-11-06: "a whole bunch of false cards before it rights itself").
// Device and account both hold 6 clients whose completed forms she has already cleared. Watch Home
// from the very first frame to well after the account answers: the heading must never appear.
// CONTROL=1 adds a genuinely new completed form, which MUST show once the account is read.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const ENGINE = process.env.ENGINE || 'chromium';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const now = Date.now(), old = now - 3 * 3600000;
const clients = {}; const dismissed = []; const seen = {};
for (let i = 0; i < 6; i++) {
  const id = 'c' + i;
  clients[id] = { name: 'Cleared Person' + i, _uAt: old, submittedForms: [{ title: 'Intake form', formId: 'intake', date: new Date(old).toISOString(), ts: old, evId: 'ev' + i }] };
  dismissed.push('rev-' + id); seen['rev-' + id] = old;
}
const acct = { sc_clients: JSON.stringify(clients), sc_home_dismissed: JSON.stringify(dismissed), sc_attn_seen: JSON.stringify(seen), sc_hide_sample: '1' };
const launch = ENGINE === 'webkit' ? pw.webkit.launch() : pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const b = await launch;
async function run(label, pullDelay, { pullFails = false, extraNew = false, localNoDismiss = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
  const acctNow = Object.assign({}, acct);
  if (extraNew) { const cl = JSON.parse(acct.sc_clients); cl.fresh = { name: 'Fresh Person', _uAt: now, submittedForms: [{ title: 'Consent form', formId: 'consent', date: new Date(now).toISOString(), ts: now, evId: 'evNEW' }] }; acctNow.sc_clients = JSON.stringify(cl); }
  await p.addInitScript(([a, noDis]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1');
    for (const k of Object.keys(a)) localStorage.setItem(k, a[k]);
    if (noDis) { localStorage.removeItem('sc_home_dismissed'); localStorage.removeItem('sc_attn_seen'); } }, [acct, localNoDismiss]);
  await p.route('**/api/**', async r => { const u = r.request().url();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && r.request().method() === 'GET') { await new Promise(z => setTimeout(z, pullDelay)); if (pullFails) return r.fulfill({ status: 503, body: 'down' }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: acctNow }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.addInitScript(() => { window.__attnLog = []; const t0 = performance.now(); const iv = setInterval(() => { try { const hs = document.getElementById('home-screen'); const txt = hs ? document.body.innerText : ''; window.__attnLog.push({ t: Math.round(performance.now() - t0), home: !!hs, attn: /needs your attention/i.test(txt), cards: (txt.match(/completed (Intake|Consent) form/g) || []).length }); } catch (e) {} }, 25); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForTimeout(pullDelay + 4000);
  const log = await p.evaluate(() => window.__attnLog);
  const homeFrames = log.filter(x => x.home);
  const flash = homeFrames.filter(x => x.attn);
  const st = await p.evaluate(() => ({ dismissed: [..._homeDismissed].length, final: /needs your attention/i.test(document.body.innerText) }));
  await ctx.close();
  return { homeFrames: homeFrames.length, flash, st, firstHome: homeFrames[0] && homeFrames[0].t };
}
for (const [label, delay] of [['quick account answer', 300], ['slow account answer (3s)', 3000]]) {
  const r = await run(label, delay);
  check(label + ': Home is drawn', r.homeFrames > 0, 'first home frame at ' + r.firstHome + 'ms');
  check(label + ': no cleared card ever flashes', !r.flash.length, r.flash.length ? (r.flash.length + ' frames, first at ' + r.flash[0].t + 'ms with ' + r.flash[0].cards + ' cards') : '');
  check(label + ': dismissals intact afterwards', r.st.dismissed >= 6 && !r.st.final, JSON.stringify(r.st));
}
{ const r = await run('account cannot be read', 500, { pullFails: true });
  check('account unreachable: still no cleared card', !r.flash.length, r.flash.length ? r.flash[0].t + 'ms' : ''); }
{ const r = await run('cleared on her other device', 2000, { localNoDismiss: true });
  check('cleared on her other device (this phone never heard): no flash', !r.flash.length, r.flash.length ? r.flash.length + ' frames, ' + r.flash[0].cards + ' cards' : '');
  check('...and still cleared afterwards', !r.st.final, JSON.stringify(r.st)); }
{ const r = await run('a genuinely new form', 1000, { extraNew: true });
  check('a genuinely new completed form still shows once the account is read', r.st.final, JSON.stringify(r.st)); }
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 220) : '')); }
console.log(`\n[${ENGINE}] ${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
