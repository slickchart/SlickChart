// The real client page with Maddie's short check-in (comfort switch OFF): the wizard and the one-page
// "Before your visit" package ask only her questions, no drinks / snacks / music / warmer / covering,
// and it still submits. Switch ON: the comfort step is back.
import { launch, mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const res = []; const check = (n, p, d) => { res.push(p); console.log((p ? '  ok   ' : '  FAIL ') + n + (d ? '  :: ' + d : '')); };
const base = { skinQ: [{ id: 's1', label: 'New medications since your last visit?', on: true }, { id: 's2', label: 'Any sunburn?', on: true }],
  drinks: [{ emoji: '💧', label: 'Water', sub: 'Cold' }], snacksOn: true, snacks: ['🍪 Cookie'], music: [{ emoji: '🎷', label: 'Jazz' }],
  heat: [{ id: 'h1', label: 'Bed warmer', on: true }], blankets: [{ id: 'bl1', emoji: '🛏️', label: 'Light blanket' }], extraNotes: true };
const b = await launch();
async function open(cfg, extra) {
  const page = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const log = await mockApi(page, { records: { TOK: clientRecord('c1', 'Cara Client', Object.assign({ checkinReqAt: Date.now(), checkinCfg: cfg }, extra || {})) } });
  await page.goto(BASE + '?c=TOK', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  return { page, errs, log };
}
const short = Object.assign({}, base, { chairComfortOn: false });
{
  const { page, errs, log } = await open(short);
  await page.evaluate(() => nav('checkin')); await page.waitForTimeout(400);
  const s = await page.evaluate(() => ({ ids: _ciSteps().map(x => x.id), all: _ciSteps().map(x => (x.questions || []).map(q => q.label).join('|')).join(' / ') }));
  check('short check-in: only her questions and "Anything else"', !s.ids.includes('comfort') && !/Water|Jazz|Cookie|warmer|blanket|Drink|Music|Snack/i.test(s.all) && /New medications/.test(s.all), JSON.stringify(s));
  await page.evaluate(() => { checkinAnswers.s1 = 'no'; checkinAnswers.s2 = 'no'; checkinStep = _ciSteps().length - 1; _renderCheckinStep(); }); await page.waitForTimeout(200);
  await page.evaluate(() => submitCheckin()); await page.waitForTimeout(3000);
  const sent = log.filter(e => e.path === '/api/client-submit' && /checkin/.test(e.body));
  check('short check-in still submits', sent.length > 0, log.map(e => e.path).join(','));
  check('no page errors (short wizard)', !errs.length, errs.join(' | '));
  await page.close();
}
{
  const pf = { formId: 'intake', title: 'New client intake & consent', assignedAt: Date.now(), qs: [{ id: 'a', label: 'Client name', type: 'Short text', required: true }] };
  const { page, errs } = await open(short, { pendingForms: [pf] });
  await page.evaluate(() => renderPrevisitPackage()); await page.waitForTimeout(400);
  const t = await page.evaluate(() => (document.getElementById('ci-package-body') || {}).textContent || '');
  check('short check-in in the one-page package: no drinks or music', t && !/Water|Jazz|Cookie|Bed warmer|Light blanket/.test(t) && /New medications/.test(t), t.replace(/\s+/g, ' ').slice(0, 200));
  check('no page errors (package)', !errs.length, errs.join(' | '));
  await page.close();
}
{
  const { page, errs } = await open(Object.assign({}, base, { chairComfortOn: true }));
  const ids = await page.evaluate(() => _ciSteps().map(x => x.id));
  check('switch on: the comfort step is there', ids.includes('comfort'), JSON.stringify(ids));
  check('no page errors (full)', !errs.length, errs.join(' | '));
  await page.close();
}
await b.close();
const bad = res.filter(x => !x).length; console.log(`\n${res.length - bad} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
