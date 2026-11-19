// Cancel reasons addressed with help articles (2026-11-19): Laura (message all clients), Jackie (privacy),
// Bria (direct pay). Each is found by the words they used and opens cleanly on a phone.
//   serve slickchart-vercel on 8899, then node scratchpad/test-cancel-reason-help.mjs  (ENGINE=webkit too)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const ENGINE = process.env.ENGINE || 'chromium';
const b = await pw[ENGINE].launch(); const res = []; const check = (n, v, d) => res.push([n, !!v, d]);
const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { localStorage.setItem('sc_token', 'T'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, enabled: true, data: {}, clients: [], events: [] }) }));
await p.goto('http://localhost:' + (process.env.PORT || 8899) + '/slickchart.html'); await p.waitForTimeout(8000);
const cases = [['all clients', 'msg-all'], ['advertising', 'msg-all'], ['privacy', 'sec-privacy'], ['compliance', 'sec-privacy'], ['direct pay', 'pay-take'], ['venmo', 'pay-take'], ['payment', 'pay-take']];
for (const [q, id] of cases) check('searching "' + q + '" finds ' + id, await p.evaluate(([q, id]) => _searchHelp(q).some(a => a.id === id), [q, id]));
for (const id of ['msg-all', 'sec-privacy', 'pay-take']) {
  await p.evaluate(id => nav('help-article', id), id); await p.waitForTimeout(500);
  const t = await p.evaluate(() => document.getElementById('S') ? document.getElementById('S').innerText : document.body.innerText);
  const want = { 'msg-all': /Select all/, 'sec-privacy': /never sold/, 'pay-take': /Take payment/ }[id];
  check(id + ' opens with its text', want.test(t), t.slice(0, 300));
  check(id + ' has no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.screenshot({ path: '/tmp/claude-0/help-' + id + '-' + ENGINE + '.png' });
}
check('no page errors', !errs.length, errs.join(' | '));
await b.close();
const bad = res.filter(r => !r[1]); res.forEach(r => console.log((r[1] ? 'PASS ' : 'FAIL ') + r[0] + (r[1] ? '' : '  ' + String(r[2] || '').slice(0, 300))));
console.log(`\n${res.length - bad.length}/${res.length} passed (${ENGINE})`); process.exit(bad.length ? 1 : 0);
