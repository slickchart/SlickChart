// Keeping providers, in the real app (2026-11-16): the yearly card on Home, a pause in place of
// cancelling, Resume, the referral prompt at happy moments, the "go" deep link.
//   serve slickchart-vercel on PORT (default 8899), then
//   node scratchpad/test-growth-ui.mjs                  (Chromium)
//   ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=<webkit dir> node scratchpad/test-growth-ui.mjs   (Safari's engine)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899, BASE = 'http://localhost:' + PORT;
const ENGINE = process.env.ENGINE || 'chromium';
const b = await pw[ENGINE].launch();
const res = []; const check = (n, v, d) => res.push([n, !!v, d]);
const DAY = 86400000;
const PERIOD_END = Math.floor(Date.UTC(2026, 11, 3) / 1000);   // Dec 3 2026

const REF = { ok: true, enabled: true, code: 'JENNIE17', link: 'https://slickchart.app/r/JENNIE17', ready: true,
  friendReward: { pct: 100, months: 1 }, sharerMonths: 1, rewardOnPayment: true, maxPerYear: 12, showOnHome: true, hasBilling: true,
  joined: 0, paying: 0, earnedCents: 0, friends: [], promptOn: true, promptDays: 21 };
const SUB = { status: 'active', plan_amount: 1700, plan_interval: 'month', current_period_end: PERIOD_END, cancel_at_period_end: false };
const OFFER = { pauseOn: true, pauseMax: 3, pausesPerYear: 1, canPause: true, pauseWhy: '', paused: false, pausedUntil: null,
  yearlyFrom: 2, yearlyTo: 5, monthOfPaying: 3, showYearly: true, onTrial: false };

async function page(opts) {
  const ctx = await b.newContext({ serviceWorkers: 'block', viewport: opts.viewport || { width: 390, height: 844 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((pre) => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1');
    for (const k in pre) localStorage.setItem(k, pre[k]); }, opts.pre || {});
  const log = []; const state = { sub: opts.sub === undefined ? SUB : opts.sub, offer: opts.offer === undefined ? OFFER : opts.offer, ref: opts.ref || REF };
  await p.route('**/api/**', async r => {
    const u = r.request().url(), m = r.request().method(), body = r.request().postData() || '';
    const J = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('cloud-status')) return J({ enabled: true });
    if (u.includes('/api/billing-status')) { log.push({ u: 'billing', auth: r.request().headers()['authorization'] }); return J({ ok: true, subscription: state.sub, offer: state.offer }); }
    if (u.includes('/api/create-portal-session')) {
      const j = JSON.parse(body || '{}'); log.push({ u: 'portal', j, auth: r.request().headers()['authorization'] });
      if (j.intent === 'pause') {
        if (opts.pauseFails) return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'A pause is not available on this plan right now.' }) });
        const until = new Date(Date.UTC(2027, 1, 3)).toISOString();
        const starts = new Date(PERIOD_END * 1000).toISOString();
        state.offer = Object.assign({}, state.offer, { paused: true, pausedUntil: until, pauseStartsAt: starts, locked: false, canPause: false, showYearly: false });
        return J({ ok: true, pausedUntil: until, pauseStartsAt: starts, months: j.months });
      }
      if (j.intent === 'unpause') { const charged = !!state.offer.locked; state.offer = Object.assign({}, state.offer, { paused: false, pausedUntil: null, pauseStartsAt: null, locked: false }); return J({ ok: true, charged }); }
      return J({ error: 'stub portal' });   // no url: the app shows its "email support" toast, never navigates
    }
    if (u.endsWith('/api/referral') || u.includes('/api/referral?')) { log.push({ u: 'referral', m, body }); return m === 'POST' ? J({ ok: true }) : J(state.ref); }
    if (u.includes('/api/feedback')) return J({ ok: true });
    return J({ ok: true, data: {}, clients: [], events: [] });
  });
  await p.goto(BASE + '/slickchart.html' + (opts.query || '')); await p.waitForTimeout(9000);
  return { p, ctx, errs, log, state };
}
const txt = (p, id) => p.evaluate(id => (document.getElementById(id) || {}).innerText || '', id);

