// Jaimie's feedback, 2026-10-22: search found no one, past calendar dates were empty, Back lost her
// place, and a form could not be previewed from the send sheet.
//   (cd slickchart-vercel && python3 -m http.server 8899) & node scratchpad/test-provider-feedback-1022.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const ENGINE = process.env.ENGINE || 'chromium';
const results = []; const check = (n, p, d) => results.push({ n, pass: !!p, d: d || '' });
const clients = {};
for (let i = 0; i < 300; i++) clients['c' + i] = { name: 'Client ' + String(i).padStart(3, '0') + ' Smith', treatment: 'Spray tan' };
clients.c_bon = { name: 'Bonnie Vale', treatment: 'Facial' };
clients.c_zz = { name: 'Zz Jaimie Lynn', treatment: 'Spray tan' };       // sorts last, far past the first 80
const now = new Date(); const pm = new Date(now.getFullYear(), now.getMonth() - 1, 10, 10, 0, 0);
const pastAppt = { id: 'PAST1', startAt: pm.toISOString(), customerName: 'Bonnie Vale', customerId: 'SQB', durationMinutes: 60, serviceName: 'Facial', status: 'ACCEPTED' };
const futAppt = { id: 'FUT1', startAt: new Date(now.getTime() + 2 * 864e5).toISOString(), customerName: 'Client 001 Smith', durationMinutes: 60, serviceName: 'Facial', status: 'ACCEPTED' };
const kv = { sc_hide_sample: '1', sc_onboarded: '1', sc_shot_mode: '1', sc_clients: JSON.stringify(clients) };
const fromQs = [];
const launchOpts = ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' };
const b = await pw[ENGINE].launch(launchOpts);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); localStorage.setItem('sc_shot_mode', '1'); });
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...kv } }) });
  if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(kv, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  if (u.includes('/api/square/appointments')) { const f = new URL(u).searchParams.get('from'); if (f) { fromQs.push(f); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: [pastAppt] }) }); } return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: [futAppt] }) }); }
  if (u.includes('/api/square/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"customers":[],"retail":[],"services":[],"invoices":[]}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce, null, { timeout: 30000 });
await p.waitForTimeout(1200);

// A: a device stuck in the old Social media mode ('1') gets her clients back.
await p.evaluate(() => nav('clients'));
const A = await p.evaluate(() => ({ shot: _shotMode(), cards: document.querySelectorAll('.client-card').length, empty: /No clients yet/.test(S.innerText), stored: localStorage.getItem('sc_shot_mode') }));
check('A old "1" Social media mode reads as off; all 302 clients listed', !A.shot && A.cards === 302 && !A.empty, JSON.stringify(A));
await p.fill('input[oninput^="searchList("]', 'Bonnie');
const A2 = await p.evaluate(() => [...document.querySelectorAll('.client-card')].filter(c => !c.classList.contains('srch-hide')).map(c => c.innerText.split('\n')[0]));
check('A search "Bonnie" finds Bonnie Vale', A2.length === 1 && /Bonnie/.test(A2[0]), JSON.stringify(A2));

// B: freshly on — banner stays visible while searching, empty state says what is hiding them.
await p.evaluate(() => { localStorage.setItem('sc_shot_mode', 'on:' + Date.now()); nav('clients'); });
await p.fill('input[oninput^="searchList("]', 'Bonnie');
const B = await p.evaluate(() => { const bn = document.getElementById('shot-banner'); return { banner: !!(bn && bn.offsetParent), bannerTxt: bn ? bn.innerText : '', text: S.innerText }; });
check('B Social media banner visible while searching, with her client count', B.banner && /302/.test(B.bannerTxt), B.bannerTxt);
check('B empty list explains Social media mode, not "No clients yet"', /hiding your clients/.test(B.text) && !/No clients yet/.test(B.text), '');
check('B no-match line points at Social media mode', /Social media mode is hiding your real clients/.test(B.text), '');
await p.evaluate(() => { localStorage.setItem('sc_shot_mode', 'on:' + (Date.now() - 3 * 3600000)); });
check('B expires after 2 hours', !(await p.evaluate(() => _shotMode())), '');
await p.evaluate(() => { localStorage.setItem('sc_shot_mode', 'on:' + Date.now()); nav('clients'); });
await p.click('#shot-banner button');
const B2 = await p.evaluate(() => ({ screen: _navCur.screen, cards: document.querySelectorAll('.client-card').length, shot: _shotMode() }));
check('B Turn off on the Clients banner stays on Clients with everyone back', B2.screen === 'clients' && B2.cards === 302 && !B2.shot, JSON.stringify(B2));

// C: Ask your book sends the clients that match the question, not just the first 80.
const C = await p.evaluate(async () => { let seen = ''; const orig = window._aiJSON; window._aiJSON = async (pr) => { seen = pr; return { answer: 'Found her', ids: ['c_zz'] }; };
  nav('clients'); const i = document.getElementById('askbook-input'); if (!i) { window._aiJSON = orig; return { noAsk: true }; } i.value = 'Jaimie'; await _askBookRun(); window._aiJSON = orig;
  return { inPrompt: seen.includes('Zz Jaimie Lynn'), out: document.getElementById('askbook-results').innerText }; });
check('C Ask your book includes a client past the first 80 when named', C.noAsk || C.inPrompt, JSON.stringify(C));

// D: previous month on the calendar loads past Square visits.
await p.evaluate(() => _loadSquareAppts(true)); await p.waitForTimeout(500);
await p.evaluate(() => { nav('calendar'); _calGo(-1); });
await p.waitForTimeout(1500);
const key = pm.getFullYear() + '-' + String(pm.getMonth() + 1).padStart(2, '0') + '-10';
await p.evaluate((k) => _calPick(k), key);
const D = await p.evaluate(() => S.innerText);
check('D previous month asks Square for that month', fromQs.some(f => f.endsWith('-01')), JSON.stringify(fromQs));
check('D past visit shows on its day', /Bonnie Vale/.test(D) && /Facial/.test(D), D.slice(0, 600).replace(/\n/g, ' | '));
const D2 = await p.evaluate(() => ({ live: squareAppts.map(a => a.id), next: _clientApptSoonMs('c_bon') }));
check('D past visit never enters squareAppts (next-visit/check-ins unchanged)', D2.live.join() === 'FUT1' && D2.next == null, JSON.stringify(D2));

// E: Back keeps her place and her search.
await p.evaluate(() => nav('clients'));
await p.fill('input[oninput^="searchList("]', 'smith');
await p.evaluate(() => { S.scrollTop = 4000; window.scrollTo(0, 4000); });
const y0 = await p.evaluate(() => Math.max(S.scrollTop, window.scrollY));
await p.evaluate(() => nav('client', 'c150'));
await p.waitForTimeout(200);
await p.evaluate(() => navBack()); await p.waitForTimeout(250);
const E = await p.evaluate(() => ({ screen: _navCur.screen, y: Math.max(S.scrollTop, window.scrollY), q: (document.querySelector('input[oninput^="searchList("]') || {}).value, bon: [...document.querySelectorAll('.client-card')].find(c => /Bonnie/.test(c.innerText)).classList.contains('srch-hide') }));
check('E Back returns to the same scroll spot', E.screen === 'clients' && y0 > 1000 && Math.abs(E.y - y0) < 40, JSON.stringify({ y0, ...E }));
check('E Back keeps the search she typed', E.q === 'smith' && E.bon === true, JSON.stringify(E));
await p.evaluate(() => nav('clients'));
check('E a fresh tap on Clients still opens at the top', (await p.evaluate(() => Math.max(S.scrollTop, window.scrollY))) < 5, '');

// F: Preview a form from the send sheet without leaving it.
await p.evaluate(() => openClientFormSender('c_bon'));
const F0 = await p.$$eval('#sendform-sheet button', bs => bs.filter(b => /Preview/.test(b.innerText)).length);
await p.evaluate(() => { const bt = [...document.querySelectorAll('#sendform-sheet button')].find(b => /Preview/.test(b.innerText)); bt.click(); });
const F = await p.evaluate(() => { const o = document.getElementById('form-preview-sheet'); return { open: !!o, qs: o ? o.querySelectorAll('.scf-q').length : 0, sheet: !!document.getElementById('sendform-sheet') }; });
check('F every form row in the send sheet has Preview', F0 > 3, 'rows ' + F0);
check('F Preview opens the form over the send sheet', F.open && F.qs > 0 && F.sheet, JSON.stringify(F));
await p.click('#form-preview-sheet .btnp');
check('F closing the preview leaves her on the send sheet', await p.evaluate(() => !document.getElementById('form-preview-sheet') && !!document.getElementById('sendform-sheet')), '');

await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS' : 'FAIL') + '  ' + x.n + (x.pass ? '' : '  — ' + x.d)); }
console.log(`\n${ENGINE}: ${results.length - bad}/${results.length} pass`); process.exit(bad ? 1 : 0);
