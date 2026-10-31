// "Add a client" end to end for: a spray tan pro (consent = her intake & consent), a head spa pro (Head Spa
// Collection consent), and a provider who deleted every consent (no broken "Preview consent", no fake send).
import { mk, launch, page, boot } from './sweep3-session-lib.mjs';
const T = mk();
const { b, ctx } = await launch();
async function run(profs, prep, mode) {
  const P = await page(ctx, { sc_clients: '{}', sc_professions: JSON.stringify(profs) });
  await boot(P.p);
  if (prep) await P.p.evaluate(prep);
  const nmv = 'Tess ' + profs.join('') + Math.random().toString(36).slice(2, 6);
  const r = await P.p.evaluate(async ([mode, NM]) => {
    nav('new-client'); await new Promise(r => setTimeout(r, 200));
    const nm = document.getElementById('nc-name'); nm.value = NM; nm.dispatchEvent(new Event('input'));
    newClientData['nc-name'] = NM;
    for (let i = 0; i < 5 && newClientStep < _ncSteps().length - 1; i++) { ncNext(); await new Promise(r => setTimeout(r, 80)); }
    const scr = document.getElementById('S').innerText;
    const out = { cid: _ncConsentId(), header: (scr.match(/Send "([^"]*)", how\?/i) || [])[1] || null, noConsent: !!document.getElementById('nc-no-consent'),
      preview: /Preview consent/.test(scr), deviceOpt: /Sign on this device/.test(scr), deliver: _ncDeliver };
    if (mode) ncSetDeliver(mode);
    out.deliverAfter = _ncDeliver;
    finishNewClient(); await new Promise(r => setTimeout(r, 300));
    const c = Object.values(CL).find(x => x.name === NM);
    out.added = !!c; out.pending = c ? (c.pendingForms || []).map(p => p.formId) : null;
    out.screen = (_navCur && _navCur.screen) || null;
    return out;
  }, [mode, nmv]);
  r.errs = P.errs.slice(); await P.p.close(); return r;
}
const st = await run(['spraytan'], null, 'app');
T.check('spray tan: Review step offers "Spray tan intake & consent"', /^spray tan intake & consent$/i.test(st.header), JSON.stringify(st));
T.check('spray tan: "Send to their app" assigns it (not the skincare consent)', st.added && st.pending.includes('spraytan-intake') && !st.pending.includes('consent-esty'), JSON.stringify(st));
const hd = await run(['headspa'], null, 'app');
T.check('head spa: "Head spa service consent" is sent', /^head spa service consent$/i.test(hd.header) && hd.pending.includes('hd-service-consent') && !hd.pending.includes('consent-esty'), JSON.stringify(hd));
const hideAll = () => { const real = window._formHidden; window._formHidden = k => /consent|liability|waiver|release/i.test(k + ' ' + ((formTmpls[k] || {}).name || '')) || real(k); };
const none = await run(['coach'], hideAll, null);
T.check('every consent deleted: says there is none, no Preview consent, no sign/link/app options', none.cid === null && none.noConsent && !none.preview && !none.deviceOpt && none.deliver === 'none', JSON.stringify(none));
T.check('every consent deleted: the client is still added', none.added, JSON.stringify(none));
const none2 = await run(['coach'], hideAll, 'invite');
T.check('every consent deleted: Invite to the app still works', none2.added && none2.deliverAfter === 'invite', JSON.stringify(none2));
const es = await run(['esty'], null, 'app');
T.check('esthetician unchanged: Esthetics consent', /^esthetics consent$/i.test(es.header) && es.pending.includes('consent-esty'), JSON.stringify(es));
T.check('no page errors', ![st, hd, none, none2, es].some(x => x.errs.length), JSON.stringify([st, hd, none, none2, es].map(x => x.errs)));
await b.close(); process.exit(T.done() ? 1 : 0);
