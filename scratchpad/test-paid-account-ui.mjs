// test-paid-account-ui (2026-11-23): the app side of "paying makes the account".
//  - ?setup=<token> (the Get set up email): her email shown, pick a password, signed in, lands on Home
//  - an expired/used link: says so, offers Sign in + "Email me a new link"; an already-set-up one: Sign in
//  - ?paid=<checkout id> (back from Stripe): "Getting your account ready", then the same set-up screen;
//    an existing account goes to Sign in with the email filled; Stripe slow -> "we emailed you" screen
//  - a browser that held ANOTHER account never carries its data into the new one (cleared, reloaded)
//  - signed in already + ?paid: carries on normally
//  - store app (native): the set-up screen works and shows no payment wording
//  - phone and computer width; the email in the page is escaped
// Serve slickchart-vercel on PORT first:  (cd slickchart-vercel && python3 -m http.server 8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const res = [];
const J = (r, status, obj) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
async function page(opts = {}) {
  const ctx = await b.newContext({ viewport: { width: opts.width || 390, height: 820 } });
  const p = await ctx.newPage(); p._errs = []; p.on('pageerror', e => p._errs.push(e.message));
  p._posts = []; p._stores = [];
  if (opts.native) await p.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }; });
  if (opts.init) await p.addInitScript(opts.init);
  await p.route('**/api/**', async r => {
    const u = r.request().url(); const m = r.request().method(); let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    if (u.includes('cloud-status')) return J(r, 200, { enabled: true });
    if (u.includes('/api/account-setup')) {
      if (m === 'GET') {
        const t = new URL(u).searchParams.get('token');
        if (t === 'GOOD') return J(r, 200, { ok: true, email: opts.email || 'nina@pro.com', name: 'Nina New' });
        if (t === 'DONE') return J(r, 400, { error: 'x', email: 'nina@pro.com', ready: true });
        return J(r, 400, { error: 'This set-up link has expired or was already used. Tap Sign in, then "Forgot password", and we will email you a new one.' });
      }
      p._posts.push(body);
      if (body.sessionId === 'cs_live_NEW') { await new Promise(x => setTimeout(x, 1500)); } if (body.sessionId === 'cs_live_NEW') return J(r, 200, { setupToken: 'FROMSTRIPE', email: 'bea@pro.com', name: 'Bea' });
      if (body.sessionId === 'cs_live_HAS') return J(r, 200, { hasAccount: true, email: 'has@pro.com' });
      if (body.sessionId) return J(r, 202, { pending: true });
      if (body.password && body.password.length >= 8) return J(r, 200, { token: 'NEWTOKEN.' + (body.token || ''), name: body.name || 'Nina New', email: 'nina@pro.com', verified: true });
      return J(r, 400, { error: 'Password must be at least 8 characters.' });
    }
    if (u.includes('/api/store')) { if (m === 'POST' || m === 'PUT') p._stores.push((r.request().headers().authorization || '') + ' ' + (r.request().postData() || '').slice(0, 200)); return J(r, 200, { ok: true, data: {} }); }
    return J(r, 200, { ok: true, data: {}, clients: [], events: [] });
  });
  await p.goto('http://localhost:' + PORT + '/slickchart.html' + (opts.qs || ''));
  await p.waitForTimeout(opts.wait || 4000);
  return p;
}
const txt = async (p, sel) => p.evaluate(s => (document.querySelector(s) || {}).innerText || '', sel);

