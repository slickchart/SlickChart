// A form filled BEFORE the 2026-11-26 question-id fix saved one answer for two questions that shared an
// id, and the provider saw that one answer under BOTH questions (Maddie, 2026-11-26: "My form answers are
// all messed up and not matching with the correct questions"). It is now shown once, with every label
// that shared it, and the saved record is untouched. Forms without a shared id draw exactly as before.
//   PORT=8899 node scratchpad/test-shared-id-answers.mjs   (serve slickchart-vercel on that port)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const PORT = process.env.PORT || 8899;
const ENGINE = process.env.ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const b = await ENGINE.launch(process.env.ENGINE === 'webkit' ? {} : {});
const res = []; const ok = (n, v, d) => res.push([n, !!v, d]);
const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 800 } }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); } });
await p.route('**/api/**', r => { const u = r.request().url();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(9000);
const sheet = () => p.evaluate(() => { const s = document.getElementById('subform-sheet'); const t = s ? s.innerText : ''; if (s) s.remove(); return t; });
const BROKEN = { formId: 'custom9', title: 'Facial intake', at: Date.now(), date: 'Today', signed: true, flagged: [],
  qs: [{ id: 'q20', label: 'Any allergies?', type: 'Short text' }, { id: 'q21', label: 'Skin type', type: 'Short text' }, { id: 'q20', label: 'Current medications', type: 'Short text' }, { id: 'q22', label: 'Signature', type: 'Signature' }],
  answers: { q20: 'Retin-A nightly', q21: 'Oily', q22: 'Jane' } };
const GOOD = { formId: 'custom8', title: 'Clean form', at: Date.now(), date: 'Today', signed: true, flagged: [],
  qs: [{ id: 'q20', label: 'Any allergies?', type: 'Short text' }, { id: 'q21', label: 'Skin type', type: 'Short text' }],
  answers: { q20: 'None', q21: 'Dry' } };
await p.evaluate(([x, y]) => { CL.tstc = { id: 'tstc', name: 'Test Client', submittedForms: [JSON.parse(JSON.stringify(x)), JSON.parse(JSON.stringify(y))] }; }, [BROKEN, GOOD]);
await p.evaluate(() => viewSubmittedForm('tstc', 0)); await p.waitForTimeout(300);
const t1 = await sheet();
ok('the shared answer shows once, not under each question', (t1.match(/Retin-A nightly/g) || []).length === 1, t1);
ok('both questions that shared it are named on that row', /Any allergies\? \/ Current medications \(one answer for both\)/i.test(t1), t1);
ok('the other answers stay under their own questions', /Skin type[\s\S]*Oily/i.test(t1), t1);
const saved = await p.evaluate(() => CL.tstc.submittedForms[0].qs.map(q => q.id + ':' + q.label).join('|'));
ok('the saved record itself is not changed', saved === 'q20:Any allergies?|q21:Skin type|q20:Current medications|q22:Signature', saved);
await p.evaluate(() => viewSubmittedForm('tstc', 1)); await p.waitForTimeout(300);
const t2 = await sheet();
ok('a form with no shared id draws as before', /Any allergies\?\s*None/i.test(t2) && /Skin type\s*Dry/i.test(t2) && !/one answer for/i.test(t2), t2);
ok('same in the provider helper: no shared id returns the very same list', await p.evaluate(() => { const q = [{ id: 'a' }, { id: 'b' }]; return _qsSharedOnce(q) === q; }));
const c = fs.readFileSync(new URL('../slickchart-vercel/slickchart-client.html', import.meta.url), 'utf8');
const pv = fs.readFileSync(new URL('../slickchart-vercel/slickchart.html', import.meta.url), 'utf8');
const body = s => { const i = s.indexOf('function _qsSharedOnce(qs){'); return s.slice(i, s.indexOf('\n}\n', i) + 3); };
ok('the client app uses the same rule', body(c) === body(pv) && body(c).length > 100);
ok('the client\'s own form records go through it', /\(_qsSharedOnce\(f\.qs\)\|\|\[\]\)\.forEach/.test(c));
ok('no page errors', !errs.length, errs.join(' | '));
await b.close();
let bad = 0; for (const [n, v, d] of res) { console.log((v ? 'PASS ' : 'FAIL ') + n + (v ? '' : '  ' + String(d || '').slice(0, 400))); if (!v) bad++; }
console.log(bad ? bad + ' FAILED' : 'ALL PASS'); process.exit(bad ? 1 : 0);
