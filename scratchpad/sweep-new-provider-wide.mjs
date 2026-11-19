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
const VP = { mac: { width: 1440, height: 900 }, ipad: { width: 1032, height: 1376 }, imac: { width: 2048, height: 1152 }, phone: { width: 390, height: 844 }, android: { width: 412, height: 915 }, se: { width: 375, height: 667 }, small: { width: 320, height: 568 }, land: { width: 844, height: 390 }, ipadland: { width: 1376, height: 1032 } }[SIZE];
const TOUCH = ['ipad', 'ipadland', 'phone', 'se', 'small', 'land', 'android'].includes(SIZE);
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
// TOKENS=1: every client already has her app link (most real clients do), so sends go straight out.
if (process.env.TOKENS) for (const c of Object.values(clients)) c._token = 'tok_' + c.id;
// LONG=1: real-world long names (hyphenated surnames, long studio names, long emails) to catch text that pushes a phone screen sideways.
if (process.env.LONG) for (const c of Object.values(clients)) { c.name = c.name.replace(' ', ' Montgomery-Vanderbilt-') + ' Alexandrina-Rosalind'; c.email = 'alexandrina.montgomery.vanderbilt.' + c.id.toLowerCase() + '@extremelylongdomainname-example.com'; }
const BIZ = process.env.LONG ? 'The Botanical Aesthetics Skin Wellness and Lash Studio of Southern California' : 'Frances Skin Studio';
const seed = { sc_clients: JSON.stringify(clients), sc_onboarded: '1', sc_professions: JSON.stringify((process.env.PROF || 'esty').split(',')), sc_wsname: JSON.stringify(BIZ),
  sc_bizinfo: JSON.stringify({ name: BIZ, phone: '5550100000', email: 'studio@ex.com' }) };
// DATEHOOK=1: record every place the app parses a bare 'YYYY-MM-DD' with new Date()/Date.parse.
// That reads it as UTC midnight, which is the PREVIOUS day anywhere west of UTC (every US provider).
if (process.env.DATEHOOK) await page.addInitScript(() => { const D = Date; const hits = window.__dh = {};
  const rec = s => { if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) { const st = (new Error().stack || '').split('\n').slice(2, 4).map(x => x.trim()).join(' < '); hits[st] = (hits[st] || 0) + 1; } };
  function W(...a) { if (!new.target) return D(); if (a.length === 1) rec(a[0]); return new D(...a); }
  W.prototype = D.prototype; W.now = D.now; W.UTC = D.UTC; W.parse = s => { rec(s); return D.parse(s); }; window.Date = W; });
await page.addInitScript(w => { window.__WORDS = w; }, process.env.WORDS || '');
if (process.env.SAFE) await page.addInitScript(() => { window.__SAFE = [47, 34]; });
if (process.env.DIRTY) await page.addInitScript(() => { window.__DIRTY = 1; });
if (process.env.SLOW || process.env.DUPSAVE) await page.addInitScript(() => { window.__SLOW = 1; });
if (process.env.TEXTZOOM) await page.addInitScript(z => { window.__TZOOM = z; }, +process.env.TEXTZOOM);
await page.addInitScript(([app, native]) => { try { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_login_email', 'new@spa.com'); localStorage.setItem('sc_hide_sample', '1'); } catch (e) {}
  if (native) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
  window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return null; };
  try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {}
  try { navigator.clipboard.writeText = () => Promise.resolve(); } catch (e) {} }, ['provider', TOUCH && !process.env.SAFE]);
