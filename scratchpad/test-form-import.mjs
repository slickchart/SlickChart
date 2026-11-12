// Form builder -> "Have this form already? Upload": a provider's own PDF (or a photo) becomes form
// questions for her to check and save (Jennie, 2026-11-12). /api/ai is mocked with a transcription in
// the line format the prompt asks for, including the messy bits a model can produce.
//   PORT=8899 node scratchpad/test-form-import.mjs   (serve slickchart-vercel on that port)
//   PDF=<a small pdf>  (optional; a tiny one is generated otherwise)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs'; import os from 'os'; import path from 'path';
const PORT = process.env.PORT || 8899;
const ENGINE = process.env.ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const b = await ENGINE.launch(process.env.ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fimp-'));
const pdf = process.env.PDF || path.join(tmp, 'form.pdf');
if (!process.env.PDF) fs.writeFileSync(pdf, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const big = path.join(tmp, 'big.pdf'); fs.writeFileSync(big, Buffer.alloc(3 * 1024 * 1024, 65));
const png = path.join(tmp, 'photo.png');
fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const REPLY = [
  '```',
  'NAME|Laser Hair Removal Client Intake & Informed Consent',
  'Q|text|1|Full legal name',
  'Q|date|0|Date of birth',
  'Q|text|0|Phone number',
  'Q|multi|0|Which area(s) would you like treated? Select all that apply.|Upper lip;;Chin;;Sideburns;;Full face;;Other',
  'Q|yesno|0|Previous laser hair removal?',
  'Q|long|0|If yes, provide dates, areas treated, device if known, and any reactions',
  'Q|yesno|1|Do you have diabetes?',
  '',
  'Q|sign|1|Client signature',
  'Q|yesno|1|I have read and understand: Possible side effects include temporary redness, swelling; and the need for multiple sessions.',
  'Q|multi|1|Please read each statement and check to confirm:|I confirm that the information I have provided is accurate and complete.;;I understand that results vary.',
  'Q|single|0|Pick one with no choices',
  'Q|weird|0|An unknown type becomes short text',
  'Q|sign|1|A second signature is dropped',
  'not a question line',
  'Q|date|1|Date',
  '```'
].join('\n');
const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 800 } }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
let aiCalls = []; let aiMode = 'ok';
await p.route('**/api/**', async r => { const u = r.request().url();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.endsWith('/api/ai')) {
    let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    aiCalls.push(body);
    if (aiMode === '413') return r.fulfill({ status: 413, contentType: 'application/json', body: '{"error":"Request too large."}' });
    if (aiMode === 'empty') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, content: [{ type: 'text', text: 'Sorry, nothing here.' }] }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, content: [{ type: 'text', text: REPLY }] }) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(9000);
const toasts = []; await p.exposeFunction('__toast', t => toasts.push(t));
await p.evaluate(() => { const o = window.proToast; window.proToast = function (t) { try { window.__toast(String(t)); } catch (e) {} return o && o.apply(this, arguments); }; aiEnabled = true; nav('form-builder', 'new'); });
await p.waitForTimeout(700);
const res = []; const ok = (n, v, d) => res.push([n, !!v, d]);
ok('the Upload card shows in a new form', await p.$('#fb-import-btn'));
const rows = () => p.evaluate(() => [...document.querySelectorAll('#qlist .qrow')].map(r => ({ l: r.querySelector('.q-label').value, t: r.querySelector('.q-type').value, req: r.querySelector('.q-req').checked, o: (r.querySelector('.q-options') || {}).value || '' })));
const waitAi = async n => { for (let i = 0; i < 40 && aiCalls.length < n; i++) await p.waitForTimeout(150); await p.waitForTimeout(500); };

