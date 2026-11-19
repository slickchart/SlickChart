// NEW-PROVIDER SWEEP AT COMPUTER AND iPAD SIZE (2026-11-18, after Frances cancelled her trial saying
// "there were several options that I couldnt get to work properly"). She used an iMac in Safari, an iPad
// app and an iPhone app, Square connected, 293 imported clients. Every earlier whole-app sweep ran at
// phone width on the demo page, so this one runs the REAL provider page, signed in, as a brand-new
// account with Square connected, at: Mac Safari (WebKit, mouse, 1440x900), iPad app (WebKit, touch,
// Capacitor, 1032x1376) and a big iMac window (2048x1152).
// For every screen reachable by nav(...) it records: render errors, sideways overflow, and then taps
// every control on a freshly drawn copy of the screen and records page errors, taps that change nothing,
// and any sheet/popup that opens OFF the visible window or with its buttons out of reach.
// usage: SIZE=mac|ipad|imac [PW_ENGINE=chromium] node scratchpad/sweep-new-provider-wide.mjs [out.json]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const SIZE = process.env.SIZE || 'mac';
const OUT = process.argv[2] || `/tmp/claude-0/sweep-wide-${SIZE}.json`;
const SHOTS = process.env.SHOTS || '';
const VP = { mac: { width: 1440, height: 900 }, ipad: { width: 1032, height: 1376 }, imac: { width: 2048, height: 1152 }, phone: { width: 390, height: 844 } }[SIZE];
const TOUCH = SIZE === 'ipad' || SIZE === 'phone';
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = p === '/slickchart' ? path.join(ROOT, 'slickchart.html') : path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : /\.woff2$/.test(f) ? 'font/woff2' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const SKIP = /logout|_doLogout|signOut|sign out|deleteAccount|delete-account|_doDelete|wipe|purge|_resetApp|resetAll|clearAll|_doDeleteClientData|location\.reload|_reloadApp|window\.location|location\.href=|_hardRefresh|_forceUpdate|removeDemoClients|_setShotMode\(true|cancelSub|_sqDisconnect|disconnect/i;
const engine = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const browser = await engine.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const ctx = await browser.newContext({ viewport: VP, hasTouch: TOUCH, isMobile: false, serviceWorkers: 'block', ...(process.env.LOCALE ? { locale: process.env.LOCALE } : {}), ...(process.env.TZ_ID ? { timezoneId: process.env.TZ_ID } : {}) });
const page = await ctx.newPage();
let errs = [], cerrs = [];
page.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|net::|favicon|fonts\.g|tabler|ERR_|404|status of|Load failed|access control|due to access/i.test(t)) cerrs.push(t.slice(0, 200)); } });
page.on('dialog', d => d.dismiss().catch(() => {}));
page.on('popup', p => p.close().catch(() => {}));
// A brand-new esthetician, Square connected, clients imported from Square, setup finished.
const now = Date.now();
const clients = {}; for (let i = 0; i < 40; i++) { const id = 'sq_CUST' + i; clients[id] = { id, name: ['Ava', 'Bea', 'Cora', 'Dana', 'Eve'][i % 5] + ' ' + ['Lane', 'Moss', 'Reed', 'Stone'][i % 4] + ' ' + i, email: 'c' + i + '@ex.com', phone: '555010' + String(i).padStart(4, '0'), sqId: 'CUST' + i, source: 'square', created: now - 86400000 * 3, _ts: now - 86400000 * 3, visits: [], notes: [] }; }
const seed = { sc_clients: JSON.stringify(clients), sc_onboarded: '1', sc_professions: JSON.stringify((process.env.PROF || 'esty').split(',')), sc_wsname: JSON.stringify('Frances Skin Studio'),
  sc_bizinfo: JSON.stringify({ name: 'Frances Skin Studio', phone: '5550100000', email: 'studio@ex.com' }) };
// DATEHOOK=1: record every place the app parses a bare 'YYYY-MM-DD' with new Date()/Date.parse.
// That reads it as UTC midnight, which is the PREVIOUS day anywhere west of UTC (every US provider).
if (process.env.DATEHOOK) await page.addInitScript(() => { const D = Date; const hits = window.__dh = {};
  const rec = s => { if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) { const st = (new Error().stack || '').split('\n').slice(2, 4).map(x => x.trim()).join(' < '); hits[st] = (hits[st] || 0) + 1; } };
  function W(...a) { if (!new.target) return D(); if (a.length === 1) rec(a[0]); return new D(...a); }
  W.prototype = D.prototype; W.now = D.now; W.UTC = D.UTC; W.parse = s => { rec(s); return D.parse(s); }; window.Date = W; });
