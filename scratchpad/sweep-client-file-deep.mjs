// DEEP sweep of the client file: every button checked for the RIGHT outcome, and every edit checked again
// after a full reload of the app (localStorage kept, server answering empty so nothing comes back from it).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
let errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
page.on('dialog', d => d.dismiss().catch(() => {}));
const calls = [];
await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {} window.open = function () { return null; };
  try { navigator.share = undefined; } catch (e) {} });
await page.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
  calls.push(m + ' ' + u.replace(/^https?:\/\/[^/]+/, '').split('?')[0] + ' ' + (r.request().postData() || '').slice(0, 400));
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (/\/api\/clients/.test(u) && m !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"tokens":{"c1":"TOKC1"},"clients":[]}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
const boot = async () => { await page.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' }); await page.waitForTimeout(2800); };
await boot();
// seed a real-looking client and a catalog, saved the normal way
await page.evaluate(() => {
  CL.c1 = { name: 'Cooper Howard', phone: '555 0101', email: 'c@x.test', treatment: 'Facial', summaries: [], _token: 'TOKC1' };
  try { saveClients(); } catch (e) {}
  affiliateLinks.push({ id: 'p1', name: 'Avène Thermal Spring Water', brand: 'Avène', active: true, site: 'shop.test/a' },
                      { id: 'p2', name: 'Cicalfate+ Cream', brand: 'Avène', active: true },
                      { id: 'p3', name: 'Mineral SPF 50', brand: 'EltaMD', active: true });
  try { persistAffiliateLinks(); } catch (e) {}
});
const go = (tab) => page.evaluate(tab => { document.querySelectorAll('#vc-type-sheet,#sendform-sheet,#vitals-modal,#buy-sheet,#invite-sheet').forEach(x => x.remove()); nav('client', 'c1'); _setClientTab('c1', tab); }, tab);
const tapText = (tab, re) => page.evaluate(([tab, src]) => { const re = new RegExp(src, 'i'); const pane = document.querySelector('.ctab[data-tab="' + tab + '"]');
  const el = Array.from(pane.querySelectorAll('button,[onclick],[role=button]')).find(e => re.test((e.getAttribute('aria-label') || '') + ' ' + e.textContent)); if (!el) return 'MISSING'; el.click(); return document.getElementById('tt').textContent; }, [tab, re.source]);

// ---------- VISIT ----------
const navs = [['AI Brief', /Brief/i], ['^\\s*Notes', /Note/i], ['^\\s*Photos', /Photo/i], ['Rebook', /Rebook|Book/i], ['Take payment', /Checkout|Payment|Charge/i], ['Session summary', /Summar/i]];
for (const [lbl, want] of navs) {
  await go('visit'); errs = [];
  const tt = await tapText('visit', new RegExp(lbl)); await page.waitForTimeout(250);
  const body = await page.evaluate(() => document.getElementById('S').innerText.length);
  check('Visit · ' + lbl.replace(/[\\^s*]/g, '') + ' opens its screen', tt !== 'MISSING' && want.test(tt) && body > 30 && !errs.length, tt + ' ' + errs.join(';'));
}
await go('visit'); errs = [];
await tapText('visit', /Start Session/); await page.waitForTimeout(200);
check('Visit · Start Session opens the session room', await page.evaluate(() => /SESSION/i.test(document.getElementById('S').innerText) && /End session/i.test(document.getElementById('S').innerText)) && !errs.length, errs.join(';'));
await go('visit'); errs = [];
await tapText('visit', /Photo consult/); await page.waitForTimeout(250);
const vc = await page.evaluate(() => { const sh = document.getElementById('vc-type-sheet'); if (!sh) return { sheet: false };
  const send = Array.from(sh.querySelectorAll('button')).find(b => /send/i.test(b.textContent)); if (send) send.click();
  return { sheet: true, sent: !!send, inv: JSON.parse(JSON.stringify(vcInvites.c1 || {})) }; });
check('Visit · Photo consult opens the setup sheet and sends', vc.sheet && vc.sent && vc.inv.invited === true && (vc.inv.photoLabels || []).length > 0, JSON.stringify(vc).slice(0, 200));
await page.evaluate(() => { delete vcInvites.c1; try { persistVcState(); } catch (e) {} });
await go('visit'); await tapText('visit', /Product consult/); await page.waitForTimeout(200);
check('Visit · Product consult sends a product consult', await page.evaluate(() => (vcInvites.c1 || {}).kind === 'product'));
await page.evaluate(() => { delete vcInvites.c1; try { persistVcState(); } catch (e) {} });
// Forms
await go('visit'); errs = [];
await tapText('visit', /^\s*Forms/); await page.waitForTimeout(250);
const fs = await page.evaluate(() => { const sh = document.getElementById('sendform-sheet'); if (!sh) return { sheet: false };
  const txt = sh.innerText; const btn = Array.from(sh.querySelectorAll('button')).find(b => /shareFormLink/.test(b.getAttribute('onclick') || ''));
  const fid = btn ? (btn.getAttribute('onclick').match(/shareFormLink\('([^']+)'/) || [])[1] : null; if (btn) btn.click();
  return { sheet: true, hasGuides: /guide/i.test(txt), fid, pending: JSON.parse(JSON.stringify(CL.c1.pendingForms || [])) }; });
check('Visit · Forms opens the send sheet', fs.sheet, JSON.stringify(fs).slice(0, 150));
check('Visit · sending a form puts it on their pending list', fs.fid && fs.pending.some(p => (p.formId || p) === fs.fid || JSON.stringify(p).includes(fs.fid)), JSON.stringify(fs).slice(0, 300));
// Guides + Courses
await go('visit'); errs = [];
await tapText('visit', /Guides \+ Courses/); await page.waitForTimeout(250);
const gs = await page.evaluate(() => { const sh = document.getElementById('sendform-sheet'); if (!sh) return { sheet: false };
  const btn = Array.from(sh.querySelectorAll('button')).find(b => /_cfsSendGuide/.test(b.getAttribute('onclick') || ''));
  const g = document.getElementById('cfs-guides'); const sc = g && g.parentNode; const firstHead = (g && sc && Math.abs((g.offsetTop - sc.offsetTop) - sc.scrollTop) < 4) ? 'GUIDES (scrolled to)' : 'not scrolled';
  const crsBtn = Array.from(sh.querySelectorAll('button')).find(b => /_cfsSendCourse/.test(b.getAttribute('onclick') || ''));
  window.__crsId = crsBtn ? (crsBtn.getAttribute('onclick').match(/_cfsSendCourse\('([^']+)'/) || [])[1] : null;
  const gid = btn ? (btn.getAttribute('onclick').match(/_cfsSendGuide\('([^']+)'/) || [])[1] : null; if (btn) btn.click();
  return { sheet: true, firstHead, gid, pending: JSON.parse(JSON.stringify(CL.c1.pendingGuides || [])) }; });
check('Visit · Guides + Courses opens the send sheet with guides', gs.sheet && !!gs.gid, JSON.stringify(gs).slice(0, 200));
check('Visit · sending a guide puts it on their list', gs.gid && JSON.stringify(gs.pending).includes(gs.gid), JSON.stringify(gs.pending).slice(0, 200));
check('Visit · Guides + Courses lands on the guides, not the forms', /scrolled to/.test(gs.firstHead), gs.firstHead);
const cs = await page.evaluate(() => { const cid = window.__crsId; if (!cid) return { btn: false }; openClientFormSender('c1', 'guides'); _cfsSendCourse(cid, 'c1');
  const blob = _assembleClientData('c1'); return { btn: true, cid, pending: JSON.parse(JSON.stringify(CL.c1.pendingCourses || [])), inBlob: JSON.stringify(blob.pendingCourses || blob).includes(cid) }; });
check('Visit · Guides + Courses can send a course', cs.btn && JSON.stringify(cs.pending).includes(cs.cid), JSON.stringify(cs).slice(0, 200));
check('the sent course is in what their app receives', cs.inBlob, '');

// ---------- HOMECARE: routine + products, then RELOAD ----------
await go('homecare');
const hc = await page.evaluate(() => {
  const pane = document.querySelector('.ctab[data-tab="homecare"]');
  const inp = pane.querySelector('input[id^="routine-add-"]'); const ok = { routineInput: !!inp };
  if (inp) { ['Cleanser AM', 'Serum PM', 'SPF daily'].forEach(v => { const i = document.querySelector('.ctab[data-tab="homecare"] input[id^="routine-add-"]'); i.value = v; _addRoutineFromProfile('c1', 'profile'); _setClientTab('c1', 'homecare'); }); }
  moveHomecareItem('c1', 2, -1, 'profile');           // SPF up one -> Cleanser, SPF, Serum
  removeHomecareTag('c1', 0, 'profile');              // drop Cleanser -> SPF, Serum
  addSummaryProd('c1', 'p1'); addSummaryProd('c1', 'p2'); addSummaryProd('c1', 'p3');
  recMove('c1', 2, -1);                                // p1,p3,p2
  removeSummaryProd('c1', 'p1');                       // p3,p2
  toggleProdInOffice('c1', 'p2');
  ok.routine = getClientHomecare('c1').slice(); ok.recs = (clientRecs.c1 || []).slice(); ok.inOffice = !!affiliateLinks.find(a => a.id === 'p2').inOffice;
  return ok; });
check('Homecare · routine add / move / remove', JSON.stringify(hc.routine) === '["SPF daily","Serum PM"]', JSON.stringify(hc));
check('Homecare · products add / move / remove', JSON.stringify(hc.recs) === '["p3","p2"]', JSON.stringify(hc.recs));
// custom product
const cp = await page.evaluate(() => { nav('client', 'c1'); _setClientTab('c1', 'homecare');
  const f = document.getElementById('cust-prod-form'); if (!f) return { form: false };
  document.getElementById('cust-name').value = 'Office Peptide Serum'; createCustomProd('c1');
  const a = affiliateLinks.find(x => x.name === 'Office Peptide Serum'); return { form: true, made: !!a, id: a && a.id, onRecs: a ? (clientRecs.c1 || []).includes(a.id) : false }; });
check('Homecare · create a custom product, added to their picks', cp.form && cp.made && cp.onRecs, JSON.stringify(cp));
const buy = await page.evaluate(() => { nav('client', 'c1'); _setClientTab('c1', 'homecare'); const b = Array.from(document.querySelectorAll('.ctab[data-tab="homecare"] [onclick]')).find(e => /openBuyOptionsP/.test(e.getAttribute('onclick'))); if (!b) return 'no buy button'; b.click(); return document.getElementById('buy-sheet') ? 'sheet' : 'nothing'; });
check('Homecare · Buy opens the buy options', buy === 'sheet', buy);
await page.waitForTimeout(1500);   // let pushes flush
await boot();
const after = await page.evaluate(() => ({ routine: getClientHomecare('c1').slice(), recs: (clientRecs.c1 || []).slice(), inOffice: !!(affiliateLinks.find(a => a.id === 'p2') || {}).inOffice,
  custom: !!affiliateLinks.find(x => x.name === 'Office Peptide Serum'), catalogLS: (localStorage.getItem('sc_affiliate_links') || ''), recsLS: localStorage.getItem('sc_client_recs') || '' }));
check('RELOAD · routine kept', JSON.stringify(after.routine) === '["SPF daily","Serum PM"]', JSON.stringify(after.routine));
check('RELOAD · product picks and their order kept', after.recs[0] === 'p3' && after.recs[1] === 'p2' && after.recs.length === 3, JSON.stringify(after.recs));
check('RELOAD · in-office flag kept', after.inOffice === true);
check('RELOAD · custom product kept', after.custom);
check('sc_client_recs itself is current (not only the workspace copy)', /"c1":\["p3","p2"/.test(after.recsLS), after.recsLS.slice(0, 160));
check('in-office reaches the saved catalog (the shop the client sees)', /"id":"p2"[^}]*"inOffice":true/.test(after.catalogLS), (after.catalogLS.match(/\{[^}]*"id":"p2"[^}]*\}/) || [''])[0].slice(0, 200));
check('custom product is in the saved catalog', /Office Peptide Serum/.test(after.catalogLS));

// ---------- FILE ----------
await go('file'); errs = [];
const vt = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.ctab[data-tab="file"] button')).find(e => /^\s*Edit\s*$/.test(e.textContent)); if (!b) return { btn: false }; b.click();
  const m = document.getElementById('vitals-modal'); if (!m) return { btn: true, modal: false };
  const inp = m.querySelector('input'); const key = inp.id.replace('vital-', ''); inp.value = 'EDITED-' + key; saveVitals('c1'); return { btn: true, modal: true, key }; });
