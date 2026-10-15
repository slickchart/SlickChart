// Client prefs are a whole-blob PUT (api/client-prefs.js -> saveClientPrefs overwrites). The app
// PUTs whenever anything changes, with no "have I read the server copy yet" guard, and boot PUTs even
// when the GET failed. A fresh device (new phone, cleared Safari, in-app browser) therefore writes its
// EMPTY defaults over the client's saved prefs: hidden summaries, completed check-in/forms marks,
// corrected contact, avatar, course progress, notification choices.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const SERVER = { notif: { messages: false, reminders: false }, hiddenSummaries: { s1: 1 }, contact: { email: 'fixed@ex.com', phone: '555-FIXED' },
  avatar: 'data:image/png;base64,ME', courseProg: { c1: { l1: true } }, checkinDone: { jess: 'Oct 20|1' }, formsDone: { 'jess|intake': { a: 1, t: 1 } } };

async function run(label, delays, handler, action) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const opts = { records: { TOK: clientRecord('c1', 'Cara Client') }, prefs: { TOK: JSON.parse(JSON.stringify(SERVER)) }, delays, handler };
  await mockApi(page, opts);
  await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
  if (action) await page.evaluate(action);
  await page.waitForTimeout(6000);
  const puts = opts.log.filter(e => e.path === '/api/client-prefs' && e.method === 'PUT');
  const get = opts.log.find(e => e.path === '/api/client-prefs' && e.method === 'GET');
  const first = puts[0];
  const body = first ? JSON.parse(first.body).prefs : null;
  await ctx.close();
  return { puts: puts.length, putBeforeGetAnswered: !!(first && get && first.at < get.answeredAt), body, stored: opts.prefs.TOK };
}

// 1. Slow GET (weak signal) + the client taps something in the first seconds.
const r1 = await run('slow', { '/api/client-prefs:GET': 4000 }, null, () => { try { _dismissA2HS(); } catch (e) {} });
check('fresh device, slow prefs GET: a PUT is sent before the GET answered', r1.putBeforeGetAnswered, { puts: r1.puts });
check('...and that PUT drops the server copy (contact/hiddenSummaries/courseProg/notif)', !!r1.body && (!r1.body.contact || !Object.keys(r1.body.hiddenSummaries || {}).length || !Object.keys(r1.body.courseProg || {}).length),
  r1.body && { contact: r1.body.contact, hidden: r1.body.hiddenSummaries, courseProg: r1.body.courseProg, notif: r1.body.notif });

// 2. GET fails outright (500) — boot still PUTs local defaults over the server copy.
const r2 = await run('fail', {}, (req, p, t, J) => (p === '/api/client-prefs' && req.method() === 'GET') ? J({ error: 'x' }, 500) : undefined, null);
check('prefs GET fails -> boot still PUTs this device\'s defaults over the saved prefs', r2.puts > 0 && !(r2.body && r2.body.contact), { puts: r2.puts, sentContact: r2.body && r2.body.contact, sentHidden: r2.body && r2.body.hiddenSummaries });
// 3. GET OK: courseProg / notif / saved are plain overwrite in the merge — check no loss in the happy path.
const r3 = await run('ok', {}, null, null);
check('happy path: boot PUT preserves server prefs', !(r3.body && r3.body.contact && r3.body.contact.phone === '555-FIXED' && Object.keys(r3.body.courseProg || {}).length && r3.body.notif && r3.body.notif.messages === false),
  r3.body && { contact: r3.body.contact, courseProg: r3.body.courseProg, notifMessages: r3.body.notif && r3.body.notif.messages, checkinDone: r3.body.checkinDone });
await browser.close();
finish();
