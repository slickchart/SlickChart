// 390px layout of the provider consult screens (inbox, review, invite sheet, client chart consult card).
import { launch, page as provPage, mk } from './sweep2-ui-lib.mjs';
const T = mk();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cara Clientwithaverylongsurnameindeed', _uAt: 1, _token: 'T1', concerns: 'redness, congestion, sensitivity, pigmentation around the jaw' } }) };
const { b, ctx } = await launch();
const P = await provPage(ctx, server);
await P.p.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await P.p.waitForTimeout(3000);
const r = await P.p.evaluate(async () => {
  const W = () => { const over = Array.from(document.querySelectorAll('#S *')).filter(e => { const x = e.getBoundingClientRect(); return x.width > 0 && x.right > window.innerWidth + 1; }).slice(0, 3).map(e => e.tagName + '.' + (e.className || '') + ':' + Math.round(e.getBoundingClientRect().right)); return { sw: document.documentElement.scrollWidth, over }; };
  const out = {};
  vcInvites.c1 = { invited: true, submitted: true, reviewed: false, invitedAt: 1, kind: 'skin', title: 'Photo consult', photoLabels: ['Front', 'Left', 'Right'], askQuestions: ['A very long question about how long the redness has been there and whether it changes with the seasons?'] };
  vcSubmissions.c1 = { photos: [{ label: 'Front', src: 'data:image/png;base64,iVBORw0KGgo=' }], refs: null, goals: 'x'.repeat(400), answers: [{ q: 'Q', a: 'y'.repeat(500) }], date: 'Oct 1', kind: 'skin', routine: [{ name: 'Some very long product name that goes on and on and on', when: 'AM and PM' }] };
  nav('vc-inbox'); await new Promise(r => setTimeout(r, 200)); out.inbox = W();
  _vcBack = 'inbox'; nav('virtual-client', 'c1'); await new Promise(r => setTimeout(r, 300)); out.review = W();
  nav('client', 'c1'); await new Promise(r => setTimeout(r, 300)); out.chart = W();
  delete vcInvites.c1; inviteVirtualConsult('c1'); await new Promise(r => setTimeout(r, 300));
  const sh = document.getElementById('vc-type-sheet'); out.sheet = sh ? { w: Math.round(sh.getBoundingClientRect().width), sw: document.documentElement.scrollWidth } : 'no sheet';
  return out;
});
T.check('inbox fits 390', r.inbox.sw <= 390 && !r.inbox.over.length, JSON.stringify(r.inbox));
T.check('review fits 390', r.review.sw <= 390 && !r.review.over.length, JSON.stringify(r.review));
T.check('chart consult card fits 390', r.chart.sw <= 390 && !r.chart.over.length, JSON.stringify(r.chart));
T.check('invite sheet fits 390', typeof r.sheet === 'object' && r.sheet.w <= 390 && r.sheet.sw <= 390, JSON.stringify(r.sheet));
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close();
process.exit(T.done() ? 1 : 0);
