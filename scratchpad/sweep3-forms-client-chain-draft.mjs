// Client app, two forms in the pre-visit chain. Submitting form 1 glides straight into form 2 while
// form 1's submit runs in the background. When that background submit answers, its success handler calls
// _ffClearDraft(), which reads the CURRENT _fillFormId (now form 2) — so it wipes form 2's saved draft
// (memory + localStorage). A refresh / backgrounded PWA then loses what the client typed on form 2.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const mkForm = (id, at) => ({ formId: id, title: 'Form ' + id, assignedAt: at, qs: [{ id: 'q1', label: 'Medications', type: 'Long text', required: false }] });
const opts = { records: { TOK: clientRecord('c1', 'Cara Client', { pendingForms: [mkForm('f1', 1000), mkForm('f2', 2000)] }) }, delays: { '/api/client-submit': 3000 } };
const log = await mockApi(page, opts);
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { _fillFormId = 'f1'; nav('fill-form'); });
await page.waitForSelector('#ff-0');
await page.fill('#ff-0', 'form one answer');
await page.evaluate(() => _submitFillForm());
await page.waitForTimeout(300);
const on = await page.evaluate(() => _fillFormId);
await page.fill('#ff-0', 'Accutane 40mg daily, spironolactone');
await page.waitForTimeout(700);   // the 400ms draft timer has written form 2's draft
const mid = await page.evaluate(() => localStorage.getItem('sc_ffdraft_f2_2000'));
await page.waitForTimeout(3500);  // form 1's background submit answers
const post = await page.evaluate(() => ({ stored: localStorage.getItem('sc_ffdraft_f2_2000'), mem: JSON.stringify(_ffDraft) }));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1200);
const after = await page.evaluate(() => { _fillFormId = 'f2'; nav('fill-form'); const el = document.getElementById('ff-0'); return el ? el.value : null; });
check('client typed on form 2 while form 1 was sending; form 1 success wiped form 2\'s draft, lost on refresh',
  on === 'f2' && !!mid && !post.stored && !after, { on, mid, post, afterRefresh: after, submits: log.filter(e => e.path === '/api/client-submit').length });
await browser.close();
finish();
