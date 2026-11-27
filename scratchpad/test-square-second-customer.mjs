// Kristi, 2026-11-27: a client since 2021 booked herself online in Square. Square made a SECOND
// customer record for her (same name, email and phone, new id), SlickChart gave that record its own
// empty chart, the booking went to it, and the first-visit package Ashley sent from Kristi's real chart
// showed "Not scheduled" in Kristi's app.
//
//   node scratchpad/test-square-second-customer.mjs        (PORT=8899 serving slickchart-vercel/)
//
// A) booking under a second Square record of the same person: no new chart, her real chart gets the visit
// B) a family sharing one email (different first names) still gets two charts, the parent no visit
// C) a booking under a Square record that was MERGED into her chart counts as hers
// D) a same-name stranger with a different Square id and no shared contact gets nothing
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ n, pass: !!p, d: d || '' });
const at = new Date(Date.now() + 3 * 864e5); at.setUTCHours(20, 30, 0, 0);
const at2 = new Date(at.getTime() + 2 * 3600e3), at3 = new Date(at.getTime() + 4 * 3600e3), at4 = new Date(at.getTime() + 6 * 3600e3);
const appts = [
  { id: 'BK1', startAt: at.toISOString(), customerName: 'Kristi Kay', customerId: 'SQKNEW', customerEmail: 'kristi@example.com', customerPhone: '+19255550101', durationMinutes: 60, serviceName: 'Signature Facial', status: 'ACCEPTED' },
  { id: 'BK2', startAt: at2.toISOString(), customerName: 'Lily Park', customerId: 'SQLILY', customerEmail: 'parkfam@example.com', customerPhone: '+19255550202', durationMinutes: 60, serviceName: 'Brow', status: 'ACCEPTED' },
  { id: 'BK3', startAt: at3.toISOString(), customerName: 'Mara Quinn', customerId: 'SQMARANEW', customerEmail: '', customerPhone: '', durationMinutes: 60, serviceName: 'Peel', status: 'ACCEPTED' },
  { id: 'BK4', startAt: at4.toISOString(), customerName: 'Sam Rowe', customerId: 'SQSAM2', customerEmail: 'sam2@example.com', customerPhone: '+19255550404', durationMinutes: 60, serviceName: 'Facial', status: 'ACCEPTED' }];
const kv = { sc_hide_sample: '1', sc_onboarded: '1',
  sc_merged_into: JSON.stringify({ sq_sqmaranew: 'c_mara' }),
  sc_clients: JSON.stringify({
    sq_sqkold: { name: 'Kristi Kay', squareId: 'SQKOLD', email: 'Kristi@Example.com', phone: '(925) 555-0101', nextVisit: 'Not scheduled', treatment: 'New client' },
    c_dana: { name: 'Dana Park', squareId: 'SQDANA', email: 'parkfam@example.com', phone: '(925) 555-0202', nextVisit: 'Not scheduled' },
    c_mara: { name: 'Mara Quinn', squareId: 'SQMARAOLD', nextVisit: 'Not scheduled' },
    c_sam: { name: 'Sam Rowe', squareId: 'SQSAM1', email: 'sam1@example.com', phone: '(925) 555-0999', nextVisit: 'Not scheduled' } }) };
const exe = process.env.SC_CHROME || '';
const b = await pw.chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await b.newContext({ timezoneId: 'America/Los_Angeles', viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
const clientPosts = [];
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...kv } }) });
  if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(kv, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  if (u.includes('/api/square/appointments')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: appts }) });
  if (u.includes('/api/square/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"customers":[],"retail":[],"services":[],"invoices":[]}' });
  if (u.includes('/api/client') && m === 'POST') { try { clientPosts.push(r.request().postData() || ''); } catch (e) {} }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce, null, { timeout: 30000 });
