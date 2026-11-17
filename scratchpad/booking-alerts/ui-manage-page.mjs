// The client's "Change or cancel" page itself, driven in a real browser (phone and computer width):
// pick a new time and send it (request mode), pick an open slot (instant mode), cancel with the
// "Yes, cancel it" step. The page is served by api/book-manage.js over an in-memory database.
// Run: node scratchpad/booking-alerts/ui-manage-page.mjs   (WebKit: bash scratchpad/run-in-safari.sh <this>)
import { register } from 'node:module';
register('../founder-push/hooks.mjs', import.meta.url);
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const APP = new URL('../../slickchart-vercel/', import.meta.url).pathname;
Object.assign(process.env, { DATABASE_URL: 'postgres://x', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', SESSION_SECRET: 's3cret' });
delete process.env.FIREBASE_SERVICE_ACCOUNT; delete process.env.APNS_KEY_P8; delete process.env.RESEND_API_KEY;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const open = { open: true, start: '09:00', end: '18:00' };
const hours = JSON.stringify({ sun: open, mon: open, tue: open, wed: open, thu: open, fri: open, sat: open });
const cfg = { on: true, mode: 'request', leadHours: 0, horizonDays: 60, services: [{ name: 'Facial', mins: 60 }] };
const events = []; let seq = 0;
globalThis.__sqlHandler = (t, v) => {
  if (/SELECT v FROM kv WHERE owner/.test(t)) {
    if (v[1] === 'sc_booking_page') return [{ v: JSON.stringify(cfg) }];
    if (v[1] === 'sc_availability') return [{ v: hours }];
    if (v[1] === 'sc_bizinfo') return [{ v: JSON.stringify({ name: 'Glow Studio', tz: 'America/Chicago' }) }];
    return [];
  }
  if (/SELECT consult_slug FROM providers/.test(t)) return [{ consult_slug: 'glow' }];
  if (/SELECT id, name, email FROM providers WHERE id/.test(t)) return [{ id: v[0], name: 'Glow', email: '' }];
  if (/SELECT name, email, phone FROM clients/.test(t)) return [{ name: 'Riley Park', email: '', phone: '' }];
  if (/INSERT INTO client_events/.test(t)) { if (events.some(e => e.id === v[0])) return []; events.push({ id: v[0], client_id: v[1], provider_id: v[2], kind: v[3], payload: JSON.parse(v[4]), created_at: Number(v[5]), seq: seq++ }); return [{ id: v[0] }]; }
  if (/FROM client_events\s+WHERE id = /.test(t)) return events.filter(e => e.id === v[0] && e.kind === 'booking');
  if (/kind = 'booking_change'/.test(t)) return events.filter(e => e.provider_id === v[0] && e.client_id === v[1] && e.kind === 'booking_change' && e.payload.ref === v[2]).sort((a, b) => (b.created_at - a.created_at) || (b.seq - a.seq)).slice(0, 1);
  if (/INSERT INTO booking_alert_log/.test(t)) return [{ akey: v[1] }];
  return [];
};
globalThis.fetch = async () => { throw new Error('no network'); };
const { default: manage } = await import(APP + 'api/book-manage.js');
const { manageToken } = await import(APP + 'lib/booking-manage.js');
const iso = d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const seed = (id, conf) => events.push({ id, client_id: 'c1', provider_id: 'prov_glow', kind: 'booking', created_at: Date.now(), seq: seq++,
  payload: { via: 'booking-link', autoConfirmed: conf, date: iso(5), time: '2:00 PM', treatment: 'Facial', dur: 60 } });

async function serve(route) {
  const req = route.request(), u = new URL(req.url());
  const isPost = req.method() === 'POST';
  const q = Object.fromEntries(u.searchParams);
  const out = { code: 200, body: '', type: 'text/html' };
  const res = { status(s) { out.code = s; return res; }, json(j) { out.body = JSON.stringify(j); out.type = 'application/json'; return res; }, send(h) { out.body = String(h); return res; }, setHeader() {} };
  await manage({ method: req.method(), headers: { 'x-real-ip': '1.2.3.' + Math.floor(Math.random() * 250) }, query: q, body: isPost ? JSON.parse(req.postData() || '{}') : undefined }, res);
  await route.fulfill({ status: out.code, contentType: out.type, body: out.body });
}
const engine = process.env.PW_ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const browser = await engine.launch(process.env.PW_ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium' });
for (const width of [390, 1280]) {
  const W = width + 'px: ';
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.route('https://slickchart.test/booking/manage**', serve);

  // request mode: pick a day and a free time
  cfg.mode = 'request';
  const A = 'ev_idem_pgA' + width; seed(A, false);
  await page.goto('https://slickchart.test/booking/manage?m=' + encodeURIComponent(manageToken('prov_glow', A)));
  ok(await page.isVisible('#btn-move') && await page.isVisible('#btn-cancel'), W + 'the page shows Pick a new time and Cancel appointment');
  await page.click('#btn-move');
  await page.fill('#f-date', iso(8));
  await page.dispatchEvent('#f-date', 'change');
  ok(await page.isVisible('#f-time'), W + 'request mode: a time box to choose any time in her hours');
  await page.fill('#f-time', '11:30');
  await page.click('#go-move');
  await page.waitForSelector('.done h2', { timeout: 5000 }).catch(() => {});
  let h = await page.textContent('.done h2').catch(() => '');
  ok(h === 'Request sent', W + 'sending it says "Request sent" (' + h + ')');
  const mv = events.filter(e => e.kind === 'booking_change' && e.payload.ref === A).pop();
  ok(mv && mv.payload.time === '11:30 AM' && mv.payload.date === iso(8), W + 'the server got the new day and time (' + (mv && mv.payload.time) + ')');

  // a time outside her hours is refused with a plain message, and the page stays usable
  await page.goto('https://slickchart.test/booking/manage?m=' + encodeURIComponent(manageToken('prov_glow', A)));
  await page.click('#btn-move'); await page.fill('#f-date', iso(9)); await page.dispatchEvent('#f-date', 'change');
  await page.fill('#f-time', '20:00'); await page.click('#go-move'); await page.waitForTimeout(600);
  const err = await page.textContent('#err');
  ok(/outside their hours/.test(err) && await page.isEnabled('#go-move'), W + 'a time outside her hours is refused in plain words (' + err + ')');

  // instant mode: open slots appear as buttons
  cfg.mode = 'instant';
  const B = 'ev_idem_pgB' + width; seed(B, true);
  await page.goto('https://slickchart.test/booking/manage?m=' + encodeURIComponent(manageToken('prov_glow', B)));
  await page.click('#btn-move'); await page.fill('#f-date', iso(6)); await page.dispatchEvent('#f-date', 'change');
  await page.waitForSelector('#slots .slot', { timeout: 5000 }).catch(() => {});
  const n = await page.$$eval('#slots .slot', x => x.length);
  ok(n > 3, W + 'instant mode: her open times show as buttons (' + n + ')');
  await page.click('#slots .slot[data-t="10:00 AM"]');
  await page.click('#go-move');
  await page.waitForSelector('.done h2', { timeout: 5000 }).catch(() => {});
  h = await page.textContent('.done h2').catch(() => '');
  ok(h === 'Appointment moved', W + 'picking one moves it straight away (' + h + ')');

  // cancel, with the confirm step, then the page says cancelled
  await page.goto('https://slickchart.test/booking/manage?m=' + encodeURIComponent(manageToken('prov_glow', B)));
  await page.click('#btn-cancel');
  ok(await page.isVisible('#go-cancel') && await page.isVisible('#keep'), W + 'Cancel asks first, with Keep my appointment');
  await page.click('#keep'); ok(await page.isVisible('#btn-move'), W + 'Keep goes back');
  await page.click('#btn-cancel'); await page.click('#go-cancel');
  await page.waitForSelector('.done h2', { timeout: 5000 }).catch(() => {});
  h = await page.textContent('.done h2').catch(() => '');
  ok(h === 'Appointment cancelled', W + 'Yes, cancel it cancels (' + h + ')');
  await page.reload();
  ok(/This appointment is cancelled/.test(await page.textContent('body')), W + 'opening the link again says it is cancelled');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), W + 'nothing runs off the side of the screen');
  ok(!errs.length, W + 'no script errors (' + errs.join(' | ') + ')');
  await page.close();
}
await browser.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
