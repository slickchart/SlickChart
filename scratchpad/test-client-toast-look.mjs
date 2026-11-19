// Client app toasts: a failure looks like a failure, and a toast shows over an open sheet.
import { launch, mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
let fails = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + JSON.stringify(d))); if (!c) fails++; };
await mockApi(page, { records: { TOK: clientRecord('c1', 'Cara Client', {}) } });
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1000);
const r = await page.evaluate(() => { const st = (m, f) => { showToast(m, f); return !!document.querySelector('#cal-toast .ti-alert-triangle'); };
  return { a: st('Saved here, couldn’t reach your provider'), b: st('The app can’t use your camera yet.'), c: st('Sent ✓'), d: st('Photo saved'), e: st('x', false), f: st('If that email is on file, your link is on its way', true) }; });
ok(r.a && r.b && r.e && !r.c && !r.d && !r.f, 'failures warn, successes stay green', r);
const v = await page.evaluate(() => { const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);'; document.body.appendChild(ov);
  showToast('Couldn’t send just now'); const t = document.getElementById('cal-toast'); const b = t.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); ov.remove(); return t.contains(top); });
ok(v, 'toast shows over an open sheet');
await browser.close();
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
