// Jaimie, 2026-10-22: a spray tan client's welcome questions asked about a weighted blanket and bed
// warmer. Each bundle can be a welcome package, picked at send time, with its own check-in sections.
//   (cd slickchart-vercel && python3 -m http.server 8899) & node scratchpad/test-welcome-packages.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899; const ENGINE = process.env.ENGINE || 'chromium';
const results = []; const check = (n, p, d) => results.push({ n, pass: !!p, d: d || '' });
const kv = { sc_hide_sample: '1', sc_onboarded: '1', sc_clients: JSON.stringify({ c_b: { name: 'Bonnie Vale', _token: 'TOKB', email: 'b@example.com' } }) };
const pushed = [];
const launchOpts = ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' };
const b = await pw[ENGINE].launch(launchOpts);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...kv } }) });
  if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(kv, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  if (u.includes('/api/clients') && m !== 'GET') { try { pushed.push(JSON.parse(r.request().postData() || '{}')); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"clients":[{"id":"c_b","token":"TOKB"}]}' }); }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce, null, { timeout: 30000 });
await p.waitForTimeout(800);
// Two bundles: a spray tan welcome (her new-client bundle) and a facial one.
const setup = await p.evaluate(() => {
  const fids = Object.keys(formTmpls).filter(f => !(typeof _formHidden === 'function' && _formHidden(f)));
  bundles.push({ id: 'b_tan', name: 'Spray tan welcome', formIds: [fids[0], fids[1]], resourceIds: [], newClient: true });
  bundles.push({ id: 'b_fac', name: 'Facial welcome', formIds: [fids[2]], resourceIds: [] });
  saveBundles(); return { f0: fids[0], f1: fids[1], f2: fids[2], intake: _ncIntakeFormId() };
});
// Bundle editor: untick blanket & bed warmer for the spray tan bundle.
await p.evaluate(() => nav('edit-bundle', 'b_tan'));
const boxes = await p.$$eval('input[type=checkbox][onchange^="_bundleCiToggle"]', bs => bs.map(x => x.checked));
check('bundle editor shows the three check-in sections, all on', boxes.length === 3 && boxes.every(Boolean), JSON.stringify(boxes));
await p.click('input[onchange="_bundleCiToggle(\'b_tan\',\'warmth\')"]');
await p.waitForTimeout(1500);
check('unticking saves on the bundle and syncs', await p.evaluate(() => JSON.stringify(bundles.find(x => x.id === 'b_tan').checkinHide)) === '["warmth"]' && /"warmth"/.test(kv.sc_bundles || ''), kv.sc_bundles && kv.sc_bundles.slice(0, 200));
// Send: the chooser opens with her new-client bundle preselected and its check-in setting.
await p.evaluate(() => { window.inviteClientToApp = () => {}; window._pushClientNow = async () => ({ ok: true }); sendFirstVisitPackage('c_b'); });
const C = await p.evaluate(() => { const sh = document.getElementById('fvp-choose-sheet'); return { open: !!sh, txt: sh ? sh.innerText : '', warmth: (document.getElementById('fvp-ci-warmth') || {}).checked, drinks: (document.getElementById('fvp-ci-drinks') || {}).checked }; });
check('first-visit package asks which welcome package', C.open && /Spray tan welcome/.test(C.txt) && /Facial welcome/.test(C.txt) && /Standard intake/.test(C.txt), C.txt.slice(0, 300));
check('spray tan is preselected with blanket/bed warmer off', C.warmth === false && C.drinks === true, JSON.stringify(C));
check('each form in the package has a Preview', await p.$$eval('#fvp-choose-sheet button', bs => bs.filter(b => /Preview/.test(b.innerText)).length) === 2, '');
await p.click('#fvp-choose-sheet .btnp'); await p.waitForTimeout(500);
const S1 = await p.evaluate((st) => { const c = CL.c_b; const d = _assembleClientData('c_b'); return { hide: c.checkinHide, forms: c.pendingForms.map(x => x.formId), blankets: d.checkinCfg.blankets.length, heat: d.checkinCfg.heat.length, drinks: d.checkinCfg.drinks.length, comfortOn: d.checkinCfg.chairComfortOn, global: checkinCfg.blankets.length }; }, setup);
check('client gets the spray tan forms', S1.forms.includes(setup.f0) && S1.forms.includes(setup.f1), JSON.stringify(S1));
check('her check-in has no blanket or bed warmer, still has drinks', S1.blankets === 0 && S1.heat === 0 && S1.drinks > 0 && S1.comfortOn !== false, JSON.stringify(S1));
check('her other clients still get the full check-in', S1.global > 0, '');
// Second send: pick Facial and tick everything back.
await p.evaluate(() => sendFirstVisitPackage('c_b'));
await p.evaluate(() => { _fvpSel = 'b_fac'; _fvpChooseDraw('c_b'); });
const C2 = await p.evaluate(() => ({ warmth: document.getElementById('fvp-ci-warmth').checked }));
check('switching to Facial resets the check-in ticks to that package', C2.warmth === true, JSON.stringify(C2));
await p.click('#fvp-choose-sheet .btnp'); await p.waitForTimeout(400);
const S2 = await p.evaluate(() => { const d = _assembleClientData('c_b'); return { hide: CL.c_b.checkinHide, blankets: d.checkinCfg.blankets.length, forms: CL.c_b.pendingForms.map(x => x.formId) }; });
check('Facial package: full check-in again and the facial form added', S2.hide === undefined && S2.blankets > 0 && S2.forms.includes(setup.f2), JSON.stringify(S2));
// Untick everything comfort-related: the whole Comfort step goes.
await p.evaluate(() => sendFirstVisitPackage('c_b'));
await p.evaluate(() => { ['warmth', 'drinks', 'music'].forEach(k => document.getElementById('fvp-ci-' + k).checked = false); document.querySelector('#fvp-choose-sheet .btnp').click(); });
await p.waitForTimeout(400);
check('no comfort parts ticked: the Comfort step is off', await p.evaluate(() => _assembleClientData('c_b').checkinCfg.chairComfortOn === false), '');
// No bundles at all: sends straight away, as before.
await p.evaluate(() => { bundles.length = 0; saveBundles(); sendFirstVisitPackage('c_b'); });
await p.waitForTimeout(300);
check('with no bundles it sends the standard intake straight away (unchanged)', await p.evaluate(() => !document.getElementById('fvp-choose-sheet')), '');
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS' : 'FAIL') + '  ' + x.n + (x.pass ? '' : '  — ' + x.d)); }
console.log(`\n${ENGINE}: ${results.length - bad}/${results.length} pass`); process.exit(bad ? 1 : 0);
