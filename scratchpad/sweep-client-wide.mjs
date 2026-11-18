// CLIENT APP SWEEP (rotation area 8, 2026-11-18). The client's own app at phone, iPad and computer size,
// with the server answering normally, then failing (FAIL=500|offline) for: first open, sending a
// message, and submitting a form. Screenshots every screen to /tmp/claude-0/cl-<size>-<screen>.png.
// usage: SIZE=phone|ipad|mac [PW_ENGINE=chromium] FAIL=none|500|offline node scratchpad/sweep-client-wide.mjs   (needs :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const SIZE = process.env.SIZE || 'phone', FAIL = process.env.FAIL || 'none';
const VP = { phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, ipad: { viewport: { width: 1032, height: 1376 }, hasTouch: true }, mac: { viewport: { width: 1440, height: 900 } } }[SIZE];
const eng = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const browser = await eng.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const rec = clientRecord('c1', 'Jo Rivera', { providerName: 'Ashley', studio: 'Rose Glow Skin',
  summaries: [{ id: 's1', date: 'Oct 1', note: 'Calm and hydrated today.', products: ['Vitamin C Serum'] }], aftercare: ['SPF every morning'],
  pendingForms: [{ formId: 'intake', title: 'New Client Intake', assignedAt: 1, qs: [{ id: 'q1', label: 'Any allergies?', type: 'Short answer', required: true }] }],
  services: ['Facial'] });
const out = {};
const ctx = await browser.newContext({ ...VP, serviceWorkers: 'block' }); const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
page.on('dialog', d => { out.dialogs = (out.dialogs || []).concat(d.message().slice(0, 120)); d.dismiss().catch(() => {}); });
let failNow = false;
const failer = (req, p, t, J) => { if (!failNow) return null; if (!/client-(messages|submit|data)/.test(p) || (p === '/api/client-messages' && req.method() === 'GET')) return null;
  return FAIL === 'offline' ? req && Promise.reject('x') : J({ error: 'Something went wrong.' }, 500); };
await page.route('**/api/**', async (r, req) => { if (failNow && FAIL === 'offline' && /client-(messages|submit)/.test(req.url()) && req.method() !== 'GET') return r.abort('internetdisconnected'); return r.fallback(); });
await mockApi(page, { records: { TOK: rec }, messages: { TOK: [{ id: 'm1', from: 'provider', text: 'Hi Jo!', ts: Date.now() - 60000 }] }, handler: FAIL === '500' ? failer : null });
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }).catch(() => { out.boot = 'client never loaded'; });
await page.waitForTimeout(1200);
if (FAIL === 'none') {
  for (const s of ['home', 'journey', 'shop', 'messages', 'profile', 'rebook', 'fill-form', 'notif-settings', 'help']) {
    await page.evaluate(s => { try { if (s === 'fill-form') _fillFormId = 'intake'; nav(s); } catch (e) {} }, s); await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/claude-0/cl-${SIZE}-${s}.png` });
    out[s] = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, w: Math.round((document.querySelector('.app,#app,.shell,main') || document.body).getBoundingClientRect().width) }));
  }
} else {
  failNow = true;
  await page.evaluate(() => nav('messages')); await page.waitForTimeout(500);
  const inp = await page.$('textarea, input[type=text]');
  out.msgInput = !!inp;
  await page.evaluate(() => { const i = document.querySelector('#msg-input, #cinput, textarea'); if (i) i.value = 'Running 5 min late'; const b = Array.from(document.querySelectorAll('button')).find(b => /send/i.test(b.getAttribute('aria-label') || b.textContent)); if (b) b.click(); else if (typeof sendMsg === 'function') sendMsg(); });
  await page.waitForTimeout(6000);
  out.msgScreen = (await page.evaluate(() => document.body.innerText)).split('\n').filter(l => /late|resend|not sent|didn|couldn|failed|try again|sending/i.test(l)).slice(0, 6);
  await page.screenshot({ path: `/tmp/claude-0/cl-${SIZE}-msgfail-${FAIL}.png` });
  await page.evaluate(() => { _fillFormId = 'intake'; nav('fill-form'); }); await page.waitForTimeout(600);
  await page.evaluate(() => { const i = document.querySelector('input[type=text], textarea'); if (i) { i.value = 'None'; i.dispatchEvent(new Event('input', { bubbles: true })); } });
  const sub = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).filter(b => /submit|send|done|finish/i.test(b.textContent)).pop(); if (b) { b.click(); return b.textContent.trim(); } return null; });
  await page.waitForTimeout(5000);
  out.formBtn = sub; out.formScreen = (await page.evaluate(() => document.body.innerText)).split('\n').filter(l => /thank|sent|saved|didn|couldn|failed|try again|offline|connection|internet/i.test(l)).slice(0, 6);
  await page.screenshot({ path: `/tmp/claude-0/cl-${SIZE}-formfail-${FAIL}.png` });
}
out.errs = errs;
console.log(JSON.stringify(out, null, 1));
await browser.close();
