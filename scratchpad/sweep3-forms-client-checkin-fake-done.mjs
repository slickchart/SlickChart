// Client app, pre-visit check-in as the LAST step. submitCheckin() calls _markCheckinDoneKeepDraft()
// (persisted to sc_checkin_done AND queued to the account's prefs) BEFORE the submit is sent. Only a
// failure answered while the page is still open un-marks it. Close / reload the app while it reads
// "Sending your check-in…" (bad signal, the 1.2s retry, a cold start) and the check-in is marked done
// for good: the client's Home says "Check-in complete — <provider> has your updates", nothing reached
// the provider, and unlike forms (_FORM_DONE_TRUST_MS) there is no expiry.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
let page = await ctx.newPage();
const cfg = { skinQ: [{ id: 's1', label: 'Any skin changes since your last visit?' }], chairComfortOn: false, extraNotes: true };
const opts = { records: { TOK: clientRecord('c1', 'Cara Client', { checkinCfg: cfg, profile: { email: 'c1@ex.com', nextVisit: 'Dec 20 · 10:00 AM', treatment: 'Facial' } }) }, delays: { '/api/client-submit': 60000 } };
const log = await mockApi(page, opts);
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { nav('checkin'); });
await page.waitForTimeout(500);
await page.evaluate(() => { checkinAnswers.s1 = 'yes'; checkinAnswers.s1_detail = 'New breakout on my chin, started tretinoin'; submitCheckin(); });
await page.waitForTimeout(2500);   // bundle re-check done; now "Sending your check-in…" (submit hanging)
const sending = await page.evaluate(() => document.getElementById('S').innerText.slice(0, 80));
// Client gives up / app is closed while sending.
await page.close();
page = await ctx.newPage();
const opts2 = Object.assign({}, opts, { delays: {} });
const log2 = await mockApi(page, opts2);
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(2000);
const after = await page.evaluate(() => ({ done: !!activeProvider().checkinDone, map: localStorage.getItem('sc_checkin_done'), home: (document.getElementById('S').innerText.match(/Check-in complete[^\n]*\n?[^\n]*/) || [''])[0] }));
const landed = log.concat(log2).filter(e => e.path === '/api/client-submit' && e.answeredAt).length;
const prefsPut = log.filter(e => e.path === '/api/client-prefs' && e.method === 'PUT').map(e => { try { return JSON.parse(e.body).prefs.checkinDone; } catch (x) { return null; } });
check('check-in never reached the server, yet after reopening the client app says it is complete', after.done && landed === 0, { sending, after, submitsAnswered: landed, prefsPutCheckinDone: prefsPut });
await browser.close();
finish();
