// WHOLE-APP SWEEP. Crawls every screen reachable by nav(...) from Home, then taps EVERY control on each
// screen, one at a time on a freshly drawn copy of that screen. Reports page errors, console errors,
// controls that change nothing, and links that go nowhere. Destructive controls are listed, not tapped.
// usage: node sweep-whole-app.mjs provider|client <page.html> [outfile.json]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const APP = process.argv[2] || 'provider';
const PAGE = process.argv[3] || (APP === 'provider' ? 'slickchart-provider-demo.html' : 'slickchart-client-demo.html');
const OUT = process.argv[4] || `/tmp/claude-0/whole-${APP}-${PAGE.replace(/\W/g, '_')}.json`;
const SEED = process.argv[5] || '';
const SKIP = /logout|_doLogout|signOut|sign out|deleteAccount|delete-account|_doDelete|wipe|purge|_resetApp|resetAll|clearAll|_doDeleteClientData|location\.reload|_reloadApp|window\.location|location\.href=|_hardRefresh|_forceUpdate|removeDemoClients|_setShotMode\(true/i;
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: [] });
const page = await ctx.newPage();
let errs = [], cerrs = [];
page.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|net::|favicon|fonts\.g|tabler|ERR_|404|status of/i.test(t)) cerrs.push(t.slice(0, 200)); } });
page.on('dialog', d => d.dismiss().catch(() => {}));
page.on('popup', p => p.close().catch(() => {}));
await page.addInitScript(([app]) => { try { localStorage.setItem('sc_onboarded', '1'); if (app === 'provider' && !location.pathname.includes('demo')) localStorage.setItem('sc_token', 'TESTTOKEN'); } catch (e) {}
  window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return null; };
  try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {}
  try { navigator.clipboard.writeText = () => Promise.resolve(); } catch (e) {} }, [APP]);
