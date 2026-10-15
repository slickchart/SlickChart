// Dictating a second voice note appends with a literal "<br>" and HTML-escapes the words ("&lt;").
// The note editor is a <textarea>, so she sees "<br>" in her note, and saving it puts "<br>" and
// "&lt;" into the session record and (via Save & send) the client-facing summary text. Also the
// in-place mutation leaves the draft's ts unchanged, so the newer dictation cannot win a merge.
import { launch, page, mk } from './sweep2-ui-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const { p, errs } = await page(ctx, { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial' } }) });
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(6000);
const r = await p.evaluate(async () => { activeNoteTemplate = 'soap'; _voiceClientId = 'c1';
  _voiceSave('First dictation'); const ts1 = providerNoteDrafts.c1.ts; await new Promise(z => setTimeout(z, 20));
  _voiceSave('Used 5% < 10% acid'); const ts2 = providerNoteDrafts.c1.ts;
  try { _voiceClose(); } catch (e) {}
  nav('write-note', 'c1'); return { ta: document.getElementById('wn-sec-s1').value, ts1, ts2 }; });
T.check('the note editor shows clean text after two dictations (no "<br>" / "&lt;")', !/<br>|&lt;/.test(r.ta), JSON.stringify(r.ta));
T.check('a new dictation moves the draft stamp forward', r.ts2 > (r.ts1 || 0), JSON.stringify({ ts1: r.ts1, ts2: r.ts2 }));
T.check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
