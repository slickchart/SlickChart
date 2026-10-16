// "Make client-friendly" / "Draft from my notes" await the AI (seconds), then call
// renderSessionSummary(id) unconditionally. If she has moved on — to the NEXT client's room — the
// screen is replaced by the PREVIOUS client's summary while the app still thinks it is on B's room.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ a: { name: 'Amy Adams', treatment: 'Facial', _token: 'TA' }, bb: { name: 'Bea Brown', treatment: 'Peel', _token: 'TB' } }) };
const P = await page(ctx, server); await boot(P.p);
const r = await P.p.evaluate(async () => {
  aiEnabled = true;
  window._aiComplete = async () => { await new Promise(r => setTimeout(r, 1500)); return 'Your skin looked great today, Amy.'; };
  summaryNoteDraft.a = 'Raw notes about Amy';
  nav('session-summary', 'a');
  const btn = document.getElementById('ai-friendly-btn');
  const pr = aiClientFriendly('a', btn);
  nav('room', 'bb');                       // next client walks in
  await pr; await new Promise(r => setTimeout(r, 100));
  return { nav: _navCur.screen + ':' + _navCur.data, shows: S.innerText.slice(0, 120) };
});
T.check('AI rewrite finishing after she moved to the next client does not replace that screen', !/Amy/.test(r.shows), JSON.stringify(r));
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