await page.addInitScript(w => { window.__WORDS = w; }, process.env.WORDS || '');
await page.addInitScript(([app, native]) => { try { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_login_email', 'new@spa.com'); localStorage.setItem('sc_hide_sample', '1'); } catch (e) {}
  if (native) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
  window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return null; };
  try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {}
  try { navigator.clipboard.writeText = () => Promise.resolve(); } catch (e) {} }, ['provider', SIZE === 'ipad' || SIZE === 'phone']);
// NET=500|offline (rotation area 14): after boot, every other /api call fails, so each screen and tap is
// checked for throws and silent failures with no server.
const NET = process.env.NET || ''; let netFail = false;
await page.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
  if (netFail && !/cloud-status|billing-status/.test(u) && !(u.includes('/api/store') && m === 'GET')) return NET === 'offline' ? r.abort('internetdisconnected') : r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Something went wrong."}' });
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: seed }) });
  if (u.includes('/api/square/connection')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"oauth":true,"connected":true,"env":"production","merchantName":"Frances Skin Studio"}' });
  if (u.includes('/api/billing-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"active":true,"status":"trialing","plan":"pro"}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"appointments":[],"items":[]}' }); });
await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await page.goto('http://localhost:' + PORT + '/slickchart.html', { waitUntil: 'load' }); await page.waitForTimeout(9000);
const bootErrs = errs.slice();
if (NET) netFail = true;
// ---- crawl ----
const key = (s, d) => s + '|' + (d == null ? '' : JSON.stringify(d));
const seen = new Map(); const queue = [['home', null], ['calendar', null], ['payments', null], ['messages', null], ['clients', null], ['more', null], ['client', 'sq_CUST1'], ['booking-link', null], ['forms', null]];
const perScreen = {};
const geom = () => { // sideways overflow and content wider than the window
  const vw = innerWidth; const out = [];
  if (document.documentElement.scrollWidth > vw + 2) out.push('page scrolls sideways ' + document.documentElement.scrollWidth + '>' + vw);
  const S = document.getElementById('S'); if (S && S.scrollWidth > S.clientWidth + 4) out.push('screen content wider than its box ' + S.scrollWidth + '>' + S.clientWidth);
  const tx = (S || document.body).innerText; const bw = tx.match(/.{0,30}(Invalid Date|\bNaN\b|\bundefined\b|\[object Object\]|\bnull\b).{0,30}/g); if (bw) out.push('bad text: ' + bw.slice(0, 3).join(' | '));
  if (window.__WORDS) { const ww = tx.match(new RegExp('.{0,40}(' + window.__WORDS + ').{0,40}', 'gi')); if (ww) out.push('words: ' + ww.slice(0, 4).join(' | ')); }
  return out; };
