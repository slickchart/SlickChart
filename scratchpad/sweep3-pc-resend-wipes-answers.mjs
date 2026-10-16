// The Product consult row says "Invited · waiting on X's answers · tap to resend". Client has typed
// answers (saved in her draft). Ashley taps resend. Do the client's typed answers survive?
import { launch, provider, check, finish } from './sweep3-pc-lib.mjs';
import { mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const prov = await provider(browser);
const inv1 = await prov.evaluate(() => { CL.aw = { name: 'Ashley Watson', concerns: '' }; _productConsult('aw'); const v = _assembleClientData('aw').vcInvite; v.askQuestions = vcInvites.aw.askQuestions; return v; });
const rec = { TOK: clientRecord('aw', 'Ashley Watson', { vcInvite: inv1 }) };
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await mockApi(page, { records: rec });
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1200);
await page.evaluate(() => nav('virtual-submit'));
await page.fill('#vc-ask-0', 'Cerave cleanser, SPF 30 every morning');
await page.fill('#vc-ask-1', 'Retinol burned me');
const row = await prov.evaluate(() => { nav('client', 'aw'); const b = Array.from(document.querySelectorAll('#S button')).find(b => /Product consult/.test(b.textContent)); const t = b ? b.textContent : ''; if (b) b.click(); const v = _assembleClientData('aw').vcInvite; v.askQuestions = vcInvites.aw.askQuestions; return { t, v, modal: !!document.getElementById('confirm-modal') }; });
check('row offers "tap to resend" and resending asks nothing', /resend/.test(row.t) && !row.modal && row.v.invitedAt !== inv1.invitedAt, { row: row.t, modal: row.modal });
rec.TOK = clientRecord('aw', 'Ashley Watson', { vcInvite: row.v });
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1500);
const c = await page.evaluate(() => { nav('virtual-submit'); return { a0: (document.getElementById('vc-ask-0') || {}).value, a1: (document.getElementById('vc-ask-1') || {}).value }; });
check('client: answers she already typed are WIPED by a resend of the same consult', !c.a0 && !c.a1, c);
await browser.close(); finish();