check('File · Edit opens client details', vt.modal, JSON.stringify(vt));
await boot();
const vtAfter = await page.evaluate(k => CL.c1 && CL.c1[k], vt.key);
check('RELOAD · edited client detail kept', vtAfter === 'EDITED-' + vt.key, String(vtAfter));
await go('file'); errs = [];
const fl = await tapText('file', /forms on file|No forms|Forms on file/); await page.waitForTimeout(200);
check('File · forms on file opens', fl !== 'MISSING' && !errs.length, fl);
await go('file'); errs = [];
const inv = await tapText('file', /Invite to the app/); await page.waitForTimeout(800);
const invSheet = await page.evaluate(() => !!document.getElementById('invite-sheet') && /Copy message/.test(document.getElementById('invite-sheet').innerText));
check('File · Invite to the app opens the invite sheet', inv !== 'MISSING' && invSheet && !errs.length, inv + ' ' + errs.join(';'));
// ---------- JOURNEY / PHOTOS ----------
await go('journey'); errs = [];
const jr = await page.evaluate(() => { const pane = document.querySelector('.ctab[data-tab="journey"]'); const b = pane.querySelector('[onclick]'); if (!b) return { txt: pane.innerText.slice(0, 120) }; b.click(); return { tt: document.getElementById('tt').textContent }; });
check('Journey · its button works (or explains there is nothing yet)', (jr.tt && !errs.length) || (jr.txt && jr.txt.length > 5), JSON.stringify(jr));
await go('photos'); errs = [];
const ph = await tapText('photos', /Open their photos/); check('Photos · Open their photos', ph !== 'MISSING' && !errs.length, ph);

