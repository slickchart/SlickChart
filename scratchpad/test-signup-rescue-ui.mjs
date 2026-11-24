// 2026-11-18: two new providers in a row "couldn't make an account". Covers the app side of the fix:
//  - store apps (native) now offer "Create your account" on the welcome and sign-in screens
//  - a refused Sign in offers "Create your account" with the email carried over (web and native)
//  - a 402 at Create account: the web shows Subscribe; the store app shows no payment link at all
//  - ?signup=1&email= with quotes in it cannot break out of the input (escaped)
//  - founder "Paid but no account": suggestion prefilled, Move payment posts {move:{from,to}}, shows
//    the result; "turned away at sign-up" list; the new alert box saves
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const res = [];
const J = (r, status, obj) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });

async function page(native, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: opts.width || 390, height: 800 } });
  const p = await ctx.newPage(); p._errs = []; p.on('pageerror', e => p._errs.push(e.message));
  p._launch = []; p._posts = [];
  if (native) await p.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }; });
  if (opts.signedIn) await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); localStorage.setItem('sc_is_founder', '1'); });
  await p.route('**/api/**', async r => {
    const u = r.request().url(); const m = r.request().method(); let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    if (u.includes('cloud-status')) return J(r, 200, { enabled: true });
    if (u.includes('/api/app-launch')) { p._launch.push(r.request().postData() || ''); return J(r, 200, { ok: true }); }
    if (u.includes('/api/login')) return J(r, 401, { error: 'Email or password is incorrect.' });
    if (u.includes('/api/signup')) return J(r, 402, { error: 'We can’t find a subscription under this email yet. If you already paid, check the email for a typo and use the exact one you typed at checkout. We’ve let Ashley know too, so she can help. Not subscribed yet? Subscribe first, then come back here.', checkoutUrl: 'https://buy.stripe.com/test', checkoutUrlYear: 'https://buy.stripe.com/testy', priceYear: 170 });
    if (u.includes('/api/admin/orphans')) {
      if (m === 'POST') { p._posts.push(body); if (body.move) return J(r, 200, { ok: true, from: body.move.from, to: body.move.to, setup: 'sent', notes: [] }); return J(r, 200, { ok: true, settings: Object.assign({ orphan_email_hours: 3, orphan_alert_hours: 48, orphan_alert_on: 0, signup_problem_alert_on: 1 }, body) }); }
      return J(r, 200, { ok: true, settings: { orphan_email_hours: 3, orphan_alert_hours: 48, orphan_alert_on: 0, signup_problem_alert_on: 1 }, labels: {},
        people: [{ email: 'cm_b@tahoo.com', suggest: 'cm_b@yahoo.com', paidAt: new Date(Date.now() - 10 * 36e5).toISOString(), emailedAt: new Date().toISOString(), status: 'emailed', failedSignIns: 0 },
                 { email: 'jill@stuck.com', suggest: null, paidAt: new Date().toISOString(), status: 'waiting', failedSignIns: 6 }],
        signupProblems: [{ email: 'cm_b@yahoo.com', kind: 'signup-unpaid', what: 'tried to create an account, but no payment is under that email', match: 'cm_b@tahoo.com', times: 2, last: new Date().toISOString(), solved: false }] });
    }
    return J(r, 200, { ok: true, data: {}, clients: [], events: [] });
  });
  await p.goto('http://localhost:' + PORT + '/slickchart.html' + (opts.qs || ''));
  await p.waitForTimeout(opts.wait || 6000);
  return p;
}
const txt = async (p, sel) => p.evaluate(s => (document.querySelector(s) || {}).innerText || '', sel);

