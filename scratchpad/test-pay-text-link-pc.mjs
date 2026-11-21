// "Text a payment link" (Build invoice) and "Send text link" (a payment's detail) on a Windows computer:
// there is no texting app behind an sms: link, so the button made the link, said "Text link ready" and
// nothing opened (sweep 2026-11-21, area 6 payments). Both now go through _goSms like the other Text
// buttons: on a Windows/Linux/Chromebook computer the message with the link is copied and the toast says
// so. Requires:
//  A. Build invoice on Windows: the message with the link is copied, the toast says "copied", not "ready"
//  B. payment detail "Send text link" on Windows: the same
//  C. on a phone (iPhone): nothing is copied, an sms: link is opened, toast "Text link ready"
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
async function open(ua, vp) {
  const ctx = await b.newContext({ viewport: vp, userAgent: ua, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.addInitScript(([a, t]) => { localStorage.setItem('sc_token', t); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1');
    for (const k of Object.keys(a)) localStorage.setItem(k, a[k]);
    window.__copied = []; window.__toasts = [];
    try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: s => { window.__copied.push(s); return Promise.resolve(); } } }); } catch (e) {}
  }, [acct, TOK]);
  await p.route('**/api/**', r => { const u = r.request().url();
    r.fulfill({ status: 200, contentType: 'application/json', body: u.includes('payment-link') ? '{"url":"https://square.link/u/abc123","id":"pl1","orderId":"o1"}' : u.includes('cloud-status') ? '{"enabled":true}' : u.includes('/api/store') ? JSON.stringify({ data: acct }) : '{"ok":true,"data":{},"clients":[],"events":[],"items":[]}' }); });
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForTimeout(3000);
  await p.evaluate(() => {
    const t = window.proToast; window.proToast = function (m) { window.__toasts.push(String(m)); try { return t.apply(this, arguments); } catch (e) {} };
    window.__sms = [];
    // Record the sms: hop instead of leaving the page.
    window._smsHref = (phone, msg) => { window.__sms.push(msg); return '#sms'; };
    CL['c_t'] = { id: 'c_t', name: 'Test Client', email: 't@example.com', phone: '5551234567' };
  });
  return { p, ctx };
}
async function buildInvoice(p) {
  return p.evaluate(async () => {
    window.__copied = []; window.__toasts = []; window.__sms = [];
    nav('build-invoice'); await new Promise(r => setTimeout(r, 300));
    _biClient = 'c_t'; _coTip = false;
    _coItems = [{ name: 'Facial', price: 85, qty: 1, kind: 'service', taxable: true, note: '' }]; _coRenderItems();
    await _biTextLink(); await new Promise(r => setTimeout(r, 400));
    return { copied: window.__copied.slice(), toasts: window.__toasts.slice(), sms: window.__sms.slice() };
  });
}
async function detail(p) {
  return p.evaluate(async () => {
    window.__copied = []; window.__toasts = []; window.__sms = [];
    const rec = _addPayment({ clientId: 'c_t', clientName: 'Test Client', amount: 40, method: 'Square', status: 'unpaid', date: _todayISO(), note: 'Brows', source: 'square' });
    await _payTextLink(rec.id); await new Promise(r => setTimeout(r, 400));
    return { copied: window.__copied.slice(), toasts: window.__toasts.slice(), sms: window.__sms.slice() };
  });
}
{
  const { p, ctx } = await open(WIN, { width: 1440, height: 900 });
  let r = await buildInvoice(p);
  ok(r.copied.some(s => /square\.link\/u\/abc123/.test(s)) && r.toasts.some(t => /copied/i.test(t)) && !r.toasts.some(t => /Text link ready/.test(t)),
    'A. Build invoice on Windows: link copied, toast says copied (' + JSON.stringify(r) + ')');
  r = await detail(p);
  ok(r.copied.some(s => /square\.link\/u\/abc123/.test(s)) && r.toasts.some(t => /copied/i.test(t)),
    'B. payment detail on Windows: link copied, toast says copied (' + JSON.stringify(r) + ')');
  await ctx.close();
}
{
  const { p, ctx } = await open(IPHONE, { width: 390, height: 844 });
  const r = await buildInvoice(p);
  ok(!r.copied.length && r.sms.some(s => /abc123/.test(s)) && r.toasts.some(t => /Text link ready/.test(t)),
    'C. iPhone: opens Messages with the link, nothing copied (' + JSON.stringify(r) + ')');
  await ctx.close();
}
await b.close();
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
