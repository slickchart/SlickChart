// Cancelling asks why first (2026-11-19, Ashley: "automatically have people directed to a feedback section
// when cancelling through the app ... i would liek to get as much feedback as possible from those", "make
// sure all cancel areas have a nice message about their feedback helping me grow and learn", "and thanking
// them for their time and support").
//   serve slickchart-vercel on PORT (default 8899), then
//   node scratchpad/test-cancel-feedback.mjs                (Chromium)
//   ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=<webkit dir> node scratchpad/test-cancel-feedback.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899, BASE = 'http://localhost:' + PORT;
const ENGINE = process.env.ENGINE || 'chromium';
const b = await pw[ENGINE].launch();
const res = []; const check = (n, v, d) => res.push([n, !!v, d]);
const PERIOD_END = Math.floor(Date.UTC(2026, 11, 3) / 1000);
const SUB = { status: 'active', plan_amount: 1700, plan_interval: 'month', current_period_end: PERIOD_END, cancel_at_period_end: false };
const OFFER = { pauseOn: true, pauseMax: 3, pausesPerYear: 1, canPause: true, pauseWhy: '', paused: false, pausedUntil: null,
  yearlyFrom: 2, yearlyTo: 5, monthOfPaying: 3, showYearly: true, onTrial: false };
const THANKS = 'Thank you so much for your time and support. SlickChart is a brand new app, and I am a self-taught esthetician building it, so any and all feedback helps me grow and learn.';
// A real (tiny) PNG, as a phone screenshot would arrive.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC', 'base64');