// NET=500|offline (rotation area 14): after boot, every other /api call fails, so each screen and tap is
// checked for throws and silent failures with no server.
const NET = process.env.NET || ''; let netFail = false;
// SLOW=1: after boot every non-GET /api call takes 3 s to answer (a weak phone signal), each is recorded,
// and every tap is a quick double tap. A Save/Send/Charge that sends twice is reported.
const SLOW = !!(process.env.SLOW || process.env.DUPSAVE); const posts = []; let slowOn = false;
await page.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (process.env.SLOW && slowOn && m !== 'GET') { posts.push({ t: Date.now(), p: u.replace(/^https?:\/\/[^/]+/, '').split('?')[0], b: (r.request().postData() || '').slice(0, 160) }); await new Promise(z => setTimeout(z, 3000)); }
  if (netFail && !/cloud-status|billing-status/.test(u) && !(u.includes('/api/store') && m === 'GET')) return NET === 'offline' ? r.abort('internetdisconnected') : NET === '401' ? r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Not signed in"}' }) : r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Something went wrong."}' });
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: seed }) });
  // BUSY=1: a full book from Square: 10 back-to-back today, 4 a day for two weeks, a few cancelled.
  if (process.env.BUSY && u.includes('/api/square/appointments')) { const d0 = new Date(); d0.setHours(8, 0, 0, 0); const ap = [];
    for (let i = 0; i < 10; i++) ap.push({ id: 'bk_t' + i, version: 1, startAt: new Date(d0.getTime() + i * 3600000).toISOString(), status: 'ACCEPTED', locationId: 'L1', customerId: 'CUST' + i, customerName: clients['sq_CUST' + i].name, customerEmail: clients['sq_CUST' + i].email, customerPhone: '', createdAt: new Date(now - 864e5 * 5).toISOString(), durationMinutes: 60, serviceVariationId: 'SV1', serviceName: process.env.LONG ? 'Signature Hydrating Oxygen Facial with LED and Lymphatic Massage Add-on' : 'Signature Facial', teamMemberId: 'TM1' });
    for (let d = 1; d < 14; d++) for (let j = 0; j < 4; j++) ap.push({ id: 'bk_' + d + '_' + j, version: 1, startAt: new Date(d0.getTime() + d * 864e5 + j * 2 * 3600000).toISOString(), status: j === 3 && d % 3 === 0 ? 'CANCELLED_BY_CUSTOMER' : 'ACCEPTED', locationId: 'L1', customerId: 'CUST' + ((d * 4 + j) % 40), customerName: clients['sq_CUST' + ((d * 4 + j) % 40)].name, customerEmail: '', customerPhone: '', createdAt: new Date(now - 864e5).toISOString(), durationMinutes: 90, serviceVariationId: 'SV2', serviceName: 'Brow Lamination', teamMemberId: 'TM1' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: ap.length, appointments: ap.filter(a => a.status === 'ACCEPTED') }) }); }
  // SQ=off: a provider who never connected Square (or disconnected it): every Square call answers nosquare.
  if (process.env.SQ === 'off' && u.includes('/api/square/connection')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"oauth":true,"connected":false}' });
  if (process.env.SQ === 'off' && /\/api\/square\//.test(u)) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Square is not connected.","code":"nosquare"}' });
  if (u.includes('/api/square/connection')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"oauth":true,"connected":true,"env":"production","merchantName":"Frances Skin Studio"}' });
  if (u.includes('/api/billing-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"active":true,"status":"trialing","plan":"pro"}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"appointments":[],"items":[]}' }); });
await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
// SAFE=1: an iPhone home-screen app (black-translucent status bar, viewport-fit=cover): the notch takes
// 47px at the top and the home bar 34px at the bottom. The page is served with env(safe-area-inset-*) set
// to those, and every button in a sheet that opens is checked to sit clear of both.
const SAFE = !!process.env.SAFE, SAFE_T = 47, SAFE_B = 34;
if (SAFE) await page.route('**/slickchart.html', async r => { const res = await r.fetch(); let body = await res.text();
  body = body.replace(/env\(\s*safe-area-inset-top\s*(,[^)]*)?\)/g, SAFE_T + 'px').replace(/env\(\s*safe-area-inset-bottom\s*(,[^)]*)?\)/g, SAFE_B + 'px')
    .replace(/env\(\s*safe-area-inset-(left|right)\s*(,[^)]*)?\)/g, '0px');
  return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body }); });