// 1) a PDF on an empty new form
await p.setInputFiles('#fb-import-file', pdf); await waitAi(1);
const c1 = aiCalls[0] || {}; const blk = ((c1.messages || [])[0] || {}).content || [];
ok('sends the PDF as one document block', blk[0] && blk[0].type === 'document' && blk[0].source.media_type === 'application/pdf' && blk[0].source.data.length > 10, JSON.stringify(blk[0] && blk[0].source && blk[0].source.media_type));
ok('asks for room to type a whole form, on the fast model', c1.max_tokens === 8000 && c1.model === 'claude-haiku-4-5-20251001', c1.max_tokens + ' ' + c1.model);
let r1 = await rows();
ok('makes one row per question, junk lines skipped', r1.length === 13, r1.length + ' ' + JSON.stringify(r1.map(x => x.l.slice(0, 20))));
ok('fills the form name', (await p.inputValue('#form-name-input')) === 'Laser Hair Removal Client Intake & Informed Consent');
const by = l => r1.find(x => x.l.startsWith(l)) || {};
ok('types map right', by('Date of birth').t === 'Date' && by('Do you have diabetes').t === 'Yes / No' && by('If yes').t === 'Long text' && by('An unknown').t === 'Short text', JSON.stringify(r1.map(x => x.t)));
ok('tick-all lists keep every choice', by('Which area').t === 'Multiple choice' && by('Which area').o.split('\n').length === 5 && /Other/.test(by('Which area').o), by('Which area').o);
ok('consent statements stay word for word, required', by('Please read each').req && /accurate and complete\./.test(by('Please read each').o));
ok('a choice question with no choices becomes short text', by('Pick one').t === 'Short text');
ok('required flags carried', by('Full legal name').req && by('Do you have diabetes').req && !by('Phone number').req);
ok('one signature, and it is last', r1.filter(x => x.t === 'Signature').length === 1 && r1[r1.length - 1].t === 'Signature' && r1[r1.length - 1].l === 'Client signature', JSON.stringify(r1.slice(-2)));
ok('nothing saved before she taps Save', await p.evaluate(() => !Object.values(formTmpls).some(f => f && f.name === 'Laser Hair Removal Client Intake & Informed Consent')));
ok('tells her to check and save', toasts.some(t => /Added 13 questions\. Check them, then tap Save form/.test(t)), toasts.join(' | '));
ok('no sideways scroll at phone width', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await p.screenshot({ path: process.env.SHOT || path.join(tmp, 'form-import.png'), fullPage: false });

// 2) Save stores it like any typed form
await p.evaluate(() => saveFormBuilder('new')); await p.waitForTimeout(800);
const saved = await p.evaluate(() => { const k = Object.keys(formTmpls).find(k => formTmpls[k] && formTmpls[k].name === 'Laser Hair Removal Client Intake & Informed Consent'); return k ? { k, n: formTmpls[k].qs.length, last: formTmpls[k].qs[formTmpls[k].qs.length - 1].type, multi: (formTmpls[k].qs.find(q => q.type === 'Multiple choice') || {}).options } : null; });
ok('Save form stores all 13, signature last, choices kept', saved && saved.n === 13 && saved.last === 'Signature' && saved.multi && saved.multi.length === 5, JSON.stringify(saved));

// 3) uploading onto a form that already has questions: Cancel adds below, keeps ONE signature last
await p.evaluate(k => nav('form-builder', k), saved && saved.k); await p.waitForTimeout(600);
p.once('dialog', d => d.dismiss());
await p.setInputFiles('#fb-import-file', pdf); await waitAi(2);
let r2 = await rows();
ok('Cancel adds the new ones below, still one signature, last', r2.length === 25 && r2.filter(x => x.t === 'Signature').length === 1 && r2[r2.length - 1].t === 'Signature', r2.length + ' sigs ' + r2.filter(x => x.t === 'Signature').length);
// OK replaces
p.once('dialog', d => d.accept());
await p.setInputFiles('#fb-import-file', pdf); await waitAi(3);
let r3 = await rows();
ok('OK replaces them', r3.length === 13, String(r3.length));

// 4) a photo goes as a shrunk JPEG image block
await p.evaluate(() => nav('form-builder', 'new')); await p.waitForTimeout(500);
await p.setInputFiles('#fb-import-file', png); await waitAi(4);
const blk4 = (((aiCalls[3] || {}).messages || [])[0] || {}).content || [];
ok('a photo is sent as a JPEG image', blk4[0] && blk4[0].type === 'image' && blk4[0].source.media_type === 'image/jpeg', JSON.stringify(blk4[0] && blk4[0].type));

// 5) too big, AI off, server refusal, nothing found
await p.evaluate(() => nav('form-builder', 'new')); await p.waitForTimeout(400);
const before = aiCalls.length; toasts.length = 0;
await p.setInputFiles('#fb-import-file', big); await p.waitForTimeout(800);
ok('a PDF over 2.5 MB is refused before sending', aiCalls.length === before && toasts.some(t => /too big/.test(t)), toasts.join('|'));
await p.evaluate(() => { aiEnabled = false; }); toasts.length = 0;
await p.click('#fb-import-btn'); await p.waitForTimeout(300);
ok('with AI off it says where to turn it on', toasts.some(t => /Turn on AI features/.test(t)) && aiCalls.length === before, toasts.join('|'));
await p.evaluate(() => { aiEnabled = true; });
aiMode = '413'; toasts.length = 0;
await p.setInputFiles('#fb-import-file', pdf); await waitAi(before + 1);
ok('a server refusal is a plain message, no rows added', toasts.some(t => /too big/.test(t)) && (await rows()).length === 0, toasts.join('|'));
aiMode = 'empty'; toasts.length = 0;
await p.setInputFiles('#fb-import-file', pdf); await waitAi(before + 2);
ok('a reply with no questions says so', toasts.some(t => /couldn.t find any questions/.test(t)) && (await rows()).length === 0, toasts.join('|'));
ok('the button is usable again', await p.$eval('#fb-import-btn', el => !el.disabled && /Upload/.test(el.textContent)));
ok('no page errors', !errs.length, errs.join('|'));
await b.close(); let all = true; for (const [n, v, d] of res) { console.log((v ? 'PASS ' : 'FAIL ') + n + (v ? '' : ' :: ' + (d || ''))); all = all && v; } console.log(all ? 'ALL PASS' : 'FAILURES'); process.exit(all ? 0 : 1);
