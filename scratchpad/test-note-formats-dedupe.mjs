// Visit room / notes sweep 2026-11-22 (area 10). Requires:
//  A. Note Format lists each format once (Brow record, PMU record, Lash record were listed twice:
//     a one-box placeholder 'browrecord' beside the real structured 'browRecord')
//  B. the Brow record offered is the structured one (Mapping · Design ...)
//  C. a provider whose saved choice is the placeholder ('browrecord') lands on the real Brow record
//  D. Session summary header has no dangling " ·" when the client has no treatment set
//  E. no page errors
// PORT (default 8900) serves slickchart-vercel/. PW_ENGINE=webkit for Safari.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900, ENGINE = process.env.PW_ENGINE || process.env.ENGINE || 'chromium';
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch();
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
async function open(saved, vp) {
  const ctx = await b.newContext({ viewport: vp, serviceWorkers: 'block' }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await p.addInitScript(s => { localStorage.setItem('sc_token', 'eyJ1IjoicHJvdl9hc2gifQ.sig'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1');
    localStorage.setItem('sc_bizinfo', JSON.stringify({ name: 'Glow', ownerName: 'Ashley Test' })); if (s) localStorage.setItem('sc_note_fmt', s); }, saved);
  await p.route('**/api/**', r => { const u = r.request().url(); r.fulfill({ status: 200, contentType: 'application/json', body: u.includes('cloud-status') ? '{"enabled":true}' : u.includes('/api/store') ? '{"data":{}}' : '{"ok":true,"data":{},"clients":[],"events":[],"items":[]}' }); });
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(3000);
  await p.evaluate(() => { CL.c_t = { id: 'c_t', name: 'Test Client', email: 't@example.com' }; });
  return { p, ctx, errs };
}
for (const [size, vp] of [['phone', { width: 390, height: 844 }], ['mac', { width: 1440, height: 900 }]]) {
  let { p, ctx, errs } = await open(null, vp);
  await p.evaluate(() => nav('note-formats', 'c_t')); await p.waitForTimeout(600);
  const names = await p.evaluate(() => { const box = [...document.querySelectorAll('.sh h2')].find(h => /Built-in formats/i.test(h.textContent)); const out = []; let el = box && box.closest('.sh').nextElementSibling;
    while (el && !el.classList.contains('sh')) { const n = el.querySelector('span[style*="font-weight:500"]'); if (n) out.push([n.textContent.trim(), el.innerText.replace(/\s+/g, ' ').trim()]); el = el.nextElementSibling; } return out; });
  const ns = names.map(n => n[0]);
  ok(ns.length > 4 && new Set(ns).size === ns.length, `A ${size}: every format once ` + JSON.stringify(ns));
  const brow = names.find(n => n[0] === 'Brow record');
  ok(brow && /Mapping/.test(brow[1]), `B ${size}: the structured Brow record is offered ` + JSON.stringify(brow));
  await p.evaluate(() => nav('session-summary', 'c_t')); await p.waitForTimeout(800);
  const dl = await p.evaluate(() => { const h = [...document.querySelectorAll('div')].find(d => /^Your session summary/.test(d.textContent.trim()) && d.children.length === 0); return h && h.nextElementSibling ? h.nextElementSibling.textContent.trim() : null; });
  ok(dl && !/·\s*$/.test(dl), `D ${size}: summary date line has no dangling dot: ` + JSON.stringify(dl));
  ok(!errs.length, `E ${size}: no page errors ` + errs.join(' | '));
  await ctx.close();
  ({ p, ctx, errs } = await open('browrecord', vp));
  const act = await p.evaluate(() => activeNoteTemplate);
  ok(act === 'browRecord', `C ${size}: saved placeholder choice opens the real Brow record (${act})`);
  await ctx.close();
}
await b.close();
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
