import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const SIZE = process.env.SIZE || 'mac';
const OUT = process.argv[2] || `/tmp/claude-0/sweep-wide-${SIZE}.json`;
const SHOTS = process.env.SHOTS || '';
const VP = { mac: { width: 1440, height: 900 }, ipad: { width: 1032, height: 1376 }, imac: { width: 2048, height: 1152 }, phone: { width: 390, height: 844 } }[SIZE];
const TOUCH = SIZE === 'ipad' || SIZE === 'phone';
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = p === '/slickchart' ? path.join(ROOT, 'slickchart.html') : path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : /\.woff2$/.test(f) ? 'font/woff2' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const SKIP = /logout|_doLogout|signOut|sign out|deleteAccount|delete-account|_doDelete|wipe|purge|_resetApp|resetAll|clearAll|_doDeleteClientData|location\.reload|_reloadApp|window\.location|location\.href=|_hardRefresh|_forceUpdate|removeDemoClients|_setShotMode\(true|cancelSub|_sqDisconnect|disconnect/i;
const engine = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const browser = await engine.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const ctx = await browser.newContext({ viewport: VP, hasTouch: TOUCH, isMobile: false, serviceWorkers: 'block' });
const page = await ctx.newPage();
let errs = [], cerrs = [];
page.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|net::|favicon|fonts\.g|tabler|ERR_|404|status of|Load failed|access control|due to access/i.test(t)) cerrs.push(t.slice(0, 200)); } });
page.on('dialog', d => d.dismiss().catch(() => {}));
page.on('popup', p => p.close().catch(() => {}));
// A brand-new esthetician, Square connected, clients imported from Square, setup finished.
const now = Date.now();
const clients = {}; for (let i = 0; i < 40; i++) { const id = 'sq_CUST' + i; clients[id] = { id, name: ['Ava', 'Bea', 'Cora', 'Dana', 'Eve'][i % 5] + ' ' + ['Lane', 'Moss', 'Reed', 'Stone'][i % 4] + ' ' + i, email: 'c' + i + '@ex.com', phone: '555010' + String(i).padStart(4, '0'), sqId: 'CUST' + i, source: 'square', created: now - 86400000 * 3, _ts: now - 86400000 * 3, visits: [], notes: [] }; }
const seed = { sc_clients: JSON.stringify(clients), sc_onboarded: '1', sc_professions: JSON.stringify(['esthetician']), sc_wsname: JSON.stringify('Frances Skin Studio'),
  sc_bizinfo: JSON.stringify({ name: 'Frances Skin Studio', phone: '5550100000', email: 'studio@ex.com' }) };
await page.addInitScript(([app, native]) => { try { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_login_email', 'new@spa.com'); localStorage.setItem('sc_hide_sample', '1'); } catch (e) {}
  if (native) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
  window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return null; };
  try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {}
  try { navigator.clipboard.writeText = () => Promise.resolve(); } catch (e) {} }, ['provider', SIZE === 'ipad' || SIZE === 'phone']);

