// Roadmap sale source tracking (2026-11-20): the Build pages send where a buyer came from to
// /api/build-checkout. Serve slickchart-vercel with scratchpad/vercel-like-server.mjs on 8898 first.
// (The local server has no /build/blog rewrite, so the post is opened at /build-blog/.) Run in Chromium and WebKit (scratchpad/run-in-safari.sh).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const engine = process.env.PW_ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const B = process.env.BASE || 'http://localhost:8898';
const browser = await engine.launch(process.env.PW_ENGINE === 'webkit' ? {} : {});
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function run(name, steps, buyPath) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  let body = null;
  await page.route('**/api/build-checkout', r => { body = JSON.parse(r.request().postData() || '{}'); r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"test"}' }); });
  await page.route(/connect\.facebook\.net|fonts\.g/, r => r.abort());
  for (const s of steps) await page.goto(B + s.url, s.referer ? { referer: s.referer } : {});
  if (buyPath && page.url() !== B + buyPath) await page.goto(B + buyPath);
  await page.evaluate(() => startCheckout());
  await page.waitForTimeout(400);
  await ctx.close();
  console.log('  ' + name + ': ' + JSON.stringify(body));
  return body;
}
let b;
b = await run('Google -> blog post -> /build', [{ url: '/build-blog/what-an-app-actually-costs', referer: 'https://www.google.com/' }, { url: '/build', referer: B + '/build-blog/what-an-app-actually-costs' }]);
ok(b && b.src && b.src.ref === 'google.com' && b.src.lp === '/build-blog/what-an-app-actually-costs' && !b.roadmap, 'google first touch + blog landing credited on /build');
b = await run('Pinterest pin -> /build-any-business', [{ url: '/build-any-business?utm_source=pinterest&utm_medium=pin&utm_campaign=build', referer: 'https://www.pinterest.com/' }]);
ok(b && b.roadmap === 'any' && b.src.utm === 'utm__pinterest__build__' && b.src.ref === 'pinterest.com', 'pinterest utm + referrer on any-business');
b = await run('Pinterest pin, wanders to homepage, then /build', [{ url: '/build?utm_source=pinterest&utm_campaign=build' }, { url: '/', referer: B + '/build' }, { url: '/build', referer: B + '/' }]);
ok(b && b.src.utm === 'utm__pinterest__build__' && !b.src.lref, 'utm kept across pages, internal referrer ignored');
b = await run('ChatGPT link straight to /build', [{ url: '/build?utm_source=chatgpt.com', referer: 'https://chatgpt.com/' }]);
ok(b && b.src.utm === 'utm__chatgptcom____' && b.src.ref === 'chatgpt.com', 'chatgpt utm');
b = await run('Typed in', [{ url: '/build' }]);
ok(b && b.src && !b.src.utm && !b.src.ref && b.src.lp === '/build', 'direct visit sends only the landing page');
b = await run('Direct first, Instagram later', [{ url: '/build' }, { url: '/build', referer: 'https://l.instagram.com/' }]);
ok(b && b.src.ref === 'instagram.com'.replace(/^/, 'l.'), 'a later outside referrer replaces a direct first touch');
await browser.close();
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
