// After "Book in Square", the "Text <name> the confirmation" button was a bare sms: link: on a Windows
// computer nothing opened (sweep 2026-11-21, follow-up to the payment-link Text fix). It now goes
// through _goSms. Requires:
//  A. Windows: tapping it copies the confirmation message, toast says copied
//  B. iPhone: nothing copied, Messages opened with the message (via _smsHref)
// PORT (default 8900) serves slickchart-vercel/. ENGINE=webkit for Safari.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900, ENGINE = process.env.ENGINE || 'chromium';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const TOK = b64({ u: 'prov_ash' }) + '.sig';
const acct = { sc_hide_sample: '1', sc_bizinfo: JSON.stringify({ name: 'Glow', ownerName: 'Ashley Test' }) };
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch();
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
async function run(ua, vp) {
  const ctx = await b.newContext({ viewport: vp, userAgent: ua, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.addInitScript(([a, t]) => { localStorage.setItem('sc_token', t); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1');
    for (const k of Object.keys(a)) localStorage.setItem(k, a[k]);
    window.__copied = []; window.__toasts = []; window.__sms = [];
    try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: s => { window.__copied.push(s); return Promise.resolve(); } } }); } catch (e) {}
  }, [acct, TOK]);
  await p.route('**/api/**', r => { const u = r.request().url();
    r.fulfill({ status: 200, contentType: 'application/json', body: u.includes('cloud-status') ? '{"enabled":true}' : u.includes('/api/store') ? JSON.stringify({ data: acct }) : '{"ok":true,"data":{},"clients":[],"events":[],"items":[]}' }); });
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForTimeout(3000);
  await p.evaluate(async () => {
    const t = window.proToast; window.proToast = function (m) { window.__toasts.push(String(m)); try { return t.apply(this, arguments); } catch (e) {} };
    window._smsHref = (phone, msg) => { window.__sms.push(msg); return 'javascript:void(0)'; };
    window._sqFetch = async () => ({ notified: true, booking: { id: 'b1' } });
    window._loadSquareAppts = () => {};
    CL['c_t'] = { id: 'c_t', name: 'Test Client', email: 't@example.com', phone: '5551234567' };
    const m = document.createElement('div'); m.id = 'qa-modal';
    m.innerHTML = '<div id="sqbook-body"></div><input id="sqb-name" value="Test Client"><input id="sqb-email" value="t@example.com"><select id="sqb-svc"><option value="0">x</option></select><input id="sqb-date" value="2026-12-01"><input id="sqb-time-fb" value="10:00"><button id="sqb-go"></button><div id="sqb-err"></div>';
    document.body.appendChild(m);
    _sqBookOpts = { services: [{ name: 'Facial', variationId: 'v1', variationVersion: 1, durationMinutes: 60, teamMemberIds: ['tm1'] }], teamMembers: [{ id: 'tm1' }] };
    _sqSelSlot = null;
    _sqDoBook(); await new Promise(r => setTimeout(r, 500));
  });
  const a = p.locator('#sqbook-body a', { hasText: 'the confirmation' });
  const n = await a.count();
  if (n) await a.first().click();
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => ({ copied: (window.__copied||['NOINIT']).slice(), toasts: (window.__toasts||[]).slice(), sms: (window.__sms||[]).slice(), url: location.href }));
  await ctx.close();
  return Object.assign({ found: n }, r);
}
let r = await run(WIN, { width: 1440, height: 900 });
ok(r.found && r.copied.some(s => /booked/i.test(s)) && r.toasts.some(t => /copied/i.test(t)) && /slickchart\.html/.test(r.url), 'A. Windows: confirmation copied, page stays (' + JSON.stringify(r) + ')');
r = await run(IPHONE, { width: 390, height: 844 });
ok(r.found && !r.copied.length && r.sms.some(s => /booked/i.test(s)), 'B. iPhone: Messages opened with it, nothing copied (' + JSON.stringify(r) + ')');
await b.close();
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
