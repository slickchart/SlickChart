// Client app readability: text under WCAG AA on every client screen, light and dark (2026-11-19).
import { launch, mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const out = {};
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', colorScheme: theme });
  const page = await ctx.newPage();
  await mockApi(page, { records: { TOK: clientRecord('c1', 'Cara Client', { providerName: 'Marco Rossi' }) } });
  await page.addInitScript(t => { try { localStorage.setItem('sc_client_theme', t); } catch (e) {} }, theme);
  await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.evaluate(t => { try { _scSetTheme(t); } catch (e) {} }, theme);
  for (const s of ['home', 'journey', 'library', 'messages', 'notif-settings', 'notifications', 'profile', 'rebook', 'shop', 'homecare', 'previsit', 'checkin', 'virtual-submit']) {
    const r = await page.evaluate(s => { try { nav(s); } catch (e) { return ['nav error ' + e.message]; }
      const S = document.getElementById('S') || document.body;
      const rgb = c => { const m = String(c).match(/[\d.]+/g); return m ? m.map(Number) : null; };
      const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bgOf = el => { let e = el; while (e) { const cs = getComputedStyle(e); const c = rgb(cs.backgroundColor); if (c && (c.length < 4 || c[3] > 0.9)) return c; if (c && c.length === 4 && c[3] > 0.3) return null; if (cs.backgroundImage !== 'none') return null; e = e.parentElement; } return rgb(getComputedStyle(document.body).backgroundColor) || [255, 255, 255]; };
      const o = [];
      S.querySelectorAll('*').forEach(el => { if (!(el.offsetParent || el.getClientRects().length)) return;
        const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(); if (own.length < 2) return;
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.95) return;
        const fg = rgb(cs.color), bg = bgOf(el); if (!fg || !bg) return; if (fg.length === 4 && fg[3] < 1) return;
        const L1 = lum(fg), L2 = lum(bg); const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.6 && +cs.fontWeight >= 700);
        if (cr < (big ? 3 : 4.5) && !el.closest('button[disabled],[aria-disabled=true]')) o.push(cr.toFixed(2) + ' ' + cs.color + ' on rgb(' + bg.slice(0, 3).join(',') + ') "' + own.slice(0, 40) + '"');
      }); return o; }, s);
    await page.waitForTimeout(200);
    for (const x of r) (out[theme + ' ' + x] = out[theme + ' ' + x] || new Set()).add(s);
  }
  await ctx.close();
}
const rows = Object.entries(out).sort((a, b) => parseFloat(a[0].split(' ')[1]) - parseFloat(b[0].split(' ')[1]));
console.log('low-contrast items: ' + rows.length);
for (const [k, v] of rows.slice(0, 80)) console.log(k.slice(0, 160) + '  [' + [...v].slice(0, 4).join(',') + ']');
await browser.close();