await p.waitForFunction(() => typeof _rosterNotReadYet !== 'function' || !_rosterNotReadYet(), null, { timeout: 20000 });
await p.evaluate(() => _loadSquareAppts(true)); await p.waitForTimeout(3000);
const R = await p.evaluate(() => {
  const kristis = Object.keys(CL).filter(id => /kristi kay/i.test(CL[id].name || ''));
  const lilys = Object.keys(CL).filter(id => /lily park/i.test(CL[id].name || ''));
  const sams = Object.keys(CL).filter(id => /sam rowe/i.test(CL[id].name || ''));
  const blob = _assembleClientData('sq_sqkold');
  const sqAppt = squareAppts.find(a => a.id === 'BK1');
  return { kristis, lilys, sams,
    kNext: CL.sq_sqkold && CL.sq_sqkold.nextVisit, kTx: CL.sq_sqkold && CL.sq_sqkold.nextVisitTx,
    kIs: _apptIsClients(sqAppt, 'sq_sqkold'), kOwner: _apptClientIdOf({ raw: sqAppt, title: 'Kristi Kay' }),
    kNextAppt: (_nextApptForClient('sq_sqkold') || {}).treatment || null,
    blobNext: blob && blob.profile && blob.profile.nextVisit,
    dana: CL.c_dana && CL.c_dana.nextVisit, mara: CL.c_mara && CL.c_mara.nextVisit, sam: CL.c_sam && CL.c_sam.nextVisit };
});
check('A no second chart for Kristi (same name + email + phone under a new Square id)', R.kristis.length === 1, JSON.stringify(R.kristis));
check('A her real chart gets the visit as her next visit', R.kNext && !/Not scheduled/.test(R.kNext), R.kNext);
check('A the booked service rides with it', R.kTx === 'Signature Facial', R.kTx);
check('A the booking counts as hers (_apptIsClients, _apptClientIdOf, _nextApptForClient)', R.kIs === true && R.kOwner === 'sq_sqkold' && R.kNextAppt === 'Signature Facial', JSON.stringify([R.kIs, R.kOwner, R.kNextAppt]));
check('A what her app is sent says the visit', (R.blobNext && !/Not scheduled/.test(R.blobNext)), String(R.blobNext));
check('B a family member sharing the email gets her own chart', R.lilys.length === 1, JSON.stringify(R.lilys));
check('B the parent is not given the child\'s visit', /Not scheduled/.test(R.dana || ''), R.dana);
check('C a booking under a Square record merged into her chart counts as hers', R.mara && !/Not scheduled/.test(R.mara), R.mara);
check('D a same-name stranger (different Square id, no shared contact) is not given the visit', /Not scheduled/.test(R.sam || ''), R.sam);
check('D ...and gets a chart of their own', R.sams.length === 2, JSON.stringify(R.sams));
// E) Ashley's account today: the second chart already exists. Once she merges it into the real one, the
//    booking (still under the second Square record) belongs to the real chart.
const E = await p.evaluate(async () => {
  CL.sq_sqe2 = { name: 'Erin Vale', squareId: 'SQE2', email: 'erin@example.com', nextVisit: 'Not scheduled' };
  CL.c_erin = { name: 'Erin Vale', squareId: 'SQE1', email: 'erin@example.com', nextVisit: 'Not scheduled', notes: 'since 2021' };
  return true; });
