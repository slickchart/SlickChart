// Every client screen at 320px (iPhone SE 1st gen / small Android) and 360px: no horizontal page
// scroll, no element poking past the right edge, and the bottom nav / primary buttons on screen.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const rec = clientRecord('c1', 'Christabel Montgomery-Fairweather', {
  providerName: 'Anastasia Konstantinopoulou', studio: 'Botanical Aesthetics & Advanced Skin Clinic of Southern California',
  profile: { email: 'christabel.montgomery.fairweather@averyveryverylongdomainname.com', phone: '(555) 555-1234', nextVisit: 'Nov 12 · 10:00 AM', treatment: 'Hydrafacial with dermaplaning and LED therapy', skin: 'Combination', allergies: 'Latex, salicylic acid' },
  summaries: [{ id: 's1', date: 'Oct 1', note: 'Supercalifragilisticexpialidocious-level-hydration-observation-without-spaces-at-all-'.repeat(2), products: ['Vitamin C Brightening Serum 30ml'] }],
  aftercare: ['Apply SPF 50 every morning and reapply every two hours outdoors'],
  products: [{ name: 'Extremely Long Product Name Ultra Hydrating Ceramide Barrier Repair Cream', why: 'barrier', site: 'https://example.com/x' }],
  pendingForms: [{ formId: 'intake', title: 'New Client Intake & Medical History Questionnaire', assignedAt: 1, qs: [{ id: 'q1', label: 'List every medication you take', type: 'Long answer' }, { id: 'q2', label: 'Signature', type: 'Signature' }] }],
  services: ['Hydrafacial', 'Dermaplaning'], vcInvite: { kind: 'skin', title: 'Photo consult', invitedAt: 5, photoLabels: ['Front', 'Left side', 'Right side'] },
});
const screens = ['home', 'journey', 'shop', 'messages', 'profile', 'rebook', 'fill-form', 'checkin', 'virtual-submit', 'notif-settings', 'help'];
for (const W of [320, 360]) {
  const page = await (await browser.newContext({ viewport: { width: W, height: 640 }, isMobile: true, hasTouch: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message || e)));
  await mockApi(page, { records: { TOK: rec }, messages: { TOK: [{ id: 'm1', from: 'provider', text: 'https://averyveryverylongurlwithoutanybreakopportunities.example.com/path/to/a/thing', ts: Date.now() }] } });
  await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  for (const s of screens) {
    const r = await page.evaluate((s) => {
      try { if (s === 'fill-form') _fillFormId = 'intake'; nav(s); } catch (e) { return { err: String(e) }; }
      return new Promise(res => setTimeout(() => {
        const W = window.innerWidth, over = [];
        document.querySelectorAll('body *').forEach(el => {
          const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
          const b = el.getBoundingClientRect(); if (!b.width) return;
          let p = el.parentElement, clipped = false; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { clipped = true; break; } p = p.parentElement; }
          if (!clipped && b.right > W + 1) over.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]) + '@' + Math.round(b.right) + ' "' + (el.textContent || '').trim().slice(0, 30) + '"');
        });
        res({ screen: typeof currentScreen !== 'undefined' ? currentScreen : '', scrollW: document.documentElement.scrollWidth, W, over: over.slice(0, 6) });
      }, 500));
    }, s);
    const bad = r.err || r.scrollW > r.W + 1 || (r.over && r.over.length);
    check(W + 'px ' + s + ': horizontal overflow', !!bad, r);
  }
  check(W + 'px: no page errors', errs.length > 0, errs);
}
await browser.close();
finish();
