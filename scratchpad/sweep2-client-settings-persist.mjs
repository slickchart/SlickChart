// Client settings across a refresh. Each setting is written to localStorage at once, but reaches the
// server only after a 900ms debounce with no flush on pagehide. On the next launch
// _loadClientPrefsFromServer() OVERWRITES the local value with the server's (notif, courseProg, saved,
// contact, avatar, installDismissed, a2hsDismissed). So a change followed by closing / reloading the
// app within the debounce REVERTS — the same "reverts on refresh" the theme had.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const opts = { records: { TOK: clientRecord('c1', 'Cara Client') }, prefs: { TOK: { notif: { messagereply: true, homecareReminder: true }, saved: ['Old Serum'] } } };
await mockApi(page, opts);
const boot = async () => { await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await page.waitForTimeout(2500); };
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' }); await boot();

// Theme (device-local by design): must survive a reload.
await page.evaluate(() => _scSetTheme('dark'));
// Notification toggle + saved product, then the client closes the app half a second later.
await page.evaluate(() => { toggleNotif('messagereply'); });
const local = await page.evaluate(() => loadNotifPrefs().messagereply);
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'load' }); await boot();
const after = await page.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), pref: _scThemePref(), messagereply: loadNotifPrefs().messagereply }));
check('theme survives a reload', after.pref !== 'dark' || after.theme !== 'dark', after);
check('notification toggle changed then app closed within ~1s REVERTS on next launch', local === false && after.messagereply === true, { localAfterToggle: local, afterReload: after.messagereply });

// Same toggle, but wait past the debounce: should stick.
await page.evaluate(() => { toggleNotif('messagereply'); });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'load' }); await boot();
const after2 = await page.evaluate(() => loadNotifPrefs().messagereply);
check('notification toggle sticks when the PUT got out', after2 !== false, { afterReload: after2 });
await browser.close();
finish();
