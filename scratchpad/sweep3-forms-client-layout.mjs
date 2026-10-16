// Client app at 390px and 320px: every screen in the forms / guides / courses / check-in / rebook flow,
// with long unbroken titles and answers. Reports any element wider than the viewport (horizontal scroll).
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const LONG = 'Microdermabrasion-and-hydrafacial-preparation-instructions-for-sensitive-skin';
const browser = await launch();
for (const width of [390, 320]) {
  const page = await (await browser.newContext({ viewport: { width, height: 800 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const rec = clientRecord('c1', 'Cara Client', {
    checkinCfg: { skinQ: [{ id: 's1', label: 'Any skin changes since your last visit? ' + LONG }], extraNotes: true },
    profile: { email: 'c1@ex.com', nextVisit: 'Dec 20 · 10:00 AM', treatment: LONG },
    services: [{ name: LONG, duration: 60 }],
    pendingForms: [{ formId: 'f1', title: LONG, assignedAt: 1, qs: [{ id: 'a', label: LONG + '?', type: 'Single select', options: [LONG, 'No'] }, { id: 'b', label: 'Contra', type: 'Contraindications', items: [LONG] }, { id: 'c', label: 'Pics', type: 'Photo upload' }, { id: 'd', label: 'Sign', type: 'Signature', required: true }] },
      { formId: 'f2', title: 'Consent', assignedAt: 2, qs: [{ id: 'a', label: 'DOB', type: 'Date' }] }],
    pendingGuides: [{ guideId: 'g1', title: LONG, icon: '', cat: LONG, url: 'https://example.com/' + LONG, tips: [LONG], files: [{ fileId: 'fx', fileName: LONG + '.pdf', fileType: 'application/pdf' }] }],
    pendingCourses: [{ id: 'co1', title: LONG, desc: LONG, lessons: [{ id: 'l1', title: LONG, body: LONG, files: [{ fileId: 'fy', fileName: LONG + '.pdf' }] }] }],
    suggestedBooking: { date: '2026-12-21', time: '2:30 PM', treatment: LONG }
  });
  await mockApi(page, { records: { TOK: rec } });
  await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const screens = [
    ['home', () => nav('home')], ['library', () => nav('library')],
    ['fill-form f1', () => { _fillFormId = 'f1'; nav('fill-form'); }], ['fill-form f2', () => { _fillFormId = 'f2'; nav('fill-form'); }],
    ['previsit flow', () => _startPrevisitFlow()], ['checkin', () => nav('checkin')],
    ['view-guide', () => { _viewGuideId = 'g1'; nav('view-guide'); }], ['view-course', () => { _viewCourseId = 'co1'; nav('view-course'); }],
    ['view-lesson', () => { _viewCourseId = 'co1'; _viewLessonId = 'l1'; nav('view-lesson'); }], ['rebook', () => nav('rebook')]
  ];
  const over = [];
  for (const [name, fn] of screens) {
    await page.evaluate(`(${fn.toString()})()`).catch(e => over.push(name + ': THREW ' + e.message));
    await page.waitForTimeout(350);
    const r = await page.evaluate((w) => {
      const sw = document.documentElement.scrollWidth;
      const bad = [...document.querySelectorAll('#S *')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > w + 1 && getComputedStyle(e).position !== 'fixed'; })
        .filter(e => !e.closest('[style*="overflow-x:auto"],[style*="overflow-x: auto"],[style*="overflow:auto"]'))
        .slice(0, 3).map(e => e.tagName + ' ' + Math.round(e.getBoundingClientRect().right) + ' "' + (e.innerText || '').slice(0, 30) + '"');
      return { sw, bad };
    }, width);
    if (r.sw > width + 1 || r.bad.length) over.push(name + ' scrollWidth=' + r.sw + ' ' + r.bad.join(' | '));
  }
  check(width + 'px: a forms/guides/courses/check-in/rebook screen overflows horizontally', over.length > 0, over);
  check(width + 'px: page errors while walking the flow', errs.length > 0, errs.slice(0, 4));
}
await browser.close();
finish();