// ---- store app: stays payment-silent (no Create account, no payment link); a refused sign-in now
//      says the account is not made yet and where the email is
{
  const p = await page(true);
  await p.evaluate(() => { _setLoginMode('signup'); }); await p.waitForTimeout(300);
  res.push(['native still never shows Create account', !(await p.$('#login-name'))]);
  await p.evaluate(() => { _setLoginMode('login'); }); await p.waitForTimeout(300);
  await p.fill('#login-email', 'cm_b@yahoo.com'); await p.fill('#login-pw', 'whatever123');
  await p.evaluate(() => doLogin()); await p.waitForTimeout(800);
  const e1 = await txt(p, '#login-err');
  const links = await p.$$eval('#login-err a, #login-err button', as => as.length);
  res.push(['native refused sign-in: says the account is not made yet, check email, no link', /Email or password is incorrect/.test(e1) && /Your account is not made yet/.test(e1) && /Check your email/.test(e1) && !links && !/Subscribe|Renew/.test(e1), e1]);
  await p.waitForTimeout(400);
  res.push(['launch log has signin-refused', /signin-refused/.test(p._launch.join(' '))]);
  res.push(['native: no page errors', !p._errs.length, p._errs.join('|')]);
  await p.context().close();
}
// ---- web: refused sign-in hint, 402 keeps Subscribe link
{
  const p = await page(false);
  await p.evaluate(() => { _setLoginMode('login'); }); await p.waitForTimeout(300);
  await p.fill('#login-email', 'x@y.com'); await p.fill('#login-pw', 'whatever123');
  await p.evaluate(() => doLogin()); await p.waitForTimeout(800);
  res.push(['web refused sign-in shows the create hint', /Just subscribed/.test(await txt(p, '#login-err'))]);
  await p.click('#login-create-hint button'); await p.waitForTimeout(300);
  await p.fill('#login-name', 'X'); await p.fill('#login-pw', 'whatever123');
  await p.evaluate(() => doSignup()); await p.waitForTimeout(800);
  const e = await txt(p, '#login-err'); const hrefs = await p.$$eval('#login-err a', as => as.map(a => a.href));
  res.push(['web 402: pick-your-plan panel with the typo hint and a Stripe link (2026-11-23)', /pick your plan/.test(e) && /Check this email for a typo/.test(e) && hrefs.some(h => /buy\.stripe\.com\/test/.test(h)), e]);
  res.push(['web: no page errors', !p._errs.length, p._errs.join('|')]);
  await p.context().close();
}
// ---- ?signup=1&email= with a quote cannot inject
{
  const p = await page(false, { qs: '?signup=1&email=' + encodeURIComponent('a@b.com" autofocus onfocus="window.__x=1'), wait: 5000 });
  const v = await p.inputValue('#login-email').catch(() => '');
  const x = await p.evaluate(() => window.__x);
  res.push(['email from the link is escaped, not run', v === 'a@b.com" autofocus onfocus="window.__x=1' && !x, v]);
  await p.context().close();
}
// ---- founder: Paid but no account -> Move payment
{
  const p = await page(false, { signedIn: true, wait: 9000 });
  await p.evaluate(() => { _isFounder = true; _founderOrphans(); }); await p.waitForTimeout(1000);
  const t = await txt(p, '#orphan-modal');
  const inp = await p.$$eval('.orph-move-to', els => els.map(e => [e.getAttribute('data-from'), e.value]));
  res.push(['suggestion prefilled for the mistyped one, blank for the other', inp.length === 2 && inp[0][0] === 'cm_b@tahoo.com' && inp[0][1] === 'cm_b@yahoo.com' && inp[1][1] === '', JSON.stringify(inp)]);
  res.push(['turned-away list shows the refused signup and the paid-as email', /Turned away at sign-up/.test(t) && /cm_b@yahoo.com/.test(t) && /Paid as cm_b@tahoo.com/.test(t) && /\(2 times\)/.test(t), t.slice(-500)]);
  res.push(['new alert box is there and on', await p.$eval('#orph-signup_problem_alert_on', el => el.checked).catch(() => false)]);
  const btns = await p.$$('.orph-move'); await btns[0].click(); await p.waitForTimeout(600);
  const mv = p._posts.find(x => x.move);
  res.push(['Move payment posts from/to', mv && mv.move.from === 'cm_b@tahoo.com' && mv.move.to === 'cm_b@yahoo.com', JSON.stringify(p._posts)]);
  res.push(['says it moved and the setup email went', /Moved to cm_b@yahoo.com\. The setup email went to her there/.test(await txt(p, '#orphan-modal'))]);
  await btns[1].click(); await p.waitForTimeout(300);
  res.push(['empty email is caught before posting', /Type the email she can get to/.test(await txt(p, '#orphan-modal')) && p._posts.filter(x => x.move).length === 1]);
  await p.uncheck('#orph-signup_problem_alert_on'); await p.click('#orph-save'); await p.waitForTimeout(500);
  res.push(['alert box saves off as 0', p._posts.some(x => x.signup_problem_alert_on === 0)]);
  res.push(['no sideways scroll at phone width', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)]);
  await p.screenshot({ path: process.env.SHOT || '/tmp/signup-rescue-orphans.png' });
  res.push(['founder: no page errors', !p._errs.length, p._errs.join('|')]);
  await p.context().close();
}
await b.close();
let all = true; for (const [n, v, d] of res) { console.log((v ? 'PASS ' : 'FAIL ') + n + (v ? '' : ' :: ' + (d || ''))); all = all && !!v; }
console.log(all ? 'ALL PASS' : 'FAILURES'); process.exit(all ? 0 : 1);
