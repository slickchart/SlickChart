// Typing a note, a phone call comes in: the app goes to the background inside the 600ms autosave
// debounce. iOS does not blur the textarea and suspends timers, so unless the hidden/pagehide handler
// snapshots the editor, the last sentence exists only in the DOM — and the OS may kill the page.
import { launch, page, mk } from './sweep2-ui-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial' } }) };
const { p, errs } = await page(ctx, server);
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(6000);
await p.evaluate(() => { activeNoteTemplate = 'soap'; nav('write-note', 'c1'); });
await p.focus('#wn-sec-s1'); await p.keyboard.type('Client reports tingling after', { delay: 5 });
// the call arrives immediately: hidden + pagehide, no blur, then timers frozen
const r = await p.evaluate(() => { const realST = window.setTimeout; Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide'));
  // what is on disk RIGHT NOW is what survives the OS killing the page
  const d = JSON.parse(localStorage.getItem('sc_note_drafts') || '{}'); return (d.c1 && d.c1.sections && d.c1.sections.s1) || ''; });
T.check('a note typed right before the app is backgrounded is on disk', /tingling after/.test(r), JSON.stringify(r));
T.check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
