// 390px / 320px layout: client submit screen for a product consult, provider invite sheet with the product type.
import { launch, provider, check, finish } from './sweep3-pc-lib.mjs';
import { mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const prov = await provider(browser);
const sheet = await prov.evaluate(() => {
  CL.aw = { name: 'Ashley Watson', concerns: '' };
  vcTypes.push({ id: 'my-prod', title: 'Product consult', kind: 'product', icon: 'ti-flask', photoLabels: [], askQuestions: ['What do you use now?', 'Any reactions?'] });
  inviteVirtualConsult('aw');
  const r = Array.from(document.querySelectorAll('#vc-type-sheet input[name=vc-type]')).find(x => x.value === 'my-prod');
  if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
  const t = document.getElementById('vc-type-sheet').innerText;
  const sw = document.documentElement.scrollWidth;
  return { head: t.split('\n').slice(0, 8).join(' | '), sw, mentionsQuestions: /question/i.test(t) };
});
check('invite sheet: heading still says "Photo consult for X" with the product type chosen', /Photo consult for/.test(sheet.head), sheet.head);
check('invite sheet: "will be asked for" does not mention the questions they will get', !sheet.mentionsQuestions, sheet);
for (const w of [390, 320]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: 800 } })).newPage();
  await mockApi(page, { records: { TOK: clientRecord('aw', 'Ashley Watson', { vcInvite: { kind: 'product', title: 'Product consult', invitedAt: 5, photoLabels: [], askQuestions: ['What are you using now, morning and night? Include your sunscreen.', 'Q2 a very long question about reactions and allergies and things that sting or burn'], routine: true },
    products: [{ name: 'A really very long product name that goes on and on Thermal Spring Water', brand: 'Brand', why: 'Because your skin is reactive', site: 'https://x.test' }] }) } });
  await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  const L = await page.evaluate(() => { const out = {}; for (const s of ['virtual-submit', 'home']) { nav(s); out[s] = { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, wide: Array.from(document.querySelectorAll('#S *')).filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > document.documentElement.clientWidth + 1; }).slice(0, 3).map(e => e.tagName + ' ' + (e.className || '') + ' ' + Math.round(e.getBoundingClientRect().right)) }; } return out; });
  check(w + 'px client: horizontal overflow on submit/home', Object.values(L).some(x => x.sw > x.cw || x.wide.length), L);
}
await browser.close(); finish();
