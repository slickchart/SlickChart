// Referral codes, every flow a person touches (2026-11-11):
//   provider: Home card -> Share (copy fallback) counts it -> Not now hides it; Settings -> Refer a friend
//   shows her code, link, totals and friends; paused program; load failure + Try again; a different
//   account signing in on the same page never sees the previous code.
//   founder: Admin tools -> Referrals shows the numbers, saves settings, Set up in Stripe reports, retry.
//   landing page: /r/CODE and ?ref=CODE put the code on both checkout buttons and show the banner,
//   a junk code is ignored, and the code is remembered for a later visit.
// Usage: serve slickchart-vercel on PORT (default 8899), then node scratchpad/test-referral-ui.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const PORT = process.env.PORT || 8899, BASE = 'http://localhost:' + PORT;
const ENGINE = process.env.ENGINE || 'chromium';
const launchOpts = ENGINE === 'chromium' ? {} : {};
const b = await pw[ENGINE].launch(launchOpts);
const res = []; const check = (n, v, d) => res.push([n, !!v, d]);

const INFO = { ok: true, enabled: true, code: 'JENNIE17', link: 'https://slickchart.app/r/JENNIE17', ready: true,
  message: 'I use SlickChart for my charts, forms and client photos. Use my code JENNIE17 for your first month free: https://slickchart.app/r/JENNIE17',
  friendReward: { pct: 100, months: 1 }, sharerMonths: 1, rewardOnPayment: true, maxPerYear: 12, showOnHome: true, hasBilling: true,
  joined: 2, paying: 1, rewarded: 1, earnedCents: 1700,
  friends: [{ firstName: 'Maddie', status: 'rewarded', label: 'Paying, your free month is on' }, { firstName: 'Diana', status: 'trial', label: 'On her free trial' }] };

async function providerPage(opts) {
  const ctx = await b.newContext({ serviceWorkers: 'block', viewport: opts.viewport || { width: 390, height: 844 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  const log = [];
  await p.route('**/api/**', async r => {
    const u = r.request().url(), m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.endsWith('/api/referral') || u.includes('/api/referral?')) {
      log.push({ m, body: r.request().postData() || '', auth: r.request().headers()['authorization'] || '' });
      if (m === 'POST') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"counted":true}' });
      const ans = opts.answer ? opts.answer(log) : INFO;
      if (ans === 'fail') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ans) });
    }
    if (u.includes('/api/admin/referrals') && opts.admin) return opts.admin(r);
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' });
  });
  await p.goto(BASE + '/slickchart.html'); await p.waitForTimeout(9000);
  return { p, ctx, errs, log };
}

