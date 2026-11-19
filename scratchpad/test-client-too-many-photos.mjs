// Client app: a form with more photos than the server takes (4 MB) says "remove a few photos" and keeps
// everything on screen, instead of sending, getting a 413, and saying "check your connection".
import { launch, mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
let fails = 0; const check = (m, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + JSON.stringify(d))); if (!c) fails++; };
const form = { formId: 'f1', title: 'Skin photos', assignedAt: 1000, qs: [{ id: 'q1', label: 'Photos of your skin', type: 'Photo upload', required: false }, { id: 'q2', label: 'Signature', type: 'Signature', required: true }] };
const opts = { records: { TOK: clientRecord('c1', 'Cara Client', { pendingForms: [form], checkinCfg: { steps: [] } }) }, log: [] };
await mockApi(page, opts);
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { window.__t = []; const o = showToast; window.showToast = function (m, k) { __t.push(m); return o(m, k); }; _fillFormId = 'f1'; nav('fill-form'); });
await page.waitForSelector('#ff-1');
await page.fill('#ff-1', 'Cara Client');
// 40 photos of ~130 KB each (what 900px phone photos come to) = ~5 MB
await page.evaluate(() => { const big = 'data:image/jpeg;base64,' + 'A'.repeat(130000); _ffPhotos[0] = Array.from({ length: 40 }, () => big); _ffRenderPhotos(0); });
const sendsBefore = opts.log.filter(e => e.path === '/api/client-submit').length;
await page.evaluate(() => _submitFillForm());
await page.waitForTimeout(1500);
let r = await page.evaluate(() => ({ t: __t.slice(), photos: (_ffPhotos[0] || []).length, onForm: !!document.getElementById('ff-photos-0'), pending: (activeProvider().pendingForms || []).length }));
const sends = opts.log.filter(e => e.path === '/api/client-submit').length - sendsBefore;
check('too many photos: says remove a few, nothing sent, photos and form kept', /Remove a few photos/.test(r.t.join('|')) && sends === 0 && r.photos === 40 && r.onForm && r.pending === 1, { ...r, sends });
// Remove most and send: goes through
await page.evaluate(() => { __t = []; _ffPhotos[0] = _ffPhotos[0].slice(0, 5); _ffRenderPhotos(0); _submitFillForm(); });
await page.waitForTimeout(2500);
const sends2 = opts.log.filter(e => e.path === '/api/client-submit').length - sendsBefore;
r = await page.evaluate(() => ({ t: __t.slice() }));
check('after removing photos it sends', sends2 === 1, { ...r, sends2 });
// A 413 from the server is not retried and not called a connection problem
const res = await page.evaluate(async () => { const of = window.fetch; let n = 0; window.fetch = async () => { n++; return new Response('{}', { status: 413 }); }; const x = await _clientSubmit('form', { a: 1 }); window.fetch = of; return { x, n }; });
check('a 413 answer is reported as too-large, once', res.x && res.x.error === 'too-large' && res.n === 1, res);
await browser.close();
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
