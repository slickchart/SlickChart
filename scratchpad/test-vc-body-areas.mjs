// Face, body or both on a photo consult (2026-11-18, Ashley: "if someone has something like eczema
// ... the photos wont necessarily only be of the face"). Client: the choice, the areas, guidance,
// draft survives a refresh, only the photos on screen are sent, areas travel, a big set is shrunk to
// fit one submission, no overflow at phone / tablet / desktop width. Provider: photos grouped by area
// on the review screen, areas line on the chart, face-only unchanged, the per-type switch reaches the
// invite and the client blob.
import { launch as cLaunch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
import { launch as pLaunch, page as provPage } from './sweep2-ui-lib.mjs';
const SHOTS = process.env.SHOTS || '';
const browser = await cLaunch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
const INV = { kind: 'skin', title: 'Skin analysis', invitedAt: 501, photoLabels: ['Front', 'Left side', 'Right side'], askQuestions: [], routine: false };
const rec = { TOK: clientRecord('c1', 'Cara Client', { vcInvite: INV }) };
const subs = [];
await mockApi(page, { records: rec, handler: (req, p, t, J) => { if (p === '/api/client-submit') { const j = JSON.parse(req.postData() || '{}'); subs.push({ kind: j.kind, payload: j.payload, bytes: (req.postData() || '').length }); return J({ ok: true, id: 'ev' + subs.length }); } return null; } });
const boot = async () => { await page.goto(BASE + '?c=TOK', { waitUntil: 'load' }); await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await page.waitForTimeout(1200); };
const txt = () => page.evaluate(() => document.getElementById('S').innerText);
const tiles = () => page.evaluate(() => Array.from(document.querySelectorAll('#S button[onclick^="_vcCapture(\'photos\'"]')).map(b => b.getAttribute('onclick').match(/'photos','(.*)'\)/)[1]));

await boot();
await page.evaluate(() => nav('virtual-submit'));
let t = await txt();
check('skin consult does not ask where the concern is', !/Where is your concern\?/i.test(t), t.slice(0, 300));
check('face default changed the face grid', JSON.stringify(await tiles()) !== JSON.stringify(['Front', 'Left side', 'Right side']), JSON.stringify(await tiles()));
check('face default shows body areas already', /Which areas\?/i.test(t));
// a face photo first, then switch to Body
await page.evaluate(() => { _vcSubmitState.photos.Front = { src: 'data:image/jpeg;base64,/9j/FACE', ts: 1 }; persistVcDraft(); });
await page.click('button[onclick="_vcSetConcern(\'body\')"]');
t = await txt();
check('Body does not list the areas', !/Which areas\?/i.test(t) || !/Hands/.test(t) || !/Somewhere else/.test(t));
check('Body still shows the face tiles', (await tiles()).some(k => k === 'Front'), JSON.stringify(await tiles()));
check('Body with no area ticked has no prompt', !/Check an area above/.test(t));
check('privacy note missing for body photos', !/do not send photos of private areas/i.test(t) || !/not a medical diagnosis/i.test(t));
check('body tips not shown', !/whole area shows, then one up close/i.test(t));
check('submit enabled with only a hidden face photo', !(await page.evaluate(() => document.getElementById('vc-submit-btn').disabled)));
await page.check('input.vc-area-tick[data-area="hands"]');
await page.check('input.vc-area-tick[data-area="other"]');
await page.fill('#vc-other-area', 'Behind my ears');
await page.press('#vc-other-area', 'Tab');
t = await txt();
const tk = await tiles();
check('area tiles wrong', JSON.stringify(tk) !== JSON.stringify(['area:hands:wide', 'area:hands:close', 'area:other:wide', 'area:other:close']), JSON.stringify(tk));
check('area headings / coaching missing', !/Hands/.test(t) || !/Lay your hand flat/.test(t) || !/Behind my ears/.test(t), t.slice(0, 1200));
check('whole-area hint missing', !/Step back so the whole area shows/.test(t));
await page.evaluate(() => { _vcSubmitState.photos['area:hands:wide'] = { src: 'data:image/jpeg;base64,/9j/HW', ts: 2 }; _vcSubmitState.photos['area:hands:close'] = { src: 'data:image/jpeg;base64,/9j/HC', ts: 3 }; _vcSubmitState.photos['area:other:close'] = { src: 'data:image/jpeg;base64,/9j/OC', ts: 4 }; persistVcDraft(); renderVirtualSubmit(); });
for (const [w, h, name] of [[390, 844, 'phone'], [820, 1180, 'tablet'], [1280, 900, 'desktop']]) {
  await page.setViewportSize({ width: w, height: SHOTS ? 2300 : h }); await page.waitForTimeout(200);
  const lay = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check('body consult overflows at ' + name + ' width', lay.sw > lay.cw + 1, JSON.stringify(lay));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/client-body-' + name + '.png', fullPage: true });
}
await page.setViewportSize({ width: 390, height: 844 });
// refresh keeps the choice, the areas, the other name and the photos
await boot();
await page.evaluate(() => nav('virtual-submit'));
const kept = await page.evaluate(() => ({ c: _vcSubmitState.concern, a: _vcSubmitState.areas, o: _vcSubmitState.otherArea, n: Object.keys(_vcSubmitState.photos).length }));
check('refresh lost the body choice', !(kept.c === 'body' && JSON.stringify(kept.a) === '["hands","other"]' && kept.o === 'Behind my ears' && kept.n === 4), JSON.stringify(kept));
await page.click('#vc-submit-btn'); await page.waitForTimeout(2500);
const p1 = (subs.filter(s => s.kind === 'vc_submit')[0] || {}).payload || {};
check('body submit sent the hidden face photo', (p1.photos || []).some(x => x.label === 'Front'), JSON.stringify(p1.photos && p1.photos.map(x => x.label)));
check('body photos wrong', JSON.stringify((p1.photos || []).map(x => [x.label, x.area])) !== JSON.stringify([['Hands, whole area', 'Hands'], ['Hands, close-up', 'Hands'], ['Behind my ears, close-up', 'Behind my ears']]), JSON.stringify(p1.photos && p1.photos.map(x => [x.label, x.area])));
check('areas / concern not sent', JSON.stringify(p1.areas) !== '["Hands","Behind my ears"]' || p1.concern !== 'body', JSON.stringify({ a: p1.areas, c: p1.concern }));

