// 2026-10-20 homecare product picker: searchable over her catalogue, what the client BOUGHT on top
// (in-app checkouts + their Square orders), their plan next, custom steps from the same sheet, and
// the same builder on the session summary. Another client's purchases never show.
//   node scratchpad/test-hc-product-picker.mjs   (server on :8899 from slickchart-vercel/)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
console.log('engine', process.env.PW_ENGINE || 'chromium');
const exe = process.env.PW_ENGINE === 'webkit' ? undefined : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const engine = process.env.PW_ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const browser = await engine.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); } catch (e) {} });
let orderCalls = [];
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.route('**/api/square/orders*', r => { orderCalls.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, orders: [
  { createdAt: '2026-10-02T18:00:00Z', items: [{ name: 'Thermal Spring Water' }, { name: 'Signature Facial' }] } ] }) }); });
await page.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await page.waitForTimeout(2600);
await page.evaluate(() => {
  CL.aw = { name: 'Amber West', squareId: 'SQAW1', _hcAuto: ['thermal spring water'] };
  CL.bo = { name: 'Bea Other' };
  affiliateLinks.push(
    { id: 'p_spring', name: 'Thermal Spring Water', brand: 'Avène', active: true },
    { id: 'p_cica', name: 'Cica Balm', brand: 'Skin Lab', active: true },
    { id: 'p_mask', name: 'Clay Mask', brand: 'Skin Lab', active: true },
    { id: 'p_spf', name: 'Daily SPF', active: true },
    { id: 'p_other', name: 'Retinol Night Serum', active: true });
  clientRecs.aw = ['p_mask'];
  clientHomecare.aw = ['Thermal Spring Water', 'Daily SPF — every morning'];
  _payments.unshift({ id: 'pay_t1', clientId: 'aw', status: 'paid', date: '2026-10-15', items: [{ name: 'Cica Balm', kind: 'product' }, { name: 'Signature Facial', kind: 'service' }] });
  _payments.unshift({ id: 'pay_t2', clientId: 'bo', status: 'paid', date: '2026-10-16', items: [{ name: 'Retinol Night Serum', kind: 'product' }] });
  _clientTab = 'homecare'; nav('client', 'aw');
});
await page.waitForTimeout(1500);
let st = await page.evaluate(() => {
  const S = document.getElementById('S');
  const chips = Array.from(S.querySelectorAll('button')).filter(b => /^\+ /.test(b.textContent.trim())).map(b => b.textContent.trim());
  return { chips, hasBtn: /Add from your products/.test(S.textContent), hasCustom: !!document.querySelector('[id^="routine-add-"]') };
});
check('profile: "Add from your products" button', st.hasBtn);
check('profile: free-text custom step box still there', st.hasCustom);
check('chips: an in-app purchase not in the routine is suggested, marked bought', st.chips.some(c => /Cica Balm.*bought/.test(c)), JSON.stringify(st.chips));
check('chips: plan product suggested', st.chips.some(c => /Clay Mask/.test(c)), JSON.stringify(st.chips));
check('chips: another client\'s purchase is never suggested', !st.chips.some(c => /Retinol/.test(c)), JSON.stringify(st.chips));
check('chips: a product already in the routine is not suggested', !st.chips.some(c => /Daily SPF|Thermal/.test(c)), JSON.stringify(st.chips));

await page.evaluate(() => _hcPickerSheet('aw', 'profile'));
await page.waitForTimeout(700);
st = await page.evaluate(() => {
  const sh = document.getElementById('hc-picker');
  const order = Array.from(sh.querySelectorAll('[data-hc-aid]')).map(b => b.getAttribute('data-hc-aid'));
  return { txt: sh.innerText, order };
});
check('picker: "They bought" section first', /^[\s\S]*THEY BOUGHT|They bought/i.test(st.txt) && st.txt.search(/they bought/i) < st.txt.search(/on their plan/i), st.txt.replace(/\n/g, ' | ').slice(0, 300));
check('picker: bought items on top, newest first (in-app Oct 15, then Square Oct 2)', st.order[0] === 'p_cica' && st.order[1] === 'p_spring', JSON.stringify(st.order));
check('picker: plan product next', st.order[2] === 'p_mask', JSON.stringify(st.order));
check('picker: Square order read for this client only', orderCalls.length >= 1 && orderCalls.every(u => /customerId=SQAW1/.test(u)), JSON.stringify(orderCalls));
check('picker: a service on the same order is not a product', !/Signature Facial/.test(st.txt));
check('picker: another client\'s purchase is not marked bought', !/Retinol[^|]*\n?Bought/.test(st.txt) && st.order.indexOf('p_other') > 2, JSON.stringify(st.order));
check('picker: purchase date shown', /Bought Oct 15/.test(st.txt) && /Bought Oct 2/.test(st.txt), st.txt.replace(/\n/g, ' | '));
check('picker: custom step offered', /Type your own step/.test(st.txt));

