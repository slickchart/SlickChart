// Visit room "Client vitals": a client with nothing recorded showed blank Skin type / Fitzpatrick and an
// empty red pill for Allergies (sweep area 10 round 3, 2026-11-28). Requires, at phone and computer:
//  A. nothing recorded: each row says "Not recorded", no empty badge
//  B. "Fragrance, retinol": red allergy badge with that text
//  C. "None known": plain text, no red badge
//  D. skin type and Fitzpatrick shown when set
//  E. no page errors
// PORT (default 8900) serves slickchart-vercel/. PW_ENGINE=webkit (or ENGINE) for Safari.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900, ENGINE = process.env.PW_ENGINE || process.env.ENGINE || 'chromium';
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch();
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
for (const [size, vp] of [['phone', { width: 390, height: 844 }], ['mac', { width: 1440, height: 900 }]]) {
  const ctx = await b.newContext({ viewport: vp, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await p.addInitScript(() => { localStorage.setItem('sc_token', 'eyJ1IjoicHJvdl9hc2gifQ.sig'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1'); });
  await p.route('**/api/**', r => { const u = r.request().url(); r.fulfill({ status: 200, contentType: 'application/json', body: u.includes('cloud-status') ? '{"enabled":true}' : u.includes('/api/store') ? '{"data":{}}' : '{"ok":true,"data":{},"clients":[],"events":[],"items":[]}' }); });
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(3000);
  const vit = rec => p.evaluate(rec => { CL.c_v = Object.assign({ id: 'c_v', name: 'Vita Client', email: 'v@example.com' }, rec); nav('room', 'c_v');
    return new Promise(r => setTimeout(() => { const box = [...document.querySelectorAll('div')].find(d => /^Client vitals$/i.test((d.textContent || '').trim()) && d.children.length === 0);
      const card = box && box.parentElement; if (!card) return r(null);
      r({ txt: card.innerText.replace(/\s+/g, ' '), nr: (card.innerText.match(/Not recorded/g) || []).length, badges: [...card.querySelectorAll('.bdg')].map(x => x.textContent.trim()) }); }, 500)); }, rec);
  let v = await vit({});
  ok(v && v.nr === 3 && v.badges.length === 0, `A ${size}: nothing recorded says so, no empty pill ` + JSON.stringify(v));
  v = await vit({ allergies: 'Fragrance, retinol' });
  ok(v && v.badges.length === 1 && v.badges[0] === 'Fragrance, retinol' && v.nr === 2, `B ${size}: real allergy is a red badge ` + JSON.stringify(v));
  v = await vit({ allergies: 'None known' });
  ok(v && v.badges.length === 0 && /None known/.test(v.txt), `C ${size}: "None known" is plain text ` + JSON.stringify(v));
  v = await vit({ skin: 'Combination', fitz: 'III', allergies: 'Latex' });
  ok(v && /Combination/.test(v.txt) && /III/.test(v.txt) && v.nr === 0, `D ${size}: set values shown ` + JSON.stringify(v));
  ok(!errs.length, `E ${size}: no page errors ` + errs.join(' | '));
  await ctx.close();
}
await b.close();
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
