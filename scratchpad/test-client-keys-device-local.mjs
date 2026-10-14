// The client app shares the provider app's website. Its settings (theme etc.) must not ride the
// provider's account sync: a pull must not overwrite them and a push must not upload them.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
const puts = [];
await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_client_theme', 'light'); localStorage.setItem('sc_course_prog_jess', '{"a":1}'); } catch (e) {} });
await page.route('**/api/**', r => {
  const u = r.request().url();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store')) {
    if (r.request().method() === 'PUT' || r.request().method() === 'POST') { puts.push(r.request().postData() || ''); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sc_client_theme: 'dark', sc_vc_draft: '{"x":1}' } }) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' });
});
await page.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await page.waitForTimeout(4000);
const st = await page.evaluate(async () => { await Cloud.pull(); await new Promise(r => setTimeout(r, 300)); await Cloud.pushAllLocal(); return { theme: localStorage.getItem('sc_client_theme'), draft: localStorage.getItem('sc_vc_draft'), recsSyncable: _syncable('sc_client_recs'), homecareSyncable: _syncable('sc_client_homecare') }; });
await page.waitForTimeout(500);
check('pull does not overwrite the client app theme', st.theme === 'light', JSON.stringify(st));
check('pull does not write client-app keys onto the device', st.draft === null, JSON.stringify(st));
const uploaded = puts.map(p => { try { return JSON.parse(p).items || {}; } catch (e) { return {}; } });
check('client app keys are never uploaded', !uploaded.some(it => it.sc_client_theme && it.sc_client_theme !== null || it.sc_course_prog_jess), puts.map(p => p.slice(0, 120)).join(' | '));
check('old account copies are cleared from the account', uploaded.some(it => 'sc_client_theme' in it && it.sc_client_theme === null), '');
check('provider keys that start sc_client_ still sync', st.recsSyncable && st.homecareSyncable);
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + x.detail.slice(0, 300) : '')); }
process.exit(bad ? 1 : 0);
