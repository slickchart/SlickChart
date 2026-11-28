// Progress Photos for a REAL client who never sent a photo consult showed "From photo consult · Skin
// analysis · sample" with three placeholder photos dated today (sweep area 9 round 3, 2026-11-28).
// Requires, at phone and iPad:
//  A. real client, no consult: no "From photo consult" section, no "· sample"
//  B. real client WITH a consult submission: the section shows, "submitted", her photos
//  C. a sample client (maya) still shows its sample consult illustration
//  D. no page errors
// PORT (default 8900) serves slickchart-vercel/. PW_ENGINE=webkit (or ENGINE) for Safari.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900, ENGINE = process.env.PW_ENGINE || process.env.ENGINE || 'chromium';
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch();
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const svg = c => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="${c}"/></svg>`);
for (const [size, vp] of [['phone', { width: 390, height: 844 }], ['ipad', { width: 1032, height: 1376 }]]) {
  const ctx = await b.newContext({ viewport: vp, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await p.addInitScript(() => { localStorage.setItem('sc_token', 'eyJ1IjoicHJvdl9hc2gifQ.sig'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1'); });
  await p.route('**/api/**', r => { const u = r.request().url(); r.fulfill({ status: 200, contentType: 'application/json', body: u.includes('cloud-status') ? '{"enabled":true}' : u.includes('/api/store') ? '{"data":{}}' : '{"ok":true,"data":{},"clients":[],"events":[],"items":[]}' }); });
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(3000);
  const view = id => p.evaluate(id => { nav('photos', id); return new Promise(r => setTimeout(() => { const t = document.body.innerText; r({ sec: /From photo consult/i.test(t), sample: /· sample/.test(t), submitted: /· submitted/.test(t), imgs: document.querySelectorAll('img[src^="data:image/svg"]').length }); }, 600)); }, id);
  await p.evaluate(() => { CL.c_r = { id: 'c_r', name: 'Real Client', email: 'r@example.com' }; delete vcSubmissions.c_r; });
  let st = await view('c_r');
  ok(!st.sec && !st.sample, `A ${size}: real client, no consult: no sample consult section ` + JSON.stringify(st));
  await p.evaluate(s => { CL.c_s = { id: 'c_s', name: 'Sent Consult', email: 's@example.com' }; vcSubmissions.c_s = { photos: [{ label: 'Front', src: s }, { label: 'Left side', src: s }], refs: null, goals: 'glow', answers: {}, date: 'Nov 20, 2026' }; }, svg('#c9a'));
  st = await view('c_s');
  ok(st.sec && st.submitted && !st.sample && st.imgs >= 2, `B ${size}: real client with a consult sees it ` + JSON.stringify(st));
  ok(!errs.length, `D ${size}: no page errors ` + errs.join(' | '));
  await ctx.close();
  // C on the public demo (built from the same source), which holds the sample clients
  const dctx = await b.newContext({ viewport: vp, serviceWorkers: 'block' }); const dp = await dctx.newPage();
  await dp.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await dp.goto('http://localhost:' + PORT + '/slickchart-provider-demo.html'); await dp.waitForTimeout(3000);
  const dst = await dp.evaluate(() => { if (!CL.maya) return 'no maya'; nav('photos', 'maya'); return new Promise(r => setTimeout(() => r({ sec: /From photo consult/i.test(document.body.innerText) }), 600)); });
  ok(dst.sec === true, `C ${size}: sample client (demo) keeps its consult illustration ` + JSON.stringify(dst));
  await dctx.close();
}
await b.close();
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
