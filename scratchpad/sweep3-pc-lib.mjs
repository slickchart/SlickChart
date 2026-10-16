// Shared provider harness for sweep3-pc-*.mjs. Provider app from the local server, /api/** mocked.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
export const PROV = 'http://localhost:8899/slickchart.html';
export const results = [];
export function check(name, bug, detail) {
  results.push({ name, bug, detail });
  console.log((bug ? 'CONFIRMED-BUG  ' : 'SOUND          ') + name + (detail !== undefined ? '\n               ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700) : ''));
}
export function finish() { console.log('\n' + results.filter(r => r.bug).length + ' confirmed of ' + results.length); }
export async function launch() { return pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
export async function provider(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page._errs = [];
  page.on('pageerror', e => page._errs.push(String(e && e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
  const J = (r, b, s) => r.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(b) });
  page._pushed = [];
  await page.route('**/api/**', r => {
    const u = r.request().url();
    if (u.includes('cloud-status')) return J(r, { enabled: true });
    if (opts.handler) { const h = opts.handler(r, u, J); if (h) return h; }
    if (r.request().method() !== 'GET') { try { page._pushed.push({ u, body: r.request().postData() }); } catch (e) {} }
    return J(r, { ok: true, data: {}, clients: [], events: [] });
  });
  await page.goto(PROV, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  return page;
}
