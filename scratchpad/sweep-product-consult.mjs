// END-TO-END: the product consult, every step, both apps.
// provider invites -> client sees the right invite -> answers (no photos) -> draft survives reload ->
// submits (payload carries answers) -> provider sees answers, no photo-only parts -> picks products ->
// sends -> message lists picks, picks are on the client's Recommended for you. Plus photo-consult regression.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs = [];
const json = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

// ---------- PROVIDER: invite ----------
const prov = await browser.newPage({ viewport: { width: 390, height: 844 } });
prov.on('pageerror', e => errs.push('provider: ' + (e && e.message || e)));
await prov.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
await prov.route('**/api/**', r => { const u = r.request().url(); if (u.includes('cloud-status')) return json(r, { enabled: true }); return json(r, { ok: true, data: {}, clients: [], events: [] }); });
await prov.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await prov.waitForTimeout(2500);
const inv = await prov.evaluate(() => {
  CL.aw = { name: 'Ashley Watson', concerns: '' };
  affiliateLinks.push({ id: 'p1', name: 'Avène Thermal Spring Water', brand: 'Retail · $20', active: true, site: 'https://shop.test/a' },
                      { id: 'p2', name: 'Cicalfate+ Cream', brand: 'Retail · $26', active: true });
  clientRecs.aw = [];
  nav('client', 'aw');
  const btn = Array.from(document.querySelectorAll('#S button')).find(b => /Product consult/.test(b.textContent));
  const rowBefore = btn ? btn.textContent.replace(/\s+/g, ' ').trim() : '';
  if (btn) btn.click();
  const i = vcInvites.aw || {};
  const last = (msgStore.aw || []).slice(-1)[0] || {};
  return { rowBefore, kind: i.kind, title: i.title, photos: i.photoLabels, asks: i.askQuestions, routine: i.routine, msg: last.text || '', invite: JSON.parse(JSON.stringify(i)) };
});
check('client screen has a Product consult row', /Product consult/.test(inv.rowBefore), inv.rowBefore);
check('tapping it sends a product consult (not a "not built yet" box)', inv.kind === 'product', JSON.stringify({ kind: inv.kind, title: inv.title }));
check('invite asks no photos', Array.isArray(inv.photos) && inv.photos.length === 0, JSON.stringify(inv.photos));
check('invite carries the 8 product questions', Array.isArray(inv.asks) && inv.asks.length === 8, JSON.stringify(inv.asks));
check('invite asks what they use now', inv.routine === true);
check('invite message talks about questions, not photos', /questions/i.test(inv.msg) && !/photos/i.test(inv.msg), inv.msg);
const rowAfter = await prov.evaluate(() => { nav('client', 'aw'); const b = Array.from(document.querySelectorAll('#S button')).find(b => /Product consult/.test(b.textContent)); const p = Array.from(document.querySelectorAll('#S button')).find(b => /Photo consult/.test(b.textContent)); return { prod: b ? b.textContent : '', photo: p ? p.textContent : '' }; });
check('Product consult row shows it is waiting on answers', /waiting on .*answers/i.test(rowAfter.prod), rowAfter.prod);
const inbox = await prov.evaluate(() => { nav('vc-inbox'); const card = Array.from(document.querySelectorAll('.vc-card')).find(c => /Ashley Watson/.test(c.textContent)); return card ? card.innerText : ''; });
check('consults inbox: product consult named and awaiting answers', /Product consult/.test(inbox) && /Awaiting answers/i.test(inbox), inbox);
check('Photo consult row is not hijacked by the product invite', !/waiting|Photos are in/.test(rowAfter.photo), rowAfter.photo);

// her edited questions must be the ones that go out
const edited = await prov.evaluate(() => {
  vcTypes.push({ id: 'my-prod', title: 'Product consult', kind: 'product', icon: 'ti-flask', photoLabels: [], askQuestions: ['What do you use now?', 'Any reactions?'] });
  delete vcInvites.aw; _productConsult('aw'); return (vcInvites.aw || {}).askQuestions;
});
check('her edited product questions are the ones sent', JSON.stringify(edited) === '["What do you use now?","Any reactions?"]', JSON.stringify(edited));
// the picker route (invite sheet) must also carry questions for a saved product type
const viaPicker = await prov.evaluate(() => { delete vcInvites.aw; inviteVirtualConsult('aw', true, 'my-prod'); return (vcInvites.aw || {}).askQuestions; });
check('invite sheet route carries the questions too', Array.isArray(viaPicker) && viaPicker.length === 2, JSON.stringify(viaPicker));
// restore the default invite for the client test
const invite = await prov.evaluate(() => { vcTypes.length = 0; delete vcInvites.aw; _productConsult('aw'); return JSON.parse(JSON.stringify(vcInvites.aw)); });

