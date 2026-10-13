// "Tidy up your client list" (openClientCleanup) removes clients that are not in Square AND score 0
// on _clientChartWeight. Before 2026-10-13 the weight ignored summaries, product plans, homecare,
// rec reasons, body maps, typed chart fields and appointments, so a client holding only one of those
// was removed. This drives the real screen with a mocked Square directory and checks who goes.
//   python3 -m http.server 8899   (from slickchart-vercel/)
//   node scratchpad/test-tidy-weight.mjs [file.html]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
let truncated = false; const delPosts = []; const storePuts = []; let storeDelayMs = 0;
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.route('**/api/cloud-status*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }));
await page.route('**/api/square/customers*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ truncated,
  customers: [ { id: 'ADAMDURAN0XYZ123', name: 'Adam Duran', email: 'bni@magnifiedmedia.net' }, { id: 'KEYONLYABCDEFGH', name: '', email: '' } ] }) }));
await page.route('**/api/clients', r => { if (r.request().method() === 'POST') { try { const b = JSON.parse(r.request().postData() || '{}'); if ((b.deletedIds || []).length) delPosts.push(b.deletedIds); } catch (e) {} } return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"clients":[],"events":[]}' }); });
await page.route('**/api/store', async r => { if (r.request().method() === 'PUT') { try { storePuts.push(Object.keys(JSON.parse(r.request().postData() || '{}').items || {})); } catch (e) {} if (storeDelayMs) await new Promise(x => setTimeout(x, storeDelayMs)); } return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{}}' }); });
await page.goto('http://localhost:8899/' + FILE, { waitUntil: 'load' });
await page.waitForTimeout(2600);

const ids = await page.evaluate(() => {
  Object.keys(CL).forEach(k => delete CL[k]);
  const skel = (name, extra) => Object.assign({ name, skin: '—', concerns: '—', allergies: 'None on file', fitz: '—', lastVisit: '—', nextVisit: 'Not scheduled', treatment: 'New client', sessions: 0, email: name.toLowerCase().replace(/ /g, '') + '@x.test', phone: '' }, extra || {});
  CL.junk1 = skel('Aaron Kim'); CL.junk2 = skel('Aaron Morgan'); CL.junk3 = skel('Abram Gill', { allergies: 'None noted' });
  CL.sumOnly = skel('Summary Only'); sessionSummaries.sumOnly = [{ t: 'Test A', _ts: 1 }];
  CL.sumOnRecord = skel('Summary On Record', { summaries: [{ t: 'x' }] });
  CL.planOnly = skel('Plan Only'); clientRecs.planOnly = ['p1'];
  CL.homecareOnly = skel('Homecare Only'); clientHomecare.homecareOnly = ['Use SPF'];
  CL.reasonOnly = skel('Reason Only'); recReasons.reasonOnly = { p1: 'dry skin' };
  CL.mapOnly = skel('Map Only'); bodyMaps.mapOnly = { a: 1 };
  CL.typedAllergy = skel('Typed Allergy', { allergies: 'Latex' });
  CL.apptOnly = skel('Appt Only'); manualAppts.push({ id: 'ma1', clientId: 'apptOnly' });
  CL.horseOwner = skel('Horse Owner'); CL.horse = skel('Horse', { ownerId: 'horseOwner', isAnimal: true });
  CL.adam = skel('Adam Duran', { email: '' });
  CL[_sqLocalId('KEYONLYABCDEFGH')] = skel('Keyed By Square Id', { email: '' });
  return Object.keys(CL);
});
const rep = await page.evaluate(async () => { const r = await _clientsNotInSquare(); return r && { extra: r.extra.map(x => [x.id, x.weight]) }; });
const w = Object.fromEntries(rep.extra);
check('Adam Duran (in Square by name) not offered', !('adam' in w));
check('client keyed sq_<id> matching a Square id not offered', !(Object.keys(w).some(k => k.startsWith('sq_'))), JSON.stringify(Object.keys(w)));
for (const k of ['junk1', 'junk2', 'junk3']) check(k + ' (bare Square-import skeleton) scores 0', w[k] === 0, w[k]);
for (const k of ['sumOnly', 'sumOnRecord', 'planOnly', 'homecareOnly', 'reasonOnly', 'mapOnly', 'typedAllergy', 'apptOnly', 'horseOwner', 'horse'])
  check(k + ' scores above 0', w[k] > 0, w[k]);

await page.evaluate(() => openClientCleanup()); await page.waitForTimeout(500);
await page.evaluate(() => _runClientCleanup()); await page.waitForTimeout(200);
await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#confirm-modal button')).filter(b => /Remove/.test(b.textContent)).pop(); if (b) b.click(); });
storeDelayMs = 2500;
await page.waitForTimeout(800);
const midText = await page.evaluate(() => (document.getElementById('client-cleanup') || {}).innerText || '');
check('while saving it says do not refresh', /don.t refresh/i.test(midText), midText.slice(0, 120));
await page.waitForTimeout(6000);
const endText = await page.evaluate(() => (document.getElementById('client-cleanup') || {}).innerText || '');
check('then it says safe to refresh, all three confirmed', /Safe to refresh/.test(endText) && (endText.match(/✓/g) || []).length === 3, endText.slice(0, 220));
const pushedKeys = storePuts.flat();
check('delete record and client list both reached /api/store', pushedKeys.includes('sc_deleted_clients') && pushedKeys.includes('sc_clients'), JSON.stringify(storePuts));
const left = await page.evaluate(() => Object.keys(CL));
check('the three empty junk clients removed', !left.includes('junk1') && !left.includes('junk2') && !left.includes('junk3'), JSON.stringify(left));
check('every client holding something kept', ['sumOnly', 'sumOnRecord', 'planOnly', 'homecareOnly', 'reasonOnly', 'mapOnly', 'typedAllergy', 'apptOnly', 'horseOwner', 'horse', 'adam'].every(k => left.includes(k)), JSON.stringify(left));

check('removed clients tombstoned on this device', await page.evaluate(() => !!(_deletedClientIds.junk1 && _deletedClientIds.junk2 && _deletedClientIds.junk3)));
check('server rows deleted in one batch request', delPosts.length === 1 && ['junk1','junk2','junk3'].every(k => delPosts[0].includes(k)), JSON.stringify(delPosts));
check('no kept client tombstoned', await page.evaluate(() => !['sumOnly','planOnly','adam','horse'].some(k => _deletedClientIds[k])));
truncated = true;
const r2 = await page.evaluate(async () => await _clientsNotInSquare());
check('a cut-off Square list offers nothing', r2 === null);
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
let bad = 0; for (const r of results) { if (!r.pass) bad++; console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail !== '' ? '  — ' + r.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
