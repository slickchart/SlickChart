// Session photos lock upright (Ashley 2026-10-20: "the photos often flip sideways ... lock upright but
// give an arrow to turn"). Fixtures in upright/: a landscape sensor frame whose scene-top is the RED
// left edge, tagged with each EXIF orientation the phone can guess (mkimg.py). Upright = red on top.
// Run: (cd slickchart-vercel && python3 -m http.server 8899) & node scratchpad/test-upright-photos.mjs
//      bash scratchpad/run-in-safari.sh scratchpad/test-upright-photos.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { mk, BASE } from './sweep3-session-lib.mjs';
const D = '/home/user/SlickChart/scratchpad/upright/';
const T = mk();
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function open(touch) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: touch, isMobile: false });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const uploads = [];
  await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  const server = { sc_hide_sample: '1', sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' } }) };
  await p.route('**/api/**', async r => { const u = r.request().url(), m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/guide-file') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); uploads.push({ id: j.id, data: j.data || (j.part && j.part.data) || '' }); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: server }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.goto(BASE + '/slickchart.html'); await p.waitForTimeout(6000);
  await p.evaluate(() => nav('room', 'c1'));
  return { p, errs, uploads, ctx };
}
// Where the red band ended up, and the shape, for the photo at index i.
const look = (p, i) => p.evaluate(async i => { const ph = capturedPhotos.c1[i]; const img = new Image(); img.src = ph.url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const red = (X, Y) => { const d = x.getImageData(X, Y, 1, 1).data; return d[0] > 180 && d[1] < 110; };
  const side = red(c.width >> 1, 4) ? 'top' : red(4, c.height >> 1) ? 'left' : red(c.width - 4, c.height >> 1) ? 'right' : red(c.width >> 1, c.height - 4) ? 'bottom' : '?';
  return { w: c.width, h: c.height, side, pid: ph.pid || '', reup: !!ph.reup }; }, i);
async function shoot(p, phase, file, library) {
  const btn = library ? p.locator('#room-photos button', { hasText: 'From library' }).first() : p.locator('#room-photos button', { hasText: phase === 'before' ? /Take BEFORE|Before ✓/ : /Take AFTER|After ✓/ });
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), btn.click()]);
  await fc.setFiles(D + file); await p.waitForTimeout(1500);
}

// ── Phone ──
const A = await open(true);
const cases = [['o1.jpg', 'tagged landscape (phone held flat)'], ['o3.jpg', 'tagged landscape the other way'], ['o6.jpg', 'tagged upright portrait'], ['o8.jpg', 'tagged upside down']];
for (let i = 0; i < cases.length; i++) { await shoot(A.p, i % 2 ? 'after' : 'before', cases[i][0]); const r = await look(A.p, i);
  T.check(`phone capture ${cases[i][1]} comes out upright portrait`, r.h > r.w && r.side === 'top', JSON.stringify(r)); }
await shoot(A.p, 'before', 'noexif.jpg'); { const r = await look(A.p, 4); T.check('phone capture with no tag, landscape, is turned to portrait', r.h > r.w, JSON.stringify(r)); }
await shoot(A.p, 'before', 'baked-portrait.jpg'); { const r = await look(A.p, 5); T.check('already-upright untagged portrait is left alone', r.h > r.w && r.side === 'top', JSON.stringify(r)); }
await shoot(A.p, 'before', 'o1.jpg', true); { const r = await look(A.p, 6); T.check('From library keeps a landscape photo landscape', r.w > r.h, JSON.stringify(r)); }

// The turn arrow in the session room
const nRot = await A.p.locator('#room-photos button.room-rot').count();
T.check('every room photo has a turn arrow', nRot === 7, 'arrows=' + nRot);
await A.p.waitForTimeout(2500);   // let the first backup land
const before = await look(A.p, 0);
const upsBefore = A.uploads.filter(u => u.id === before.pid).length;
T.check('the photo was backed up before turning', upsBefore >= 1 && !before.reup, JSON.stringify({ upsBefore, before }));
await A.p.locator('#room-photos button.room-rot').first().click(); await A.p.waitForTimeout(600);
const after = await look(A.p, 0);
T.check('tapping the arrow turns it a quarter clockwise', after.w === before.h && after.h === before.w && after.side === 'right', JSON.stringify(after));
T.check('the photo keeps its name (the client app finds it by that)', after.pid === before.pid);
T.check('the room still shows all photos after a turn', (await A.p.locator('#room-photos button.room-rot').count()) === 7);
await A.p.waitForTimeout(3000);
const ups = A.uploads.filter(u => u.id === before.pid);
const st = await A.p.evaluate(pid => { const ph = capturedPhotos.c1.find(x => x.pid === pid); const idx = JSON.parse(localStorage.getItem('sc_photo_index') || '{}'); const m = (idx.c1 || []).find(x => x.pid === pid) || {}; return { reup: !!ph.reup, url: ph.url, ets: ph.ets, mts: m._ts }; }, before.pid);
T.check('the turned photo is sent to the account again, same name, new bytes', ups.length === upsBefore + 1 && ups[ups.length - 1].data === st.url, 'uploads=' + ups.length);
T.check('after it lands, the flag clears and the index carries the turn time', !st.reup && st.mts === st.ets && st.ets > 0, JSON.stringify({ reup: st.reup, ets: st.ets, mts: st.mts }));

// Another device that already has this photo picks up the turned one.
const turned = st.url, pid = before.pid, ets = st.ets;
const B = await open(true);
const got = await B.p.evaluate(async ({ pid, ets, turned }) => {
  capturedPhotos.c1 = [{ url: 'data:image/jpeg;base64,OLD', ts: 1, phase: 'before', pid }];
  localStorage.setItem('sc_photo_index', JSON.stringify({ c1: [{ pid, ts: 1, phase: 'before', _ts: ets }] }));
  window._getGuideFile = async id => (id === pid ? { data: turned } : null);
  await _restorePhotosFromCloud();
  const first = capturedPhotos.c1[0].url === turned;
  capturedPhotos.c1[0].url = 'data:image/jpeg;base64,KEEP';   // same turn again: no second fetch
  await _restorePhotosFromCloud();
  return { first, again: capturedPhotos.c1[0].url, n: capturedPhotos.c1.length };
}, { pid, ets, turned });
T.check('another device swaps in the turned photo', got.first && got.n === 1, JSON.stringify(got));
T.check('and does not refetch it on every sync', got.again === 'data:image/jpeg;base64,KEEP');

// ── Computer (no touch): a "Take photo" there is a file pick, never turned ──
const C = await open(false);
await shoot(C.p, 'before', 'o1.jpg'); { const r = await look(C.p, 0); T.check('on a computer a landscape photo stays landscape', r.w > r.h, JSON.stringify(r)); }

T.check('no page errors', !A.errs.length && !B.errs.length && !C.errs.length, [...A.errs, ...B.errs, ...C.errs].join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