// ---------- CLIENT: answer + submit ----------
const cli = await browser.newPage({ viewport: { width: 390, height: 844 } });
cli.on('pageerror', e => errs.push('client: ' + (e && e.message || e)));
let submitted = null;
await cli.route('**/api/**', r => { const u = r.request().url(); if (u.includes('client-submit')) { try { submitted = JSON.parse(r.request().postData() || '{}'); } catch (e) {} return json(r, { ok: true, id: 'ev1' }); } return json(r, { ok: true }); });
await cli.addInitScript(inv => { try { localStorage.setItem('sc_client_invite', JSON.stringify({ kind: inv.kind, title: inv.title, fee: '', providerFirst: 'Ashley', invitedAt: inv.invitedAt, askQuestions: inv.askQuestions, photoLabels: inv.photoLabels, refTitle: null, refLabels: null, routine: true })); } catch (e) {} }, invite);
await cli.goto('http://localhost:8899/slickchart-client.html', { waitUntil: 'load' });
await cli.waitForTimeout(1500);
const home = await cli.evaluate(() => { loadInvite(); nav('home'); return document.getElementById('S').innerText; });
check('client home card says product consult', /invited you to a product consult/i.test(home) && /questions/i.test(home), (home.match(/invited you to[^\n]*/) || [''])[0]);
const sub1 = await cli.evaluate(() => { nav('virtual-submit'); const t = document.getElementById('S').innerText; const btn = document.getElementById('vc-submit-btn'); return { t, title: document.getElementById('tt').textContent, boxes: document.querySelectorAll('[id^=vc-ask-]').length, photoTiles: Array.from(document.querySelectorAll('#S button')).filter(b => /_vcCapture/.test(b.getAttribute('onclick') || '')).length, disabled: btn && btn.disabled }; });
check('submit screen title is the consult name', sub1.title === 'Product consult', sub1.title);
check('no photo slots on a product consult', sub1.photoTiles === 0, String(sub1.photoTiles));
check('all 8 questions shown', sub1.boxes === 8, String(sub1.boxes));
check('submit starts disabled', sub1.disabled === true);
await cli.fill('#vc-ask-0', 'Cerave cleanser and SPF 30');
await cli.fill('#vc-ask-6', 'Less redness');
const en = await cli.evaluate(() => { const b = document.getElementById('vc-submit-btn'); return { disabled: b.disabled, label: document.getElementById('vc-submit-label').textContent }; });
check('answering a question enables Submit', en.disabled === false && /Submit to/.test(en.label), JSON.stringify(en));
await cli.reload({ waitUntil: 'load' }); await cli.waitForTimeout(1200);
const kept = await cli.evaluate(() => { loadInvite(); nav('virtual-submit'); return { a0: (document.getElementById('vc-ask-0') || {}).value, a6: (document.getElementById('vc-ask-6') || {}).value, disabled: document.getElementById('vc-submit-btn').disabled }; });
check('answers survive closing the app (draft)', kept.a0 === 'Cerave cleanser and SPF 30' && kept.a6 === 'Less redness', JSON.stringify(kept));
check('Submit still enabled after reload', kept.disabled === false);
await cli.evaluate(() => { client._real = true; client._token = 'TOK'; });
await cli.click('#vc-submit-btn');
await cli.waitForTimeout(1200);
check('submission reaches the server', !!submitted && submitted.kind === 'vc_submit', JSON.stringify(submitted && submitted.kind));
const pl = (submitted && submitted.payload) || {};
check('payload carries question + answer pairs', Array.isArray(pl.answers) && pl.answers.length === 2 && /Cerave/.test(pl.answers[0].a) && /using now/i.test(pl.answers[0].q), JSON.stringify(pl.answers));
check('payload is a product consult with no photos', pl.kind === 'product' && Array.isArray(pl.photos) && pl.photos.length === 0, JSON.stringify({ k: pl.kind, p: pl.photos }));
const after = await cli.evaluate(() => ({ invite: localStorage.getItem('sc_client_invite'), draft: localStorage.getItem('sc_vc_draft'), journey: (nav('journey'), document.getElementById('S').innerText) }));
check('invite and draft cleared after sending', !after.invite && !after.draft, JSON.stringify({ i: !!after.invite, d: !!after.draft }));
check('journey shows the consult with her answers', /Product consult/.test(after.journey) && /Cerave cleanser/.test(after.journey), '');

