// Every screen a provider opens, against the odd records real accounts hold: a client with no name, a
// null name, a numeric name, emoji only, a 6000-char note, null entries in lists, non-array summaries,
// a thread for a client that no longer exists. Any throw = a screen that will not open for her.
import { launch, page, mk } from './sweep2-ui-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const long = 'Very long note '.repeat(400);
const clients = {
  noname: { treatment: 'Facial' },
  nullname: { name: null, treatment: null },
  numname: { name: 12345, email: 5 },
  emoji: { name: '🌸💆‍♀️', treatment: '✨ glow ✨', notes: long, phone: '+1 (555) 000-0000 ext. 9' },
  quote: { name: "O'Brien \"Q\" <b>x</b>", treatment: "Dermaplane & 'peel'", summaries: 'oops' },
  nulls: { name: 'Nulls Person', summaries: [null, { date: null }], submittedForms: [null], pendingForms: [null], tags: null, allergies: null, photos: null },
  ok: { name: 'Normal Person', treatment: 'Facial' } };
const server = { sc_clients: JSON.stringify(clients),
  sc_session_summaries: JSON.stringify({ nulls: [null, { note: null }], emoji: [{ date: 'x', note: long, ts: 1 }], ok: 'notalist' }),
  sc_msgstore: JSON.stringify({ nulls: [null, { from: 'them' }], ghost: [{ from: 'them', text: 'hi', ts: 1 }], emoji: [{ from: 'me', text: long, ts: 2 }] }),
  sc_threads: JSON.stringify([null, { id: 'ghost', preview: 'hi' }, { id: 'nulls' }, { id: 'emoji', preview: null, ts: 'x' }]),
  sc_note_drafts: JSON.stringify({ nulls: { date: null, sections: null }, emoji: { sections: { s1: long } } }) };
const { p, errs } = await page(ctx, server);
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(7000);
T.check('boot with odd records: no page errors', !errs.length, errs.join(' | '));
const glob = ['home', 'clients', 'messages', 'calendar', 'more', 'forms', 'checkins', 'requests', 'merge-clients', 'flagged-intakes', 'today-appts', 'week-appts', 'week-clients', 'notifications-feed', 'vc-inbox', 'revenue', 'learn', 'shop'];
const per = ['client', 'brief', 'room', 'client-forms', 'rebook', 'notes', 'photos', 'session-summary', 'summary-history', 'chat', 'write-note', 'virtual-client', 'checkout'];
const fails = await p.evaluate(([glob, per, ids]) => { const out = [];
  const tryNav = (s, d) => { try { nav(s, d); } catch (e) { out.push(s + (d ? '(' + d + ')' : '') + ': ' + e.message); } };
  glob.forEach(s => tryNav(s));
  ids.forEach(id => per.forEach(s => tryNav(s, id)));
  ['ghost'].forEach(id => ['chat'].forEach(s => tryNav(s, id)));
  try { nav('client', 'emoji'); ['visit', 'notes', 'history', 'forms', 'photos', 'details'].forEach(tab => { try { _setClientTab('emoji', tab); } catch (e) { out.push('tab ' + tab + ': ' + e.message); } }); } catch (e) {}
  return out; }, [glob, per, Object.keys(clients)]);
await p.waitForTimeout(1500);
console.log(fails.join('\n')); T.check('every screen opens for odd records (no throw)', !fails.length, fails.length+' throws');
T.check('no async page errors while drawing', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
