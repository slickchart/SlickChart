// Shared boot for the sweep-dup-edge-*.mjs repros (same setup as test-auto-dedupe.mjs).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
export const PORT = process.env.PORT || 8899;
export function reporter() {
  const results = [];
  const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
  const done = () => { let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 400) : '')); }
    console.log(`\n${results.length - bad}/${results.length} passed`); return bad; };
  return { check, done };
}
// acct: the account's sc_clients object. extra: other kv keys (strings). Returns {b,p,errs,toasts,posts}.
export async function boot(acct, extra = {}, waitMs = 16000) {
  const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  const toasts = []; await p.exposeFunction('__toast', t => toasts.push(t));
  await p.addInitScript(() => { const iv = setInterval(() => { if (typeof proToast === 'function' && !window.__tw) { window.__tw = 1; const o = proToast; window.proToast = function (m) { try { window.__toast(String(m)); } catch (e) {} return o.apply(this, arguments); }; clearInterval(iv); } }, 5); });
  const posts = [];
  await p.route('**/api/**', async r => { const u = r.request().url();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && r.request().method() === 'GET') { await new Promise(z => setTimeout(z, 3000)); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: Object.assign({ sc_clients: JSON.stringify(acct), sc_hide_sample: '1' }, extra) }) }); }
    if (r.request().method() !== 'GET') { try { posts.push({ u, body: JSON.parse(r.request().postData() || '{}') }); } catch (e) {} }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(waitMs);
  return { b, p, errs, toasts, posts };
}