await page.route('**/api/**', r => { const u = r.request().url(); if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await page.route(/^(?!http:\/\/localhost:8899).*/, r => { const u = r.request().url(); if (/cdn\.jsdelivr|fonts\.g|cdnjs|unpkg/.test(u)) return r.continue(); return r.abort(); });
const boot = async () => { await page.goto('http://localhost:8899/' + PAGE, { waitUntil: 'load' }); await page.waitForTimeout(2600); if (SEED) await page.evaluate(SEED).catch(() => {}); };
await boot();
// ---- crawl ----
const key = (s, d) => s + '|' + (d == null ? '' : JSON.stringify(d));
const seen = new Map(); const queue = [['home', null]];
const perScreen = {};
while (queue.length && seen.size < 260) {
  const [s, d] = queue.shift(); const k = key(s, d); if (seen.has(k)) continue;
  perScreen[s] = (perScreen[s] || 0) + 1; if (perScreen[s] > 2) continue;   // two data variants per screen is plenty
  errs = []; cerrs = [];
  const found = await page.evaluate(([s, d]) => { try { document.querySelectorAll('.shell > div[id], body > div[id]').forEach(x => { if (getComputedStyle(x).position === 'fixed' && x.id !== 'app') x.remove(); }); } catch (e) {}
    try { d == null ? nav(s) : nav(s, d); } catch (e) { return { err: String(e.message) }; }
    const html = document.body.innerHTML; const out = []; const re = /nav\(\s*'([a-z0-9-]+)'\s*(?:,\s*('[^']*'|\d+|\{[^}]{0,120}\}))?\s*\)/g; let m;
    while ((m = re.exec(html))) { let dd = null; if (m[2] != null) { const v = m[2]; if (/^'/.test(v)) dd = v.slice(1, -1); else if (/^\d+$/.test(v)) dd = +v; else { try { dd = Function('return ' + v)(); } catch (e) { dd = null; } } } out.push([m[1], dd]); }
    return { tt: (document.getElementById('tt') || {}).textContent || '', len: (document.getElementById('S') || document.body).innerText.length, links: out }; }, [s, d]).catch(e => ({ err: String(e.message) }));
  await page.waitForTimeout(120);
  seen.set(k, { s, d, tt: found.tt, len: found.len, renderErr: found.err || null, errs: errs.slice(), cerrs: cerrs.slice() });
  for (const [ns, nd] of (found.links || [])) if (!seen.has(key(ns, nd))) queue.push([ns, nd]);
}
// ---- tap ----
const taps = [];
for (const [k, scr] of seen) {
  if (scr.renderErr) continue;
  const n = await page.evaluate(([s, d]) => { try { d == null ? nav(s) : nav(s, d); } catch (e) { return 0; } const S = document.getElementById('S') || document.body;
    return Array.from(S.querySelectorAll('button,[onclick],a[href],[role=button]')).filter(e => e.offsetParent || e.getClientRects().length).length; }, [scr.s, scr.d]).catch(() => 0);
  for (let i = 0; i < Math.min(n, 80); i++) {
    errs = []; cerrs = [];
    const r = await page.evaluate(([s, d, i, skipSrc]) => {
      document.querySelectorAll('.shell > div[id], body > div[id]').forEach(x => { try { if (getComputedStyle(x).position === 'fixed' && x.id !== 'app') x.remove(); } catch (e) {} });
      try { d == null ? nav(s) : nav(s, d); } catch (e) { return null; }
      const S = document.getElementById('S') || document.body;
      const els = Array.from(S.querySelectorAll('button,[onclick],a[href],[role=button]')).filter(e => e.offsetParent || e.getClientRects().length);
      const el = els[i]; if (!el) return null;
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 60);
      const act = (el.getAttribute('onclick') || '').trim(); const href = el.getAttribute('href') || '';
      if (new RegExp(skipSrc, 'i').test(act + ' ' + label)) return { label, act: act.slice(0, 80), skipped: true };
      if (el.tagName === 'A' && !act) { const bad = !href || href === '#' || /^javascript:/i.test(href); return { label, act: 'href=' + href.slice(0, 80), link: true, deadLink: bad }; }
      if (el.disabled) return { label, act: act.slice(0, 80), disabled: true };
      window.__navs = 0; if (!window.__navW) { const o = window.nav; window.nav = function () { window.__navs++; return o.apply(this, arguments); }; window.__navW = 1; }
      window.__opened = [];
      const tt = (document.getElementById('tt') || {}).innerHTML || ''; const sh = S.innerHTML; const kids = document.querySelectorAll('body *').length;
      window.__snap = { tt, sh, kids };
      try { el.click(); } catch (e) { return { label, act: act.slice(0, 80), threw: String(e.message).slice(0, 150) }; }
      return { label, act: act.slice(0, 80) }; }, [scr.s, scr.d, i, SKIP.source]).catch(e => ({ label: '?', act: '', threw: String(e.message).slice(0, 150) }));
    if (!r) continue;
    if (r.skipped || r.link || r.disabled || r.threw) { taps.push({ screen: k, i, ...r, errs: errs.slice() }); continue; }
    await page.waitForTimeout(220);
    const a = await page.evaluate(() => { const s = window.__snap || {}; const S = document.getElementById('S') || document.body;
      return { nav: window.__navs || 0, opened: (window.__opened || []).length, changed: ((document.getElementById('tt') || {}).innerHTML || '') !== s.tt || S.innerHTML !== s.sh || document.querySelectorAll('body *').length !== s.kids }; }).catch(() => ({ changed: true, gone: true }));
    taps.push({ screen: k, i, ...r, effect: !!(a.nav || a.opened || a.changed), errs: errs.slice(), cerrs: cerrs.slice() });
  }
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify({ screens: [...seen.values()], taps }, null, 1));
const sErr = [...seen.values()].filter(x => x.renderErr || x.errs.length);
const tErr = taps.filter(t => t.threw || (t.errs && t.errs.length));
const noop = taps.filter(t => t.effect === false);
const dead = taps.filter(t => t.deadLink);
console.log(`${APP} ${PAGE}: ${seen.size} screens, ${taps.length} controls (${taps.filter(t => t.skipped).length} skipped as destructive)`);
console.log(`screen render errors: ${sErr.length}, tap errors: ${tErr.length}, do-nothing taps: ${noop.length}, dead links: ${dead.length}`);
for (const x of sErr) console.log('RENDER-ERR ' + key(x.s, x.d) + ' ' + (x.renderErr || x.errs.join(' ; ')));
for (const t of tErr) console.log('TAP-ERR    ' + t.screen + ' #' + t.i + ' ' + t.label + ' :: ' + t.act + ' !! ' + (t.threw || t.errs.join(' ; ')));
for (const t of noop) console.log('NOOP       ' + t.screen + ' #' + t.i + ' ' + t.label + ' :: ' + t.act);
for (const t of dead) console.log('DEADLINK   ' + t.screen + ' #' + t.i + ' ' + t.label + ' :: ' + t.act);