await page.goto('http://localhost:' + PORT + '/slickchart.html', { waitUntil: 'load' }); await page.waitForTimeout(9000);
const bootErrs = errs.slice();
if (NET) netFail = true;
if (SLOW) slowOn = true;
// ---- crawl ----
const key = (s, d) => s + '|' + (d == null ? '' : JSON.stringify(d));
const seen = new Map(); const queue = [['home', null], ['calendar', null], ['payments', null], ['messages', null], ['clients', null], ['more', null], ['client', 'sq_CUST1'], ['booking-link', null], ['forms', null]];
const perScreen = {};
const geom = () => { // sideways overflow and content wider than the window
  const vw = innerWidth; const out = [];
  // TEXTZOOM=1.3: Android's "font size" setting scales every text in the app's web view (textZoom).
  if (window.__TZOOM) { const els = Array.from(document.querySelectorAll('body *')).filter(e => !e.__tz && e.childNodes.length); const fs = els.map(e => parseFloat(getComputedStyle(e).fontSize)); els.forEach((e, i) => { e.__tz = 1; if (fs[i]) e.style.setProperty('font-size', (fs[i] * window.__TZOOM).toFixed(1) + 'px', 'important'); });
    Array.from(document.querySelectorAll('#S button, .nav .ni, #S [role=button]')).forEach(e => { const st = getComputedStyle(e); if (e.offsetWidth > 0 && e.scrollWidth > e.clientWidth + 3 && /(hidden|clip)/.test(st.overflow + st.overflowX)) out.push('text cut off: "' + (e.innerText || '').trim().slice(0, 30) + '" ' + e.scrollWidth + '>' + e.clientWidth); });
  }
  // A button past the edge of the window that no sideways-scrolling row can bring back.
  Array.from(document.querySelectorAll('#S button')).forEach(e => { const r = e.getBoundingClientRect(); if (!(e.offsetWidth > 0 && (r.right > vw + 2 || r.left < -2))) return;
    let q = e.parentElement; while (q && q.id !== 'S' && q !== document.body) { if (/(auto|scroll)/.test(getComputedStyle(q).overflowX)) return; q = q.parentElement; }
    out.push('button past the edge: "' + ((e.innerText || '').trim() || e.getAttribute('aria-label') || '').slice(0, 30) + '"'); });
  if (document.documentElement.scrollWidth > vw + 2) out.push('page scrolls sideways ' + document.documentElement.scrollWidth + '>' + vw);
  const S = document.getElementById('S'); if (S && S.scrollWidth > S.clientWidth + 4) { const sr = S.getBoundingClientRect(); const wide = Array.from(S.querySelectorAll('*')).filter(e => { const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.right > sr.right + 4)) return false; let q = e.parentElement; while (q && q !== S) { if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(q).overflowX)) return false; q = q.parentElement; } return true; }).slice(0, 2).map(e => e.tagName + '.' + String(e.className || '').slice(0, 20) + '"' + (e.innerText || '').trim().slice(0, 40) + '" right ' + Math.round(e.getBoundingClientRect().right));
    out.push('screen content wider than its box ' + S.scrollWidth + '>' + S.clientWidth + (wide.length ? ' [' + wide.join(' | ') + ']' : '')); }
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
// LEAVE=1: on every screen with a box to type in, type a few words the way she would, then tap Home on
// the bottom bar. The words must still be there when she comes back, or the app must have asked.
if (process.env.LEAVE) {
  const rows = [];
  for (const [k, scr] of seen) {
    await page.evaluate(([s, d]) => { document.querySelectorAll('#confirm-modal').forEach(x => x.remove()); document.querySelectorAll('body > div').forEach(x => { try { if (getComputedStyle(x).position === 'fixed' && x.id !== 'app' && !x.querySelector('#S')) x.remove(); } catch (e) {} }); try { d == null ? nav(s) : nav(s, d); } catch (e) {} }, [scr.s, scr.d]);
    await page.waitForTimeout(450);
    const fid = await page.evaluate(() => { const S = document.getElementById('S') || document.body;
      const el = [...S.querySelectorAll('textarea'), ...S.querySelectorAll('input[type=text],input:not([type])')].find(e => e.offsetParent && !e.readOnly && !e.disabled && !/search|find|filter/i.test((e.id || '') + ' ' + (e.placeholder || '') + ' ' + (e.getAttribute('aria-label') || '')) && e.getBoundingClientRect().top < innerHeight - 80 && e.getBoundingClientRect().top > 60);
      if (!el) return null; if (!el.id) el.id = '__lv' + Math.random().toString(36).slice(2, 7); return { id: el.id, tag: el.tagName, ph: (el.placeholder || el.getAttribute('aria-label') || '').slice(0, 40) }; });
    if (!fid) continue;
    try { await page.click('#' + fid.id, { timeout: 2000 }); await page.keyboard.press('End'); await page.keyboard.type(' Zebra words 77'); } catch (e) { continue; }
    await page.waitForTimeout(200);
    try { await page.click('.nav .ni:first-child, .nav button:first-child, .nav > *:first-child', { timeout: 2000 }); } catch (e) { await page.evaluate(() => nav('home')); }
    await page.waitForTimeout(500);
    const asked = await page.evaluate(() => !!document.getElementById('confirm-modal'));
    if (asked) { rows.push(['asked', k, fid.ph]); await page.evaluate(() => { const c = document.getElementById('confirm-modal'); const x = c && c.querySelector('#_cf-cancel'); if (x) x.click(); else if (c) c.remove(); }); continue; }
    await page.evaluate(([s, d]) => { try { d == null ? nav(s) : nav(s, d); } catch (e) {} }, [scr.s, scr.d]); await page.waitForTimeout(450);
    const kept = await page.evaluate(() => [...document.querySelectorAll('input,textarea')].some(e => /Zebra words 77/.test(e.value || '')) || /Zebra words 77/.test((document.getElementById('S') || document.body).innerText));
    rows.push([kept ? 'kept' : 'LOST', k, fid.tag + ' ' + fid.ph]);
  }
  for (const r of rows) console.log(r[0].padEnd(6) + ' ' + r[1] + '  [' + r[2] + ']');
  console.log('LEAVE: ' + rows.length + ' screens with a box; lost ' + rows.filter(r => r[0] === 'LOST').length);
  await browser.close(); srv.close(); process.exit(0);
}
for (const [k, scr] of seen) {
  if (scr.renderErr) continue; if (ONLY && !ONLY.test(scr.s)) continue;
  const n = await page.evaluate(([s, d]) => { try { d == null ? nav(s) : nav(s, d); } catch (e) { return 0; } const S = document.getElementById('S') || document.body;
    return Array.from(S.querySelectorAll('button,[onclick],a[href],[role=button]')).filter(e => e.offsetParent || e.getClientRects().length).length; }, [scr.s, scr.d]).catch(() => 0);
  for (let i = 0; i < Math.min(n, 70); i++) {
    errs = []; cerrs = []; const pBefore = posts.length;
    if (process.env.DUPSAVE) await page.evaluate(() => { const snap = {}; try { for (const k of _lsAllKeys()) { if (!/^sc_/.test(k)) continue; let v; try { v = JSON.parse(_lsGet(k)); } catch (e) { continue; } if (v && typeof v === 'object') snap[k] = new Set((Array.isArray(v) ? v : Object.values(v)).map(x => JSON.stringify(x))); } } catch (e) {} window.__dsnap = snap; }).catch(() => {});
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
      if (window.__SLOW) setTimeout(() => { try { if (el.isConnected && !el.disabled && getComputedStyle(el).pointerEvents !== 'none') el.click(); } catch (e) {} }, 220);
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
        if (window.__SAFE) x.querySelectorAll('button,[role=button],input,textarea,select').forEach(btn => { const r = btn.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
          let sc = btn.parentElement; while (sc && sc !== x.parentElement) { const st = getComputedStyle(sc); if (/(auto|scroll)/.test(st.overflowY) && sc.scrollHeight > sc.clientHeight + 1) break; sc = sc.parentElement; }
          const canDown = sc && sc !== x.parentElement && sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1, canUp = sc && sc !== x.parentElement && sc.scrollTop > 0;
          if (r.top < window.__SAFE[0] && r.bottom > 0 && !canUp) bad.push('"' + (btn.textContent || btn.placeholder || btn.tagName).trim().slice(0, 30) + '" under the notch (top ' + Math.round(r.top) + ')');
          if (r.bottom > innerHeight - window.__SAFE[1] && r.top < innerHeight && !canDown) bad.push('"' + (btn.textContent || btn.placeholder || btn.tagName).trim().slice(0, 30) + '" on the home bar (bottom ' + Math.round(r.bottom) + ' of ' + innerHeight + ')'); });
        if (bad.length) sheets.push(bad.join('; '));
      });
      return { nav: window.__navs || 0, opened: (window.__opened || []).length, sheets, overflow: document.documentElement.scrollWidth > innerWidth + 2,
        changed: ((document.getElementById('tt') || {}).innerHTML || '') !== s.tt || S.innerHTML !== s.sh || document.querySelectorAll('body *').length !== s.kids }; }).catch(() => ({ changed: true, gone: true, sheets: [] }));
    if (SLOW) { const p0 = pBefore; const t0 = Date.now();
      const lbl = await page.evaluate(() => { const fresh = Array.from(document.querySelectorAll('body *')).filter(x => { try { return !window.__fixedBefore.has(x) && document.body.contains(x) && getComputedStyle(x).position === 'fixed' && x.offsetWidth > 120 && x.offsetHeight > 80; } catch (e) { return false; } });
        const sh = fresh[fresh.length - 1]; if (!sh) return null;
        const today = new Date(); const ymd = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate() + 1).padStart(2, '0');
        sh.querySelectorAll('input,textarea,select').forEach(f => { if (f.disabled || f.readOnly || f.offsetWidth < 1) return; const ty = (f.type || '').toLowerCase();
          if (f.tagName === 'SELECT') { if (!f.value && f.options.length > 1) { f.selectedIndex = 1; f.dispatchEvent(new Event('change', { bubbles: true })); } return; }
          if (['checkbox', 'radio', 'file', 'range', 'color', 'hidden', 'button', 'submit'].includes(ty) || f.value) return;
          f.value = ty === 'email' ? 'slow.sweep@ex.com' : ty === 'tel' ? '5550109999' : ty === 'number' ? '25' : ty === 'date' ? ymd : ty === 'time' ? '10:00' : ty === 'password' ? 'Sweep-pass-2026!' : 'Slow sweep 25';
          f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true })); });
        const btns = Array.from(sh.querySelectorAll('button')).filter(b => b.offsetWidth > 0 && !b.disabled && /^(save|send|create|add|book|charge|confirm|done|submit|pay|request|schedule|invite|copy and send|send now|save and send)/i.test((b.textContent || '').trim()) && !/delete|remove|cancel|sign out|refund/i.test(b.textContent || ''));
        const b = btns[btns.length - 1]; if (!b) return null; const l = (b.textContent || '').trim().slice(0, 40);
        b.click(); setTimeout(() => { try { if (b.isConnected && !b.disabled && getComputedStyle(b).pointerEvents !== 'none') b.click(); } catch (e) {} }, 220); return l; }).catch(() => null);
      if (lbl) await page.waitForTimeout(700);
      const mine = posts.slice(p0); const byP = {}; for (const x of mine) byP[x.p] = (byP[x.p] || 0) + 1;
      const dup = Object.entries(byP).filter(([k, n]) => n > 1 && !/^\/api\/(store|device-report|app-launch|client-log|log)/.test(k));
      if (dup.length) a.sheets = (a.sheets || []).concat('DOUBLE SEND (' + (lbl || r.label) + '): ' + dup.map(([k, n]) => n + 'x ' + k.slice(0, 120)).join(' ; '));
      void t0; }
    if (process.env.DUPSAVE) { await page.waitForTimeout(600); const d = await page.evaluate(() => { const out = []; const snap = window.__dsnap || {}; const strip = x => { if (!x || typeof x !== 'object') return JSON.stringify(x); const o = {}; for (const k of Object.keys(x).sort()) if (!/^(id|_id|_ts|ts|at|created|createdAt|updated|updatedAt|_uAt|key|uid)$/.test(k)) o[k] = x[k]; return JSON.stringify(o); };
        try { for (const k of _lsAllKeys()) { if (!/^sc_/.test(k) || /log|seen|launch|history|tomb|deleted|hidden|audit|report|queue|cache|recent/.test(k)) continue; let v; try { v = JSON.parse(_lsGet(k)); } catch (e) { continue; } if (!v || typeof v !== 'object') continue; const before = snap[k] || new Set();
          const vals = Array.isArray(v) ? v : Object.values(v).filter(x => x && typeof x === 'object' && 'id' in x); const fresh = vals.filter(x => !before.has(JSON.stringify(x)) && x && typeof x === 'object'); const seen = {}; for (const x of fresh) { const h = strip(x); if (seen[h]) { out.push(k + ': ' + h.slice(0, 90)); break; } seen[h] = 1; } } } catch (e) {} return out; }).catch(() => []);
      if (d.length) a.sheets = (a.sheets || []).concat('TWO COPIES SAVED: ' + d.join(' ; ')); }
    // BACK=1: Android's back button (the app's _scBack) must close whatever sheet the tap opened, and throw nothing.
    if (process.env.BACK) { const bk = await page.evaluate(() => { const fresh = () => Array.from(document.querySelectorAll('body *')).filter(x => { try { return !window.__fixedBefore.has(x) && document.body.contains(x) && getComputedStyle(x).position === 'fixed' && x.offsetWidth > 120 && x.offsetHeight > 80; } catch (e) { return false; } });
        const before = fresh(); if (!before.length) return null; let ret, threw = '';
        let typed = null; if (window.__DIRTY) { for (const sh of before) { const ta = Array.from(sh.querySelectorAll('textarea')).find(t => t.offsetWidth > 0 && !t.readOnly && !t.disabled); if (ta) { ta.focus(); ta.value = (ta.value ? ta.value + ' ' : '') + 'Typed by the sweep, several sentences of a note.'; ta.dataset.typed = '1'; ta.dispatchEvent(new Event('input', { bubbles: true })); typed = ta.id || ta.placeholder || 'textarea'; break; } } if (!typed) return null; } try { ret = _scBack(); } catch (e) { threw = String(e.message).slice(0, 120); }
        return new Promise(res => setTimeout(() => { const left = before.filter(x => x.id !== 'pro-toast' && document.body.contains(x) && getComputedStyle(x).display !== 'none' && x.offsetWidth > 0); res({ ret, typed, asked: !!document.getElementById('confirm-modal'), threw, left: left.map(x => (x.id || x.className || x.tagName) + ':' + (x.innerText || '').trim().slice(0, 40).replace(/\s+/g, ' ')) }); }, 450)); }).catch(e => ({ threw: String(e.message).slice(0, 100), left: [] }));
      if (bk && bk.typed && !bk.left.length && !bk.asked) a.sheets = (a.sheets || []).concat('BACK with typed text: closed without asking (' + bk.typed + ')');
      try { await page.evaluate(() => { const c = document.getElementById('confirm-modal'); if (c) { const x = c.querySelector('#_cf-cancel,#_is-cancel'); if (x) x.click(); else c.remove(); } }); } catch (e) {}
      if (bk && !bk.typed && (bk.threw || bk.left.length || bk.ret === false)) a.sheets = (a.sheets || []).concat('BACK button: ' + (bk.threw ? 'threw ' + bk.threw : bk.ret === false ? 'did nothing' : 'sheet stayed open ' + bk.left.join(' | '))); }
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
