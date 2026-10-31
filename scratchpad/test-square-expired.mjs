// "Reconnect Square" notice (Ashley 2026-10-31, after tif… went two months with an expired Square
// sign-in that the app showed as "not connected"). Every flow: expired, working, never connected,
// signed out, an error answer, reconnecting, the bell note once and never back after she clears it,
// the Square screen, and phone width.
import { mk, launch, page, boot } from './sweep3-session-lib.mjs';
const T = mk();
const { b, ctx } = await launch();
let conn = { connected: false, oauth: false, oauthConfigured: true, env: 'production', merchantId: null, expired: true, expiredAt: '2026-08-29T10:00:00.000Z' };
const handler = async (r, u) => { if (u.includes('/api/square/connection')) { await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conn) }); return true; } };
const P = await page(ctx, { sc_clients: JSON.stringify({ c1: { id: 'c1', name: 'Kay Client', _token: 'TOK_c1' } }) }, { handler });
await boot(P.p); await P.p.waitForTimeout(1500);
const r = await P.p.evaluate(async () => {
  const o = {}; const W = ms => new Promise(r => setTimeout(r, ms));
  window._sqConnect = () => { window.__connected = (window.__connected || 0) + 1; };
  await _sqCheckExpiry(true); nav('home'); await W(200);
  const bn = document.getElementById('sq-exp-banner');
  o.banner = !!bn && /Square needs you to sign in again/.test(bn.textContent) && /Nothing in SlickChart is lost/.test(bn.textContent);
  o.fits = bn && bn.getBoundingClientRect().right <= window.innerWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1;
  bn.querySelector('button').click(); o.tapped = window.__connected;
  o.notes = notifFeed.filter(n => /^sq-expired-/.test(n.id)).length;
  await _sqCheckExpiry(true); o.notesAgain = notifFeed.filter(n => /^sq-expired-/.test(n.id)).length;
  o.throttled = (await (async () => { const t = _sqExpChecked; await _sqCheckExpiry(); return _sqExpChecked === t; })());
  nav('square-guide'); await W(600);
  o.guide = /Sign-in expired/.test((document.getElementById('sq-status') || {}).textContent || '') || /sign-in expired/i.test(((document.getElementById('sqg-oauth-body') || {}).textContent) || '');
  o.guideBtn = [...document.querySelectorAll('#sqg-oauth-body button')].some(x => /Reconnect Square/.test(x.textContent));
  return o;
});
T.check('expired: Home says so in plain words with one Reconnect button', r.banner, JSON.stringify(r));
T.check('the notice fits on a phone', r.fits);
T.check('Reconnect opens the Square sign-in', r.tapped === 1, String(r.tapped));
T.check('the bell gets one note, and checking again does not add a second', r.notes === 1 && r.notesAgain === 1, JSON.stringify(r));
T.check('it checks at most every 30 minutes unless asked', r.throttled);
T.check('the Square screen says the sign-in expired, with Reconnect', r.guide && r.guideBtn, JSON.stringify(r));
// she reconnects: back in the app, the notice and the bell note go
conn = { connected: true, oauth: true, oauthConfigured: true, env: 'production', merchantId: 'M1', expired: false, expiredAt: null };
const r2 = await P.p.evaluate(async () => { nav('home'); await new Promise(r => setTimeout(r, 200));
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(r => setTimeout(r, 600));
  return { banner: !!document.getElementById('sq-exp-banner'), notes: notifFeed.filter(n => /^sq-expired-/.test(n.id)).length }; });
T.check('after reconnecting, coming back to the app clears the notice and the bell note', !r2.banner && r2.notes === 0, JSON.stringify(r2));
// never connected, an error, cleared note
const r3 = await P.p.evaluate(async (C) => {
  const o = {};
  window.__setConn = null;
  return o; }, null);
conn = { connected: false, oauth: false, oauthConfigured: true, env: 'production', merchantId: null, expired: false, expiredAt: null };
const r4 = await P.p.evaluate(async () => { await _sqCheckExpiry(true); nav('home'); await new Promise(r => setTimeout(r, 200)); return !!document.getElementById('sq-exp-banner'); });
T.check('a provider who never connected Square sees nothing', !r4);
conn = { error: 'Something went wrong. Please try again.' };
const r5 = await P.p.evaluate(async () => { await _sqCheckExpiry(true); nav('home'); await new Promise(r => setTimeout(r, 200)); return !!document.getElementById('sq-exp-banner'); });
T.check('an error answer shows nothing', !r5);
conn = { connected: false, oauth: false, oauthConfigured: true, expired: true, expiredAt: '2026-08-29T10:00:00.000Z' };
const r6 = await P.p.evaluate(async () => { await _sqCheckExpiry(true); const n = notifFeed.find(x => /^sq-expired-/.test(x.id));
  _notifCleared.add(n.id); notifFeed.splice(notifFeed.indexOf(n), 1); await _sqCheckExpiry(true);
  return { back: notifFeed.some(x => /^sq-expired-/.test(x.id)), banner: !!document.getElementById('sq-exp-banner') }; });
T.check('a bell note she cleared never comes back (the Home notice stays until she reconnects)', !r6.back && r6.banner, JSON.stringify(r6));
// signed out
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 } });
const Q = await ctx2.newPage(); const qerr = []; Q.on('pageerror', e => qerr.push(e.message));
await Q.route('**/api/**', r => r.request().url().includes('/api/square/connection') ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conn) }) : r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }));
await Q.goto('http://localhost:8899/slickchart.html'); await Q.waitForTimeout(4000);
const r7 = await Q.evaluate(async () => { try { await _sqCheckExpiry(true); } catch (e) {} return !!document.getElementById('sq-exp-banner'); });
T.check('signed out: nothing shows', !r7);
T.check('no page errors', !P.errs.length && !qerr.length, [...P.errs, ...qerr].join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
