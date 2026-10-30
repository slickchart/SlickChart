// Maddie (Feedback, 2026-10-30) round 2: "Is there a way to control what is in the invite client to app
// message?" and "is there a way to not send a client check in, or ... 100% customize the check in form?
// I don't change bed heat or music for clients". The invite can now be saved as her own wording for
// every client; the check-in has one switch for a short check-in with only her questions.
import { mk, launch, page, boot } from './sweep3-session-lib.mjs';
const T = mk();
const { b, ctx } = await launch();
const C = { c1: { id: 'c1', name: 'Faye Facial', _token: 'TOK_c1' }, c2: { id: 'c2', name: 'Gail Glow', _token: 'TOK_c2' } };
const P = await page(ctx, { sc_clients: JSON.stringify(C), sc_professions: JSON.stringify(['wax', 'esty']) });
await boot(P.p);
const r = await P.p.evaluate(async () => {
  const out = {};
  bizInfo.name = 'MNC Aesthetics';
  inviteClientToApp('c1');
  const ta = document.getElementById('invite-msg-text');
  out.before = ta.value;
  ta.value = 'Hey Faye! Welcome to MNC Aesthetics. Here is your app, see you soon!\n\n' + _clientAppLink('c1');
  document.getElementById('invite-save-default').click();
  out.saved = (msgTemplates.find(t => t.id === 'app_invite') || {}).text;
  document.getElementById('invite-sheet').remove();
  inviteClientToApp('c2');
  out.c2 = document.getElementById('invite-msg-text').value;
  out.link2 = _clientAppLink('c2');
  out.hasReset = [...document.querySelectorAll('#invite-sheet button')].some(x => /Back to the original/.test(x.textContent));
  window.confirmModal = (o, fn) => fn();
  [...document.querySelectorAll('#invite-sheet button')].find(x => /Back to the original/.test(x.textContent)).click();
  out.afterReset = document.getElementById('invite-msg-text').value;
  out.tomb = JSON.parse(localStorage.getItem('sc_deleted_msg_tmpls') || '{}');
  document.getElementById('invite-sheet').remove();
  // check-in: one switch for a short check-in
  nav('checkin-settings');
  out.hasSwitch = document.getElementById('S').textContent.includes('Ask about drinks, snacks, music and comfort');
  out.drinksShown = document.getElementById('S').textContent.includes('Drink options');
  _ciToggleComfort();
  out.comfortOff = checkinCfg.chairComfortOn === false;
  out.drinksHidden = !document.getElementById('S').textContent.includes('Drink options');
  out.questionsStill = document.getElementById('S').textContent.includes('Health & skin questions');
  _ciToggleComfort();
  out.backOn = checkinCfg.chairComfortOn !== false && document.getElementById('S').textContent.includes('Drink options');
  _ciToggleComfort();
  out.autoSendToggle = document.getElementById('S').textContent.includes('Send check-in automatically');
  return out;
});
T.check('invite: Save as default turns her edit into a template', r.saved === 'Hey {client}! Welcome to {business}. Here is your app, see you soon!', JSON.stringify(r.saved));
T.check('invite: the next client gets her wording with their own name and link', r.c2.startsWith('Hey Gail! Welcome to MNC Aesthetics.') && r.c2.endsWith(r.link2), r.c2);
T.check('invite: Back to the original restores the built-in message and records the reset', r.hasReset && /invited you to SlickChart/.test(r.afterReset) && r.tomb && r.tomb.app_invite, JSON.stringify({ a: r.afterReset, t: r.tomb }));
T.check('check-in: one switch for comfort questions, and the auto-send switch is there', r.hasSwitch && r.drinksShown && r.autoSendToggle, JSON.stringify(r));
T.check('check-in: switching it off hides drinks/music, keeps her questions; back on restores', r.comfortOff && r.drinksHidden && r.questionsStill && r.backOn, JSON.stringify(r));
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
