// Client app: a RE-SENT form whose submit never landed stays hidden forever.
// _applyFormsDoneFromMap trusts an optimistic "done" mark for 12h, then lets the form come back UNLESS
// _providerHasSubmission() says the provider has it. That proof matches by formId only, so the client's
// EARLIER submission of the same form (last year's intake, still in d.forms) counts as proof for the new
// instance too: the re-sent intake never returns to their to-do list, and the provider waits forever
// ("2 forms not back"). Same symptom the 12h expiry was written to fix, for every re-sent form.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const pf = { formId: 'intake', title: 'New client intake', assignedAt: 2000, qs: [{ id: 'q1', label: 'Allergies', type: 'Short text' }] };
const rec = clientRecord('c1', 'Cara Client', { pendingForms: [pf], forms: [{ formId: 'intake', title: 'New client intake', status: 'signed', date: 'Jan 4', at: 1000 }] });
await page.addInitScript(() => {
  if (!sessionStorage.getItem('seeded')) {
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sc_forms_done', JSON.stringify({ 'jess|intake': { a: 2000, t: Date.now() - 13 * 3600 * 1000 } }));   // marked 13h ago, submit never landed
  }
});
await mockApi(page, { records: { TOK: rec }, prefs: {} });
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1500);
const r = await page.evaluate(() => ({ pending: (activeProvider().pendingForms || []).map(f => f.formId + '@' + f.assignedAt), mark: localStorage.getItem('sc_forms_done') }));
check('re-sent form whose submission never reached the provider stays hidden past the 12h trust window', r.pending.length === 0, r);
await browser.close();
finish();
