// Progress Photos for a REAL client (sweep 2026-11-22, area 9 photos): under her real before/after photos
// the screen drew the sample "Compare sessions" block (two empty silhouettes, "Photo consult"), a made-up
// session timeline and "1 session"; and the picked "Before" chip was white on pale green (unreadable).
// Requires:
//  A. real client, 3 photos on 2 days: no sample silhouettes/timeline; Compare shows HER before and after images
//  B. session count = days with photos (2)
//  C. picking another photo on the right redraws with it
//  D. one photo only: no Compare block, nothing empty drawn
//  E. a sample client (maya) still gets its sample compare + timeline
//  F. selected Before/After chips have readable text (contrast >= 4.5)
//  G. no page errors. Saves /tmp/claude-0/pcr-<engine>-<size>.png
// PORT (default 8900) serves slickchart-vercel/. PW_ENGINE=webkit for Safari.
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
  const day = 86400000, now = Date.now();
  await p.evaluate(([a, bb, c, now, day]) => {
    CL.c_t = { id: 'c_t', name: 'Test Client', email: 't@example.com' };
    capturedPhotos.c_t = [{ url: a, ts: now - 30 * day, phase: 'before', angle: 'Front', pid: 'ph_a' },
      { url: bb, ts: now - 1000, phase: 'after', angle: 'Front', pid: 'ph_b' },
      { url: c, ts: now - 500, phase: 'after', angle: 'Front', pid: 'ph_c' }];
    nav('photos', 'c_t');
  }, [svg('#c9a'), svg('#9ac'), svg('#ac9'), now, day]);
  await p.waitForTimeout(700);
  let st = await p.evaluate(() => { const t = document.body.innerText; const imgs = [...document.querySelectorAll('img[alt$="photo, " i], img[alt*=" photo, "]')].map(i => i.alt);
    const lum = c => { const m = c.match(/[\d.]+/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * m[0] + .7152 * m[1] + .0722 * m[2]; };
    const cr = el => { const s = getComputedStyle(el); const a = lum(s.color), b = lum(s.backgroundColor); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
    const chips = [...document.querySelectorAll('button')].filter(x => /^(Before|After)$/.test(x.textContent.trim()) && x.style.fontWeight === '700').map(x => +cr(x).toFixed(2));
    return { silh: /compare sessions/i.test(t) ? 1 : 0, consultCompare: /Photo consult · Client-submitted|Session timeline|Add photos for a new session/.test(t), sess: (t.match(/(\d+) sessions?/) || [])[1], imgs, chips }; });
  ok(!st.silh && !st.consultCompare && st.imgs.length === 2 && /Before/.test(st.imgs[0]) && /After/.test(st.imgs[1]), `A ${size}: her own photos compared, no sample blocks ` + JSON.stringify(st));
  ok(st.sess === '2', `B ${size}: 2 sessions (${st.sess})`);
  ok(st.chips.length === 3 && st.chips.every(c => c >= 4.5), `F ${size}: picked chips readable ` + JSON.stringify(st.chips));
  await p.screenshot({ path: `/tmp/claude-0/pcr-${ENGINE}-${size}.png`, fullPage: true });
  await p.selectOption('select[aria-label="Choose right photo"]', 'ph_b'); await p.waitForTimeout(400);
  st = await p.evaluate(() => { const s = [...document.querySelectorAll('img[alt*=" photo, "]')].map(i => i.src); return { n: s.length, right: s[1] === capturedPhotos.c_t[1].url }; });
  ok(st.n === 2 && st.right, `C ${size}: right picker redraws ` + JSON.stringify(st));
  st = await p.evaluate(() => { capturedPhotos.c_t = capturedPhotos.c_t.slice(0, 1); nav('photos', 'c_t'); return new Promise(r => setTimeout(() => r({ cmp: !!document.querySelector('select[aria-label="Choose right photo"]'), silh: /compare sessions/i.test(document.body.innerText) }), 400)); });
  ok(!st.cmp && !st.silh, `D ${size}: one photo, no compare drawn ` + JSON.stringify(st));
  st = await p.evaluate(() => { if (!CL.maya) return 'no maya'; nav('photos', 'maya'); return new Promise(r => setTimeout(() => r({ t: /Session timeline/i.test(document.body.innerText), sel: !!document.querySelector('select[aria-label="Choose before photo"]') }), 400)); });
  ok(st === 'no maya' || (st.t && st.sel), `E ${size}: sample client keeps its sample compare ` + JSON.stringify(st));
  ok(!errs.length, `G ${size}: no page errors ` + errs.join(' | '));
  await ctx.close();
}
await b.close();
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