// search
await page.fill('#hc-pick-q', 'mask'); await page.waitForTimeout(300);
st = await page.evaluate(() => Array.from(document.querySelectorAll('#hc-picker [data-hc-aid]')).map(b => b.getAttribute('data-hc-aid')));
check('search: "mask" finds only Clay Mask', JSON.stringify(st) === '["p_mask"]', JSON.stringify(st));
await page.fill('#hc-pick-q', 'skin lab'); await page.waitForTimeout(300);
st = await page.evaluate(() => Array.from(document.querySelectorAll('#hc-picker [data-hc-aid]')).map(b => b.getAttribute('data-hc-aid')));
check('search: matches brand too', st.length === 2 && st.includes('p_cica') && st.includes('p_mask'), JSON.stringify(st));
await page.fill('#hc-pick-q', 'Ice roller'); await page.waitForTimeout(300);
st = await page.evaluate(() => ({ txt: document.getElementById('hc-picker').innerText, focus: document.activeElement && document.activeElement.id }));
check('search: no match offers the typed words as their own step', /Add “Ice roller” as your own step/.test(st.txt), st.txt.replace(/\n/g, ' | '));
check('search: focus stays in the search box while typing', st.focus === 'hc-pick-q', st.focus);
await page.click('#hc-pick-custom'); await page.waitForTimeout(200);
st = await page.evaluate(() => ({ name: document.getElementById('hc-name').value, title: document.getElementById('hc-picker').innerText }));
check('custom: name carried into the step', st.name === 'Ice roller' && /Your own step/.test(st.title), JSON.stringify(st));
await page.fill('#hc-instr', 'Morning, 2 minutes');
await page.evaluate(() => _hcAddPicked('aw', 'profile')); await page.waitForTimeout(400);
st = await page.evaluate(() => clientHomecare.aw.slice());
check('custom: added as one plain line', st.includes('Ice roller — Morning, 2 minutes'), JSON.stringify(st));

// pick a bought product
await page.evaluate(() => _hcPickerSheet('aw', 'profile')); await page.waitForTimeout(300);
await page.click('#hc-picker [data-hc-aid="p_cica"]'); await page.waitForTimeout(200);
await page.fill('#hc-instr', 'Night, thin layer');
await page.evaluate(() => _hcAddPicked('aw', 'profile')); await page.waitForTimeout(400);
st = await page.evaluate(() => ({ hc: clientHomecare.aw.slice(), shapes: clientHomecare.aw.every(x => typeof x === 'string') }));
check('pick: bought product added with its instructions', st.hc.includes('Cica Balm — Night, thin layer'), JSON.stringify(st.hc));
check('homecare stays a list of strings', st.shapes);
st = await page.evaluate(() => Array.from(document.getElementById('S').querySelectorAll('button')).filter(b => /^\+ /.test(b.textContent.trim())).map(b => b.textContent.trim()));
check('chips: once added, the bought product is no longer suggested', !st.some(c => /Cica/.test(c)), JSON.stringify(st));

