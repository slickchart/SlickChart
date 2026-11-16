// test-booking-qr: provider feedback 2026-11-16 wanted a QR code to her booking site for business
// cards, and a way for a friend to pass the link on. Checks the QR decodes back to HER link, the save
// button produces a PNG, and the public booking page has a working "send to a friend".
//   node scratchpad/test-booking-qr.mjs  (needs :8899; ENGINE=webkit for Safari; decoder from /tmp/qrt)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { createRequire } from 'module';
const req = createRequire('/tmp/qrt/');
const jsQR = req('jsqr'); const { PNG } = req('pngjs');
const ENGINE = process.env.ENGINE || 'chromium';
const results = []; const check = (n, p, d) => results.push({ n, p: !!p, d: d || '' });
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 860 }, serviceWorkers: 'block' });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const T = Buffer.from(JSON.stringify({ u: 'prov_R', sid: 's_R' })).toString('base64url') + '.sig';
await ctx.route('**/api/**', r => { const u = r.request().url();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sc_hide_sample: '1', sc_onboarded: '1' } }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.addInitScript(([T]) => { localStorage.setItem('sc_token', T); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); }, [T]);
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(9000);
await p.evaluate(() => { _consultSlug = 'rose-glow'; bookCfg.on = true; nav('booking-link'); }); await p.waitForTimeout(500);
check('booking link screen has the QR button', await p.locator('button:has-text("QR code for business cards")').count() === 1);
await p.click('button:has-text("QR code for business cards")'); await p.waitForTimeout(1500);
check('QR sheet opens', await p.locator('#bookqr-sheet').count() === 1);
const src = await p.getAttribute('#bookqr-img', 'src');
check('QR is a PNG', /^data:image\/png;base64,/.test(src || ''));
const png = PNG.sync.read(Buffer.from(src.split(',')[1], 'base64'));
check('QR is print size (>=1000px)', png.width >= 1000, png.width + 'px');
const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
const want = await p.evaluate(() => _bookFull());
check('QR decodes to her own booking link', code && code.data === want, (code && code.data) + ' vs ' + want);
let saved = null; await p.evaluate(() => { window._savePhoto = (u, n) => { window.__saved = [String(u).slice(0, 22), n]; }; });
await p.click('#bookqr-sheet button:has-text("Save the QR code")'); saved = await p.evaluate(() => window.__saved);
check('Save hands over the PNG', saved && saved[0] === 'data:image/png;base64,' && saved[1] === 'booking-qr-code.png', JSON.stringify(saved));
await p.evaluate(() => { document.getElementById('bookqr-sheet').remove(); bookCfg.on = false; _bookQrSheet(); }); await p.waitForTimeout(800);
check('warns when the link is turned off', (await p.locator('#bookqr-sheet').innerText()).includes('turned off'));
await p.evaluate(() => { document.getElementById('bookqr-sheet').remove(); _consultSlug = ''; window.__slug = 0; window._setConsultSlug = () => { window.__slug = 1; }; _bookQrSheet(); });
check('no link name yet: asks her to pick one instead', await p.evaluate(() => window.__slug === 1 && !document.getElementById('bookqr-sheet')));

// Public booking page: render it through the real handler with a stubbed db.
const page = await ctx.newPage(); page.on('pageerror', e => errs.push('book: ' + e.message));
const { execSync } = await import('child_process');
const html = execSync('node scratchpad/render-book-page.mjs', { encoding: 'utf8' });
await ctx.route('http://localhost:8899/book/rose-glow', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
await page.goto('http://localhost:8899/book/rose-glow'); await page.waitForTimeout(500);
check('booking page has "Send this page to a friend"', await page.locator('button.share').count() === 1);
await page.evaluate(() => { window.__shared = null; navigator.share = (o) => { window.__shared = o; return Promise.resolve(); }; });
await page.click('button.share');
const sh = await page.evaluate(() => window.__shared);
check('share sends the public booking page address', sh && sh.url === 'http://localhost:8899/book/rose-glow' && /Book with/.test(sh.title), JSON.stringify(sh));
check('no page errors', !errs.length, errs.join(' | '));
let bad = 0; for (const x of results) { if (!x.p) bad++; console.log((x.p ? 'PASS ' : 'FAIL ') + x.n + (!x.p && x.d ? '  — ' + x.d : '')); }
console.log(`\n[${ENGINE}] ${results.length - bad}/${results.length} passed`); await b.close(); process.exit(bad ? 1 : 0);
