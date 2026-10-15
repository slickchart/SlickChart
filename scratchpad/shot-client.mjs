import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
await p.addInitScript(() => { localStorage.setItem('sc_client_theme', 'light'); });
await p.goto('http://localhost:8899/slickchart-client-demo.html'); await p.waitForTimeout(2000);
const dir = '/tmp/claude-0/-home-user-SlickChart/be0fe3b4-54df-5d41-bda7-89dbec145231/scratchpad/';
for (const s of ['home', 'journey']) { await p.evaluate(s => nav(s), s); await p.waitForTimeout(400); await p.screenshot({ path: dir + 'cl-' + s + '.png', fullPage: false }); }
await p.evaluate(() => { nav('journey'); const el = Array.from(document.querySelectorAll('button')).find(b => /photoRight=/.test(b.getAttribute('onclick') || '')); if (el) el.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(300);
await p.screenshot({ path: dir + 'cl-photos.png' });
await b.close();