// ── 1. Home card, share, not now ──────────────────────────────────────────────────────────────────
{
  const { p, ctx, errs, log } = await providerPage({});
  await p.evaluate(() => nav('home')); await p.waitForTimeout(3500);
  const card = await p.evaluate(() => (document.getElementById('ref-home-slot') || {}).innerText || '');
  check('Home card shows her code and both rewards', /Give a month, get a month/.test(card) && /JENNIE17/.test(card) && /their first month free/.test(card) && /a free month once they are paying/.test(card), card);
  check('the code request carried her own session token', log.some(x => x.m === 'GET' && x.auth === 'Bearer TESTTOKEN'));
  // No navigator.share in headless desktop: falls back to copying the whole message.
  await p.evaluate(() => { try { delete navigator.share; } catch (e) {} window.__copied = ''; window._copyToClipboard = (t, msg) => { window.__copied = t; }; });
  await p.click('#ref-home-slot button.btnp'); await p.waitForTimeout(500);
  check('Share copies the full message with code and link', await p.evaluate(() => /JENNIE17/.test(window.__copied) && /slickchart\.app\/r\/JENNIE17/.test(window.__copied)));
  check('the share is counted (counts only)', log.some(x => x.m === 'POST' && JSON.parse(x.body || '{}').how === 'copy'));
  check('no sideways scroll at phone width', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.screenshot({ path: '/tmp/claude-0/ref-home-' + ENGINE + '.png' });
  await p.click('#ref-home-slot button.btng'); await p.waitForTimeout(300);
  check('Not now hides the card', await p.evaluate(() => !(document.getElementById('ref-home-slot') || {}).innerText));
  await p.evaluate(() => nav('home')); await p.waitForTimeout(600);
  check('and it stays hidden on the next Home', await p.evaluate(() => !(document.getElementById('ref-home-slot') || {}).innerText));
  check('it uses a device-only key, never a synced sc_* key', await p.evaluate(() => localStorage.getItem('slickrefhome') === 'hidden' && !Object.keys(localStorage).some(k => /^sc_ref/.test(k))));
  // ── Settings -> Refer a friend
  await p.evaluate(() => nav('account')); await p.waitForTimeout(600);
  const row = await p.$('text=Refer a friend'); check('Settings lists Refer a friend', !!row);
  if (row) await row.click(); await p.waitForTimeout(600);
  const t = await p.evaluate(() => document.getElementById('S') ? document.getElementById('S').innerText : document.body.innerText);
  check('screen shows code, link, totals and friends', /JENNIE17/.test(t) && /slickchart\.app\/r\/JENNIE17/.test(t) && /\$17/.test(t) && /Maddie/.test(t) && /On her free trial/.test(t) && /12 free months a year/.test(t), t.slice(0, 600));
  await p.evaluate(() => { window.__copied = ''; }); await p.click('text=Copy code'); await p.waitForTimeout(200);
  check('Copy code copies just the code', await p.evaluate(() => window.__copied === 'JENNIE17'));
  await p.click('text=Copy link'); await p.waitForTimeout(200);
  check('Copy link copies just the link', await p.evaluate(() => window.__copied === 'https://slickchart.app/r/JENNIE17'));
  check('no sideways scroll on the screen', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.screenshot({ path: '/tmp/claude-0/ref-screen-' + ENGINE + '.png', fullPage: true });
  // ── another account signs in on the same page
  await p.evaluate(() => { Cloud.token = 'OTHERTOKEN'; nav('refer'); }); await p.waitForTimeout(1200);
  const gets = log.filter(x => x.m === 'GET');
  check('a different account fetches its own code, never shows the old one first', gets[gets.length - 1].auth === 'Bearer OTHERTOKEN');
  check('no page errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

// ── 2. paused, too new, failure + retry ───────────────────────────────────────────────────────────
{
  const { p, ctx, errs } = await providerPage({ answer: () => ({ ok: true, enabled: false }) });
  await p.evaluate(() => nav('home')); await p.waitForTimeout(3500);
  check('paused program: no Home card', await p.evaluate(() => !(document.getElementById('ref-home-slot') || {}).innerText));
  await p.evaluate(() => nav('refer')); await p.waitForTimeout(500);
  check('paused program: screen says so', /paused/.test(await p.evaluate(() => document.body.innerText)));
  check('no page errors (paused)', !errs.length, errs.join(' | '));
  await ctx.close();
}
{
  const { p, ctx, errs } = await providerPage({ answer: () => Object.assign({}, INFO, { showOnHome: false }) });
  await p.evaluate(() => nav('home')); await p.waitForTimeout(3500);
  check('too new to the app: no Home card yet', await p.evaluate(() => !(document.getElementById('ref-home-slot') || {}).innerText));
  await ctx.close();
}
{
  let failing = true;
  const { p, ctx, errs } = await providerPage({ answer: () => (failing ? 'fail' : INFO) });
  await p.evaluate(() => { _refInfo = null; _refTried = false; _refTok = Cloud.token; nav('refer'); }); await p.waitForTimeout(1200);
  const t1 = await p.evaluate(() => document.body.innerText);
  check('a failed load says so and offers Try again', /Couldn.t load your code/.test(t1) && /Try again/.test(t1), t1.slice(0, 200));
  failing = false;
  await p.click('text=Try again'); await p.waitForTimeout(1200);
  check('Try again loads the code', /JENNIE17/.test(await p.evaluate(() => document.body.innerText)));
  check('no page errors (retry)', !errs.length, errs.join(' | '));
  await ctx.close();
}

// ── 3. Founder: Admin tools -> Referrals ──────────────────────────────────────────────────────────
{
  let posted = []; let settings = { ref_enabled: 1, ref_friend_pct: 100, ref_friend_months: 1, ref_sharer_months: 1, ref_reward_on_payment: 1, ref_max_per_year: 12, ref_home_days: 7, message: 'Use my code {code}: {link}' };
  const labels = { ref_enabled: { label: 'Referral program on (1) or off (0)', min: 0, max: 1, unit: '' }, ref_friend_pct: { label: 'Friend’s discount, percent off', min: 1, max: 100, unit: '%' }, ref_sharer_months: { label: 'Sharer’s credit', min: 0, max: 12, unit: 'months' } };
  const metrics = { codes: 9, sharers: 6, sharers30: 4, shares: 11, signups: 5, signups30: 3, onTrial: 2, paying: 3, canceled: 1, blocked: 1, failed: 1, rewardCents: 3400,
    retention: { day90: { paying: 0, of: 0 }, day180: { paying: 0, of: 0 } },
    top: [{ name: 'Jennie Milla', email: 'j@x.com', joined: 3, paying: 2 }], recent: [{ friend: 'Maddie', referrer: 'Jennie Milla', code: 'JENNIE17', status: 'rewarded', label: 'Paying, your free month is on', note: '', at: new Date().toISOString() }],
    progress: { paidTotal: 64, mrrCents: 68800, fromReferral: 3, goalProviders: 588, goalMrrCents: 1000000 } };
  const { p, ctx, errs } = await providerPage({ admin: async r => {
    if (r.request().method() === 'POST') { const body = JSON.parse(r.request().postData() || '{}'); posted.push(body);
      if (body.action === 'setup') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, setup: { coupon: 'Friend’s reward is ready in Stripe.', links: ['$17 monthly link: now accepts codes', '$170 yearly link: already accepts codes'], webhook: 'Webhook now hears payments' } }) });
      if (body.action === 'retry') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, retried: [{ friend: 'Diana', status: 'rewarded' }] }) });
      settings = Object.assign({}, settings, body); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, settings }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, settings, labels, metrics }) }); } });
  await p.evaluate(() => { _isFounder = true; nav('account'); }); await p.waitForTimeout(800);
  const row = await p.$('text=Who shared, who joined'); check('Admin tools lists Referrals', !!row);
  if (row) await row.click(); await p.waitForTimeout(800);
  const txt = await p.evaluate(() => (document.getElementById('ref-admin-modal') || {}).innerText || '');
  check('shows progress to 588 with MRR and referral count', /Progress to 588/.test(txt) && /64 paying/.test(txt) && /\$688/.test(txt) && /3 came by referral/.test(txt), txt.slice(0, 400));
  check('shows sharers, joined, paying, credits', /6\s*providers shared/.test(txt) && /5\s*friends joined/.test(txt) && /3\s*friends paying/.test(txt) && /\$34/.test(txt));
  check('shows top sharers and the latest referral', /Jennie Milla/.test(txt) && /Maddie via Jennie Milla/.test(txt));
  await p.click('#refa-setup'); await p.waitForTimeout(500);
  const sm = await p.textContent('#refa-setup-msg');
  check('Set up in Stripe says exactly what it did', /now accepts codes/.test(sm) && /already accepts codes/.test(sm) && /hears payments/.test(sm), sm);
  await p.click('#refa-retry'); await p.waitForTimeout(500);
  check('retry reports each credit', /Diana: rewarded/.test(await p.textContent('#refa-retry')));
  await p.fill('#refa-ref_friend_pct', '50'); await p.fill('#refa-message', 'Try SlickChart with {code}: {link}'); await p.click('#refa-save'); await p.waitForTimeout(500);
  const last = posted[posted.length - 1];
  check('saves her settings and message', last && last.ref_friend_pct === 50 && last.message === 'Try SlickChart with {code}: {link}' && /Saved/.test(await p.textContent('#refa-msg')));
  check('admin: no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.screenshot({ path: '/tmp/claude-0/ref-admin-' + ENGINE + '.png' });
  check('no page errors (admin)', !errs.length, errs.join(' | '));
  await ctx.close();
}

