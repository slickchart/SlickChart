// Jaimie, 2026-10-22: "have the booking button redirect clients directly to our existing Square booking page".
//   (cd slickchart-vercel && python3 -m http.server 8899) & node scratchpad/test-square-booking-page.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
// lib/booking.js imports the database driver, which is not installed here; lift the one function out.
const _src = fs.readFileSync(new URL('../slickchart-vercel/lib/booking.js', import.meta.url), 'utf8');
const normalizeSquareBookingUrl = new Function(_src.match(/export function normalizeSquareBookingUrl[\s\S]*?\n}\n/)[0].replace('export ', '') + '; return normalizeSquareBookingUrl;')();
const PORT = process.env.PORT || 8899; const ENGINE = process.env.ENGINE || 'chromium';
const results = []; const check = (n, p, d) => results.push({ n, pass: !!p, d: d || '' });
const URLOK = 'https://book.squareup.com/appointments/abc123/location/L1/services';
check('server accepts a Square booking link', normalizeSquareBookingUrl(URLOK) === URLOK, '');
check('server accepts name.square.site', normalizeSquareBookingUrl('jaimie.square.site') === 'https://jaimie.square.site/', '');
for (const bad of ['https://evil.com/?squareup.com', 'https://squareup.com.evil.com/', 'javascript:alert(1)', 'https://a:b@book.squareup.com/', 'https://book.squareup.com:8443/'])
  check('server refuses ' + bad, normalizeSquareBookingUrl(bad) === '', normalizeSquareBookingUrl(bad));
const launchOpts = ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' };
const b = await pw[ENGINE].launch(launchOpts);

// Provider: set it from the booking link screen.
{
  const kv = { sc_hide_sample: '1', sc_onboarded: '1', sc_clients: '{}' };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...kv } }) });
    if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(kv, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"slug":"jaimie"}' }); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce, null, { timeout: 30000 });
  await p.evaluate(() => nav('booking-link'));
  const btn = await p.$('button:has-text("Add my Square link")');
  check('booking link screen offers "Add my Square link"', !!btn, '');
  // a wrong link is refused
  await btn.click(); await p.waitForTimeout(200);
  await p.fill('#input-sheet input, #input-sheet textarea, .input-sheet input', 'https://evil.com/book').catch(() => {});
  const sheetSel = await p.evaluate(() => { const i = [...document.querySelectorAll('input,textarea')].find(x => /squareup/.test(x.placeholder || '')); if (!i) return null; i.value = 'https://evil.com/book'; const sv = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === 'Save'); sv.click(); return true; });
  await p.waitForTimeout(200);
  check('a non-Square link is refused', sheetSel && !(await p.evaluate(() => bookCfg.squareUrl)), '');
  await p.evaluate(() => { const o = document.querySelector('[id*="input-sheet"],[id*="inputsheet"]'); if (o) o.remove(); });
  await p.click('button:has-text("Add my Square link")'); await p.waitForTimeout(200);
  await p.evaluate((u) => { const i = [...document.querySelectorAll('input,textarea')].find(x => /squareup/.test(x.placeholder || '')); i.value = u; [...document.querySelectorAll('button')].find(x => x.innerText.trim() === 'Save').click(); }, URLOK.replace('https://', ''));
  await p.waitForTimeout(400);
  const P = await p.evaluate(() => ({ cfg: bookCfg.squareUrl, txt: S.innerText }));
  check('her Square link saves (https added) and syncs', P.cfg === URLOK && JSON.parse(kv.sc_booking_page || '{}').squareUrl === URLOK, JSON.stringify(P.cfg) + ' kv=' + (kv.sc_booking_page || '').slice(0, 200));
  check('screen shows the link and a Stop button', P.txt.includes(URLOK) && /Stop/.test(P.txt), '');
  await ctx.close();
}

// Client: the Book button opens her Square page, request still reachable.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERROR', e.message));
  const data = (sq) => ({ ok: true, client: { id: 'c1', name: 'Bonnie Vale', email: 'b@example.com', data: { providerName: 'Jaimie Lynn', providerFirst: 'Jaimie', services: ['Spray tan'], squareBookingUrl: sq,
    availability: { mon: { open: true, start: '09:00', end: '17:00' }, tue: { open: true, start: '09:00', end: '17:00' } } } } });
  let sq = URLOK;
  await p.route('**/api/client-data*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data(sq)) }));
  await p.route('**/api/client-availability*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"slots":[],"openDays":["mon","tue"]}' }));
  await p.goto('http://localhost:' + PORT + '/slickchart-client.html?c=TESTTOKEN', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => nav('rebook'));
  const C = await p.evaluate(() => { const a = document.getElementById('rb-square'); return { href: a && a.href, txt: S.innerText }; });
  check('client Book screen opens her Square page', C.href === URLOK && /Book on Square/.test(C.txt), JSON.stringify(C).slice(0, 300));
  await p.click('text=send Jaimie a request instead');
  const C2 = await p.evaluate(() => S.innerText);
  check('"request instead" shows the normal request form', /Request an appointment/.test(C2), C2.slice(0, 200));
  await p.evaluate(() => nav('home')); await p.evaluate(() => nav('rebook'));
  check('next visit to Book shows Square again', await p.evaluate(() => !!document.getElementById('rb-square')), '');
  // Home card button route.
  await p.evaluate(() => nav('home')); await p.waitForTimeout(300);
  const hb = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /nav\('rebook'\)/.test(x.getAttribute('onclick') || '')); if (!b) return false; b.click(); return !!document.getElementById('rb-square'); });
  check('Home "Request an appointment" button also lands on Book on Square', hb, '');
  // A link that is not Square's (should never come from the server) is ignored: normal form.
  sq = 'https://evil.example/book';
  await p.goto('http://localhost:' + PORT + '/slickchart-client.html?c=TESTTOKEN', { waitUntil: 'load' }); await p.waitForTimeout(2500);
  await p.evaluate(() => nav('rebook'));
  check('a non-Square link from the server is ignored, normal request form', await p.evaluate(() => !document.getElementById('rb-square') && /Request an appointment/.test(S.innerText)), '');
  // No link: unchanged request form.
  sq = '';
  await p.goto('http://localhost:' + PORT + '/slickchart-client.html?c=TESTTOKEN', { waitUntil: 'load' }); await p.waitForTimeout(2500);
  await p.evaluate(() => nav('rebook'));
  check('without a Square link the request form is unchanged', await p.evaluate(() => !document.getElementById('rb-square') && /Request an appointment/.test(S.innerText)), '');
  // Deep link ?scr=rebook (from a notification) with the link set.
  sq = URLOK;
  await p.goto('http://localhost:' + PORT + '/slickchart-client.html?c=TESTTOKEN&scr=rebook', { waitUntil: 'load' }); await p.waitForTimeout(3000);
  const dl = await p.evaluate(() => { try { nav('rebook'); } catch (e) {} return !!document.getElementById('rb-square'); });
  check('opening Book from a notification link lands on Book on Square', dl, '');
  await ctx.close();
}
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS' : 'FAIL') + '  ' + x.n + (x.pass ? '' : '  — ' + x.d)); }
console.log(`\n${ENGINE}: ${results.length - bad}/${results.length} pass`); process.exit(bad ? 1 : 0);
