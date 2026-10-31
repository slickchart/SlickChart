// Every profession: the intake and consent "Add a client" / the first-visit package picks must belong to
// that profession (or be one she made). Then delete her own and check the fallback never reaches another
// profession's form (Maddie got a SPRAY TAN intake as a facialist, 2026-10-30).
import { mk, launch, page, boot } from './sweep3-session-lib.mjs';
const T = mk();
const { b, ctx } = await launch();
const P = await page(ctx, { sc_clients: '{}', sc_professions: JSON.stringify(['esty']) });
await boot(P.p);
const r = await P.p.evaluate(() => {
  const out = [];
  const ids = allProfessions.map(p => p.id);
  const orig = JSON.parse(JSON.stringify(selectedProfessions));
  for (const id of ids) {
    selectedProfessions.length = 0; selectedProfessions.push(id);
    const row = { id, intake: _ncIntakeFormId(), consent: _ncConsentId() };
    row.intakeOwn = !row.intake || row.intake === 'intake' || _ncOwnForm(row.intake);
    row.consentOwn = !row.consent || _ncOwnForm(row.consent);
    out.push(row);
  }
  // Phase 2: delete each pick in turn (hidden, as deleteFormCard does) until nothing is left. Every
  // pick on the way down must still be hers. Generic skin forms only for a skin pro.
  const realHidden = window._formHidden; const gone = new Set();
  window._formHidden = k => gone.has(k) || realHidden(k);
  const skin = new Set(['intake', 'consent-esty']);
  const chain = [];
  for (const ps of ids.map(i => [i]).concat([['esty', 'headspa'], ['headspa', 'esty'], ['lash', 'brow'], ['wax', 'esty'], ['spraytan', 'esty']])) {
    selectedProfessions.length = 0; ps.forEach(x => selectedProfessions.push(x)); gone.clear();
    const isSkin = ps.includes('esty') || ps.includes('wax');
    const row = { ps: ps.join('+'), intakes: [], consents: [], bad: [] };
    for (let i = 0; i < 40; i++) { const f = _ncIntakeFormId(); if (!f) break; row.intakes.push(f); if (!(_ncOwnForm(f) || (isSkin && skin.has(f)))) row.bad.push(f); gone.add(f); }
    gone.clear();
    for (let i = 0; i < 40; i++) { const f = _ncConsentId(); if (!f) break; row.consents.push(f); if (!(_ncOwnForm(f) || (isSkin && skin.has(f)))) row.bad.push(f); gone.add(f); }
    chain.push(row);
  }
  window._formHidden = realHidden;
  selectedProfessions.length = 0; orig.forEach(x => selectedProfessions.push(x));
  return { out, ids, chain };
});
const bad = r.out.filter(x => !x.intakeOwn || !x.consentOwn);
console.log(r.out.map(x => `${x.id}: ${x.intake} / ${x.consent}`).join('\n'));
T.check('every profession: intake and consent are its own', !bad.length, JSON.stringify(bad));
const cbad = r.chain.filter(x => x.bad.length);
console.log(r.chain.map(x => `${x.ps}: [${x.intakes.join(',')}] [${x.consents.slice(0,6).join(',')}${x.consents.length>6?'…':''}]`).join('\n'));
T.check('deleting picks one by one never reaches another profession', !cbad.length, JSON.stringify(cbad.map(x => ({ ps: x.ps, bad: x.bad }))));
T.check('spray tan alone: its own intake & consent is the signed consent, never the skincare one', (r.out.find(x => x.id === 'spraytan') || {}).consent === 'spraytan-intake', JSON.stringify(r.out.find(x => x.id === 'spraytan')));
T.check('head spa alone: the Head Spa Collection consent', (r.out.find(x => x.id === 'headspa') || {}).consent === 'hd-service-consent', JSON.stringify(r.out.find(x => x.id === 'headspa')));
T.check('esty alone is unchanged: intake / consent-esty', JSON.stringify(r.out.find(x => x.id === 'esty')) .includes('"intake":"intake","consent":"consent-esty"'));
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
