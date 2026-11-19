// FRONT DOOR ON PHONES (2026-11-19): log in, sign up, forgot password and "sent" at every phone size, in
// light and dark (phone set to dark) and with big text, by REAL taps. Reports anything pushed sideways,
// controls under 40px tall, controls off screen with no way to scroll to them, and the field a tap on
// "Log in" with empty boxes points at. Screenshots to /tmp/claude-0/fd-*.png.
// usage: [PW_ENGINE=chromium] node scratchpad/sweep-front-door-phones.mjs   (serves slickchart-vercel itself)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : /\.woff2$/.test(f) ? 'font/woff2' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(0);
const PORT = srv.address().port;
const chromium = process.env.PW_ENGINE === 'chromium';
const browser = await (chromium ? pw.chromium : pw.webkit).launch(chromium ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const SIZES = { se: [320, 568], iphone: [390, 844], android: [412, 915], land: [844, 390] };
const problems = []; let shots = 0;
for (const [sz, [w, h]] of Object.entries(SIZES)) for (const dark of [false, true]) for (const zoom of [false, true]) {
  if (zoom && dark) continue;
  const tag = `${chromium ? 'cr' : 'wk'}-${sz}${dark ? '-dark' : ''}${zoom ? '-zoom' : ''}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: chromium, colorScheme: dark ? 'dark' : 'light', serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  if (zoom) await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'html{-webkit-text-size-adjust:150%!important;text-size-adjust:150%!important;font-size:150%}'; document.head.appendChild(st); }));
  await page.route('**/api/**', r => { const u = new URL(r.request().url()).pathname; if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }); if (/request-reset/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); if (/login|signup/.test(u)) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"That email and password don’t match."}' }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await page.goto(`http://localhost:${PORT}/slickchart.html`); await page.waitForTimeout(3500);
  for (const mode of ['welcome', 'login', 'signup', 'reset', 'sent', 'client', 'clientcode']) {
    await page.evaluate(m => { try { if (m === 'sent') _resetSentTo = 'jordan@example.com'; _setLoginMode(m); } catch (e) {} }, mode); await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const scr = document.getElementById('login-screen'); if (!scr || !scr.offsetParent && getComputedStyle(scr).position !== 'fixed') return { missing: true };
      const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
      const ctl = [...scr.querySelectorAll('button, a[href], input, [onclick]')].filter(vis);
      const scrollable = el => { let p = el.parentElement; while (p) { const st = getComputedStyle(p); if (/(auto|scroll)/.test(st.overflowY) && p.scrollHeight > p.clientHeight + 1) return true; p = p.parentElement; } return document.scrollingElement.scrollHeight > innerHeight + 1; };
      return { sideways: document.documentElement.scrollWidth > innerWidth + 1 || scr.scrollWidth > scr.clientWidth + 1,
        small: ctl.filter(e => (e.tagName === 'BUTTON' || e.tagName === 'INPUT') && (e.closest('label') || e).getBoundingClientRect().height < 40).map(e => (e.getAttribute('aria-label') || e.textContent || e.placeholder || e.id).trim().slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().height) + 'px'),
        cutoff: ctl.filter(e => { const r = e.getBoundingClientRect(); return (r.bottom > innerHeight || r.right > innerWidth + 1 || r.left < -1) && !scrollable(e); }).map(e => (e.textContent || e.placeholder || e.id).trim().slice(0, 30)),
        clipped: [...scr.querySelectorAll('button, label, h1, h2, p')].filter(vis).filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible').map(e => e.textContent.trim().slice(0, 30)),
        lowContrast: (() => { const out = []; for (const e of [...scr.querySelectorAll('p, label, span, a, button, h1, h2, div')].filter(vis).filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))) { const c = getComputedStyle(e).color; let p = e, bg; while (p) { bg = getComputedStyle(p).backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) break; p = p.parentElement; } const L = s => { const m = (s || '').match(/[\d.]+/g); if (!m) return 1; const [r, g, b] = m.slice(0, 3).map(v => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const a = L(c), bb = L(bg || 'rgb(255,255,255)'); const ratio = (Math.max(a, bb) + 0.05) / (Math.min(a, bb) + 0.05); if (ratio < 3) out.push(e.textContent.trim().slice(0, 25) + ' ' + ratio.toFixed(1)); } return out.slice(0, 6); })() }; });
    if (r.missing) { problems.push(`${tag} ${mode}: front door not showing`); continue; }
    for (const k of ['small', 'cutoff', 'clipped', 'lowContrast']) if (r[k].length) problems.push(`${tag} ${mode} ${k}: ${r[k].join(' | ')}`);
    if (r.sideways) problems.push(`${tag} ${mode}: pushed sideways`);
    if (!zoom && (sz === 'se' || sz === 'android')) { await page.screenshot({ path: `/tmp/claude-0/fd-${tag}-${mode}.png` }); shots++; }
  }
  // Log in with empty boxes, by a real tap: the message must show and be on screen.
  await page.evaluate(() => _setLoginMode('login')); await page.waitForTimeout(200);
  const btn = page.locator('#login-screen button[onclick^="doLogin"]').first();
  if (await btn.count()) { await btn.tap().catch(e => problems.push(`${tag}: Log in button could not be tapped: ${String(e.message).split('\n')[0]}`)); await page.waitForTimeout(500);
    const m = await page.evaluate(() => { const e = document.getElementById('login-err'); if (!e) return null; const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), onScreen: r.top >= 0 && r.bottom <= innerHeight, h: r.height }; });
    if (!m || !m.t) problems.push(`${tag}: empty Log in shows no message`); else if (!m.onScreen) problems.push(`${tag}: empty Log in message is off screen (${m.t})`); }
  if (errs.length) problems.push(`${tag}: page errors ${errs.join(' | ')}`);
  await ctx.close();
}
await browser.close(); srv.close();
console.log(`front door: ${Object.keys(SIZES).length} sizes x light/dark/big text x 7 screens, ${shots} screenshots`);
console.log(problems.length ? problems.join('\n') : 'NO PROBLEMS'); process.exit(0);