const SQ = process.env.SQ || 'expired';
const sqBody = { none: [200, { oauth: false, connected: false }], expired: [200, { oauth: false, expired: true }], err500: [200, { oauth: true, connected: true }], nosquare: [200, { oauth: false }], offline: [200, { oauth: true, connected: true }] }[SQ];
await page.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: seed }) });
  if (u.includes('/api/square/connection') || u.includes('/api/square/token-status')) return r.fulfill({ status: sqBody[0], contentType: 'application/json', body: JSON.stringify(sqBody[1]) });
  if (u.includes('/api/square/')) {
    if (SQ === 'offline') return r.abort('internetdisconnected');
    if (SQ === 'err500') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Square is having trouble right now."}' });
    if (SQ === 'expired') return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Square sign-in expired","code":"expired"}' });
    return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Connect Square first.","code":"nosquare"}' });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"appointments":[],"items":[]}' }); });
await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await page.addInitScript(() => { window.__said = []; const iv = setInterval(() => { if (typeof proToast === 'function' && !window.__tw) { window.__tw = 1; const o = proToast; window.proToast = function (m) { window.__said.push('TOAST ' + String(m)); return o.apply(this, arguments); }; clearInterval(iv); } }, 20); });
await page.goto('http://localhost:' + PORT + '/slickchart.html', { waitUntil: 'load' }); await page.waitForTimeout(8000);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
errs.length = 0;
// Removing ONE session photo (Ashley chose "Yes, with Undo, kept on server", 2026-11-19).
const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
await page.evaluate((px) => {
  window.__up = []; window.__upOk = true;
  window._uploadGuideFileToServer = async (id, pl) => { __up.push(id); return __upOk ? { ok: true } : { ok: false }; };
  window.confirmModal = (o, a) => { window.__confirm = o; a(); };
  CL.p2 = { id: 'p2', name: 'Pia Remove' };
  capturedPhotos.p2 = [
    { url: px + '#1', ts: Date.now() - 3000, phase: 'before', angle: 'Front', pid: 'ph_a1' },
    { url: px + '#2', ts: Date.now() - 2000, phase: 'after', angle: 'Front', pid: 'ph_b2' },
    { url: px + '#3', ts: Date.now() - 1000, phase: 'reference', angle: '', pid: 'ph_c3' }];
  _markPhotoBackedUp('ph_a1'); _markPhotoBackedUp('ph_b2'); _markPhotoBackedUp('ph_c3'); persistCapturedPhotos();
  nav('photos', 'p2');
}, px);
await page.waitForTimeout(800);
const trash = await page.locator('button[aria-label="Remove photo"]').count();
ok(trash === 3, 'every photo on the Photos screen has a Remove button: ' + trash);
// Remove the after photo from the Photos screen
await page.evaluate(() => { const i = capturedPhotos.p2.findIndex(p => p.pid === 'ph_b2'); _removeSessionPhoto('p2', i); });
await page.waitForTimeout(500);
let st = await page.evaluate(() => ({ pids: (capturedPhotos.p2 || []).map(p => p.pid), rm: JSON.parse(localStorage.getItem('sc_photo_removed') || '{}'), toast: !!document.getElementById('photorm-toast'), idx: JSON.parse(localStorage.getItem('sc_photo_index') || '{}').p2 || [], body: __confirm && __confirm.body }));
ok(!st.pids.includes('ph_b2') && st.pids.length === 2, 'the photo comes off the file: ' + JSON.stringify(st.pids));
ok(st.rm.ph_b2 > 0, 'removal recorded for other devices');
ok(st.idx.some(m => m.pid === 'ph_b2'), 'the photo index keeps the entry (bytes stay on her account)');
ok(st.toast && /Undo puts it back/.test(st.body || ''), 'confirm says a copy stays and Undo shows');
ok(__up_count(await page.evaluate(() => __up.length)) === 0, 'already on the account: nothing re-uploaded');
function __up_count(n) { return n; }
// Undo
await page.evaluate(() => _undoRemovePhoto()); await page.waitForTimeout(400);
st = await page.evaluate(() => ({ pids: (capturedPhotos.p2 || []).map(p => p.pid), rm: JSON.parse(localStorage.getItem('sc_photo_removed') || '{}') }));
ok(st.pids.join() === 'ph_a1,ph_b2,ph_c3' && st.rm.ph_b2 < 0, 'Undo puts it back in the same place: ' + JSON.stringify(st));
// Remove again then a later save of an old copy (another device / IDB) does not bring it back
await page.evaluate(() => { _removeSessionPhoto('p2', 1); });
await page.waitForTimeout(300);
st = await page.evaluate((px) => { _absorbPhotoCopy({ p2: [{ url: px + '#2', ts: 1, phase: 'after', pid: 'ph_b2' }] }, true); capturedPhotos.p2.push({ url: px + '#2', ts: 1, phase: 'after', pid: 'ph_b2' }); persistCapturedPhotos(); return (capturedPhotos.p2 || []).map(p => p.pid); }, px);
ok(!st.includes('ph_b2'), 'an old copy of a removed photo does not come back: ' + JSON.stringify(st));
// Another device's removal reaches this device through sync (merge of the delete record)
const merged = await page.evaluate(() => JSON.parse(_mergeTombstone('sc_photo_removed', JSON.stringify({ ph_a1: Date.now() }), localStorage.getItem('sc_photo_removed'))));
ok(merged.ph_a1 > 0 && merged.ph_b2 > 0, 'delete records from both devices union');
const undoWins = await page.evaluate(() => { const t = Date.now(); return JSON.parse(_mergeTombstone('sc_photo_removed', JSON.stringify({ ph_x: t - 5000 }), JSON.stringify({ ph_x: -t })))['ph_x'] < 0; });
ok(undoWins, 'a later Undo on one device beats the earlier removal');
await page.evaluate(() => { localStorage.setItem('sc_photo_removed', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('sc_photo_removed')), { ph_a1: Date.now() }))); _loadRemovedPhotos(); });
await page.waitForTimeout(300);
st = await page.evaluate(() => (capturedPhotos.p2 || []).map(p => p.pid));
ok(st.join() === 'ph_c3', 'a removal from another device comes off this one after a sync: ' + JSON.stringify(st));
// A photo not yet on the account: uploaded first; offline/failed upload keeps it
await page.evaluate((px) => { capturedPhotos.p3 = [{ url: px + '#9', ts: Date.now(), phase: 'before', pid: 'ph_new9' }]; CL.p3 = { id: 'p3', name: 'New Photo' }; window.__said.length = 0; __upOk = false; _removeSessionPhoto('p3', 0); }, px);
await page.waitForTimeout(500);
st = await page.evaluate(() => ({ pids: (capturedPhotos.p3 || []).map(p => p.pid), said: __said.join('|'), rm: JSON.parse(localStorage.getItem('sc_photo_removed') || '{}').ph_new9 }));
ok(st.pids.length === 1 && !st.rm && /photo was kept/.test(st.said), 'upload fails: photo kept, says so: ' + JSON.stringify(st));
await page.evaluate(() => { __upOk = true; __up.length = 0; _removeSessionPhoto('p3', 0); });
await page.waitForTimeout(500);
st = await page.evaluate(() => ({ pids: (capturedPhotos.p3 || []).map(p => p.pid), up: __up.slice(), rm: JSON.parse(localStorage.getItem('sc_photo_removed') || '{}').ph_new9 }));
ok(st.pids.length === 0 && st.up.includes('ph_new9') && st.rm > 0, 'not yet on the account: saved there first, then removed: ' + JSON.stringify(st));
// Restore from cloud skips a removed photo
const fetched = await page.evaluate(async () => { window.__got = []; const o = _getGuideFile; window._getGuideFile = async (id) => { __got.push(id); return { data: 'data:image/png;base64,AAAA' }; }; await _restorePhotosFromCloud(); window._getGuideFile = o; return __got; });
ok(!fetched.includes('ph_b2') && !fetched.includes('ph_a1') && !fetched.includes('ph_new9'), 'restore from the account skips removed photos: ' + JSON.stringify(fetched));
// Viewer has Remove; room thumbnails have Remove
await page.evaluate(() => { _viewClientPhoto('p2', 0); });
ok(await page.locator('#photo-viewer button:has-text("Remove")').count() === 1, 'the full-size viewer has Remove');
await page.evaluate(() => _closePhotoViewer());
const roomHtml = await page.evaluate(() => { capturedPhotos.p2.push({ url: 'data:image/png;base64,AAAA', ts: Date.now(), phase: 'before', pid: 'ph_r1' }); return _roomPhotosHTML('p2'); });
ok(/room-rm/.test(roomHtml), 'the visit room before/after thumbnails have Remove');
ok(errs.length === 0, 'no page errors ' + errs.join('|'));
await browser.close(); srv.close();
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
