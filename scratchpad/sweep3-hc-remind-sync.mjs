// sweep3: cron-reminders sends routine reminders only when prefs.reminders.hasHomecare is true — a
// value the CLIENT computes and uploads with its prefs. It is computed at upload time, and an open
// app that receives its first routine by poll (_pollRealClient -> _applyRealClientData) never
// re-uploads prefs. Also checks the shapes the cron reads (tz, homecareAM/PM {on,hour,min}).
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const rec = clientRecord('c1', 'Cara Client', { aftercare: [] });
const opts = { records: { TOK: rec }, prefs: {} };
await mockApi(page, opts);
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(3000);
const p0 = opts.prefs.TOK || {};
check('boot uploads prefs with tz', !(p0.reminders && p0.reminders.tz), p0.reminders);
check('boot: hasHomecare false (no routine yet)', !(p0.reminders && p0.reminders.hasHomecare === false), p0.reminders);
// provider sends the first routine while the app is open
rec.client.data.aftercare = ['Cleanse', 'SPF 50'];
await page.evaluate(() => _pollRealClient()); await page.waitForTimeout(2500);
const shown = await page.evaluate(() => (activeProvider().homecare || []).length);
const p1 = opts.prefs.TOK || {};
check('open app shows the new routine (' + shown + ' steps)', shown !== 2);
check('server prefs still say hasHomecare:false after the routine arrived (no re-upload) -> cron sends no homecare reminder', p1.reminders && p1.reminders.hasHomecare === false, p1.reminders);
// she turns on the morning reminder
await page.evaluate(() => { nav('homecare'); _hcToggle('AM'); _hcSetTime('AM', '07:30'); });
await page.waitForTimeout(2500);
const p2 = opts.prefs.TOK || {};
check('after setting AM, uploaded shape = {on:true,hour:7,min:30} + hasHomecare true', !(p2.notif && p2.notif.homecareAM && p2.notif.homecareAM.on && p2.notif.homecareAM.hour === 7 && p2.notif.homecareAM.min === 30 && p2.reminders.hasHomecare === true && p2.notif.enabled === true), { am: p2.notif && p2.notif.homecareAM, rem: p2.reminders, enabled: p2.notif && p2.notif.enabled });
// provider REMOVES the whole routine; app open
rec.client.data.aftercare = [];
await page.evaluate(() => _pollRealClient()); await page.waitForTimeout(2500);
const p3 = opts.prefs.TOK || {};
check('routine removed while open: server still hasHomecare:true -> 7:30 reminders keep firing for an empty routine', p3.reminders && p3.reminders.hasHomecare === true, p3.reminders);
await browser.close();
finish();