for (const width of [390, 1280]) {
  const p = await page({ qs: '?setup=GOOD', width });
  const t1 = await txt(p, '#login-screen');
  res.push([width + ': Get set up link opens "Your account is ready" with her email', /Your account is ready/.test(t1) && /nina@pro\.com/.test(t1), t1]);
  res.push([width + ': name is filled in from checkout', (await p.inputValue('#login-name')) === 'Nina New']);
  res.push([width + ': the token is taken out of the address bar', !/setup=/.test(p.url()), p.url()]);
  res.push([width + ': no email box to get wrong (only a hidden one for password managers)', await p.evaluate(() => !document.querySelector('#login-email') && [...document.querySelectorAll('#login-screen input[type=email]')].every(i => i.style.display === 'none'))]);
  await p.fill('#login-pw', 'short'); await p.click('#setup-go'); await p.waitForTimeout(300);
  res.push([width + ': a short password is stopped on the screen', /8/.test(await txt(p, '#login-err')) && p._posts.length === 0]);
  await p.fill('#login-pw', 'MyNewPass1'); await p.click('#setup-go'); await p.click('#setup-go').catch(() => {}); await p.waitForTimeout(2500);
  res.push([width + ': one tap sends ONE request with the token and password', p._posts.length === 1 && p._posts[0].token === 'GOOD' && p._posts[0].password === 'MyNewPass1', p._posts]);
  const st = await p.evaluate(() => ({ screen: !!document.getElementById('login-screen'), tok: localStorage.getItem('sc_token'), em: localStorage.getItem('sc_login_email'), cur: (typeof _navCur !== 'undefined' && _navCur) ? _navCur.screen : '' }));
  res.push([width + ': she is signed in and on Home', !st.screen && st.tok === 'NEWTOKEN.GOOD' && st.em === 'nina@pro.com' && st.cur === 'home', st]);
  res.push([width + ': no page errors', !p._errs.length, p._errs.join('|')]);
  await p.context().close();
}
{
  const p = await page({ qs: '?setup=BAD' });
  const t = await txt(p, '#login-screen');
  res.push(['expired link: says so and offers a new one', /expired/.test(t) && /Email me a new link/.test(t), t]);
  await p.click('text=Email me a new link'); await p.waitForTimeout(300);
  res.push(['"Email me a new link" opens the reset screen', !!(await p.$('#login-email')) && /reset/i.test(await p.evaluate(() => _loginMode))]);
  await p.context().close();
}
{
  const p = await page({ qs: '?setup=DONE' });
  const t = await txt(p, '#login-screen');
  res.push(['already-set-up link: goes to Sign in, no new-link button', /already set up/.test(t) && !/Email me a new link/.test(t), t]);
  await p.click('#login-screen button'); await p.waitForTimeout(300);
  res.push(['...with her email filled in', (await p.inputValue('#login-email').catch(() => '')) === 'nina@pro.com']);
  await p.context().close();
}
{
  const p = await page({ qs: '?paid=cs_live_NEW', wait: 300 });
  const t0 = await txt(p, '#login-screen');
  await p.waitForTimeout(2500);
  const t1 = await txt(p, '#login-screen');
  res.push(['back from Stripe: "Thank you", then the set-up screen for the email she paid with', /Thank you for joining/.test(t0) && /Your account is ready/.test(t1) && /bea@pro\.com/.test(t1), [t0, t1]]);
  await p.fill('#login-pw', 'BeaPass123'); await p.click('#setup-go'); await p.waitForTimeout(2500);
  res.push(['...and she is in with the token Stripe handed back', p._posts.some(x => x.token === 'FROMSTRIPE') && !(await p.$('#login-screen'))]);
  res.push(['...the checkout id is out of the address bar', !/paid=/.test(p.url())]);
  await p.context().close();
}
{
  const p = await page({ qs: '?paid=cs_live_HAS', wait: 3000 });
  res.push(['back from Stripe with an account already: Sign in with her email filled', (await p.inputValue('#login-email').catch(() => '')) === 'has@pro.com' && /already have an account/.test(await txt(p, '#login-err'))]);
  await p.context().close();
}
{
  const p = await page({ qs: '?paid=cs_live_SLOW', wait: 1000 });
  await p.evaluate(() => { window.__orig = setTimeout; });
  await p.waitForTimeout(17000);
  const t = await txt(p, '#login-screen');
  res.push(['Stripe slow: after a few tries says the Get set up email is on its way', /emailed you/.test(t) && /Get set up/.test(t), t]);
  res.push(['...tried several times, not forever', p._posts.filter(x => x.sessionId).length >= 3 && p._posts.filter(x => x.sessionId).length <= 7, p._posts.length]);
  await p.context().close();
}
{
  // A browser that still holds another account's data
  const p = await page({ qs: '?setup=GOOD', init: () => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_prev_owner', 'p_other'); localStorage.setItem('sc_clients', JSON.stringify([{ id: 'c1', name: 'Someone Elses Client' }])); localStorage.setItem('sc_cloud_seeded', '1'); } } });
  await p.fill('#login-pw', 'MyNewPass1'); await p.click('#setup-go'); await p.waitForTimeout(5000);
  const left = await p.evaluate(() => ({ clients: localStorage.getItem('sc_clients') || '', tok: localStorage.getItem('sc_token') }));
  res.push(['another account\'s data on this browser is cleared, never sent to the new account', !/Someone Elses/.test(left.clients) && left.tok === 'NEWTOKEN.GOOD' && !p._stores.some(s => /Someone Elses/.test(s)), [left, p._stores]]);
  await p.context().close();
}
{
  const p = await page({ qs: '?paid=cs_live_NEW', init: () => { localStorage.setItem('sc_token', 'OLDTOKEN'); localStorage.setItem('sc_onboarded', '1'); } });
  res.push(['signed in already + back from Stripe: carries on, no set-up screen, no claim', !(await p.$('#login-screen')) && !p._posts.some(x => x.sessionId)]);
  await p.context().close();
}
{
  const p = await page({ qs: '?setup=GOOD', native: true });
  const t = await txt(p, '#login-screen');
  res.push(['store app: the set-up screen works there too, nothing about paying', /Your account is ready/.test(t) && !/Subscribe|\$|price/i.test(t), t]);
  await p.context().close();
}
{
  const p = await page({ qs: '?setup=GOOD', email: '"><img src=x onerror=window.__x=1>@x.com' });
  res.push(['the email is escaped on the page', !(await p.evaluate(() => window.__x)) && !(await p.$('#login-screen img[src=x]'))]);
  await p.context().close();
}
await b.close();
let f = 0; for (const [n, ok, d] of res) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  ' + JSON.stringify(d).slice(0, 400))); if (!ok) f++; }
console.log(f ? f + ' FAILED' : 'ALL PASS (' + res.length + ')'); process.exit(f ? 1 : 0);
