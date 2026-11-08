// Home, Clients and More drawn with ALL outside servers blocked: proves the icons and text fonts come
// from this site. Prints any request that tried to leave and how many icons drew blank.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900, OUT = process.argv[2] || '/tmp/claude-0/home.png';
const ENGINE = process.env.ENGINE || 'chromium';
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
const outside = [];
await p.addInitScript(() => { localStorage.setItem('sc_token', 'T'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); localStorage.setItem('sc_bizinfo', JSON.stringify({ name: 'Glow', ownerName: 'Ashley' })); });
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[],"events":[],"appointments":[]}' }));
await p.route(/^(?!http:\/\/localhost:\d+).*/, r => { outside.push(r.request().url().slice(0, 90)); return r.abort(); });
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(3500);
const res = {};
for (const scr of ['home', 'clients', 'more']) {
  await p.evaluate(s => nav(s), scr); await p.waitForTimeout(600);
  res[scr] = await p.evaluate(async () => { await document.fonts.ready; const els = [...document.querySelectorAll('i.ti')].filter(e => e.offsetParent);
    const blank = els.filter(e => { const c = getComputedStyle(e, '::before').content; return !c || c === 'none' || c === 'normal'; }).map(e => e.className);
    return { icons: els.length, blank: blank.slice(0, 8), tabler: document.fonts.check('16px tabler-icons'), dm: document.fonts.check('16px "DM Sans"'), bodyFont: getComputedStyle(document.body).fontFamily.slice(0, 40) }; });
  if (scr === 'home') await p.screenshot({ path: OUT });
}
console.log(JSON.stringify(res)); console.log('outside requests:', outside.length ? outside : 'none');
await b.close();