async function page(opts) {
  const ctx = await b.newContext({ serviceWorkers: 'block', viewport: opts.viewport || { width: 390, height: 844 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  const log = [];
  await p.route('**/api/**', async r => {
    const u = r.request().url(), m = r.request().method(), body = r.request().postData() || '';
    const J = (o, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('cloud-status')) return J({ enabled: true });
    if (u.includes('/api/billing-status')) return J({ ok: true, subscription: opts.sub || SUB, offer: opts.offer === undefined ? OFFER : opts.offer });
    if (u.includes('/api/create-portal-session')) { log.push({ u: 'portal', j: JSON.parse(body || '{}') }); return J({ error: 'stub portal' }); }
    if (u.includes('/api/feedback') && m === 'POST') { log.push({ u: 'feedback', j: JSON.parse(body || '{}'), auth: r.request().headers()['authorization'] }); return opts.feedbackFails ? J({ ok: false }, 500) : J({ ok: true }); }
    return J({ ok: true, data: {}, clients: [], events: [] });
  });
  await p.goto(BASE + '/slickchart.html'); await p.waitForTimeout(9000);
  await p.evaluate(() => nav('subscription-billing')); await p.waitForTimeout(1500);
  return { p, ctx, errs, log };
}
const txt = (p, sel) => p.evaluate(s => (document.querySelector(s) || {}).innerText || '', sel);

// 1. Tick, write, attach, send: the words and screenshots reach Ashley, then the pause offer shows.
{
  const { p, ctx, errs, log } = await page({});
  await p.click('text=Cancel subscription'); await p.waitForTimeout(400);
  const t = await txt(p, '#cancel-ask');
  check('Cancel opens the feedback sheet first', /Before you go, can you tell me why\?/.test(t), t);
  check('it thanks them and says their feedback helps her grow and learn', t.includes(THANKS), t);
  check('nothing is sent and no Stripe call yet', !log.length);
  check('the reasons are tick boxes', (await p.$$('#cancel-ask input.cancel-why')).length === 7);
  await p.check('#cancel-ask input.cancel-why[value="Hard to use"]');
  await p.check('#cancel-ask input.cancel-why[value="Missing a feature I need"]');
  await p.fill('#cancel-words', 'I could not find where to add my services.');
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('text=Add screenshots of anything')]);
  await fc.setFiles([{ name: 'a.png', mimeType: 'image/png', buffer: PNG }, { name: 'b.png', mimeType: 'image/png', buffer: PNG }]);
  await p.waitForTimeout(1200);
  check('two screenshots show as thumbnails', (await p.$$('#cancel-shots img')).length === 2);
  await p.click('#cancel-shots button[aria-label="Remove screenshot 2"]'); await p.waitForTimeout(200);
  check('one can be taken off again', (await p.$$('#cancel-shots img')).length === 1);
  await p.screenshot({ path: '/tmp/claude-0/cancel-ask-' + ENGINE + '.png' });
  check('no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.click('#cancel-ask-send'); await p.waitForTimeout(800);
  const f = log.find(x => x.u === 'feedback');
  check('sent as cancel feedback with her own session', f && f.j.kind === 'cancel' && f.auth === 'Bearer TESTTOKEN', JSON.stringify(f && f.j && { kind: f.j.kind }));
  check('the message has both reasons and her words', f && /Hard to use, Missing a feature I need/.test(f.j.message) && /add my services/.test(f.j.message), f && f.j.message);
  check('one JPEG screenshot went with it', f && f.j.shots && f.j.shots.length === 1 && /^data:image\/jpeg;base64,/.test(f.j.shots[0]));
  check('the sheet closes and the pause offer follows', !(await p.$('#cancel-ask')) && !!(await p.$('#grow-cancel')));
  const g = await txt(p, '#grow-cancel');
  check('the pause sheet also thanks them', g.includes(THANKS), g);
  await p.click('text=Cancel anyway'); await p.waitForTimeout(800);
  check('Cancel anyway still reaches Stripe’s cancel screen, with no second ask', log.some(x => x.u === 'portal' && x.j.intent === 'cancel') && !(await p.$('#cancel-ask')));
  check('no page errors (1)', !errs.length, errs.join(' | '));
  await ctx.close();
}
// 2. Skip: nothing is sent, cancelling goes on.
{
  const { p, ctx, errs, log } = await page({});
  await p.click('text=Cancel subscription'); await p.waitForTimeout(300);
  await p.click('text=Skip and continue to cancel'); await p.waitForTimeout(500);
  check('Skip sends nothing', !log.some(x => x.u === 'feedback'));
  check('Skip goes on to the pause offer', !!(await p.$('#grow-cancel')));
  check('no page errors (2)', !errs.length, errs.join(' | '));
  await ctx.close();
}
// 3. Send with nothing filled in acts as Skip; a failed send never blocks cancelling.
{
  const { p, ctx, errs, log } = await page({ feedbackFails: true, offer: null });
  await p.click('text=Cancel subscription'); await p.waitForTimeout(300);
  await p.click('#cancel-ask-send'); await p.waitForTimeout(800);
  check('an empty Send sends nothing and goes on (straight to Stripe on an older server)', !log.some(x => x.u === 'feedback') && log.some(x => x.u === 'portal' && x.j.intent === 'cancel'));
  await p.click('text=Cancel subscription'); await p.waitForTimeout(300);
  await p.check('#cancel-ask input.cancel-why[value="Too expensive"]');
  await p.click('#cancel-ask-send'); await p.waitForTimeout(800);
  check('a failed send still goes on to cancel', log.filter(x => x.u === 'portal' && x.j.intent === 'cancel').length === 2 && log.some(x => x.u === 'feedback'));
  check('no page errors (3)', !errs.length, errs.join(' | '));
  await ctx.close();
}
// 4. Already cancelled: the screen thanks them and offers the same sheet, with nothing to continue to.
{
  const { p, ctx, errs, log } = await page({ sub: Object.assign({}, SUB, { cancel_at_period_end: true }) });
  const t = await txt(p, '#billing-body');
  check('the Ending screen thanks them', /Ending/.test(t) && t.includes(THANKS) && /Tell me what I could do better/.test(t), t.slice(0, 600));
  await p.click('text=Tell me what I could do better'); await p.waitForTimeout(300);
  const s = await txt(p, '#cancel-ask');
  check('it opens as "What could I do better?" with Send and Not now', /What could I do better\?/.test(s) && /\bSend\b/.test(s) && /Not now/.test(s) && !/continue to cancel/.test(s), s);
  await p.fill('#cancel-words', 'More text reminders please.');
  await p.click('#cancel-ask-send'); await p.waitForTimeout(800);
  check('her note is sent, and no Stripe screen opens', log.some(x => x.u === 'feedback' && /text reminders/.test(x.j.message)) && !log.some(x => x.u === 'portal'));
  check('no page errors (4)', !errs.length, errs.join(' | '));
  await ctx.close();
}
// 5. The help article says it too.
{
  const { p, ctx } = await page({});
  const body = await p.evaluate(() => { const a = (typeof helpArticles !== 'undefined' ? helpArticles : []).find(x => x.id === 'bill-cancel'); return a ? a.body + '\n' + (a.nativeBody || '') : ''; });
  check('How to cancel (web and app) thanks them', body.split(THANKS).length === 3, body.slice(-400));
  await ctx.close();
}
await b.close();
const bad = res.filter(r => !r[1]);
res.forEach(r => console.log((r[1] ? 'PASS ' : 'FAIL ') + r[0] + (r[1] ? '' : '  ' + String(r[2] || '').slice(0, 400))));
console.log(`\n${res.length - bad.length}/${res.length} passed (${ENGINE})`);
process.exit(bad.length ? 1 : 0);
