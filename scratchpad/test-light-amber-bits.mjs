// Light mode (2026-11-19 screenshot sweep): three pieces kept their dark-mode colours, so in the light
// theme they showed dark-brown boxes with amber words at under 3:1: every "Couldn't ..." toast, the
// "Treatment notes not done yet" bar on Today's appointments, the photo-save failure toast and an
// automation warning. They now use the theme's amber colours. Checked in light AND dark. Also: Resources and
// My docs had an empty top bar, and What's new showed every provider a 'Signed in as / Owner mode' check line.
//   node scratchpad/test-light-amber-bits.mjs     (ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=... for Safari)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const PORT = 8500 + Math.floor(Math.random() * 90);
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const ENGINE = process.env.ENGINE || 'chromium';
const b = await pw[ENGINE].launch(ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (d ? '  — ' + d : '')); if (!c) fails++; };
const src = fs.readFileSync(ROOT + 'slickchart.html', 'utf8');
ok(!/background:\$\{done\?'var\(--p-surf2\)':'#241a08'\}/.test(src) && !src.includes("isErr?'#241a08'") && !src.includes("'#2a1206'"), 'no dark-only background left on these pieces');
const now = Date.now(); const clients = { c1: { id: 'c1', name: 'Ava Lane', email: 'a@ex.com', sqId: 'CUST1', source: 'square', created: now - 864e5 * 40, _ts: now - 864e5 * 40, _token: 't1' } };
for (const scheme of ['light', 'dark']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, serviceWorkers: 'block' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(s => { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_token', 'T'); localStorage.setItem('sc_hide_sample', '1'); localStorage.setItem('sc_provider_theme', s); }, scheme);
  await p.route('**/api/**', r => { const u = r.request().url(), m = r.request().method(); const J = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('cloud-status')) return J({ enabled: true });
    if (u.includes('/api/store') && m === 'GET') return J({ data: { sc_clients: JSON.stringify(clients), sc_onboarded: '1', sc_theme: JSON.stringify(scheme) } });
    if (u.includes('/api/square/connection')) return J({ oauth: true, connected: true, env: 'production' });
    if (u.includes('/api/square/appointments')) { const d = new Date(); d.setHours(0, 30, 0, 0); return J({ appointments: [{ id: 'b1', version: 1, startAt: d.toISOString(), status: 'ACCEPTED', locationId: 'L1', customerId: 'CUST1', customerName: 'Ava Lane', durationMinutes: 60, serviceName: 'Facial', createdAt: new Date(now - 864e5 * 9).toISOString() }] }); }
    return J({ ok: true, data: {}, clients: [], events: [], items: [] }); });
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(9000);
  const contrast = sel => p.evaluate(sel => { const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const [r, g, bb] = m.slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * bb; };
    const el = typeof sel === 'string' ? document.querySelector(sel) : null; if (!el) return null; let bgEl = el; while (bgEl && /rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(bgEl).backgroundColor)) bgEl = bgEl.parentElement;
    const a = lum(getComputedStyle(el).color), bg = lum(getComputedStyle(bgEl).backgroundColor); return Math.round(((Math.max(a, bg) + .05) / (Math.min(a, bg) + .05)) * 100) / 100; }, sel);
  await p.evaluate(() => proToast('Couldn’t save that just now. Please try again.'));
  const tc = await contrast('#pro-toast span'); ok(tc >= 4.5, scheme + ': an error toast reads at 4.5:1 or better', String(tc));
  await p.evaluate(() => { const t = document.getElementById('pro-toast'); if (t) t.remove(); nav('today-appts'); }); await p.waitForTimeout(800);
  const has = await p.evaluate(() => { const s = [...document.querySelectorAll('#S span')].find(x => /Treatment notes not done yet/.test(x.textContent)); if (s) s.id = '__tn'; return !!s; });
  ok(has, scheme + ': Today shows the treatment-notes bar');
  if (has) { const nc = await contrast('#__tn'); ok(nc >= 4.5, scheme + ': "Treatment notes not done yet" reads at 4.5:1 or better', String(nc)); }
  if (scheme === 'light') { for (const [scr, want] of [['forms', 'Resources'], ['vault', 'My docs']]) { await p.evaluate(s => nav(s), scr); await p.waitForTimeout(300); const t = await p.evaluate(() => document.getElementById('tt').textContent.trim()); ok(t === want, scr + ' has a title in the top bar', t); }
    await p.evaluate(() => nav('whats-new')); await p.waitForTimeout(300); const wn = await p.evaluate(() => document.getElementById('S').innerText); ok(!/Owner mode|email not detected/.test(wn), "What's new shows a provider no sign-in check line", wn.slice(-80)); }
  ok(!errs.length, scheme + ': no page errors', errs.join(' | '));
  await ctx.close();
}
await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