// ── 1. Home: the yearly card for a monthly payer in month 3, one card at a time, Not now ───────────────
{
  const { p, ctx, errs, log } = await page({});
  await p.evaluate(() => nav('home')); await p.waitForTimeout(3500);
  const g = await txt(p, 'grow-home-slot');
  check('Home shows the yearly card in month 3', /2 months free with yearly/.test(g) && /\$170 once a year/.test(g) && /instead of \$17 a month/.test(g), g);
  check('the referral card waits while the yearly card shows', !(await txt(p, 'ref-home-slot')));
  check('billing status was read with her own session', log.some(x => x.u === 'billing' && x.auth === 'Bearer TESTTOKEN'));
  check('no sideways scroll on Home', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.screenshot({ path: '/tmp/claude-0/grow-home-' + ENGINE + '.png' });
  await p.click('#grow-home-slot button.btnp'); await p.waitForTimeout(500);
  check('Switch to yearly opens the change-plan screen', log.some(x => x.u === 'portal' && x.j.intent === 'yearly'));
  await p.click('#grow-home-slot button.btng'); await p.waitForTimeout(400);
  check('Not now hides the yearly card', !(await txt(p, 'grow-home-slot')));
  check('and the referral card comes back in its place', /Give a month, get a month/.test(await txt(p, 'ref-home-slot')));
  await p.evaluate(() => nav('clients')); await p.waitForTimeout(300); await p.evaluate(() => nav('home')); await p.waitForTimeout(800);
  check('it stays hidden on the next Home', !(await txt(p, 'grow-home-slot')));
  check('Not now is a device-only key (never synced)', await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('slickyearlyskip') || 'null'); return o && o.m === 3; }));
  check('no page errors (1)', !errs.length, errs.join(' | '));
  await ctx.close();
}
// ── 1b. A month later Not now has run out, and outside months 2 to 5 nothing shows ───────────────────
{
  const { p, ctx, errs } = await page({ pre: { slickyearlyskip: JSON.stringify({ o: '', m: 3 }) }, offer: Object.assign({}, OFFER, { monthOfPaying: 4 }) });
  await p.evaluate(() => nav('home')); await p.waitForTimeout(3000);
  check('a Not now from month 3 does not hide month 4', /2 months free with yearly/.test(await txt(p, 'grow-home-slot')));
  await ctx.close();
  const r2 = await page({ offer: Object.assign({}, OFFER, { monthOfPaying: 7, showYearly: false }) });
  await r2.p.evaluate(() => nav('home')); await r2.p.waitForTimeout(3000);
  check('month 7: no yearly card, the referral card shows', !(await txt(r2.p, 'grow-home-slot')) && /Give a month/.test(await txt(r2.p, 'ref-home-slot')));
  const r3 = await page({ offer: undefined, sub: Object.assign({}, SUB, { plan_interval: 'year', plan_amount: 17000 }) });
  await r3.p.evaluate(() => { _growSet({ subscription: Object.assign({}, _growSub), offer: Object.assign({}, _growOffer, { showYearly: false }) }, Cloud.token); nav('home'); }); await r3.p.waitForTimeout(2000);
  check('a yearly payer never sees it', !(await txt(r3.p, 'grow-home-slot')));
  check('no page errors (1b)', !errs.length && !r2.errs.length && !r3.errs.length, [...errs, ...r2.errs, ...r3.errs].join(' | '));
  await r2.ctx.close(); await r3.ctx.close();
}
// ── 2. Cancel offers a pause; pause 2 months; the screen shows Paused; Resume ──────────────────────
{
  const { p, ctx, errs, log } = await page({});
  await p.evaluate(() => nav('subscription-billing')); await p.waitForTimeout(1500);
  let t = await txt(p, 'billing-body');
  check('billing shows Active and the yearly switch', /Active/.test(t) && /Switch to yearly/.test(t), t.slice(0, 300));
  await p.click('text=Cancel subscription'); await p.waitForTimeout(400);
  const sheet = await txt(p, 'grow-cancel');
  check('Cancel opens the pause offer first', /Need a break instead\?/.test(sheet) && /Pause for 1 month/.test(sheet) && /Pause for 3 months/.test(sheet) && !/Pause for 4/.test(sheet), sheet);
  check('each pause says when billing starts again', /billing again January 3, 2027/.test(sheet) && /billing again February 3, 2027/.test(sheet) && /billing again March 3, 2027/.test(sheet), sheet);
  check('Cancel anyway is right there', /Cancel anyway/.test(sheet));
  check('the sheet says it is locked while paused, not free', /locked while paused/.test(sheet) && /until December 3, 2026/.test(sheet) && !/keep using/i.test(sheet), sheet);
  check('no Stripe call yet', !log.some(x => x.u === 'portal'));
  await p.screenshot({ path: '/tmp/claude-0/grow-cancel-' + ENGINE + '.png' });
  await p.click('#grow-pause-2'); await p.waitForTimeout(1500);
  const call = log.find(x => x.u === 'portal' && x.j.intent === 'pause');
  check('Pause for 2 months asks the server with her session, months only', call && call.j.months === 2 && call.auth === 'Bearer TESTTOKEN' && Object.keys(call.j).sort().join() === 'intent,months', JSON.stringify(call));
  check('the sheet closes', !(await p.$('#grow-cancel')));
  t = await txt(p, 'billing-body');
  check('billing now says Paused, when it locks and when it starts again', /Paused/.test(t) && /Billing starts again/.test(t) && /February 3, 2027/.test(t) && /until December 3, 2026/.test(t) && /locked while paused/.test(t) && /Cancel the pause/.test(t), t.slice(0, 700));
  check('not locked yet: she is still in the time she paid for', !(await p.$('#grow-locked')));
  check('no yearly switch while paused', !/Switch to yearly/.test(t));
  await p.screenshot({ path: '/tmp/claude-0/grow-paused-' + ENGINE + '.png', fullPage: true });
  await p.click('text=Cancel the pause'); await p.waitForTimeout(1500);
  check('Cancel the pause asks the server to unpause', log.some(x => x.u === 'portal' && x.j.intent === 'unpause'));
  t = await txt(p, 'billing-body');
  check('and the screen is Active again', /Active/.test(t) && !/Paused/.test(t), t.slice(0, 300));
  // Cancel anyway goes to the real cancel screen
  await p.click('text=Cancel subscription'); await p.waitForTimeout(300);
  await p.click('text=Cancel anyway'); await p.waitForTimeout(800);
  check('Cancel anyway goes to Stripe’s cancel screen', log.some(x => x.u === 'portal' && x.j.intent === 'cancel'));
  check('no page errors (2)', !errs.length, errs.join(' | '));
  await ctx.close();
}
// ── 2b. A refused pause says why and lets her try again; no pause available = straight to cancel ─────
{
  const { p, ctx, errs, log } = await page({ pauseFails: true });
  await p.evaluate(() => nav('subscription-billing')); await p.waitForTimeout(1500);
  await p.click('text=Cancel subscription'); await p.waitForTimeout(300);
  await p.click('#grow-pause-1'); await p.waitForTimeout(1200);
  check('a refused pause shows the reason in the sheet', /not available on this plan/.test(await txt(p, 'grow-cancel-msg')));
  check('and the buttons work again', await p.evaluate(() => !document.getElementById('grow-pause-1').disabled));
  await ctx.close();
  const r = await page({ offer: Object.assign({}, OFFER, { canPause: false, pauseWhy: 'used this year' }), sub: Object.assign({}, SUB, { plan_interval: 'year', plan_amount: 17000 }) });
  await r.p.evaluate(() => nav('subscription-billing')); await r.p.waitForTimeout(1500);
  await r.p.click('text=Cancel subscription'); await r.p.waitForTimeout(800);
  check('no pause and yearly already: Cancel goes straight to cancel', !(await r.p.$('#grow-cancel')) && r.log.some(x => x.u === 'portal' && x.j.intent === 'cancel'));
  await r.ctx.close();
  const r2 = await page({ offer: Object.assign({}, OFFER, { canPause: false, pauseWhy: 'used this year' }) });
  await r2.p.evaluate(() => nav('subscription-billing')); await r2.p.waitForTimeout(1500);
  await r2.p.click('text=Cancel subscription'); await r2.p.waitForTimeout(400);
  const sh = await txt(r2.p, 'grow-cancel');
  check('pause used this year: the sheet offers yearly only', /Before you go/.test(sh) && /Switch to yearly/.test(sh) && !/Pause for/.test(sh), sh);
  // an older server with no offer field at all: cancel works exactly as before
  const r3 = await page({ offer: null });
  await r3.p.evaluate(() => nav('subscription-billing')); await r3.p.waitForTimeout(1500);
  await r3.p.click('text=Cancel subscription'); await r3.p.waitForTimeout(800);
  check('older server (no offer): Cancel is one step, as before', !(await r3.p.$('#grow-cancel')) && r3.log.some(x => x.u === 'portal' && x.j.intent === 'cancel'));
  check('no page errors (2b)', !errs.length && !r.errs.length && !r2.errs.length && !r3.errs.length, [...errs, ...r.errs, ...r2.errs, ...r3.errs].join(' | '));
  await r2.ctx.close(); await r3.ctx.close();
}
// ── 3. Native app: no yearly card on Home ───────────────────────────────────────────────────────────
{
  const { p, ctx, errs } = await page({});
  await p.evaluate(() => { window._isNativeApp = () => true; _growSet({ subscription: _growSub, offer: _growOffer }, Cloud.token); nav('home'); }); await p.waitForTimeout(1500);
  check('native app: no yearly card', !(await txt(p, 'grow-home-slot')));
  check('no page errors (3)', !errs.length, errs.join(' | '));
  await ctx.close();
}
// ── 4. Another account signs in on the same page: never shows the first account's offer ────────────
{
  const { p, ctx } = await page({});
  await p.evaluate(() => { Cloud.token = 'OTHERTOKEN'; nav('home'); }); await p.waitForTimeout(600);
  check('another account never sees the first account’s offer', !(await txt(p, 'grow-home-slot')) && await p.evaluate(() => _growOfferNow() === null));
  await ctx.close();
}
// ── 4b. Paused months have begun: the whole app is locked; Resume charges today and opens it ─────────
{
  const LOCKED = Object.assign({}, OFFER, { paused: true, locked: true, canPause: false, showYearly: false,
    pausedUntil: new Date(Date.now() + 30 * DAY).toISOString(), pauseStartsAt: new Date(Date.now() - 2 * DAY).toISOString() });
  const { p, ctx, errs, log } = await page({ offer: LOCKED });
  const t = await txt(p, 'grow-locked');
  check('locked: "SlickChart is paused" covers the app', /SlickChart is paused/.test(t) && /clients, notes and photos are all safe/.test(t) && /Resume now · \$17 today/.test(t) && /charged today/.test(t), t);
  check('the lock covers the whole screen', await p.evaluate(() => { const r = document.getElementById('grow-locked').getBoundingClientRect(); return r.top <= 0 && r.height >= window.innerHeight - 1; }));
  check('nothing behind it can be tapped', await p.evaluate(() => { const e = document.elementFromPoint(200, 120); return !!(e && e.closest('#grow-locked')); }));
  await p.evaluate(() => nav('clients')); await p.waitForTimeout(400);
  check('navigating does not get round it', !!(await p.$('#grow-locked')));
  await p.screenshot({ path: '/tmp/claude-0/grow-locked-' + ENGINE + '.png' });
  await p.click('#grow-resume'); await p.waitForTimeout(1500);
  check('Resume now asks the server to unpause (charged today)', log.some(x => x.u === 'portal' && x.j.intent === 'unpause'));
  check('and the app opens again', !(await p.$('#grow-locked')));
  check('no page errors (4b)', !errs.length, errs.join(' | '));
  await ctx.close();
  // A refused resume says why ON the lock screen (toasts sit under it)
  const r0 = await page({ offer: LOCKED });
  await r0.p.route('**/api/create-portal-session', r => r.fulfill({ status: 409, contentType: 'application/json', body: '{"ok":false,"error":"Could not resume it. Try again, or email support@slickchart.app."}' }));
  await r0.p.click('#grow-resume'); await r0.p.waitForTimeout(1200);
  check('a refused resume says why on the lock screen', /Could not resume it/.test(await txt(r0.p, 'grow-locked-msg')) && !!(await r0.p.$('#grow-locked')));
  await r0.ctx.close();
  // Native app: locked, but no payment button
  const r1 = await page({ offer: LOCKED });
  await r1.p.evaluate(() => { document.getElementById('grow-locked').remove(); window._isNativeApp = () => true; _growApplyLock(); }); await r1.p.waitForTimeout(300);
  const nt = await txt(r1.p, 'grow-locked');
  check('native app: locked, no price or pay button', /SlickChart is paused/.test(nt) && /slickchart\.app/.test(nt) && !/\$/.test(nt) && !(await r1.p.$('#grow-resume')), nt);
  await r1.ctx.close();
  // The lock date passes while the app is open: it locks when she comes back to it
  const soon = Object.assign({}, LOCKED, { locked: false, pauseStartsAt: new Date(Date.now() + 12000).toISOString() });
  const r2 = await page({ offer: soon });
  check('before the lock date: app open', !(await r2.p.$('#grow-locked')));
  await r2.p.waitForTimeout(4000);
  await r2.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await r2.p.waitForTimeout(300);
  check('after it, coming back to the app locks it', !!(await r2.p.$('#grow-locked')));
  await r2.ctx.close();
  // A different account on this page never inherits the lock
  const r3 = await page({ offer: LOCKED });
  await r3.p.evaluate(() => { Cloud.token = 'OTHERTOKEN'; _growApplyLock(); }); await r3.p.waitForTimeout(200);
  check('another account signing in is not locked by the first one’s pause', !(await r3.p.$('#grow-locked')));
  await r3.ctx.close();
}
// ── 5. Referral prompt at a happy moment ─────────────────────────────────────────────────────────────
{
  const { p, ctx, errs, log } = await page({ offer: Object.assign({}, OFFER, { showYearly: false }) });
  await p.evaluate(() => nav('home')); await p.waitForTimeout(1500);
  // A 5 on the pulse
  await p.evaluate(() => { _openPulse(); _pulsePickRating(5); }); await p.waitForTimeout(200);
  await p.evaluate(() => _sendPulse()); await p.waitForTimeout(3500);
  const n = await txt(p, 'ref-nudge');
  check('a 5 on the pulse brings up the referral prompt', /Know someone who would love this\?/.test(n) && /So glad SlickChart is helping/.test(n) && /JENNIE17/.test(n), n);
  check('it is not counted as a share just for showing', !log.some(x => x.u === 'referral' && x.m === 'POST'));
  await p.screenshot({ path: '/tmp/claude-0/grow-nudge-' + ENGINE + '.png' });
  await p.evaluate(() => { try { delete navigator.share; } catch (e) {} window._copyToClipboard = (t) => { window.__copied = t; }; });
  await p.click('#ref-nudge button.btnp'); await p.waitForTimeout(600);
  check('Share from the prompt shares her code and counts once', await p.evaluate(() => /JENNIE17/.test(window.__copied || '')) && log.filter(x => x.u === 'referral' && x.m === 'POST').length === 1);
  check('the prompt closes', !(await p.$('#ref-nudge')));
  // Not again for promptDays
  await p.evaluate(() => _refMoment('charts')); await p.waitForTimeout(500);
  check('it does not come back the same day', !(await p.$('#ref-nudge')));
  check('the "last asked" stamp is device-only', await p.evaluate(() => !!localStorage.getItem('slickrefnudge') && !Object.keys(localStorage).some(k => /^sc_refnudge/.test(k))));
  // 22 days later it may ask again
  await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('slickrefnudge')); o.at = Date.now() - 22 * 86400000; localStorage.setItem('slickrefnudge', JSON.stringify(o)); _refMoment('charts'); }); await p.waitForTimeout(400);
  check('after her 21 days it can ask again', /busy charting/.test(await txt(p, 'ref-nudge')));
  await p.evaluate(() => _refNudgeClose());
  // Gates: low rating, treatment room, another sheet open
  await p.evaluate(() => { localStorage.removeItem('slickrefnudge'); _openPulse(); _pulsePickRating(3); }); await p.evaluate(() => _sendPulse()); await p.waitForTimeout(3500);
  check('a 3 on the pulse does not ask', !(await p.$('#ref-nudge')));
  await p.evaluate(() => { const d = document.createElement('div'); d.id = 'beta-fb'; document.body.appendChild(d); _refMoment('charts'); }); await p.waitForTimeout(300);
  check('never on top of another sheet', !(await p.$('#ref-nudge')));
  await p.evaluate(() => { document.getElementById('beta-fb').remove(); _navCur = { screen: 'room' }; _refMoment('charts'); }); await p.waitForTimeout(300);
  check('never in the treatment room', !(await p.$('#ref-nudge')));
  check('no page errors (5)', !errs.length, errs.join(' | '));
  await ctx.close();
}
{
  // promptOn false (trial, not yet referral-ready, or she switched it off)
  const { p, ctx } = await page({ ref: Object.assign({}, REF, { promptOn: false }), offer: Object.assign({}, OFFER, { showYearly: false }) });
  await p.evaluate(() => _refMoment('pulse')); await p.waitForTimeout(600);
  check('prompt switched off or not ready: never asks', !(await p.$('#ref-nudge')));
  // older server: no promptOn field
  const r = await page({ ref: Object.assign({}, REF, { promptOn: undefined, promptDays: undefined }) });
  await r.p.evaluate(() => _refMoment('pulse')); await r.p.waitForTimeout(600);
  check('older server (no promptOn): never asks', !(await r.p.$('#ref-nudge')));
  await ctx.close(); await r.ctx.close();
}
// ── 6. Refer screen line, and the go deep link from the email ──────────────────────────────────────
{
  const { p, ctx, errs } = await page({ query: '?n=go&i=refer' });
  await p.waitForTimeout(1500);
  const t = await p.evaluate(() => document.getElementById('S').innerText);
  check('the email link ?n=go&i=refer opens Refer a friend', /Your code/.test(t) && /JENNIE17/.test(t), t.slice(0, 200));
  check('Refer shows "12 friends who stay = a free year"', /Refer 12 friends who stay, and SlickChart is free for a whole year/.test(t));
  check('no page errors (6)', !errs.length, errs.join(' | '));
  await ctx.close();
  const r = await page({ query: '?n=go&i=admin-recover' });
  check('a go link to anything off the list does nothing', await r.p.evaluate(() => !_navCur || _navCur.screen !== 'admin-recover'));
  await r.ctx.close();
  const r2 = await page({ ref: Object.assign({}, REF, { maxPerYear: 6 }), query: '?n=go&i=refer' }); await r2.p.waitForTimeout(1200);
  check('the free-year line hides when her cap is under 12', !/free for a whole year/.test(await r2.p.evaluate(() => document.getElementById('S').innerText)));
  await r2.ctx.close();
}

await b.close();
let fail = 0; for (const [n, ok, d] of res) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok || d === undefined ? '' : '  -- ' + String(d).slice(0, 400))); if (!ok) fail++; }
console.log(`\n${ENGINE}: ${res.length - fail}/${res.length} passed`);
process.exit(fail ? 1 : 0);
