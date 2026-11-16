// test-paper-forms: Lisa (2026-11-16) wants her old signed PAPER intake forms scanned into each
// client's file. Device 1 adds a 2-page paper form (a photo + a PDF), it backs up under HER token,
// shows on Forms & documents (not in Photos, not to the client), opens, and is removed. Device 2 gets
// it from the account, then sees the removal.
//   node scratchpad/test-paper-forms.mjs   (needs the :8899 server; ENGINE=webkit for Safari)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const PORT = process.env.PORT || 8899;
const ENGINE = process.env.ENGINE || 'chromium';
const tok = u => Buffer.from(JSON.stringify({ u, sid: 's_' + u })).toString('base64url') + '.sig';
const T = tok('prov_L');
const PNG = fs.readFileSync(new URL('./sweep3-test-photo.png', import.meta.url));
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const results = []; const check = (n, p, d) => results.push({ n, p: !!p, d: d || '' });
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const files = {}; const store = { sc_clients: JSON.stringify({ c1: { id: 'c1', name: 'Rosa Lane', email: 'r@example.com' } }), sc_hide_sample: '1', sc_onboarded: '1' };
const uploads = [];
async function device(width) {
  const ctx = await b.newContext({ viewport: { width, height: 860 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route('**/api/**', async r => {
    const u = r.request().url(); const m = r.request().method(); const auth = r.request().headers()['authorization'] || '';
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: store }) });
    if (u.includes('/api/guide-file') && m === 'GET' && u.includes('list=')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"photos":[],"files":[]}' });
    if (u.includes('/api/guide-file') && m === 'GET') { const id = new URL(u).searchParams.get('id'); const f = files[id]; return r.fulfill({ status: f ? 200 : 404, contentType: 'application/json', body: JSON.stringify(f ? { file: f } : { error: 'nf' }) }); }
    if (u.includes('/api/guide-file') && m === 'PUT') {
      const bd = JSON.parse(r.request().postData() || '{}');
      if (bd.part) { const f = files[bd.id] || (files[bd.id] = { id: bd.id, name: bd.name, type: bd.type, data: '' }); if (bd.part.index === 0) f.data = ''; f.data += bd.part.data; }
      else files[bd.id] = { id: bd.id, name: bd.name, type: bd.type, data: bd.data };
      uploads.push({ id: bd.id, asL: auth.includes(T), type: bd.type });
    }
    if (u.includes('/api/store') && m !== 'GET') { try { const bd = JSON.parse(r.request().postData() || '{}'); const d = bd.items || bd.data || {}; Object.keys(d || {}).forEach(k => { if (/^sc_/.test(k) && typeof d[k] === 'string') store[k] = d[k]; }); } catch (e) {} }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' });
  });
  await p.addInitScript(([T]) => { if (!sessionStorage.getItem('__s')) { sessionStorage.setItem('__s', '1'); localStorage.setItem('sc_token', T); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); } }, [T]);
  await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(9000);
  return { ctx, p, errs };
}
const txt = async (p) => p.evaluate(() => document.getElementById('S') ? document.getElementById('S').innerText : document.body.innerText);

