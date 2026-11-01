// Jennie (2026-10-31, iPhone build 31d): opening a photo consult review threw
// "SyntaxError: Unexpected identifier 'c1793373011636lm1zn'" — the "Can't read these" and
// "Suggest they see a doctor" buttons handed confirmModal a string whose quotes were eaten by the
// template literal. This test uses a REAL-shaped client id, compiles EVERY inline handler on every
// client screen, and taps both buttons through to their confirm.
import { launch, page as provPage, mk } from './sweep2-ui-lib.mjs';
const T = mk();
const ID = 'c1793373011636lm1zn';
const server = { sc_clients: JSON.stringify({ [ID]: { name: "Jen O'Neil", _uAt: 1, _token: 'T1', concerns: 'redness' } }) };
const handler = async (r, u) => { if (u.includes('/api/ai')) { await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"text":"{}"}' }); return true; } return false; };
const { b, ctx } = await launch();
const P = await provPage(ctx, server, { handler });
await P.p.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await P.p.waitForTimeout(3000);
const res = await P.p.evaluate(async (ID) => {
  const out = { bad: [], screens: {}, retake: 0, doctor: 0 };
  vcInvites[ID] = { invited: true, submitted: true, reviewed: false, invitedAt: 100, kind: 'skin', title: 'Photo consult', photoLabels: ['Front'] };
  vcSubmissions[ID] = { photos: [{ label: 'Front', src: 'data:image/png;base64,iVBORw0KGgoAAA' }], goals: 'x', date: 'Oct 1', kind: 'skin', title: 'Photo consult', flags: { [Object.keys(_VC_FLAG_LABELS)[0]]: true, note: "it's itchy" } };
  window.vcAskForRetake = id => { out.retake = id; };
  window.vcReferToDoctor = id => { out.doctor = id; };
  const scan = name => { let n = 0; document.querySelectorAll('#S *').forEach(el => { for (const a of el.attributes) { if (!/^on/.test(a.name)) continue; n++; try { new Function('event', a.value); } catch (e) { out.bad.push(name + ' ' + a.name + ': ' + e.message + ' :: ' + a.value.slice(0, 160)); } } }); out.screens[name] = n; };
  for (const back of ['client', 'inbox', 'virtual']) { _vcBack = back; nav('virtual-client', ID); await new Promise(r => setTimeout(r, 300)); scan('virtual-client/' + back); }
  for (const s of ['client', 'notes', 'photos', 'write-note', 'brief', 'rebook', 'summary-history', 'client-forms', 'virtual', 'vc-inbox']) { try { nav(s, ID); await new Promise(r => setTimeout(r, 250)); scan(s); } catch (e) { out.bad.push(s + ' threw ' + e.message); } }
  const tap = async (re) => { _vcBack = 'client'; nav('virtual-client', ID); await new Promise(r => setTimeout(r, 300)); const btn = Array.from(document.querySelectorAll('#S button')).find(x => re.test(x.textContent)); if (!btn) return 'no button'; btn.click(); await new Promise(r => setTimeout(r, 200)); const m = document.getElementById('confirm-modal'); if (!m) return 'no modal'; const ok = Array.from(m.querySelectorAll('button')).pop(); ok.click(); await new Promise(r => setTimeout(r, 200)); return 'ok'; };
  out.tapRetake = await tap(/Can.t read these/);
  out.tapDoctor = await tap(/see a doctor/);
  return out;
}, ID);
T.check('every inline handler on every client screen compiles (real-shaped id)', res.bad.length === 0, res.bad.join(' | '));
T.check('screens were actually scanned', Object.values(res.screens).every(n => n > 0), JSON.stringify(res.screens));
T.check('"Can\'t read these" confirms and asks for new photos for that client', res.tapRetake === 'ok' && res.retake === ID, res.tapRetake + ' ' + res.retake);
T.check('"Suggest they see a doctor" confirms and refers that client', res.tapDoctor === 'ok' && res.doctor === ID, res.tapDoctor + ' ' + res.doctor);
T.check('no page errors', P.errs.length === 0, P.errs.join(' | '));
await b.close();
process.exit(T.done() ? 1 : 0);
