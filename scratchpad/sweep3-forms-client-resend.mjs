// Client app: things a provider RE-SENDS after the client removed / completed them.
// 1) Client removes a guide (and a course) from their library ("You can always ask your provider to
//    resend it"). Provider re-sends it (provider app bumps assignedAt via _assignPending). Does it come back?
// 2) Stale form draft: after submitting the LAST form, is the sc_ffdraft_<formId>_<assignedAt> key cleared?
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const guide = { guideId: 'g1', title: 'Retinol 101', icon: '', cat: 'Care', url: '', tips: ['Use at night'], files: [], hasFile: false };
const course = { id: 'co1', title: 'Acne reset', lessons: [{ id: 'l1', title: 'Day 1', body: 'x' }] };
const form = { formId: 'f1', title: 'Consent', assignedAt: 1000, qs: [{ id: 'q1', label: 'Anything to tell us?', type: 'Long text', required: false }, { id: 'q2', label: 'Signature', type: 'Signature', required: true }] };
const opts = { records: { TOK: clientRecord('c1', 'Cara Client', { pendingGuides: [guide], pendingCourses: [course], pendingForms: [form], checkinCfg: { steps: [] } }) } };
await mockApi(page, opts);
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1200);
// Client removes guide + course from their library (what the confirm sheet's action does).
await page.evaluate(() => { _deletedRes.add(_resGK('g1')); _resSetSave('sc_deleted_res', _deletedRes); _deletedRes.add(_resCK('co1')); _resSetSave('sc_deleted_res', _deletedRes); });
// Provider re-sends both: provider app's _assignPending bumps assignedAt; client-data payload is rebuilt.
opts.records.TOK = clientRecord('c1', 'Cara Client', { pendingGuides: [Object.assign({}, guide, { assignedAt: Date.now() })], pendingCourses: [Object.assign({}, course, { assignedAt: Date.now() })], pendingForms: [form], checkinCfg: { steps: [] } });
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1500);
const r1 = await page.evaluate(() => ({ libGuides: _libGuides().map(g => g.guideId), homeGuides: _homeGuides().map(g => g.guideId), libCourses: _libCourses().map(c => c.id) }));
check('guide removed by client, then RE-SENT by provider, never shows again (library + home)', !r1.libGuides.includes('g1') && !r1.homeGuides.includes('g1'), r1);
check('course removed by client, then RE-SENT by provider, never shows again', !r1.libCourses.includes('co1'), r1);

// 2) Fill the (last) form, submit, check the draft key is cleared.
await page.evaluate(() => { _fillFormId = 'f1'; nav('fill-form'); });
await page.waitForSelector('#ff-0');
await page.fill('#ff-0', 'I am allergic to aspirin');
await page.fill('#ff-1', 'Cara Client');
await page.waitForTimeout(700);
const before = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sc_ffdraft_')));
await page.evaluate(() => _submitFillForm());
await page.waitForTimeout(2500);
const after = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sc_ffdraft_')).map(k => [k, localStorage.getItem(k)]));
check('after a SUCCESSFUL standalone form submit, the typed answers (incl. medical) stay in sc_ffdraft_* forever', after.length > 0, { before, after });
await browser.close();
finish();
