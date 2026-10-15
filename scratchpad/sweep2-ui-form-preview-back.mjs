// New form → Preview → Back. Preview saves the form under a new id, but Back re-opens the builder for
// 'new' (the blank template): the form she just built looks gone. Re-entering it and saving makes a
// second copy of the same form.
import { launch, page, mk } from './sweep2-ui-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const { p, errs } = await page(ctx, { sc_clients: '{}' });
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(6000);
const n0 = await p.evaluate(() => customForms.length);
await p.evaluate(() => { nav('forms'); nav('form-builder', 'new'); document.getElementById('form-name-input').value = 'Brow Lamination Consent'; });
// add a question the way the builder does
await p.evaluate(() => { const add = Array.from(document.querySelectorAll('button')).find(x => /add (a )?question/i.test(x.textContent)); if (add) add.click(); const l = document.querySelector('#qlist .q-label'); if (l) { l.value = 'Any eye allergies?'; l.dispatchEvent(new Event('input')); } });
await p.evaluate(() => saveFormBuilder('new', true));
const prevTitle = await p.evaluate(() => document.getElementById('tt').textContent);
await p.evaluate(() => navBack());
const back = await p.evaluate(() => ({ screen: _navCur.screen, data: _navCur.data, name: (document.getElementById('form-name-input') || {}).value, qs: document.querySelectorAll('#qlist .qrow').length }));
T.check('Back from Preview shows the form she built (not a blank builder)', back.name === 'Brow Lamination Consent', JSON.stringify({ prevTitle, back }));
// she re-types it because it looked lost, and saves
await p.evaluate(() => { document.getElementById('form-name-input').value = 'Brow Lamination Consent'; const add = Array.from(document.querySelectorAll('button')).find(x => /add (a )?question/i.test(x.textContent)); if (add) add.click(); const l = document.querySelector('#qlist .q-label'); if (l) l.value = 'Any eye allergies?'; saveFormBuilder('new'); });
const n1 = await p.evaluate(() => customForms.filter(f => f && f.name === 'Brow Lamination Consent').length);
T.check('only one copy of the form exists', n1 === 1, 'copies=' + n1 + ' before=' + n0);
T.check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
