// Sign out with edits that have not reached the account yet. _doLogout calls Cloud.logout() (token='')
// BEFORE anything flushes, then deletes every sc_* key and reloads. The debounced queue (700ms) and the
// pagehide beacon both need the token, so the last edit never leaves the device and is then erased.
// The confirm box says "Your data stays saved in the cloud." Offline, everything since the drop is lost.
import { launch, page, mk } from './sweep2-ui-lib.mjs';
const T = mk();
for (const mode of ['online', 'offline']) {
  const { b, ctx } = await launch();
  const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial' } }) };
  let off = false;
  const { p, errs } = await page(ctx, server, { offline: () => off });
  await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(6000);
  if (mode === 'offline') off = true;
  // a chart edit (rides the patched setItem → 700ms queue) and a note save (rides _pushKeyNow)
  await p.evaluate(() => { CL.c1.notes = 'Allergic to latex — added just now'; saveClients(); activeNoteTemplate = 'soap'; nav('write-note', 'c1'); document.getElementById('wn-sec-s1').value = 'Note typed just before signing out'; _saveWriteNote('c1'); });
  if (mode === 'offline') await p.waitForTimeout(4000);   // she keeps working a while with no signal
  const warned = await p.evaluate(() => { cloudLogout(); const ov = document.getElementById('confirm-modal'); return ov ? ov.innerText : 'NO MODAL'; });
  if (mode === 'offline') off = false;   // signal comes back as she taps Sign out
  await p.evaluate(() => { const btn = Array.from(document.querySelectorAll('button')).find(x => /^\s*Sign out\s*$/.test(x.textContent)); if (btn) btn.click(); });
  await p.waitForTimeout(5000);
  const acct = { notes: (JSON.parse(server.sc_clients).c1 || {}).notes, ss: server.sc_session_summaries || '' };
  T.check(`[${mode}] chart edit made just before sign-out reached the account`, /latex/.test(acct.notes || ''), JSON.stringify(acct).slice(0, 200));
  T.check(`[${mode}] note saved just before sign-out reached the account`, /just before signing out/.test(acct.ss), JSON.stringify(acct).slice(0, 200));
  if (mode === 'offline') T.check('[offline] sign-out warns that changes have not backed up', !/stays saved in the cloud/i.test(warned) || /not backed up|haven.t synced|not saved/i.test(warned), warned.slice(0, 200));
  T.check(`[${mode}] no page errors`, !errs.length, errs.join(' | '));
  await b.close();
}
process.exit(T.done() ? 1 : 0);
