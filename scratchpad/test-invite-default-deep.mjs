// "Use this for every client" — the edges. A saved invite must never carry ONE client's private link to
// every later client (CLAUDE.md §0.3), must turn accented first names into {client}, must fill odd names
// safely, keeps the first-visit wording separate, and must reach her other device (and a reset too).
import { mk, launch, page, boot } from './sweep3-session-lib.mjs';
const T = mk();
const { b, ctx } = await launch();
const C = { z: { id: 'z', name: 'Zoë Smith', _token: 'TOK_z' }, a: { id: 'a', name: 'Ann Lee', _token: 'TOK_a' },
  d: { id: 'd', name: 'Jo$& Ray', _token: 'TOK_d' }, r: { id: 'r', name: 'René Cruz', _token: 'TOK_r' },
  f: { id: 'f', name: 'Fay Form', _token: 'TOK_f', pendingForms: [{ formId: 'intake', assignedAt: 5 }] } };
const server = { sc_clients: JSON.stringify(C), sc_professions: JSON.stringify(['esty']) };
const P = await page(ctx, server);
await boot(P.p);
const r = await P.p.evaluate(async () => {
  const out = {}; bizInfo.name = 'Glow Room';
  const open = id => { const o = document.getElementById('invite-sheet'); if (o) o.remove(); inviteClientToApp(id); return document.getElementById('invite-msg-text'); };
  const save = () => document.getElementById('invite-save-default').click();
  // 1. accented name, link kept in the text, AND another client's link pasted in
  let ta = open('z');
  ta.value = 'Hi Zoë! Glow Room here. Your app: ' + _clientAppLink('z') + ' (old one: ' + _clientAppLink('a') + ')';
  save();
  out.t1 = (msgTemplates.find(t => t.id === 'app_invite') || {}).text;
  out.ann = open('a').value; out.annLink = _clientAppLink('a');
  out.odd = open('d').value;
  out.rene = open('r').value;
  // 2. first-visit wording is its own message
  out.form = open('f').value;
  ta = open('f'); ta.value = 'Hi Fay! Please do your forms before {when}. See you at Glow Room!'; save();
  out.t2 = (msgTemplates.find(t => t.id === 'app_invite_forms') || {}).text;
  out.annAfter = open('a').value;
  // 3. saving an empty message does nothing
  ta = open('a'); ta.value = '   '; save(); out.t3 = (msgTemplates.find(t => t.id === 'app_invite') || {}).text;
  document.getElementById('invite-sheet').remove();
  await new Promise(r => setTimeout(r, 1500));
  return out;
});
const tok = /[?&]c=|TOK_/;
T.check('saved message never keeps a client\'s private link (hers or one pasted in)', r.t1 && !tok.test(r.t1), JSON.stringify(r.t1));
T.check('accented first name becomes {client}', /^Hi \{client\}!/.test(r.t1 || ''), JSON.stringify(r.t1));
T.check('the next client gets their own name and ONLY their own link', r.ann.startsWith('Hi Ann! Glow Room here.') && r.ann.endsWith(r.annLink) && (r.ann.match(/TOK_/g) || []).length === 1, r.ann);
T.check('a name with $& in it is filled literally', r.odd.startsWith('Hi Jo$&! '), r.odd);
T.check('René works too', r.rene.startsWith('Hi René! '), r.rene);
T.check('a client with forms waiting still gets the first-visit wording', /2 quick forms/.test(r.form) && !/Glow Room here/.test(r.form), r.form);
T.check('first-visit wording saves separately and leaves the plain invite alone', r.t2 && /\{when\}|before/.test(r.t2) && r.annAfter.startsWith('Hi Ann! Glow Room here.'), JSON.stringify([r.t2, r.annAfter]));
T.check('saving an empty message changes nothing', r.t3 === r.t1, JSON.stringify(r.t3));
// 4. her other device (separate browser storage, same account)
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/Los_Angeles' });
const Q = await page(ctx2, server);
await boot(Q.p);
const q = await Q.p.evaluate(() => { bizInfo.name = 'Glow Room'; inviteClientToApp('a'); return document.getElementById('invite-msg-text').value; });
T.check('her other device uses the saved message', q.startsWith('Hi Ann! Glow Room here.'), q);
// 5. reset on device 1, device 2 boots again: back to the original, not resurrected
await P.p.evaluate(async () => { window.confirmModal = (o, fn) => fn(); inviteClientToApp('a');
  [...document.querySelectorAll('#invite-sheet button')].find(x => /Back to the original/.test(x.textContent)).click();
  document.getElementById('invite-sheet').remove(); await new Promise(r => setTimeout(r, 1500)); });
await Q.p.close();
const Q2 = await page(ctx2, server);
await boot(Q2.p);
const q2 = await Q2.p.evaluate(() => { inviteClientToApp('a'); return document.getElementById('invite-msg-text').value; });
T.check('a reset reaches her other device too (it does not come back)', /invited you to SlickChart/.test(q2), q2);
T.check('no page errors', !P.errs.length && !Q.errs.length && !Q2.errs.length, [...P.errs, ...Q.errs, ...Q2.errs].join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
