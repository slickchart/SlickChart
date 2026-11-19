// CLIENT APP ON A WEAK SIGNAL (2026-11-19): every send takes 3 s and every control is double tapped
// 220 ms apart, with the screen's empty boxes filled first. A message, form, booking request or photo
// that reaches the server twice from one double tap is reported.
//   PLAYWRIGHT_BROWSERS_PATH=<webkit> node scratchpad/sweep-client-slow.mjs   (needs :8899)
import { BASE, launch, clientRecord, mockApi } from './sweep2-client-lib.mjs';
const b = await launch(); const page = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 150)));
page.on('dialog', d => d.dismiss().catch(() => {}));
const rec = clientRecord('c1', 'Jo Rivera', { providerName: 'Ashley', studio: 'Rose Glow Skin',
  summaries: [{ id: 's1', date: 'Oct 1', note: 'Calm and hydrated today.', products: ['Vitamin C Serum'] }], aftercare: ['SPF every morning'],
  pendingForms: [{ formId: 'intake', title: 'New Client Intake', assignedAt: 1, qs: [{ id: 'q1', label: 'Any allergies?', type: 'Short answer', required: true }] }],
  services: ['Facial'] });
const delays = {}; for (const p of ['/api/client-messages', '/api/client-submit', '/api/client-request', '/api/client-photo', '/api/client-booking', '/api/book', '/api/client-consult']) delays[p + ':POST'] = 3000;
const log = await mockApi(page, { records: { TOK: rec }, messages: { TOK: [{ id: 'm1', from: 'provider', text: 'Hi Jo!', ts: Date.now() - 60000 }] }, delays });
await page.addInitScript(() => { window.open = () => null; });
await page.goto(BASE + '?c=TOK'); await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await page.waitForTimeout(1200);
const rows = []; let taps = 0;
for (const s of ['home', 'journey', 'shop', 'messages', 'profile', 'rebook', 'fill-form', 'notif-settings', 'help']) {
  const go = () => page.evaluate(s => { document.querySelectorAll('body > div').forEach(x => { try { if (getComputedStyle(x).position === 'fixed' && !x.querySelector('#app,.nav')) x.remove(); } catch (e) {} }); try { if (s === 'fill-form') _fillFormId = 'intake'; nav(s); } catch (e) {} }, s);
  await go(); await page.waitForTimeout(400);
  const n = await page.evaluate(() => [...document.querySelectorAll('button,[onclick],[role=button]')].filter(e => e.offsetParent && !e.closest('.nav,nav')).length);
  for (let i = 0; i < Math.min(n, 40); i++) {
    await go(); await page.waitForTimeout(300);
    const l0 = log.length;
    const lbl = await page.evaluate(i => { const els = [...document.querySelectorAll('button,[onclick],[role=button]')].filter(e => e.offsetParent && !e.closest('.nav,nav')); const el = els[i]; if (!el) return null;
      document.querySelectorAll('input,textarea').forEach(f => { const ty = (f.type || 'text').toLowerCase(); if (f.value || f.disabled || f.readOnly || !f.offsetParent || ['checkbox', 'radio', 'file', 'hidden'].includes(ty)) return; f.value = ty === 'email' ? 'jo@ex.com' : ty === 'tel' ? '5550101234' : ty === 'date' ? '2026-12-02' : ty === 'time' ? '10:00' : 'Slow sweep words'; f.dispatchEvent(new Event('input', { bubbles: true })); });
      const l = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      el.click(); setTimeout(() => { try { if (el.isConnected && !el.disabled && getComputedStyle(el).pointerEvents !== 'none') el.click(); } catch (e) {} }, 220); return l; }, i);
    if (lbl == null) continue; taps++;
    await page.waitForTimeout(900);
    // a sheet the first tap opened: double tap its main button too
    const l2 = await page.evaluate(() => { const sh = [...document.querySelectorAll('body *')].filter(x => { try { return getComputedStyle(x).position === 'fixed' && x.offsetWidth > 120 && x.offsetHeight > 80 && !x.querySelector('.nav'); } catch (e) { return false; } }).pop(); if (!sh) return null;
      sh.querySelectorAll('input,textarea').forEach(f => { if (!f.value && f.offsetParent && !['checkbox', 'radio', 'file'].includes(f.type)) { f.value = 'Slow sweep words'; f.dispatchEvent(new Event('input', { bubbles: true })); } });
      const bt = [...sh.querySelectorAll('button')].filter(x => x.offsetWidth && !x.disabled && /^(send|submit|request|book|save|confirm|done)/i.test((x.textContent || '').trim())).pop(); if (!bt) return null;
      bt.click(); setTimeout(() => { try { if (bt.isConnected && !bt.disabled) bt.click(); } catch (e) {} }, 220); return (bt.textContent || '').trim().slice(0, 30); });
    if (l2) await page.waitForTimeout(900);
    const posts = log.slice(l0).filter(x => x.method !== 'GET' && !/client-prefs|log|launch|device/.test(x.path));
    const by = {}; posts.forEach(x => by[x.path] = (by[x.path] || 0) + 1);
    const dup = Object.entries(by).filter(([, k]) => k > 1);
    if (dup.length) rows.push(s + ' "' + lbl + '"' + (l2 ? ' > "' + l2 + '"' : '') + ': ' + dup.map(([p, k]) => k + 'x ' + p).join(', '));
  }
}
{ const t = {}; log.filter(x => x.method !== 'GET').forEach(x => t[x.path] = (t[x.path] || 0) + 1); console.log('sends seen: ' + JSON.stringify(t)); }
console.log('client slow: ' + taps + ' double taps; page errors ' + errs.length);
for (const r of rows) console.log('DOUBLE SEND  ' + r);
for (const e of [...new Set(errs)]) console.log('ERR  ' + e);
await b.close(); process.exit(0);
