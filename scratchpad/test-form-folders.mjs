// Jaimie, 2026-10-22: her own headings (Facials, Spray tanning...) with folders inside (New client
// paperwork, Returning clients), forms rearranged, shown in the Forms list AND the send sheet.
//   (cd slickchart-vercel && python3 -m http.server 8899) & node scratchpad/test-form-folders.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899; const ENGINE = process.env.ENGINE || 'chromium';
const results = []; const check = (n, p, d) => results.push({ n, pass: !!p, d: d || '' });
const kv = { sc_hide_sample: '1', sc_onboarded: '1', sc_clients: JSON.stringify({ c_b: { name: 'Bonnie Vale' } }) };
const launchOpts = ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' };
const b = await pw[ENGINE].launch(launchOpts);
const mk = async () => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...kv } }) });
    if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(kv, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce, null, { timeout: 30000 });
  await p.waitForTimeout(800);
  return { ctx, p };
};
const { ctx, p } = await mk();
const all = await p.evaluate(() => _ffAllForms().map(x => x.id));
const [f0, f1, f2, f3] = all;
// Build: heading "Spray tanning" > folder "New client paperwork" (f0,f1), heading "Facials" holds f2.
const answer = async (v) => { await p.waitForSelector('#_is-input'); await p.fill('#_is-input', v); await p.click('#_is-ok'); await p.waitForTimeout(150); };
await p.evaluate(() => nav('forms'));
await p.click('#ff-bar button');
check('Forms screen opens the folders screen', await p.evaluate(() => _navCur.screen === 'form-folders'), '');
await p.click('button:has-text("New heading")'); await answer('Spray tanning');
await p.click('button:has-text("New heading")'); await answer('Facials');
const tan = await p.evaluate(() => formFolders.find(f => f.name === 'Spray tanning').id);
const fac = await p.evaluate(() => formFolders.find(f => f.name === 'Facials').id);
await p.evaluate((id) => _ffAdd(id), tan); await answer('New client paperwork');
const ncp = await p.evaluate(() => formFolders.find(f => f.name === 'New client paperwork').id);
await p.evaluate(([id, a, b2]) => { _ffAddForms(id); }, [ncp]);
await p.evaluate(([a, b2]) => { [a, b2].forEach(fid => { const cb = [...document.querySelectorAll('#ff-forms-sheet input')].find(x => (x.getAttribute('onchange') || '').includes("'" + fid + "'")); cb.click(); }); }, [f0, f1]);
await p.click('#ff-forms-done');
await p.evaluate(([id, f]) => _ffPlace(f, id), [fac, f2]);
// Move f2 from Facials into the subfolder via the card's folder button later; first check order controls.
await p.evaluate(() => renderFormFolders());
await p.evaluate((id) => _ffMove(id, -1), fac);
const order = await p.evaluate(() => _ffKids('').map(f => f.name));
check('headings can be reordered', JSON.stringify(order) === '["Facials","Spray tanning"]', JSON.stringify(order));
await p.evaluate(([id, f]) => _ffFormMove(id, f, -1), [ncp, f1]);
check('forms inside a folder can be reordered', await p.evaluate((id) => JSON.stringify(formFolders.find(f => f.id === id).formIds), ncp) === JSON.stringify([f1, f0]), '');
await p.waitForTimeout(1200);
check('folders synced to the account', /New client paperwork/.test(kv.sc_form_folders || ''), (kv.sc_form_folders || '').slice(0, 120));
// Forms list
await p.evaluate(() => nav('forms'));
const L = await p.evaluate(([a, b2, c]) => {
  const secs = [...document.querySelectorAll('.form-section')].map(s => ({ h: (s.querySelector('h2') || {}).innerText, cards: s.querySelectorAll('.form-card').length, txt: s.innerText }));
  const count = id => [...document.querySelectorAll('.form-card')].filter(x => (x.getAttribute('data-search') || '').split(' ').includes(id.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim().split(' ')[0]) ).length;
  return { heads: secs.map(s => s.h), first: secs[0], second: secs[1] };
}, [f0, f1, f2]);
check('Forms list leads with her headings, in her order', /Facials/i.test(L.heads[0]) && /Spray tanning/i.test(L.heads[1]), JSON.stringify(L.heads.slice(0, 4)));
check('folder inside a heading shows with its forms', /New client paperwork/.test(L.second.txt) && L.second.cards === 2, JSON.stringify(L.second).slice(0, 200));
const dupes = await p.evaluate(() => { const c = {}; document.querySelectorAll('.form-card').forEach(x => { const id = x.getAttribute('data-fid'); c[id] = (c[id] || 0) + 1; }); return Object.entries(c).filter(e => e[1] > 1); });
check('a filed form is not listed twice', dupes.length === 0, JSON.stringify(dupes));
// Move f3 into Facials from its card
await p.evaluate((f) => _ffPickFolder(f), f3);
await p.evaluate((id) => { [...document.querySelectorAll('#ff-pick-sheet button')].find(x => x.innerText.trim() === 'Facials').click(); }, fac);
check('"Move to a folder" from a form card files it', await p.evaluate(([id, f]) => formFolders.find(x => x.id === id).formIds.includes(f), [fac, f3]), '');
// Send sheet
await p.evaluate(() => openClientFormSender('c_b'));
const T = await p.evaluate(() => document.getElementById('sendform-sheet').innerText);
const iF = T.indexOf('Facials'), iT = T.indexOf('Spray tanning'), iN = T.indexOf('New client paperwork'), iO = T.toLowerCase().indexOf('other forms');
check('send sheet shows her headings and folder, then Other forms', iF > 0 && iT > iF && iN > iT && iO > iN, JSON.stringify({ iF, iT, iN, iO }));
await p.fill('#cfs-q', 'zzzznomatch');
check('search still filters the send sheet', await p.evaluate(() => document.getElementById('cfs-noresults').style.display === ''), '');
await p.evaluate(() => document.getElementById('sendform-sheet').remove());
// Delete a heading: its folder goes, forms stay in the library and return to their usual place.
await p.evaluate((id) => _ffDelete(id), tan); await p.click('#_cf-ok'); await p.waitForTimeout(300);
const D = await p.evaluate(([f]) => ({ names: formFolders.map(x => x.name), stillThere: _ffAllForms().some(x => x.id === f), tomb: localStorage.getItem('sc_deleted_form_folders') || '' }), [f0]);
check('deleting a heading removes it and the folder inside, keeps the forms', JSON.stringify(D.names) === '["Facials"]' && D.stillThere && D.tomb.includes(tan) && D.tomb.includes(ncp), JSON.stringify(D));
await p.waitForTimeout(1200);
await ctx.close();
// A second device opens: it sees her folders, and the deleted ones stay deleted.
const d2 = await mk();
const D2 = await d2.p.evaluate(() => formFolders.map(x => x.name + ':' + (x.formIds || []).length));
check('her other device shows the same folders', JSON.stringify(D2) === '["Facials:2"]', JSON.stringify(D2));
await d2.ctx.close();
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS' : 'FAIL') + '  ' + x.n + (x.pass ? '' : '  — ' + x.d)); }
console.log(`\n${ENGINE}: ${results.length - bad}/${results.length} pass`); process.exit(bad ? 1 : 0);
