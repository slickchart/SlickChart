// The client app runs on the provider app's website (slickchart.app), sharing its localStorage — in
// the native shell they are the same app. "Delete my data" in the client app removes EVERY key that
// starts with sc_, so a person who is both a provider and a client on that origin (or Ashley testing a
// client link in the browser she charts in) loses the provider app's sign-in, its pending queued
// writes, and its device-only crash-safety copies (sc_room_draft_*, sc_captured_photos).
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1');
  localStorage.setItem('sc_token', 'PROVIDER-SESSION'); localStorage.setItem('sc_room_draft_c1', '{"photos":["data:image/jpeg;base64,UNSAVED"]}');
  localStorage.setItem('sc_captured_photos', '[1]'); localStorage.setItem('sc_clients', '[{"id":"c9"}]'); localStorage.setItem('sc_cloud_queue', '{"sc_notes":1}'); } });
await mockApi(page, { records: { TOK: clientRecord('c1', 'Cara Client') } });
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1000);
await page.evaluate(() => _doDeleteClientData());
await page.waitForTimeout(1000);
const left = await page.evaluate(() => ({ sc_token: localStorage.getItem('sc_token'), draft: localStorage.getItem('sc_room_draft_c1'), captured: localStorage.getItem('sc_captured_photos'), clients: localStorage.getItem('sc_clients') }));
check("client 'Delete my data' wipes the PROVIDER app's keys on the same origin (sign-in, room drafts, captured photos, roster)", !left.sc_token || !left.draft || !left.captured, left);
await browser.close();
finish();
