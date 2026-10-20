// Ashley 2026-10-20 (afternoon): "today every before picture i am taking disappears from the 'start
// session' area before I am done." Phone (touch) context, real room buttons, the account mocked
// like the live server (store keys plain-overwrite, guide-file uploads remembered and served back).
// Run: (cd slickchart-vercel && python3 -m http.server 8899) & node scratchpad/test-before-persists.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { mk, BASE } from './sweep3-session-lib.mjs';
const D = '/home/user/SlickChart/scratchpad/upright/';
const T = mk();
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const server = { sc_hide_sample: '1', sc_clients: JSON.stringify({ cdez: { name: 'Dez Schrader', treatment: 'Facial', _token: 'TOKD' }, c1: { name: 'Sina Prom', treatment: 'Facial', _token: 'TOKC1' }, c2: { name: 'Janice Albers', treatment: 'Peel', _token: 'TOKC2' } }) };
const files = {}, names = {}; let pushedPhotoStore = 0;
// MODE=serverstale: the account itself holds an sc_captured_photos (Dez's 3), pushed there by a device
// whose IndexedDB failed. An ordinary phone with working storage then pulls it.
if (process.env.MODE === 'serverstale') { const px = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  server.sc_captured_photos = JSON.stringify({ cdez: [1, 2, 3].map(i => ({ url: px, ts: Date.now() - 7 * 864e5 + i, phase: 'before', angle: 'Front', pid: 'ph_dez' + i })) }); }
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const logs = []; p.on('console', m => { const t = m.text(); if (/photo|captured|room/i.test(t)) logs.push(t.slice(0, 200)); });
// MODE=brokenidb: her Android (build 2026-10-20c) reported "phone storage (IndexedDB): NOT WORKING",
// and the account's photo index all day held one client (Dez Schrader, 3 photos) from every device
// that opened. So: no IndexedDB, a full localStorage that refuses the photo copy, and an older
// fallback copy of the photo store (Dez's 3) still sitting in localStorage from a day it fitted.
if (process.env.MODE === 'brokenidb') await p.addInitScript(() => {
  try { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); } catch (e) {}
  const px = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sc_captured_photos', JSON.stringify({ cdez: [1, 2, 3].map(i => ({ url: px, ts: Date.now() - 7 * 864e5 + i, phase: 'before', angle: 'Front', pid: 'ph_dez' + i })) })); }
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (k === 'sc_captured_photos' || String(k).indexOf('sc_room_draft_') === 0) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
});
await p.addInitScript(() => { if (!localStorage.getItem('sc_token')) { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); } });
await p.route('**/api/**', async r => { const u = r.request().url(), m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/guide-file')) {
    if (m === 'GET' && new URL(u).searchParams.get('list') === 'photos') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, photos: Object.keys(files).filter(k => k.startsWith('ph_')).map(id => ({ id, name: names[id] || '', type: 'image/jpeg', size: files[id].length, updated_at: new Date().toISOString() })) }) });
    if (m === 'GET') { const id = new URL(u).searchParams.get('id'); return r.fulfill({ status: files[id] ? 200 : 404, contentType: 'application/json', body: JSON.stringify(files[id] ? { file: { id, name: names[id] || '', data: files[id] } } : { error: 'nf' }) }); }
    try { const j = JSON.parse(r.request().postData() || '{}'); if (j.data) { files[j.id] = j.data; names[j.id] = j.name || ''; } } catch (e) {}
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: server }) });
  if (u.includes('/api/store')) { try { const j = JSON.parse(r.request().postData() || '{}'); const it = j.items || (j.key ? { [j.key]: j.value } : {}); if (Object.prototype.hasOwnProperty.call(it, 'sc_captured_photos')) pushedPhotoStore++; Object.assign(server, it); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  if (u.includes('/api/clients') && m === 'POST') { let j = {}; try { j = JSON.parse(r.request().postData() || '{}'); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, clients: (j.clients || []).map(c => ({ id: c.id, token: 'TOK_' + c.id })) }) }); }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto(BASE + '/slickchart.html'); await p.waitForTimeout(6000);
