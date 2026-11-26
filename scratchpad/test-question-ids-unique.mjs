// Every question in a form needs its own id: the client's answers are stored by id, so two questions
// sharing one put both answers under one key and they showed under the wrong questions (2026-11-26,
// Maddie: "My form answers are all messed up and not matching with the correct questions").
// The id counter restarted at 20 on every launch, so a question added on a later day could take the
// id of one added earlier to the same form.
//   PORT=8899 node scratchpad/test-question-ids-unique.mjs   (serve slickchart-vercel on that port)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const PORT = process.env.PORT || 8899;
const ENGINE = process.env.ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const b = await ENGINE.launch(process.env.ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const res = []; const ok = (n, v, d) => res.push([n, !!v, d]);
const FORMS = { tmpls: {
  custom1: { name: 'My intake', qs: [{ id: 'q20', label: 'Added on day one', type: 'Short text' }, { id: 'q21', label: 'Also day one', type: 'Long text' }] },
  custom2: { name: 'Old broken form', qs: [{ id: 'q20', label: 'First', type: 'Short text' }, { id: 'q21', label: 'Second', type: 'Short text' }, { id: 'q20', label: 'Third shares an id', type: 'Long text' }] } },
  custom: [{ id: 'custom1', name: 'My intake' }, { id: 'custom2', name: 'Old broken form' }] };
const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 800 } }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(f => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); localStorage.setItem('sc_forms', JSON.stringify(f)); } }, FORMS);
await p.route('**/api/**', r => { const u = r.request().url();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(9000);
const ids = fid => p.evaluate(f => (formTmpls[f] && formTmpls[f].qs || []).map(q => q.id), fid);
const has = await p.evaluate(() => !!formTmpls.custom1 && !!formTmpls.custom2);
ok('her two forms loaded', has);
const b2 = await ids('custom2');
ok('a saved form with two questions on one id gets its own id for the later one', new Set(b2).size === b2.length && b2[0] === 'q20' && b2[1] === 'q21' && b2[2] === 'q20_2', b2.join(','));
ok('the questions themselves are untouched', await p.evaluate(() => formTmpls.custom2.qs.map(q => q.label).join('|') === 'First|Second|Third shares an id'));
// a later day: fresh launch, she adds two questions to the day-one form
await p.evaluate(() => nav('form-builder', 'custom1')); await p.waitForTimeout(700);
await p.evaluate(() => { addFormQ('Short text'); addFormQ('Yes / No'); });
await p.evaluate(() => { const ls = [...document.querySelectorAll('#qlist .q-label')]; ls[ls.length - 2].value = 'Added on day two'; ls[ls.length - 1].value = 'Also day two'; });
await p.evaluate(() => saveFormBuilder('custom1', false, false)); await p.waitForTimeout(500);
const a1 = await ids('custom1');
ok('new questions never reuse an id already in the form', new Set(a1).size === a1.length && a1.length >= 4 && a1.slice(0, 2).join() === 'q20,q21' && a1.filter(i => i === 'q20' || i === 'q21').length === 2, a1.join(','));
ok('new questions never reuse an id from any other form', !a1.slice(2).some(i => b2.includes(i)), a1.join(','));
const stored = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('sc_forms')).tmpls.custom1.qs.map(q => q.id); } catch (e) { return []; } });
ok('the saved copy holds unique ids too', stored.length === a1.length && new Set(stored).size === stored.length, stored.join(','));
// what a client answers maps back to the right question
const map = await p.evaluate(() => { const qs = _orderedFormQs(formTmpls.custom1.qs); const ans = {}; qs.forEach((q, i) => { ans[q.id] = 'answer ' + i; }); return qs.filter(q => /day (one|two)/.test(q.label)).map(q => q.label + '=' + ans[q.id]); });
ok('each answer lands under its own question', map.join('|') === 'Added on day one=answer 0|Also day one=answer 1|Added on day two=answer 4|Also day two=answer 5', map.join('|'));
// the client page fixes a form that was already SENT with a shared id, the same way
const c = fs.readFileSync(new URL('../slickchart-vercel/slickchart-client.html', import.meta.url), 'utf8');
const pv = fs.readFileSync(new URL('../slickchart-vercel/slickchart.html', import.meta.url), 'utf8');
const grab = s => { const i = s.indexOf('function _uniqQIds(qs){'); return s.slice(i, s.indexOf('\n}\n', i) + 3); };
ok('the client page uses the same id rule as the provider app', grab(c) === grab(pv) && grab(c).length > 100);
let run = []; try { run = new Function(grab(c) + '; const qs=[{id:"q20"},{id:"q21"},{id:"q20"}]; const a=_uniqQIds(qs); const once=qs.map(q=>q.id).join(); const b=_uniqQIds(qs); return [a,once,b,qs.map(q=>q.id).join()];')(); } catch (e) { run = [String(e)]; }
ok('client: a shared id is split the same way, and a second pass changes nothing', run[0] === true && run[1] === 'q20,q21,q20_2' && run[2] === false && run[3] === run[1], JSON.stringify(run));
ok('client: the form is drawn through the dedupe', /function _orderedFormQs\(qs\)\{_uniqQIds\(qs\);/.test(c));
ok('no page errors', !errs.length, errs.join(' | '));
await b.close();
let bad = 0; for (const [n, v, d] of res) { console.log((v ? 'PASS ' : 'FAIL ') + n + (v ? '' : '  ' + (d || ''))); if (!v) bad++; }
console.log(bad ? bad + ' FAILED' : 'ALL PASS'); process.exit(bad ? 1 : 0);