await p.evaluate((t) => { squareAppts.push(..._sqMapAppts([{ id: 'BK5', startAt: t, customerName: 'Erin Vale', customerId: 'SQE2', customerEmail: 'erin@example.com', durationMinutes: 60, serviceName: 'Facial' }])); _stampClientNextVisit(true); }, new Date(at.getTime() + 8 * 3600e3).toISOString());
const E1 = await p.evaluate(() => ({ dup: CL.sq_sqe2 && CL.sq_sqe2.nextVisit, real: CL.c_erin.nextVisit }));
check('E before the merge the second chart holds the visit (the duplicate is hers to merge)', !/Not scheduled/.test(E1.dup || '') && /Not scheduled/.test(E1.real), JSON.stringify(E1));
await p.evaluate(() => { _mergeClientRecords('c_erin', 'sq_sqe2'); _sqOwnerMemo.k = -1; _stampClientNextVisit(true); });
const E2 = await p.evaluate(() => ({ gone: !CL.sq_sqe2, real: CL.c_erin.nextVisit, sq: CL.c_erin.squareId }));
check('E after merging into the real chart, the real chart gets the visit', E2.gone && !/Not scheduled/.test(E2.real || ''), JSON.stringify(E2));
// F) Copies that already exist fold on their own (Ashley, 2026-11-27: "lets fix this so this whole thing
//    never happens again"). Two Square copies, same full name + email + phone: one chart, the one her
//    client's link is on, and a real allergy note beats the starter "None noted".
// G) a family (same email, different full names) and H) same name + email but different phones stay apart.
const F = await p.evaluate(() => {
  CL.sq_sqf1 = { name: 'Fay Lund', squareId: 'SQF1', email: 'fay@example.com', phone: '(925) 555-0707', allergies: 'None noted', appJoined: true, _token: 't1', nextVisit: 'Not scheduled', notes: '' };
  CL.sq_sqf2 = { name: 'Fay Lund', squareId: 'SQF2', email: 'FAY@example.com', phone: '+19255550707', allergies: 'A few antibiotics.', appJoined: false, source: 'square', nextVisit: 'Not scheduled' };
  CL.sq_sqg1 = { name: 'Gail Moss', squareId: 'SQG1', email: 'moss@example.com', phone: '(925) 555-0808' };
  CL.sq_sqg2 = { name: 'Gina Moss', squareId: 'SQG2', email: 'moss@example.com', phone: '(925) 555-0808' };
  CL.sq_sqh1 = { name: 'Hana Ito', squareId: 'SQH1', email: 'ito@example.com', phone: '(925) 555-0901' };
  CL.sq_sqh2 = { name: 'Hana Ito', squareId: 'SQH2', email: 'ito@example.com', phone: '(925) 555-0902' };
  const n = _autoMergeSquareDuplicates();
  const again = _autoMergeSquareDuplicates();
  return { n, again, f1: !!CL.sq_sqf1, f2: !!CL.sq_sqf2, allergies: CL.sq_sqf1 && CL.sq_sqf1.allergies, into: _mergedInto.sq_sqf2,
    g: !!CL.sq_sqg1 && !!CL.sq_sqg2, h: !!CL.sq_sqh1 && !!CL.sq_sqh2 };
});
check('F the two Square copies of one person fold into one chart, the one her link is on', F.f1 && !F.f2 && F.into === 'sq_sqf1', JSON.stringify(F));
check('F her real allergy note survives over the starter "None noted"', F.allergies === 'A few antibiotics.', F.allergies);
check('F a second run changes nothing', F.again === 0, String(F.again));
check('G a family sharing an email and phone (different first names) stays two charts', F.g, JSON.stringify(F));
check('H same name and email but different phones stays two charts', F.h, JSON.stringify(F));
await p.evaluate((t) => { squareAppts.push(..._sqMapAppts([{ id: 'BK6', startAt: t, customerName: 'Fay Lund', customerId: 'SQF2', customerEmail: 'fay@example.com', durationMinutes: 60, serviceName: 'Facial' }])); _sqOwnerMemo.k = -1; _stampClientNextVisit(true); }, new Date(at.getTime() + 9 * 3600e3).toISOString());
const F2 = await p.evaluate(() => CL.sq_sqf1 && CL.sq_sqf1.nextVisit);
check('F a booking under the folded Square record lands on the kept chart', F2 && !/Not scheduled/.test(F2), F2);
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS' : 'FAIL') + '  ' + x.n + '  — ' + x.d); }
console.log(`\n${results.length - bad}/${results.length} pass`); process.exit(bad ? 1 : 0);
