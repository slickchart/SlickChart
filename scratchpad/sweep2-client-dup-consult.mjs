// Retry-after-lost-response for each client submission kind. The server dedups on payload._idem
// (lib/clients.js logEvent). Forms, check-ins, bookings and messages persist a STABLE key so a manual
// "try again" reuses it. A photo consult (vc_submit) mints a fresh random key per tap, so a consult
// that committed server-side but whose response was lost (twice: _clientSubmit retries once) is
// stored TWICE when the client taps Submit again — two consults, two sets of face photos.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
let mode = 'lose';            // 'lose' = the server stored it but the reply never arrives
const committed = [];         // what the server would have stored, keyed by idem
const opts = { records: { TOK: clientRecord('c1', 'Cara Client', { vcInvite: { kind: 'skin', title: 'Photo consult', invitedAt: 111, photoLabels: ['Front'] } }) },
  handler: (req, p, t, J) => {
    if (p !== '/api/client-submit') return null;
    const b = JSON.parse(req.postData() || '{}');
    const k = b.kind + ':' + (b.payload && b.payload._idem);
    if (!committed.includes(k)) committed.push(k);
    return mode === 'lose' ? J({ error: 'gateway timeout' }, 504) : J({ ok: true, id: 'ev1' });
  } };
await mockApi(page, opts);
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1500);
async function consultTap() {
  await page.evaluate(() => {
    _vcSubmitState = { photos: { Front: { src: 'data:image/png;base64,iVBORw0KGgo=' } }, refs: {}, routine: [], flags: {}, answers: {} };
    submitVirtualConsult();
  });
  await page.waitForTimeout(3500);
}
await consultTap();            // reply lost twice -> "Couldn't send your consult" toast
mode = 'ok';
await consultTap();            // client taps Submit again
const vc = committed.filter(k => k.startsWith('vc_submit:'));
check('photo consult: retry after a lost reply is stored as a SECOND consult (new idempotency key)', new Set(vc).size > 1, vc);

// Same scenario for a booking request — the stable key should make it ONE.
committed.length = 0; mode = 'lose';
const bk = () => page.evaluate(() => { const b = { providerId: 'jess', date: '2026-11-02', dateLabel: 'Mon Nov 2', time: '10:00 AM', treatment: 'Facial', note: '' };
  return _clientSubmit('booking', { treatment: b.treatment, date: b.date, dateLabel: b.dateLabel, time: b.time, note: '', client: 'Cara', _idem: _bkStableIdem(b) }); });
await bk(); mode = 'ok'; await bk();
const bks = committed.filter(k => k.startsWith('booking:'));
check('booking: retry after a lost reply reuses its key (one stored)', new Set(bks).size > 1, bks);
await browser.close();
finish();