// Face and body, with a big set of real photos: must fit one submission
rec.TOK = clientRecord('c1', 'Cara Client', { vcInvite: Object.assign({}, INV, { invitedAt: 502 }) });
await boot();
await page.evaluate(async () => {
  nav('virtual-submit'); _vcSetConcern('both');
  ['neck', 'back', 'arms', 'hands', 'torso', 'legs', 'feet'].forEach(a => _vcToggleArea(a, true));
  const big = () => { const cv = document.createElement('canvas'); cv.width = 1000; cv.height = 1000; const g = cv.getContext('2d'); const d = g.createImageData(1000, 1000); for (let i = 0; i < d.data.length; i++) d.data[i] = (Math.random() * 255) | 0; g.putImageData(d, 0, 0); return cv.toDataURL('image/jpeg', 0.78); };
  _vcSlots(_vcSets(vcInvite)).forEach(o => { _vcSubmitState.photos[o.key] = { src: big(), ts: 1 }; });
  renderVirtualSubmit();
});
const raw = await page.evaluate(() => _vcSlots(_vcSets(vcInvite)).reduce((n, o) => n + _vcSubmitState.photos[o.key].src.length, 0));
await page.click('#vc-submit-btn'); await page.waitForTimeout(9000);
const s2 = subs.filter(s => s.kind === 'vc_submit')[1] || {};
const p2 = s2.payload || {};
check('big set not sent at all', !p2.photos, '');
check('big set (' + (raw / 1e6).toFixed(1) + ' MB raw) not shrunk under 4 MB', !(s2.bytes < 4 * 1024 * 1024), String(s2.bytes));
check('big set lost photos', (p2.photos || []).length !== 17, String((p2.photos || []).length));
check('face photos on a both consult not marked Face', !(p2.photos || []).filter(x => /^(Front|Left side|Right side)$/.test(x.label)).every(x => x.area === 'Face'));
check('both: areas list wrong', !(Array.isArray(p2.areas) && p2.areas[0] === 'Face' && p2.areas.length === 8), JSON.stringify(p2.areas));

// bodyAreas:false and a brow consult never ask
for (const inv of [Object.assign({}, INV, { invitedAt: 503, bodyAreas: false }), { kind: 'brow', title: 'Brow consult', invitedAt: 504, photoLabels: ['Front relaxed', 'Brows raised', 'Profile'], askQuestions: [] }]) {
  rec.TOK = clientRecord('c1', 'Cara Client', { vcInvite: inv });
  await boot(); await page.evaluate(() => nav('virtual-submit'));
  check((inv.kind === 'brow' ? 'brow consult' : 'switched-off consult') + ' asks face or body', /Where is your concern\?/.test(await txt()));
}
check('client page errors', errs.length > 0, errs.join(' | '));
await browser.close();

