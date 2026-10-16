// Client app: the intake draft (sc_ffdraft_<formId>_<assignedAt>) stores answers by QUESTION INDEX
// (q0, q1 ...). The pending form's questions are rebuilt from the provider's LIVE template on every
// publish (slickchart.html clientDataPayload: pendingForms -> tmpl.qs), without changing assignedAt.
// So if the provider edits the form (adds a question at the top) while a client has a half-filled
// draft, the client's saved answers land on the WRONG questions after a refresh, and are submitted
// that way (e.g. their allergy answer now sits under "Medications").
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const qsV1 = [{ id: 'q_allergy', label: 'Allergies', type: 'Short text' }, { id: 'q_meds', label: 'Medications', type: 'Short text' }];
const qsV2 = [{ id: 'q_preg', label: 'Pregnant or nursing?', type: 'Short text' }].concat(qsV1);
const rec = qs => clientRecord('c1', 'Cara Client', { pendingForms: [{ formId: 'intake', title: 'Intake', assignedAt: 1000, qs }] });
const opts = { records: { TOK: rec(qsV1) } };
const log = await mockApi(page, opts);
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1000);
await page.evaluate(() => { _fillFormId = 'intake'; nav('fill-form'); });
await page.waitForSelector('#ff-0');
await page.fill('#ff-0', 'Penicillin');
await page.fill('#ff-1', 'None');
await page.waitForTimeout(700);
opts.records.TOK = rec(qsV2);   // provider added a question at the top; same instance (assignedAt)
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1000);
const shown = await page.evaluate(() => { _fillFormId = 'intake'; nav('fill-form'); return [0, 1, 2].map(i => { const e = document.getElementById('ff-' + i); return e && e.value; }); });
await page.fill('#ff-2', 'Tretinoin');   // they finish the visible empty field and submit
await page.evaluate(() => _submitFillForm());
await page.waitForTimeout(2000);
const sub = log.filter(e => e.path === '/api/client-submit').map(e => JSON.parse(e.body).payload.answers)[0];
check('provider edited the form mid-draft: saved answers shift onto the wrong questions and are submitted that way',
  shown[0] === 'Penicillin' && sub && sub.q_preg === 'Penicillin', { shownAfterEdit: { 'Pregnant or nursing?': shown[0], Allergies: shown[1], Medications: shown[2] }, submitted: sub });
await browser.close();
finish();
