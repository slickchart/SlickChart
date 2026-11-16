// Landing page proof (2026-11-16): yearly first in the pricing card, the live "Join N+ beauty pros"
// line (shown only when /api/provider-count answers above 0), referral code still on both buttons,
// the Build banner still there. Serve the folder holding index.html on PORT (default 8899).
//   node scratchpad/test-landing-proof.mjs     ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=... for Safari
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899, BASE = 'http://localhost:' + PORT, ENGINE = process.env.ENGINE || 'chromium';
const b = await pw[ENGINE].launch(); const res = []; const check = (n, v, d) => res.push([n, !!v, d]);
async function open(count, q = '', vw = { width: 390, height: 844 }) {
  const ctx = await b.newContext({ serviceWorkers: 'block', viewport: vw }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route('**/api/provider-count', r => count === 'fail' ? r.fulfill({ status: 500, body: 'x' }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count }) }));
  await p.route('**/api/**', r => r.fallback ? r.fallback() : r.continue());
  await p.goto(BASE + '/index.html' + q); await p.waitForTimeout(1200);
  return { p, ctx, errs };
}
{
  const { p, ctx, errs } = await open(45);
  const line = await p.evaluate(() => { const e = document.getElementById('pro-count'); return e && !e.hidden ? e.innerText : ''; });
  check('the count line shows the server number', /Join 45\+ beauty pros already using SlickChart/.test(line), line);
  const plan = await p.evaluate(() => { const c = document.querySelector('.plan.featured'); const a = [...c.querySelectorAll('a.btn')]; return { text: c.innerText, first: a[0].getAttribute('href'), second: a[1].getAttribute('href'), firstT: a[0].innerText, secondT: a[1].innerText }; });
  check('pricing leads with yearly', /Best value · 2 months free/.test(plan.text) && /\$170 \/ year/.test(plan.text) && /\$14\.17 a month/.test(plan.text) && /\$17 a month, paid monthly/.test(plan.text), plan.text.slice(0, 300));
  check('the first button is the yearly checkout', /8x2bJ05eXcuRbak2Cp4wM04/.test(plan.first) && /then yearly/.test(plan.firstT), plan.first);
  check('the second button is monthly', /4gM8wOfTB9iF1zK3Gt4wM05/.test(plan.second) && /Or monthly/.test(plan.secondT) && /\$17\/month/.test(plan.secondT), plan.second);
  check('the hero button is still the monthly trial', await p.evaluate(() => /4gM8wOfTB9iF1zK3Gt4wM05/.test(document.querySelector('.hero a[data-cta]').href)));
  check('the Build banner is still there', await p.evaluate(() => /build/i.test(document.body.innerHTML.slice(0, 60000)) && !!document.querySelector('a[href*="/build"]')));
  check('no sideways scroll at phone width', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.locator('.plan.featured').screenshot({ path: '/tmp/claude-0/landing-plan-' + ENGINE + '.png' });
  await p.screenshot({ path: '/tmp/claude-0/landing-hero-' + ENGINE + '.png' });
  check('no page errors', !errs.length, errs.join(' | '));
  await ctx.close();
}
for (const c of [0, 'fail']) {
  const { p, ctx } = await open(c);
  check('count ' + c + ': no line at all', await p.evaluate(() => document.getElementById('pro-count').hidden && document.getElementById('pro-count').offsetHeight === 0));
  await ctx.close();
}
{
  const { p, ctx } = await open(45, '?ref=MADDIE42');
  const hrefs = await p.evaluate(() => [...document.querySelectorAll('.plan.featured a.btn')].map(a => a.href));
  check('a friend code is on both pricing buttons', hrefs.length === 2 && hrefs.every(h => /prefilled_promo_code=MADDIE42/.test(h)), hrefs.join(' '));
  await ctx.close();
}
{
  const { p, ctx } = await open(45, '', { width: 1280, height: 900 });
  check('desktop: no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.locator('.plan.featured').screenshot({ path: '/tmp/claude-0/landing-plan-desk-' + ENGINE + '.png' });
  await ctx.close();
}
await b.close();
let fail = 0; for (const [n, ok, d] of res) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok || d === undefined ? '' : '  -- ' + String(d).slice(0, 300))); if (!ok) fail++; }
console.log(`\n${ENGINE}: ${res.length - fail}/${res.length} passed`); process.exit(fail ? 1 : 0);