while (queue.length && seen.size < 300) {
  const [s, d] = queue.shift(); const k = key(s, d); if (seen.has(k)) continue;
  perScreen[s] = (perScreen[s] || 0) + 1; if (perScreen[s] > 2) continue;
  errs = []; cerrs = [];
  const found = await page.evaluate(([s, d, g]) => { try { document.querySelectorAll('.shell > div[id], body > div[id]').forEach(x => { if (getComputedStyle(x).position === 'fixed' && x.id !== 'app') x.remove(); }); } catch (e) {}
    try { d == null ? nav(s) : nav(s, d); } catch (e) { return { err: String(e.message) }; }
    const html = Array.from(document.body.children).filter(e => e.tagName !== 'SCRIPT').map(e => e.outerHTML).join('');   // not the app's own script text
    const out = []; const re = /nav\(\s*'([a-z0-9-]+)'\s*(?:,\s*('[^']*'|\d+|\{[^}]{0,120}\}))?\s*\)/g; let m;
    while ((m = re.exec(html))) { let dd = null; if (m[2] != null) { const v = m[2]; if (/^'/.test(v)) dd = v.slice(1, -1); else if (/^\d+$/.test(v)) dd = +v; else { try { dd = Function('return ' + v)(); } catch (e) { dd = null; } } } out.push([m[1], dd]); }
    return { tt: (document.getElementById('tt') || {}).textContent || '', len: (document.getElementById('S') || document.body).innerText.length, links: out, geom: Function('return (' + g + ')()')() }; }, [s, d, geom.toString()]).catch(e => ({ err: String(e.message) }));
  await page.waitForTimeout(150);
  if (SHOTS && perScreen[s] === 1) await page.screenshot({ path: path.join(SHOTS, SIZE + '-' + s + '.png') }).catch(() => {});
  seen.set(k, { s, d, tt: found.tt, len: found.len, renderErr: found.err || null, geom: found.geom || [], errs: errs.slice(), cerrs: cerrs.slice() });
  for (const [ns, nd] of (found.links || [])) if (!seen.has(key(ns, nd))) queue.push([ns, nd]);
}
// ---- tap ----
const taps = [];
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
for (const [k, scr] of seen) {
  if (scr.renderErr) continue; if (ONLY && !ONLY.test(scr.s)) continue;
  const n = await page.evaluate(([s, d]) => { try { d == null ? nav(s) : nav(s, d); } catch (e) { return 0; } const S = document.getElementById('S') || document.body;
    return Array.from(S.querySelectorAll('button,[onclick],a[href],[role=button]')).filter(e => e.offsetParent || e.getClientRects().length).length; }, [scr.s, scr.d]).catch(() => 0);
  for (let i = 0; i < Math.min(n, 70); i++) {
    errs = []; cerrs = [];
    const r = await page.evaluate(([s, d, i, skipSrc]) => {
      document.querySelectorAll('.shell > div[id], body > div[id], .shell > div.ov, body > div.ov').forEach(x => { try { if (getComputedStyle(x).position === 'fixed' && x.id !== 'app') x.remove(); } catch (e) {} });
      try { d == null ? nav(s) : nav(s, d); } catch (e) { return null; }
      const S = document.getElementById('S') || document.body;
      const els = Array.from(S.querySelectorAll('button,[onclick],a[href],[role=button]')).filter(e => e.offsetParent || e.getClientRects().length);
      const el = els[i]; if (!el) return null;
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 60);
      const act = (el.getAttribute('onclick') || '').trim(); const href = el.getAttribute('href') || '';
      if (new RegExp(skipSrc, 'i').test(act + ' ' + label)) return { label, act: act.slice(0, 80), skipped: true };
      if (el.tagName === 'A' && !act) { const bad = !href || href === '#' || /^javascript:/i.test(href); return { label, act: 'href=' + href.slice(0, 80), link: true, deadLink: bad }; }
      if (el.disabled) return { label, act: act.slice(0, 80), disabled: true };
      // Is the control itself where a mouse can reach it?
      const br = el.getBoundingClientRect(); const offscreen = br.right < 0 || br.left > innerWidth || br.width < 2 || br.height < 2;
      window.__navs = 0; if (!window.__navW) { const o = window.nav; window.nav = function () { window.__navs++; return o.apply(this, arguments); }; window.__navW = 1; }
      window.__opened = [];
      window.__fixedBefore = new Set(Array.from(document.querySelectorAll('body *')).filter(x => { try { return getComputedStyle(x).position === 'fixed'; } catch (e) { return false; } }));
      const tt = (document.getElementById('tt') || {}).innerHTML || ''; const sh = S.innerHTML; const kids = document.querySelectorAll('body *').length;
      window.__snap = { tt, sh, kids };
      try { el.click(); } catch (e) { return { label, act: act.slice(0, 80), threw: String(e.message).slice(0, 150) }; }
      return { label, act: act.slice(0, 80), offscreen }; }, [scr.s, scr.d, i, SKIP.source]).catch(e => ({ label: '?', act: '', threw: String(e.message).slice(0, 150) }));
    if (!r) continue;
    if (r.skipped || r.link || r.disabled || r.threw) { taps.push({ screen: k, i, ...r, errs: errs.slice() }); continue; }
    await page.waitForTimeout(320);
    const a = await page.evaluate(() => { const s = window.__snap || {}; const S = document.getElementById('S') || document.body;
      // Any sheet/popup that opened: is it inside the window, and are its buttons reachable?
      const sheets = [];
      Array.from(document.querySelectorAll('body *')).filter(x => { try { return !window.__fixedBefore.has(x) && getComputedStyle(x).position === 'fixed' && x.offsetWidth > 120 && x.offsetHeight > 80; } catch (e) { return false; } }).slice(0, 3).forEach(x => {
        const b = x.getBoundingClientRect(); const bad = [];
        if (b.left < -2 || b.right > innerWidth + 2) bad.push('sheet sticks out sideways ' + Math.round(b.left) + '..' + Math.round(b.right) + ' of ' + innerWidth);
        if (b.top < -2 || b.bottom > innerHeight + 2) { if (getComputedStyle(x).overflowY === 'visible') bad.push('sheet taller than the window and cannot scroll ' + Math.round(b.top) + '..' + Math.round(b.bottom)); }
        x.querySelectorAll('button').forEach(btn => { const r = btn.getBoundingClientRect(); if (r.width > 1 && (r.right > innerWidth + 2 || r.left < -2)) bad.push('button "' + (btn.textContent || '').trim().slice(0, 30) + '" outside the window'); });
        if (bad.length) sheets.push(bad.join('; '));
      });
      return { nav: window.__navs || 0, opened: (window.__opened || []).length, sheets, overflow: document.documentElement.scrollWidth > innerWidth + 2,
        changed: ((document.getElementById('tt') || {}).innerHTML || '') !== s.tt || S.innerHTML !== s.sh || document.querySelectorAll('body *').length !== s.kids }; }).catch(() => ({ changed: true, gone: true, sheets: [] }));
    taps.push({ screen: k, i, ...r, effect: !!(a.nav || a.opened || a.changed), sheets: a.sheets, overflow: a.overflow, errs: errs.slice(), cerrs: cerrs.slice() });
  }
}
if (process.env.DATEHOOK) { const dh = await page.evaluate(() => window.__dh || {}).catch(() => ({})); for (const [k, v] of Object.entries(dh)) console.log('DATE-ONLY  x' + v + '  ' + k); }
await browser.close(); srv.close();
fs.writeFileSync(OUT, JSON.stringify({ size: SIZE, bootErrs, screens: [...seen.values()], taps }, null, 1));
const sErr = [...seen.values()].filter(x => x.renderErr || x.errs.length);
const sGeo = [...seen.values()].filter(x => x.geom && x.geom.length);
const tErr = taps.filter(t => t.threw || (t.errs && t.errs.length));
const noop = taps.filter(t => t.effect === false);
const dead = taps.filter(t => t.deadLink);
const badSheet = taps.filter(t => t.sheets && t.sheets.length);
const off = taps.filter(t => t.offscreen);
console.log(`${SIZE}: ${seen.size} screens, ${taps.length} controls (${taps.filter(t => t.skipped).length} skipped as destructive); boot errors: ${bootErrs.length}`);
console.log(`render errors ${sErr.length}, sideways ${sGeo.length}, tap errors ${tErr.length}, do-nothing ${noop.length}, dead links ${dead.length}, bad sheets ${badSheet.length}, offscreen controls ${off.length}`);
for (const e of bootErrs) console.log('BOOT-ERR   ' + e);
for (const x of sErr) console.log('RENDER-ERR ' + key(x.s, x.d) + ' ' + (x.renderErr || x.errs.join(' ; ')));
for (const x of sGeo) console.log('SIDEWAYS   ' + key(x.s, x.d) + ' ' + x.geom.join(' ; '));
for (const t of tErr) console.log('TAP-ERR    ' + t.screen + ' #' + t.i + ' ' + t.label + ' :: ' + t.act + ' !! ' + (t.threw || t.errs.join(' ; ')));
for (const t of badSheet) console.log('SHEET      ' + t.screen + ' #' + t.i + ' ' + t.label + ' :: ' + t.sheets.join(' | '));
for (const t of off) console.log('OFFSCREEN  ' + t.screen + ' #' + t.i + ' ' + t.label);
for (const t of noop) console.log('NOOP       ' + t.screen + ' #' + t.i + ' ' + t.label + ' :: ' + t.act);
for (const t of dead) console.log('DEADLINK   ' + t.screen + ' #' + t.i + ' ' + t.label + ' :: ' + t.act);
