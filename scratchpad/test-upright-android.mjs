// Before/after photos stay upright on the Android app (Ashley 2026-11-20: "taking picture of client
// while laying down ... no matter what just make sure the picture stays upright after taking it").
// The Android camera plugin with correctOrientation turns the photo by the camera's guess and then
// RESETS the tag to 1, so a "landscape the other way" (3) or "upside down" (8) guess came out upside
// down. The phone app now asks for the camera's own pixels + tag and turns them itself.
// Fixture: upright/noexif.jpg = raw sensor frame (landscape, scene top = RED left edge).
// Run: (cd slickchart-vercel && python3 -m http.server 8899) & node scratchpad/test-upright-android.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
import { mk, BASE } from './sweep3-session-lib.mjs';
const D = new URL('./', import.meta.url).pathname+'upright/';
const RAW = 'data:image/jpeg;base64,' + fs.readFileSync(D + 'noexif.jpg').toString('base64');
const BAKED = 'data:image/jpeg;base64,' + fs.readFileSync(D + 'baked-portrait.jpg').toString('base64');
const T = mk();
const b = await (process.env.SC_ENGINE === 'webkit' ? pw.webkit.launch() : pw.chromium.launch());
async function open(vw, vh, platform) {
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(({ platform }) => {
    localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1');
    window.__calls = [];
    // Headless has no motion sensor; a phone does. Same shape as the real event.
    if (typeof window.DeviceMotionEvent === 'undefined') window.DeviceMotionEvent = class extends Event { constructor(t, i) { super(t); this.accelerationIncludingGravity = (i || {}).accelerationIncludingGravity || null; } };
    // Behaves like @capacitor/camera 8 on Android: correctOrientation turns by the tag and resets it to 1.
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform, Plugins: { Camera: { getPhoto: async o => {
      window.__calls.push(o); const n = window.__next || {};
      if (o.correctOrientation && n.corrected) return { dataUrl: n.corrected, exif: { Orientation: '1' } };
      return { dataUrl: n.raw, exif: { Orientation: String(n.tag || '') } }; } } } };
  }, { platform });
  const server = { sc_hide_sample: '1', sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' } }) };
  await p.route('**/api/**', async r => { const u = r.request().url(), m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: server }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.goto(BASE + '/slickchart.html'); await p.waitForTimeout(6000);
  await p.evaluate(() => nav('room', 'c1'));
  await p.waitForTimeout(500);
  return { p, errs, ctx };
}
const look = (p, i) => p.evaluate(async i => { const ph = capturedPhotos.c1[i]; if (!ph) return null; const img = new Image(); img.src = ph.url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const red = (X, Y) => { const d = x.getImageData(X, Y, 1, 1).data; return d[0] > 180 && d[1] < 110; };
  const side = red(c.width >> 1, 4) ? 'top' : red(4, c.height >> 1) ? 'left' : red(c.width - 4, c.height >> 1) ? 'right' : red(c.width >> 1, c.height - 4) ? 'bottom' : '?';
  return { w: c.width, h: c.height, side }; }, i);
// grav: the phone's gravity sensor while the camera hands the photo back ([x,y,z], Android signs).
async function shoot(p, phase, next, grav) {
  await p.evaluate(n => { window.__next = n; }, next);
  if (grav) await p.evaluate(g => { window.__gi = setInterval(() => { try { window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: g[0], y: g[1], z: g[2] } })); } catch (e) {} }, 40); }, grav);
  await p.locator('#room-photos button', { hasText: phase === 'before' ? /Take BEFORE|Before ✓/ : /Take AFTER|After ✓/ }).click();
  await p.waitForTimeout(1500);
  await p.evaluate(() => clearInterval(window.__gi));
}
const FLAT = [0.4, -0.6, 9.7], UP = [0.2, 9.6, 1.5], SIDE = [9.5, 0.3, 1.8];

// ── Android phone ── (the Android app is Chromium's WebView, so in WebKit only the iPhone part runs)
const WK = process.env.SC_ENGINE === 'webkit';
if (!WK) {
const A = await open(390, 844, 'android');
const cases = [[1, 'camera guessed landscape', FLAT], [3, 'camera guessed landscape the other way', FLAT], [6, 'camera guessed upright', UP],
  [8, 'camera guessed upside down', FLAT], [0, 'no tag at all', null], [1, 'phone held on its side', SIDE]];
for (let i = 0; i < cases.length; i++) {
  await shoot(A.p, i % 2 ? 'after' : 'before', { raw: RAW, tag: cases[i][0] }, cases[i][2]);
  const r = await look(A.p, i);
  T.check(`Android phone, ${cases[i][1]}: comes out upright portrait`, r && r.h > r.w && r.side === 'top', JSON.stringify(r));
}
const opts = await A.p.evaluate(() => window.__calls);
T.check('Android phone asks the camera for its own pixels (no plugin turn)', opts.length === cases.length && opts.every(o => o.correctOrientation === false && o.source === 'CAMERA' && o.width === 1600), JSON.stringify(opts[0]));
await shoot(A.p, 'before', { raw: BAKED, tag: 1 }, FLAT);
{ const r = await look(A.p, cases.length); T.check('a camera app that already turned its pixels is left alone', r && r.h > r.w && r.side === 'top', JSON.stringify(r)); }
const log = await A.p.evaluate(() => JSON.parse(localStorage.getItem('scnat_log') || '[]').filter(e => e.e === 'photo-upright').map(e => e.d));
T.check('each capture notes what it did in the launch log (no photo, no client)', log.length === cases.length + 1 && /^raw 400x300 o1 flat/.test(log[0]) && /rot$/.test(log[0]), JSON.stringify(log.slice(0, 3)));
T.check('no page errors (phone)', A.errs.length === 0, A.errs.join(' | '));
await A.ctx.close();

// ── Android tablet: the plugin's own turn is kept, as before ──
const B = await open(820, 1180, 'android');
await shoot(B.p, 'before', { raw: RAW, tag: 6, corrected: BAKED });
const bo = await B.p.evaluate(() => window.__calls[0]);
{ const r = await look(B.p, 0); T.check('Android tablet keeps the plugin turn and stays upright', bo && bo.correctOrientation === true && r && r.h > r.w && r.side === 'top', JSON.stringify({ r, c: bo && bo.correctOrientation })); }
await B.ctx.close();
}

// ── iPhone app: unchanged (plugin turn kept) ──
const C = await open(390, 844, 'ios');
await shoot(C.p, 'before', { raw: RAW, tag: 6, corrected: BAKED });
const co = await C.p.evaluate(() => window.__calls[0]);
{ const r = await look(C.p, 0); T.check('iPhone app still uses the plugin turn and stays upright', co && co.correctOrientation === true && r && r.h > r.w && r.side === 'top', JSON.stringify({ r, c: co && co.correctOrientation })); }
T.check('no page errors (iPhone)', C.errs.length === 0, C.errs.join(' | '));
await b.close();
process.exit(T.done() ? 1 : 0);
