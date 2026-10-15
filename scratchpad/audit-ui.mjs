// UI/UX AUDIT across every crawled screen. Measures, per visible element:
//  - tap targets: smaller than 24x24 CSS px (WCAG 2.2 SC 2.5.8 minimum) and smaller than 44x44 (Apple HIG / 2.5.5)
//  - text contrast below 4.5:1 (3:1 for large text) — WCAG 1.4.3, computed from styles incl. ancestor backgrounds
//  - inputs/selects/textareas with computed font-size < 16px (iOS Safari zooms the page on focus)
//  - buttons / role=button / links with no accessible name (WCAG 4.1.2), images without alt (1.1.1)
//  - form fields with no label (placeholder-only) (WCAG 3.3.2 / 1.3.1)
//  - body text under 12px; horizontal overflow at 390px (reflow, 1.4.10)
// usage: node audit-ui.mjs <crawl.json> <page.html> <out.json> [theme light|dark] [app provider|client]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const [CRAWLF, PAGE, OUT, THEME = 'dark', APP = 'provider'] = process.argv.slice(2);
const CRAWL = JSON.parse(fs.readFileSync(CRAWLF, 'utf8'));
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: THEME });
const page = await ctx.newPage();
await page.addInitScript(([app, theme]) => { try { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem(app === 'provider' ? 'sc_provider_theme' : 'sc_client_theme', theme);
  if (app === 'provider' && !location.pathname.includes('demo')) localStorage.setItem('sc_token', 'TESTTOKEN'); } catch (e) {} window.open = () => null; }, [APP, THEME]);
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.route(/^(?!http:\/\/localhost:8899).*/, r => /cdn\.jsdelivr|fonts\.g|cdnjs|unpkg/.test(r.request().url()) ? r.continue() : r.abort());
await page.goto('http://localhost:8899/' + PAGE, { waitUntil: 'load' }); await page.waitForTimeout(2800);
const meta = await page.evaluate(() => ({ viewport: (document.querySelector('meta[name=viewport]') || {}).content || '' }));
const screens = CRAWL.screens.filter(x => !x.renderErr && !(x.errs && x.errs.length) && !/\$\{|"\+/.test(JSON.stringify(x.d)));
const all = [];
for (const scr of screens) {
  const res = await page.evaluate(([s, d]) => {
    document.querySelectorAll('.shell > div[id], body > div[id]').forEach(x => { try { if (getComputedStyle(x).position === 'fixed' && x.id !== 'app') x.remove(); } catch (e) {} });
    try { d == null ? nav(s) : nav(s, d); } catch (e) { return null; }
    const out = [];
    const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
    const desc = e => { const t = (e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || e.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 50); return (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ' "' + t + '"'); };
    const act = e => (e.getAttribute('onclick') || e.getAttribute('oninput') || '').slice(0, 60);
    const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] == null ? 1 : p[3] }; };
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const bgOf = e => { const stack = []; let n = e; while (n && n.nodeType === 1) { const cs = getComputedStyle(n); if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) stack.push(c); if (c && c.a >= 1) break; n = n.parentElement; }
      let base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }; if (base.a < 1) base = { r: 255, g: 255, b: 255, a: 1 }; for (let i = stack.length - 1; i >= 0; i--) base = blend(stack[i], base); return base; };
    const root = document.getElementById('S') || document.body;
    // tap targets
    root.querySelectorAll('button,a[href],[onclick],[role=button],input[type=checkbox],input[type=radio],select,[role=switch]').forEach(e => {
      if (!vis(e)) return; if (e.tagName === 'A' && e.closest('p,li') && !e.getAttribute('onclick')) return; // inline text links are exempt
      const r = e.getBoundingClientRect(); const w = Math.round(r.width), h = Math.round(r.height);
      if (w < 24 || h < 24) out.push({ rule: 'target<24', el: desc(e), size: w + 'x' + h, act: act(e) });
      else if (w < 44 || h < 44) out.push({ rule: 'target<44', el: desc(e), size: w + 'x' + h, act: act(e) });
      const name = (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title') || e.textContent || '').trim() || (e.querySelector('img[alt]') || {}).alt;
      if (!name && e.tagName !== 'SELECT' && e.type !== 'checkbox' && e.type !== 'radio') out.push({ rule: 'no-name', el: desc(e) + ' ' + e.innerHTML.slice(0, 60).replace(/\s+/g, ' '), act: act(e) });
      if (e.tagName === 'DIV' && e.getAttribute('onclick') && !e.getAttribute('role') && !e.getAttribute('tabindex')) out.push({ rule: 'div-click-no-role', el: desc(e), act: act(e) });
    });
    root.querySelectorAll('img').forEach(e => { if (vis(e) && !e.hasAttribute('alt')) out.push({ rule: 'img-no-alt', el: desc(e) + ' ' + (e.getAttribute('src') || '').slice(0, 40) }); });
    // fields
    root.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=color]),textarea,select').forEach(e => {
      if (!vis(e)) return; const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 16) out.push({ rule: 'input-font<16', el: desc(e), size: fs + 'px' });
      const labelled = e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e.id && document.querySelector('label[for="' + e.id + '"]')) || e.closest('label');
      if (!labelled) out.push({ rule: 'field-no-label', el: desc(e) });
    });
    // text contrast + tiny text: leaf-ish text nodes
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const seenEl = new Set(); let t;
    while ((t = tw.nextNode())) { const s = t.textContent.trim(); if (s.length < 2) continue; const e = t.parentElement; if (!e || seenEl.has(e) || !vis(e)) continue; seenEl.add(e);
      const cs = getComputedStyle(e); const fg = parse(cs.color); if (!fg) continue; const bg = bgOf(e); const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight) >= 700;
      if (size < 12) out.push({ rule: 'text<12px', el: desc(e), size: size + 'px' });
      if (!bg) continue; const f = fg.a < 1 ? blend(fg, bg) : fg; const L1 = lum(f), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const large = size >= 24 || (bold && size >= 18.66); const need = large ? 3 : 4.5;
      if (ratio < need) out.push({ rule: 'contrast', el: desc(e), ratio: ratio.toFixed(2), need, size: size + 'px', color: cs.color });
    }
    const over = document.documentElement.scrollWidth > window.innerWidth + 1; if (over) out.push({ rule: 'h-overflow', el: 'page', size: document.documentElement.scrollWidth + 'px' });
    return { tt: (document.getElementById('tt') || {}).textContent || '', out };
  }, [scr.s, scr.d]).catch(() => null);
  if (res) all.push({ screen: scr.s + (scr.d != null ? '|' + JSON.stringify(scr.d) : ''), tt: res.tt, issues: res.out });
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify({ meta, screens: all }, null, 1));
const tally = {}; all.forEach(s => s.issues.forEach(i => { tally[i.rule] = (tally[i.rule] || 0) + 1; }));
console.log(APP + ' ' + PAGE + ' (' + THEME + '): ' + all.length + ' screens; viewport meta: ' + meta.viewport);
console.log(JSON.stringify(tally));
