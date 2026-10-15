// The open client app polls /api/client-data every 15s but only re-applies it when
// _clientDataFingerprint changes. Fields the fingerprint leaves out never reach an open app until
// the client fully relaunches. Each case below changes ONE field server-side, polls, and checks
// whether the open app picked it up.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const rec = clientRecord('c1', 'Cara Client', { pendingForms: [{ formId: 'intake', title: 'Intake', assignedAt: 1 }], forms: [] });
const opts = { records: { TOK: rec } };
await mockApi(page, opts);
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(2000);
const d = rec.client.data;
async function poll() { await page.evaluate(() => _pollRealClient()); await page.waitForTimeout(800); }

const cases = [
  ['provider suggests a new time for a booking request (Accept banner)', () => { d.suggestedBooking = { date: '2026-11-03', time: '2:00 PM', treatment: 'Facial' }; },
    () => !!(client._suggestedBooking && client._suggestedBooking.time === '2:00 PM')],
  ['provider sends a photo-consult invite', () => { d.vcInvite = { kind: 'skin', title: 'Photo consult', invitedAt: 222 }; },
    () => !!(typeof vcInvite !== 'undefined' && vcInvite && String(vcInvite.invitedAt) === '222')],
  ['provider sends a new first-visit package (checkinReqAt bump)', () => { d.checkinReqAt = 999; },
    () => activeProvider().checkinReqAt === 999],
  ['provider RE-sends the same form (new assignedAt)', () => { d.pendingForms = [{ formId: 'intake', title: 'Intake', assignedAt: 2 }]; },
    () => (activeProvider().pendingForms || []).some(f => f.assignedAt === 2)],
  ['provider edits the client profile (allergies)', () => { d.profile = Object.assign({}, d.profile, { allergies: 'Latex' }); },
    () => (activeProvider().profileFields || []).some(r => r[1] === 'Latex')],
  ['provider edits an OLDER visit summary (index 1)', () => { d.summaries = [{ id: 's2', note: 'new' }, { id: 's1', note: 'old' }]; },
    () => (activeProvider().summaries || []).length === 2],
];
// baseline for the summaries case, so only the edit to index 1 differs.
for (const [name, mutate, test] of cases) {
  if (name.startsWith('provider edits an OLDER')) { mutate(); await poll(); d.summaries[1] = { id: 's1', note: 'old EDITED' };
    await poll(); const ok = await page.evaluate(() => (activeProvider().summaries || [])[1] && activeProvider().summaries[1].note === 'old EDITED');
    const dbg = await page.evaluate(() => JSON.stringify(activeProvider().summaries)); check('open app misses: ' + name, !ok, dbg); continue; }
  mutate(); await poll();
  const ok = await page.evaluate(test);
  check('open app misses: ' + name, !ok);
}
await browser.close();
finish();