// session summary builder
await page.evaluate(() => { summaryToggles.homecare = true; nav('session-summary', 'aw'); });
await page.waitForTimeout(900);
st = await page.evaluate(() => { const S = document.getElementById('S'); return { btn: /Add from your products/.test(S.textContent), inp: !!document.getElementById('homecare-new-tag'), chips: Array.from(S.querySelectorAll('button')).filter(b => /^\+ /.test(b.textContent.trim())).map(b => b.textContent.trim()) }; });
check('summary: picker button present', st.btn, JSON.stringify(st));
check('summary: own-step box still present', st.inp);
check('summary: plan suggestion chip present', st.chips.some(c => /Clay Mask/.test(c)), JSON.stringify(st.chips));
await page.evaluate(() => _hcPickerSheet('aw', 'summary')); await page.waitForTimeout(300);
await page.click('#hc-picker [data-hc-aid="p_mask"]'); await page.waitForTimeout(200);
await page.fill('#hc-instr', 'Twice a week');
await page.evaluate(() => _hcAddPicked('aw', 'summary')); await page.waitForTimeout(500);
st = await page.evaluate(() => ({ hc: clientHomecare.aw.slice(), stillSummary: !!document.getElementById('homecare-new-tag') }));
check('summary: picked product added and the summary redrawn', st.hc.includes('Clay Mask — Twice a week') && st.stillSummary, JSON.stringify(st));

// a bare bought product line asks for THIS client's how-to and fills it in place
await page.evaluate(() => { clientRecs.aw = ['p_mask']; recReasons.aw = Object.assign(recReasons.aw || {}, {}); _clientTab = 'homecare'; nav('client', 'aw'); });
await page.waitForTimeout(800);
st = await page.evaluate(() => Array.from(document.querySelectorAll('#S [data-hc-howto]')).map(b => b.getAttribute('data-hc-howto') + ':' + b.textContent.trim()));
check('how-to: a bare product line asks how this client should use it', st.length === 1 && /^0:Add how Amber should use it/.test(st[0]), JSON.stringify(st));
await page.evaluate(() => _hcAddHowTo('aw', 0, 'profile')); await page.waitForTimeout(200);
st = await page.evaluate(() => ({ name: document.getElementById('hc-name').value, title: document.getElementById('hc-picker').innerText.split('\n')[0] }));
check('how-to: sheet opens on that product for this client', st.name === 'Thermal Spring Water' && /How should Amber use it/.test(st.title), JSON.stringify(st));
await page.fill('#hc-instr', 'Mist after cleansing, morning and night');
await page.click('#hc-picker .btnp'); await page.waitForTimeout(500);
st = await page.evaluate(() => ({ hc: clientHomecare.aw.slice(), prompts: document.querySelectorAll('#S [data-hc-howto]').length }));
check('how-to: replaces the line in place, nothing added', st.hc[0] === 'Thermal Spring Water — Mist after cleansing, morning and night' && st.hc.length === 5, JSON.stringify(st.hc));
check('how-to: prompt gone once written', st.prompts === 0, st.prompts);
check('how-to: another client is untouched', await page.evaluate(() => !(clientHomecare.bo || []).some(x => /Mist/.test(x))));
// moved meanwhile: still lands on the right line
await page.evaluate(() => { clientHomecare.aw.unshift('Daily SPF'); });
await page.evaluate(() => _hcStepSheet('aw', 'profile', 'Daily SPF', '', false, 3)); await page.fill('#hc-instr', 'Every morning');
await page.click('#hc-picker .btnp'); await page.waitForTimeout(400);
st = await page.evaluate(() => clientHomecare.aw.slice());
check('how-to: a stale position finds the same line instead of overwriting another', st[0] === 'Daily SPF — Every morning' && st[3] === 'Ice roller — Morning, 2 minutes', JSON.stringify(st));
await page.evaluate(() => { summaryToggles.homecare = true; clientHomecare.aw.push('Clay Mask'); nav('session-summary', 'aw'); });
await page.waitForTimeout(800);
st = await page.evaluate(() => document.querySelectorAll('#S [data-hc-howto]').length);
check('how-to: the summary asks too', st === 1, st);

// 390px overflow of the picker
await page.evaluate(() => _hcPickerSheet('aw', 'profile')); await page.waitForTimeout(300);
st = await page.evaluate(() => { const w = document.documentElement.clientWidth; const bad = []; document.querySelectorAll('#hc-picker *').forEach(el => { const b = el.getBoundingClientRect(); if (b.width && b.right > w + 1) bad.push(el.tagName + ':' + Math.round(b.right)); }); return bad; });
check('picker fits 390px', st.length === 0, JSON.stringify(st.slice(0, 5)));
await page.screenshot({ path: '/tmp/claude-0/-home-user-SlickChart/383780bf-1231-58bc-af23-6a35335591a8/scratchpad/hc-picker.png' });
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail !== '' ? '  — ' + x.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
