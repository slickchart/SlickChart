// 2026-11-23: Create account with no payment under the email -> "pick your plan" with the email prefilled
// into the Stripe link (web). Store app never shows it.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const res = [];
for (const native of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 820 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  if (native) await p.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }; });
  await p.route('**/api/**', r => { const u = r.request().url();
    if (u.includes('/api/signup')) return r.fulfill({ status: 402, contentType: 'application/json', body: JSON.stringify({ error: 'We can’t find a subscription under this email yet.', checkoutUrl: 'https://buy.stripe.com/test_m', checkoutUrlYear: 'https://buy.stripe.com/test_y', priceMonth: 17, priceYear: 170 }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(3500);
  await p.evaluate(() => { _setLoginMode('signup'); }); await p.waitForTimeout(300);
  if (!native) {
    await p.fill('#login-name', 'Wa Hu'); await p.fill('#login-email', 'wa+x@gmail.com'); await p.fill('#login-pw', 'whatever123');
    await p.evaluate(() => doSignup()); await p.waitForTimeout(800);
    const m = await p.getAttribute('#signup-plan-month', 'href').catch(() => null); const y = await p.getAttribute('#signup-plan-year', 'href').catch(() => null);
    const t = await p.evaluate(() => (document.getElementById('signup-plan') || {}).innerText || '');
    res.push(['web: no plan yet -> "pick your plan" panel', /pick your plan/.test(t) && /Get set up/.test(t) && /wa\+x@gmail\.com/.test(t) && /\$17\/month/.test(t) && /\$170/.test(t), t]);
    res.push(['web: both links carry the email she typed', m === 'https://buy.stripe.com/test_m?prefilled_email=wa%2Bx%40gmail.com' && y === 'https://buy.stripe.com/test_y?prefilled_email=wa%2Bx%40gmail.com', [m, y]]);
    res.push(['web: still has the typo hint for anyone who did pay', /Already paid\? Check this email for a typo/.test(t)]);
  } else {
    res.push(['store app: never shows Create account or a plan link', !(await p.$('#login-name')) && !(await p.$('#signup-plan'))]);
  }
  res.push([(native ? 'native' : 'web') + ': no page errors', !errs.length, errs]);
  await ctx.close();
}
await b.close();
let f = 0; for (const [n, ok, d] of res) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  ' + JSON.stringify(d).slice(0, 300))); if (!ok) f++; }
console.log(f ? f + ' FAILED' : 'ALL PASS (' + res.length + ')'); process.exit(f ? 1 : 0);