// ---------- PROVIDER: review ----------
const rv = await prov.evaluate(pl => {
  vcSubmissions.aw = { photos: [], refs: null, goals: pl.goals || '', answers: _sanVcAnswers(pl.answers), routine: pl.routine || [], date: pl.date, kind: pl.kind };
  vcInvites.aw = { ...(vcInvites.aw || {}), submitted: true };
  nav('client', 'aw');
  const row = Array.from(document.querySelectorAll('#S button')).find(b => /Product consult/.test(b.textContent));
  const rowTxt = row ? row.textContent : '';
  _vcBack = 'client'; nav('virtual-client', 'aw');
  const t = document.getElementById('S').innerText;
  return { rowTxt, t, title: document.getElementById('tt').textContent, picker: !!document.getElementById('prod-picker') };
}, pl);
check('row says answers are in', /Answers are in/.test(rv.rowTxt), rv.rowTxt);
check('review title is Product consult', rv.title === 'Product consult', rv.title);
check('review shows her answers', /Cerave cleanser and SPF 30/.test(rv.t) && /Less redness/.test(rv.t), '');
check('no photo-only parts on the review', !/Can.t read these/.test(rv.t) && !/Terminology helper/.test(rv.t) && !/Current photos|Client photos/.test(rv.t) && !/Connect a submitted photo/.test(rv.t), rv.t.slice(0, 400));
check('product picker on the review', rv.picker && /Your product picks/i.test(rv.t));
const sent = await prov.evaluate(async () => {
  addClientProd('aw', 'p1'); addClientProd('aw', 'p2');
  const ok = sendVcReview('aw');
  await new Promise(r => setTimeout(r, 500));
  const last = (msgStore.aw || []).slice(-1)[0] || {};
  return { ok, msg: last.text || '', recs: (clientRecs.aw || []).slice(), reviewed: !!(vcInvites.aw || {}).reviewed };
});
check('send works with picks', sent.ok === true && sent.reviewed, JSON.stringify(sent));
check('message lists the picks', /product recommendations are ready/i.test(sent.msg) && /Avène Thermal Spring Water/.test(sent.msg) && /Cicalfate/.test(sent.msg), sent.msg);
check('picks are on Recommended for you (clientRecs)', JSON.stringify(sent.recs) === '["p1","p2"]', JSON.stringify(sent.recs));
const empty = await prov.evaluate(() => { clientRecs.aw = []; vcInvites.aw.reviewed = false; nav('virtual-client', 'aw'); return sendVcReview('aw'); });
check('nothing to send is refused politely', empty === false);

// ---------- regression: photo consult unchanged ----------
const photo = await prov.evaluate(() => {
  delete vcInvites.aw; delete vcSubmissions.aw;
  inviteVirtualConsult('aw', true, (_vcKindOptions()[0] || {}).id);
  const i = vcInvites.aw; const last = (msgStore.aw || []).slice(-1)[0] || {};
  vcSubmissions.aw = { photos: [{ label: 'Front', src: 'data:image/png;base64,iVBORw0KGgo=' }], goals: 'glow' }; vcInvites.aw.submitted = true;
  nav('virtual-client', 'aw'); const t = document.getElementById('S').innerText;
  return { kind: i.kind, photos: (i.photoLabels || []).length, msg: last.text, t };
});
check('photo consult still asks for photos', photo.kind !== 'product' && photo.photos > 0, JSON.stringify({ k: photo.kind, n: photo.photos }));
check('photo consult invite still mentions photos', /photos/i.test(photo.msg), photo.msg);
check('photo review still has its photo tools', /Can.t read these/.test(photo.t) && /Terminology helper/i.test(photo.t) && !/Your product picks/i.test(photo.t), '');
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 260) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