const befores = () => p.evaluate(() => ({ c1: (capturedPhotos.c1||[]).map(x => (x.pid||'')+'/'+(x.source||'')+'/'+String(x.url).length).join(','), disk: (Cloud._origGet('sc_captured_photos')||'').length, mem2: !!(Cloud._mem&&Cloud._mem.sc_captured_photos), lsraw: (localStorage.getItem('sc_captured_photos')||'').length, idb: _idb.available(), keys: Object.keys(capturedPhotos), ls: !!localStorage.getItem('sc_captured_photos'), mem: (capturedPhotos.c1 || []).filter(x => x.phase === 'before').length, room: (document.getElementById('room-photos') || {}).innerText || '' }));
await p.evaluate(() => nav('room', 'c1'));
const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#room-photos button', { hasText: 'Take BEFORE' }).click()]);
await fc.setFiles(D + (process.argv[2] || 'o6.jpg')); await p.waitForTimeout(2000);
let s = await befores(); T.check('before captured and shown', s.mem === 1 && /Before ✓/.test(s.room), JSON.stringify(s));
// The appointment: she leaves the room, the app syncs, she comes back.
for (const [what, fn] of [['go home and back', async () => { await p.evaluate(() => nav('home')); await p.waitForTimeout(4000); await p.evaluate(() => nav('room', 'c1')); }],
  ['a sync pull from the account', async () => { await p.evaluate(async () => { try { await Cloud.pull(); } catch (e) {} try { _reloadAll && _reloadAll(); } catch (e) {} nav('room', 'c1'); }); await p.waitForTimeout(3000); }],
  ['wait out the backup', async () => { await p.waitForTimeout(12000); await p.evaluate(() => nav('room', 'c1')); }],
  ['app closed and reopened', async () => { await p.reload(); await p.waitForTimeout(8000); await p.evaluate(() => nav('room', 'c1')); await p.waitForTimeout(500); }]]) {
  await fn(); s = await befores(); T.check(`before still there after: ${what}`, s.mem === 1 && /Before ✓/.test(s.room), JSON.stringify(s));
}
T.check('the device photo store is never pushed to the account', pushedPhotoStore === 0, 'pushes: ' + pushedPhotoStore);
const myPid = Object.keys(names).find(k => !k.startsWith('ph_dez'));
T.check('the before reached the server labelled with its client and phase', !!myPid && /^scph\|c1\|before\|/.test(names[myPid]), JSON.stringify(names));
if (process.env.MODE === 'serverstale') T.check("the account's old copy only ADDS photos (Dez's 3 kept)", await p.evaluate(() => (capturedPhotos.cdez || []).length) === 3);
// The orphan case, as on her account: a new device whose index lost the photo entirely.
{ const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); const q = await c2.newPage();
  delete server.sc_photo_index;
  await q.addInitScript(() => { if (!localStorage.getItem('sc_token')) { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); } });
  await q.route('**/api/**', async r => { const u = r.request().url(), m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/guide-file') && new URL(u).searchParams.get('list') === 'photos') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, photos: Object.keys(files).filter(k => k.startsWith('ph_')).map(id => ({ id, name: names[id] || '', type: 'image/jpeg', size: files[id].length, updated_at: new Date().toISOString() })) }) });
    if (u.includes('/api/guide-file') && m === 'GET') { const id = new URL(u).searchParams.get('id'); return r.fulfill({ status: files[id] ? 200 : 404, contentType: 'application/json', body: JSON.stringify(files[id] ? { file: { id, name: names[id] || '', data: files[id] } } : { error: 'nf' }) }); }
    if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: server }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await q.goto(BASE + '/slickchart.html'); await q.waitForTimeout(6000);
  await q.evaluate(async () => { await _forcePhotoRecovery(); });
  const got = await q.evaluate(() => ({ c1: (capturedPhotos.c1 || []).filter(x => x.phase === 'before').length, un: (capturedPhotos.__recovered__ || []).length }));
  await q.evaluate(() => nav('room', 'c1')); const room = await q.evaluate(() => (document.getElementById('room-photos') || {}).innerText || '');
  T.check('Find & restore on a device that lost the index puts the before back on Sina, as a before', got.c1 === 1 && /Before ✓/.test(room), JSON.stringify(got));
  // Today's real case: the before went up BEFORE photos carried a label, so nothing says whose it is.
  // Recover lost photos offers it on the client whose appointment it was taken during, one tap.
  const pid0 = Object.keys(names).find(k => /^scph\|c1\|/.test(names[k])); names[pid0] = '';
  await q.evaluate(() => { delete capturedPhotos.c1; delete capturedPhotos.__recovered__; try { _photoBackedUp = null; } catch (e) {} });
  await q.evaluate(async (pid) => { const ts = Date.now(); const st = new Date(ts - 10 * 60000);
    manualAppts.push({ id: 'a1', client: 'Sina Prom', date: _calKey(st), time: _apptTimeStr(st), tx: 'Facial' });
    await _recoverUnindexedServerPhotos(); }, pid0);
  const un = await q.evaluate(() => (capturedPhotos.__recovered__ || []).length);
  await q.evaluate(() => { _openPhotoRecovery(); _pr_gallery('__recovered__'); });
  const sug = await q.locator('button.pr-sug').allInnerTexts();
  T.check('an unlabelled photo is offered on Sina, from her appointment', un >= 1 && sug.length === 1 && /Put them on Sina as 1 before/.test(sug[0]), JSON.stringify({ un, sug }));
  if (sug.length) await q.locator('button.pr-sug').first().click();
  await q.evaluate(() => { const o = document.getElementById('photo-recover'); if (o) o.remove(); nav('room', 'c1'); });
  const room2 = await q.evaluate(() => (document.getElementById('room-photos') || {}).innerText || '');
  T.check('one tap puts it back in her session as the before', /Before ✓/.test(room2), room2.slice(0, 120));
  // "for all of these I did the sessions already... sorted (and dated) into their files and clear this
  // part out": old unassigned photos go to the client whose visit they were taken at, in one tap.
  const sortRes = await q.evaluate(() => {
    const day = Date.now() - 30 * 864e5;
    sessionSummaries.c2 = [{ date: 'x', ts: day + 3600e3, treatment: 'Peel' }];
    sessionSummaries.c1 = (sessionSummaries.c1 || []).concat([{ date: 'y', ts: day - 20 * 864e5 }]);
    const px = 'data:image/png;base64,QUJD';
    capturedPhotos.__recovered__ = [
      { url: px + 'MQ', ts: day, pid: 'ph_j1' }, { url: px + 'Mg', ts: day + 50 * 60e3, pid: 'ph_j2' },   // Janice's visit: before, after
      { url: px + 'Mw', ts: day - 10 * 864e5, pid: 'ph_none' } ];                                          // no visit near it
    _openPhotoRecovery(); _pr_render();
    const btn = document.getElementById('pr-sortall-main'); const label = btn ? btn.textContent : '';
    if (btn) btn.click();
    const j = (capturedPhotos.c2 || []).map(p => p.pid + ':' + p.phase + ':' + p.ts);
    return { label, j, left: (capturedPhotos.__recovered__ || []).map(p => p.pid), txt: document.getElementById('photo-recover').innerText };
  });
  T.check('Sort puts old photos on the client whose visit they were taken at, before then after, dated', /Sort 2 unassigned/.test(sortRes.label) && sortRes.j.some(x => /^ph_j1:before:/.test(x)) && sortRes.j.some(x => /^ph_j2:after:/.test(x)) && JSON.stringify(sortRes.left) === '["ph_none"]', JSON.stringify(sortRes).slice(0, 400));
  T.check('clients with photos collapse to one line, nothing to clear by hand', /Photos are in \d+ client/.test(sortRes.txt) && !/Open session/.test(sortRes.txt), sortRes.txt.slice(0, 300));
  // Her screenshot: the "which client?" list is hundreds of rows, many "(no name)". It must search.
  await q.evaluate(() => { CL.cjunk = { name: '(no name)' }; capturedPhotos.__recovered__ = [{ url: 'data:image/png;base64,AA', ts: Date.now(), pid: 'ph_x' }]; _openPhotoRecovery(); _prSel = new Set(['ph_x']); _pr_reassign('__recovered__', 0); });
  const rows0 = await q.locator('#photo-recover .pr-cl').count();
  await q.fill('#pr-cl-search', 'janice');
  const vis = await q.locator('#photo-recover .pr-cl:visible').allInnerTexts();
  T.check('assign list: a search box, no "(no name)" rows, typing finds Janice', rows0 === 3 && vis.length === 1 && /Janice Albers/.test(vis[0]), JSON.stringify({ rows0, vis }));
  // Her screenshot: rows of the same cat photo. They show once (×3), and one tap clears them for good.
  const cat = 'data:image/png;base64,' + 'Q0FU'.repeat(20);
  ['ph_cat1', 'ph_cat2', 'ph_cat3'].forEach(id => { files[id] = cat; names[id] = ''; });
  await q.evaluate(() => { const o = document.getElementById('photo-recover'); if (o) o.remove(); delete capturedPhotos.__recovered__; });
  await q.evaluate(async () => { await _recoverUnindexedServerPhotos();
    // As on her account: an earlier build put the unassigned bucket into the synced index.
    const ix = JSON.parse(localStorage.getItem('sc_photo_index') || '{}'); ix.__recovered__ = ['ph_cat1', 'ph_cat2', 'ph_cat3', 'ph_old9'].map(pid => ({ pid, ts: 1 })); localStorage.setItem('sc_photo_index', JSON.stringify(ix));
    _openPhotoRecovery(); _prSel = new Set(); _pr_gallery('__recovered__'); });
  const badge = await q.locator('#photo-recover').innerText();
  await q.locator('#photo-recover img[src^="data:image/png;base64,Q0FU"]').locator('xpath=..').locator('button').click();
  await q.locator('#pr-remove').click();
  const after = await q.evaluate(async () => { const left = (capturedPhotos.__recovered__ || []).filter(p => /^ph_cat/.test(p.pid)).length; await _recoverUnindexedServerPhotos(); return { left, back: (capturedPhotos.__recovered__ || []).filter(p => /^ph_cat/.test(p.pid)).length }; });
  const listAfter = await q.evaluate(() => { _pr_render(); return document.getElementById('photo-recover').innerText; });
  T.check('after removing, the Unassigned count goes down (no stale index count)', !/Unassigned photos · [1-9]/.test(listAfter), listAfter.slice(0, 400));
  T.check('the same photo 3 times shows once as ×3; Remove clears all 3 and they stay cleared', /×3/.test(badge) && after.left === 0 && after.back === 0 && !!files.ph_cat1, JSON.stringify(after));
  await c2.close(); }
console.log('server keys:', Object.keys(server).join(','), 'files:', Object.keys(files).join(','));
T.check('no page errors', !errs.length, errs.join(' | '));
if (T.results.some(r => !r.pass)) console.log(logs.slice(-20).join('\n'));
await b.close(); process.exit(T.done() ? 1 : 0);