// ── 4. Landing page ───────────────────────────────────────────────────────────────────────────────
{
  const html = fs.readFileSync(new URL('../slickchart-vercel/index.html', import.meta.url), 'utf8');
  for (const vw of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const ctx = await b.newContext({ serviceWorkers: 'block', viewport: vw }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route(BASE + '/r/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await p.goto(BASE + '/r/jennie17'); await p.waitForTimeout(800);
    const hrefs = await p.evaluate(() => [...document.querySelectorAll('a[data-cta],a[data-cta-year]')].map(a => a.getAttribute('href')));
    check(vw.width + 'px /r/CODE: every checkout button carries the code', hrefs.length >= 2 && hrefs.every(h => /prefilled_promo_code=JENNIE17$/.test(h)), hrefs.join(' '));
    check(vw.width + 'px /r/CODE: banner names the code', /JENNIE17/.test(await p.evaluate(() => (document.getElementById('refbar') || {}).innerText || '')));
    check(vw.width + 'px /r/CODE: address bar tidied to /', await p.evaluate(() => location.pathname === '/'));
    check(vw.width + 'px: no sideways scroll with the banner', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (vw.width === 390) await p.screenshot({ path: '/tmp/claude-0/ref-landing-' + ENGINE + '.png' });
    await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
    check(vw.width + 'px: a later visit still carries the code', (await p.evaluate(() => document.querySelector('a[data-cta]').getAttribute('href'))).includes('prefilled_promo_code=JENNIE17'));
    check(vw.width + 'px: no page errors', !errs.length, errs.join(' | '));
    await ctx.close();
  }
  const ctx = await b.newContext({ serviceWorkers: 'block' }); const p = await ctx.newPage();
  await p.goto(BASE + '/index.html?ref=<script>'); await p.waitForTimeout(500);
  check('a junk code is ignored', !(await p.$('#refbar')) && !(await p.evaluate(() => document.querySelector('a[data-cta]').getAttribute('href'))).includes('prefilled'));
  await p.goto(BASE + '/index.html?ref=MADDIE42'); await p.waitForTimeout(500);
  check('?ref=CODE works too', (await p.evaluate(() => document.querySelector('a[data-cta]').getAttribute('href'))).endsWith('prefilled_promo_code=MADDIE42'));
  await ctx.close();
  const ctx2 = await b.newContext({ serviceWorkers: 'block' }); const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/index.html'); await p2.waitForTimeout(500);
  check('no code: buttons go straight to checkout, no banner', !(await p2.$('#refbar')) && !(await p2.evaluate(() => document.querySelector('a[data-cta]').getAttribute('href'))).includes('prefilled'));
  await ctx2.close();
  // ad links: utm_* ride to Stripe as client_reference_id (lib/referral.js parseClientRef), with or without a code
  const ctx3 = await b.newContext({ serviceWorkers: 'block' }); const p3 = await ctx3.newPage(); const e3 = []; p3.on('pageerror', e => e3.push(e.message));
  await p3.goto(BASE + '/index.html?utm_source=facebook&utm_campaign=Nov%20Test&utm_content=ad_1<x>'); await p3.waitForTimeout(500);
  const h3 = await p3.evaluate(() => [...document.querySelectorAll('a[data-cta],a[data-cta-year]')].map(a => a.getAttribute('href')));
  check('ad link: every checkout button carries the source, cleaned', h3.length >= 2 && h3.every(h => h.endsWith('client_reference_id=utm__facebook__novtest__ad1x')), h3.join(' '));
  check('ad link without a code: no friend banner', !(await p3.$('#refbar')));
  await p3.goto(BASE + '/index.html?ref=MADDIE42'); await p3.waitForTimeout(500);
  const h4 = await p3.evaluate(() => document.querySelector('a[data-cta]').getAttribute('href'));
  check('ad source is remembered and sits beside a friend code', /prefilled_promo_code=MADDIE42&client_reference_id=utm__facebook__novtest__ad1x$/.test(h4), h4);
  check('no page errors (ad links)', !e3.length, e3.join(' | '));
  await ctx3.close();
}

await b.close();
let all = true; for (const [n, v, d] of res) { console.log((v ? 'PASS ' : 'FAIL ') + n + (v ? '' : ' :: ' + (d || ''))); all = all && v; }
console.log(ENGINE + ': ' + (all ? 'ALL PASS' : 'FAILURES')); process.exit(all ? 0 : 1);