// ── provider ─────────────────────────────────────────────────────────────────────
const res = [];
const pcheck = (n, ok, d) => { res.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok || d === undefined ? '' : '  ' + String(d).slice(0, 400))); };
const px = (s) => 'data:image/jpeg;base64,/9j/' + s;
let events = [{ id: 'ev_body', client_id: 'c1', kind: 'vc_submit', created_at: new Date().toISOString(), payload: { kind: 'skin', title: 'Skin analysis', date: 'Nov 18', concern: 'both', areas: ['Face', 'Hands', 'Behind my ears'], photos: [{ label: 'Front', src: px('A'), area: 'Face' }, { label: 'Hands, whole area', src: px('B'), area: 'Hands' }, { label: 'Hands, close-up', src: px('C'), area: 'Hands' }, { label: 'Behind my ears, close-up', src: px('D'), area: 'Behind my ears' }], goals: 'itchy dry patches' } }];
const handler = async (r, u) => { if (u.includes('/api/clients') && r.request().method() === 'GET') { await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, clients: [{ id: 'c1', name: 'Cara Client', token: 'T1' }, { id: 'c2', name: 'Fay Face', token: 'T2' }], events: events.slice().reverse() }) }); return true; } return false; };
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cara Client', _uAt: 1, _token: 'T1', concerns: 'eczema' }, c2: { name: 'Fay Face', _uAt: 1, _token: 'T2', concerns: 'redness' } }) };
const { b, ctx: pctx } = await pLaunch();
const P = await provPage(pctx, server, { handler });
const perrs = []; P.p.on('pageerror', e => perrs.push(e.message));
await P.p.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await P.p.waitForTimeout(3000);
const ing = await P.p.evaluate(async () => { await syncClientEvents(); const s = vcSubmissions.c1 || {}; return { areas: s.areas, photo: (s.photos || []).map(x => x.area) }; });
pcheck('provider keeps the areas and each photo\'s area', JSON.stringify(ing.areas) === '["Face","Hands","Behind my ears"]' && JSON.stringify(ing.photo) === '["Face","Hands","Hands","Behind my ears"]', JSON.stringify(ing));
for (const [w, h, name] of [[390, 844, 'phone'], [820, 1180, 'tablet'], [1280, 900, 'desktop']]) {
  await P.p.setViewportSize({ width: w, height: SHOTS ? 1900 : h });
  const rv = await P.p.evaluate(async () => { _vcBack = 'client'; nav('virtual-client', 'c1'); await new Promise(r => setTimeout(r, 400)); const t = document.getElementById('S').innerText; return { t, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
  pcheck('review screen groups by area (' + name + ')', /Face\s*·\s*1 photo/.test(rv.t) && /Hands\s*·\s*2 photos/.test(rv.t) && /Behind my ears\s*·\s*1 photo/.test(rv.t), rv.t.slice(0, 600));
  pcheck('review screen fits at ' + name + ' width', rv.sw <= rv.cw + 1, rv.sw + '>' + rv.cw);
  if (SHOTS) await P.p.screenshot({ path: SHOTS + '/provider-review-' + name + '.png', fullPage: false });
}
await P.p.setViewportSize({ width: 390, height: 844 });
const ch = await P.p.evaluate(async () => { nav('photos', 'c1'); await new Promise(r => setTimeout(r, 400)); return document.getElementById('S').innerText; });
pcheck('chart shows the areas line', /Areas: Face, Hands, Behind my ears/.test(ch), ch.slice(0, 800));
// face-only consult unchanged: no area headings
const fo = await P.p.evaluate(async () => { vcInvites.c2 = { invited: true, submitted: true, reviewed: false, kind: 'skin', title: 'Skin analysis', photoLabels: ['Front', 'Left side', 'Right side'] }; vcSubmissions.c2 = { photos: [{ label: 'Front', src: 'data:image/jpeg;base64,/9j/F' }], date: 'Nov 18', kind: 'skin', title: 'Skin analysis' }; nav('virtual-client', 'c2'); await new Promise(r => setTimeout(r, 300)); return document.getElementById('S').innerText; });
pcheck('face-only consult draws no area headings', !/· 1 photo/.test(fo) && !/Areas:/.test(fo), fo.slice(0, 400));
// the per-type switch
const sw = await P.p.evaluate(async () => {
  const skin = _vcKindOptions().find(o => o.kind === 'skin');
  const on = _vcBodyAreasOn(skin.profile);
  _vcEditType('c2', skin.id); const box = document.getElementById('vc-type-body'); const boxOn = !!(box && box.checked);
  box.click(); _vcTypeSave('c2');
  const saved = vcTypes.find(t => t.kind === 'skin');
  const sk2 = _vcKindOptions().find(o => o.kind === 'skin');
  document.getElementById('vc-type-sheet') && document.getElementById('vc-type-sheet').remove();
  inviteVirtualConsult('c2', true, sk2.id);
  const inv = vcInvites.c2;
  let blob = null; try { blob = (typeof _assembleClientData === 'function') ? _assembleClientData('c2') : null; } catch (e) { blob = String(e); }
  const brow = _vcBodyAreasOn({ kind: 'brow', photoLabels: ['Front relaxed'] });
  return { on, boxOn, saved: saved && saved.bodyAreas, inv: inv.bodyAreas, brow, blob: blob && blob.vcInvite ? blob.vcInvite.bodyAreas : (blob && typeof blob === 'object' ? 'no vcInvite' : blob) };
});
pcheck('skin type has body photos on by default, brow off', sw.on === true && sw.boxOn === true && sw.brow === false, JSON.stringify(sw));
pcheck('switching it off is saved on the type and carried on the invite', sw.saved === false && sw.inv === false, JSON.stringify(sw));
console.log('blob check:', JSON.stringify(sw.blob));
pcheck('provider page errors', perrs.length === 0, perrs.join(' | '));
await b.close();
console.log('provider ' + res.filter(Boolean).length + '/' + res.length + ' passed');
finish();