// ---------- a brand-new client: the empty-state buttons ----------
await page.evaluate(() => { CL.c9 = { name: 'New Person', _token: 'TOKC9' }; try { saveClients(); } catch (e) {} });
errs = [];
const nw = await page.evaluate(async () => {
  const r = {};
  nav('client', 'c9'); _setClientTab('c9', 'homecare');
  _hcPickerSheet('c9', 'profile'); const sh = document.getElementById('hc-picker');
  const pick = sh && sh.querySelector('button[onclick*="_hcPickProduct"]'); r.pickerRows = sh ? sh.querySelectorAll('button[onclick*="_hcPickProduct"]').length : -1;
  const before = getClientHomecare('c9').length; if (pick) pick.click();
  const step2 = document.getElementById('hc-picker'); r.step2 = step2 ? step2.innerText.split('\n')[0] : '';
  const save = step2 && Array.from(step2.querySelectorAll('button')).find(b => /add|save/i.test(b.textContent) && !/cancel/i.test(b.textContent)); r.saveBtn = save ? save.textContent.trim() : ''; if (save) save.click();
  r.routineGrew = getClientHomecare('c9').length > before; r.routine = getClientHomecare('c9').slice();
  document.querySelectorAll('#hc-picker').forEach(x => x.remove());
  nav('client', 'c9'); _setClientTab('c9', 'homecare'); startProductDictate('c9'); await new Promise(z => setTimeout(z, 3200)); r.dictate = !!document.getElementById('voice-overlay'); try { _voiceClose(); } catch (e) {}
  nav('client', 'c9'); _setClientTab('c9', 'file');
  const sendSel = Array.from(document.querySelectorAll('.ctab[data-tab="file"] button')).find(b => /Send selected/.test(b.textContent));
  r.sendSel = !!sendSel; if (sendSel) sendSel.click(); await new Promise(z => setTimeout(z, 300));
  r.pending = (CL.c9.pendingForms || []).map(p => p.formId); document.querySelectorAll('#share-sheet,[id$="-sheet"]').forEach(x => x.remove());
  nav('client', 'c9'); _setClientTab('c9', 'file');
  const sign = Array.from(document.querySelectorAll('.ctab[data-tab="file"] button')).find(b => /Sign here/.test(b.textContent)); if (sign) sign.click();
  r.sign = document.getElementById('tt').textContent + ' | ' + document.getElementById('S').innerText.slice(0, 60);
  return r; });
check('New client · Add one of your products adds it to their routine', nw.pickerRows > 0 && nw.routineGrew, JSON.stringify(nw).slice(0, 200));
check('New client · Dictate product recommendations opens the recorder', nw.dictate);
check('New client · Send selected forms puts them on their pending list', nw.sendSel && nw.pending.length >= 1, JSON.stringify(nw.pending));
check('New client · Sign here opens signing on this device', /sign|intake|consent/i.test(nw.sign), nw.sign);
check('New client buttons: no page errors', errs.length === 0, errs.join(' | '));
check('no page errors overall', errs.length === 0, errs.join(' | '));
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 240) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
