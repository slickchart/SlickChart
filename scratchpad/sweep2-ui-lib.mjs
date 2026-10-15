// Shared harness for sweep2-ui-* repros. Boots slickchart.html signed in, /api/** mocked.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
export const PORT = process.env.PORT || 8899;
export function mk() { const results = []; return { results, check: (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' }),
  done(){ let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 300) : '')); } console.log(`\n${results.length - bad}/${results.length} passed`); return bad; } }; }
export async function launch(opts = {}) {
  const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: opts.tz || 'America/Los_Angeles' });
  return { b, ctx };
}
// server: an object {key: string} the mock serves on GET /api/store and updates on POST (plain overwrite, like api/store.js for most keys)
export async function page(ctx, server, opts = {}) {
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss().catch(() => {}));
  const toasts = []; const posts = [];
  await p.exposeFunction('__toast', t => toasts.push(String(t)));
  await p.addInitScript(() => { try { if (!localStorage.getItem('sc_token')) { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); } } catch (e) {}
    const iv = setInterval(() => { if (typeof proToast === 'function' && !window.__tw) { window.__tw = 1; const o = proToast; window.proToast = function (m) { try { window.__toast(String(m)); } catch (e) {} return o.apply(this, arguments); }; clearInterval(iv); } }, 5); });
  await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
    if (opts.offline && opts.offline()) return r.abort('internetdisconnected');
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') { if (opts.getDelay) await new Promise(z => setTimeout(z, opts.getDelay));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: Object.assign({ sc_hide_sample: '1' }, server) }) }); }
    if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); const it = j.items || (j.key ? { [j.key]: j.value } : {}); posts.push(Object.keys(it)); Object.assign(server, it); } catch (e) {} }
    if (opts.handler) { const h = await opts.handler(r, u, m); if (h) return; }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  return { p, errs, toasts, posts };
}
