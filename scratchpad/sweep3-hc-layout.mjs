// sweep3: 390px layout of the client Homecare screen (long steps, reminders card) and the provider's
// client-profile Homecare tab (long lines, product picker). Reports horizontal overflow.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const long = 'Cica Recovery Balm with Centella Asiatica and Panthenol — apply a thin layer every night after cleansing, avoid the eye area';
const rec = clientRecord('c1', 'Cara Client', { aftercare: ['Cleanse', long, 'https://example.com/a-very-long-unbroken-url-for-the-product-page-that-has-no-spaces-at-all', 'SPF 50'] });
await mockApi(page, { records: { TOK: rec }, prefs: {} });
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(2000);
async function over(p, label) {
  const r = await p.evaluate(() => { const w = document.documentElement.clientWidth; const bad = [];
    document.querySelectorAll('body *').forEach(el => { const b = el.getBoundingClientRect(); if (b.width && b.right > w + 1 && getComputedStyle(el).position !== 'fixed') bad.push((el.id || el.tagName) + ':' + Math.round(b.right)); });
    return { sw: document.documentElement.scrollWidth, w, bad: bad.slice(0, 6) }; });
  check(label + ' overflows at 390px', r.sw > r.w + 1 || r.bad.length > 0, r);
}
await page.evaluate(() => nav('homecare')); await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/claude-0/-home-user-SlickChart/be0fe3b4-54df-5d41-bda7-89dbec145231/scratchpad/hc-client-390.png', fullPage: true });
await over(page, 'client Homecare screen');
await page.evaluate(() => nav('home')); await page.waitForTimeout(500);
await over(page, 'client Home (routine card)');
// provider side
const pp = await ctx.newPage();
await pp.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
await pp.route('**/api/**', r => { const u = r.request().url(); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(u.includes('cloud-status') ? { enabled: true } : u.includes('/api/store') ? { data: { sc_hide_sample: '1', sc_onboarded: '1', sc_clients: JSON.stringify({ c1: { id: 'c1', name: 'Amber Test' } }), sc_client_homecare: JSON.stringify({ c1: ['Cleanse', long, 'https://example.com/a-very-long-unbroken-url-for-the-product-page-that-has-no-spaces-at-all'] }) } } : { ok: true, clients: [], events: [] }) }); });
await pp.goto('http://localhost:8899/slickchart.html');
await pp.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce && !Cloud._booting, null, { timeout: 30000 }).catch(() => {});
await pp.waitForTimeout(1500);
await pp.evaluate(() => { nav('client', 'c1'); }); await pp.waitForTimeout(500); await pp.evaluate(() => { const b = Array.from(document.querySelectorAll('button,[role=tab],.ctabbtn,div')).find(x => x.textContent.trim() === 'Homecare' && x.offsetParent); if (b) b.click(); });
await pp.waitForTimeout(800);
await pp.screenshot({ path: '/tmp/claude-0/-home-user-SlickChart/be0fe3b4-54df-5d41-bda7-89dbec145231/scratchpad/hc-provider-390.png', fullPage: true });
await over(pp, 'provider client Homecare tab');
await pp.evaluate(() => _hcPickerSheet('c1', 'profile')); await pp.waitForTimeout(300);
await over(pp, 'provider product picker sheet');
await browser.close();
finish();