// ── Device 1: her phone ──
const d1 = await device(390); const p = d1.p;
await p.evaluate(() => nav('client', 'c1')); await p.waitForTimeout(500);
await p.evaluate(() => _setClientTab('c1', 'file')); await p.waitForTimeout(300);
check('Their file still says 0 forms before', /0 forms on file/.test(await txt(p)));
await p.evaluate(() => nav('client-forms', 'c1')); await p.waitForTimeout(500);
check('Forms & documents has "Add a paper form"', await p.locator('button:has-text("Add a paper form")').count() === 1);
await p.click('button:has-text("Add a paper form")'); await p.waitForTimeout(300);
check('add sheet opens', await p.locator('#paper-sheet').count() === 1);
check('Save is disabled with no pages', await p.locator('#paper-save').isDisabled());
await p.fill('#paper-title', 'Intake form');
await p.fill('#paper-signed', '2021-03-03');
await p.setInputFiles('#paper-files', [{ name: 'page1.png', mimeType: 'image/png', buffer: PNG }, { name: 'scan.pdf', mimeType: 'application/pdf', buffer: PDF }]);
await p.waitForTimeout(1500);
const nPages = await p.evaluate(() => _paperDraft && _paperDraft.pages.length);
check('two pages picked (photo + PDF)', nPages === 2, 'pages=' + nPages);
check('typed name survives the redraw', (await p.inputValue('#paper-title')) === 'Intake form');
await p.click('#paper-save'); await p.waitForTimeout(3500);
const mem = await p.evaluate(() => (capturedPhotos.c1 || []).filter(x => x.phase === 'paperform').map(x => ({ pid: x.pid || _photoPid(x), angle: x.angle, source: x.source, fileType: x.fileType, head: String(x.url).slice(0, 30) })));
check('saved as 2 paper pages on THIS client', mem.length === 2 && mem.every(m => m.angle === 'Intake form' && /^paper\|pf[^|]+\|2021-03-03$/.test(m.source)), JSON.stringify(mem));
check('PDF kept as a PDF', mem.some(m => m.fileType === 'pdf' && m.head.startsWith('data:application/pdf')));
check('image downscaled to jpeg', mem.some(m => m.fileType === '' && m.head.startsWith('data:image/jpeg')));
const t1 = await txt(p);
check('Forms & documents lists it with date + pages', /PAPER FORMS|Paper forms/i.test(t1) && t1.includes('Intake form') && t1.includes('Signed Mar 3, 2021') && t1.includes('2 pages'), t1.slice(0, 500));
check('header count includes it', /1 on file for Rosa/.test(t1));
await p.waitForTimeout(2500);
const pids = mem.map(m => m.pid);
check('both pages uploaded under her own token', pids.every(id => uploads.some(u => u.id === id && u.asL)), JSON.stringify(uploads));
check('pdf uploaded as application/pdf', uploads.some(u => u.type === 'application/pdf'));
const idx = JSON.parse(store.sc_photo_index || '{}');
check('photo index on the account carries both pages with the paper source', (idx.c1 || []).filter(m => m.phase === 'paperform' && /^paper\|/.test(m.source)).length === 2, store.sc_photo_index);
await p.evaluate(() => nav('client', 'c1')); await p.waitForTimeout(400); await p.evaluate(() => _setClientTab('c1', 'file'));
check('Their file now says 1 form on file', /1 form on file/.test(await txt(p)));
await p.evaluate(() => nav('photos', 'c1')); await p.waitForTimeout(600);
check('NOT shown in Photos', await p.evaluate(() => !document.querySelector('#S img[src^="data:application/pdf"]') && !(document.getElementById('S').innerHTML.includes('Intake form'))));
const cd = await p.evaluate(() => { try { return JSON.stringify(_assembleClientData('c1')); } catch (e) { return 'ERR ' + e.message; } });
check('NOT in what the client app receives', !/paperform|paper\|pf/.test(cd), cd.slice(0, 200));
// open it
await p.evaluate(() => nav('client-forms', 'c1')); await p.waitForTimeout(400);
await p.click('button:has-text("Intake form")'); await p.waitForTimeout(400);
check('viewer shows the page image and an Open the PDF button', await p.locator('#paper-view img').count() === 1 && await p.locator('#paper-view button:has-text("Open the PDF")').count() === 1);
await p.click('#paper-view img'); await p.waitForTimeout(300);
check('tapping a page opens it full size', await p.locator('#photo-viewer').count() === 1);
await p.evaluate(() => _closePhotoViewer());

// ── Device 2: her iPad gets it from the account ──
const d2 = await device(1024);
await d2.p.waitForTimeout(3000);
await d2.p.evaluate(() => nav('client-forms', 'c1')); await d2.p.waitForTimeout(600);
const t2 = await txt(d2.p);
check('second device shows the paper form from the account', t2.includes('Intake form') && t2.includes('2 pages') && t2.includes('Signed Mar 3, 2021'), t2.slice(0, 400));

// ── Remove on device 1 ──
await p.click('#paper-view button:has-text("Remove from their file")'); await p.waitForTimeout(400);
const cm = await p.locator('button:has-text("Remove")').last(); await cm.click(); await p.waitForTimeout(1200);
const t3 = await txt(p);
check('removed: gone from the list', !t3.includes('Intake form') && /0 on file/.test(t3), t3.slice(0, 300));
check('removal recorded on the account', JSON.parse(store.sc_paper_removed || '[]').length === 1, store.sc_paper_removed);
// device 2 relaunches with the account's removal record (its own memory still holds the pages)
await d2.p.reload(); await d2.p.waitForTimeout(9000);
await d2.p.evaluate(() => nav('client-forms', 'c1')); await d2.p.waitForTimeout(600);
check('second device: removal holds after relaunch', !(await txt(d2.p)).includes('Intake form'));
// The index on the account keeps the page ids (the shrink guard holds back a smaller photo index on
// purpose); the removal record is what every device reads. A brand-new device must not fetch them.
const d3 = await device(390); await d3.p.waitForTimeout(3000);
const d3pages = await d3.p.evaluate(() => (capturedPhotos.c1 || []).filter(x => x.phase === 'paperform').length);
await d3.p.evaluate(() => nav('client-forms', 'c1')); await d3.p.waitForTimeout(500);
check('a new device neither downloads nor shows the removed form', d3pages === 0 && !(await txt(d3.p)).includes('Intake form'), 'pages=' + d3pages);
check('no page errors', !d1.errs.length && !d2.errs.length && !d3.errs.length, d1.errs.concat(d2.errs, d3.errs).join(' | '));

let bad = 0; for (const x of results) { if (!x.p) bad++; console.log((x.p ? 'PASS ' : 'FAIL ') + x.n + (x.d && !x.p ? '  — ' + String(x.d).slice(0, 400) : '')); }
console.log(`\n[${ENGINE}] ${results.length - bad}/${results.length} passed`);
await b.close(); process.exit(bad ? 1 : 0);
