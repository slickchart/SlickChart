// _isPlaceholderChart decides "the app invented this" by a fixed field list. Fields she TYPES that are
// not on the list make a real edit read as a placeholder, and _mergeClients then lets the other side win
// wholesale, whatever the timestamps say.
import { boot, reporter } from './sweep-dup-edge-harness.mjs';
const { check, done } = reporter();
const { b, p, errs } = await boot({ sq_seed: { name: 'Seed', squareId: 'SEED' } }, {}, 12000);
const r = await p.evaluate(() => {
  const ph = { name: 'Dee Kay', skin: '—', concerns: '—', allergies: 'None noted', fitz: '—', treatment: 'New client' };
  const out = {};
  out.birthdayOnly = _isPlaceholderChart(Object.assign({}, ph, { birthday: '1990-02-03' }));
  out.contraOnly = _isPlaceholderChart(Object.assign({}, ph, { flaggedContra: 'Accutane' }));
  out.guidesOnly = _isPlaceholderChart(Object.assign({}, ph, { pendingGuides: [{ guideId: 'g1' }] }));
  out.squareIdOnly = _isPlaceholderChart(Object.assign({}, ph, { squareId: 'SQ1' }));
  // merge: account holds the placeholder with a phone typed elsewhere? No: account holds a REAL record
  // (phone) older; this device typed the contraindication flag later.
  const server = { x1: Object.assign({}, ph, { phone: '5550001111', _uAt: 1 }) };
  const local = { x1: Object.assign({}, ph, { flaggedContra: 'Accutane', _uAt: 9e12 }) };
  const m = _mergeClients(JSON.stringify(server), JSON.stringify(local));
  out.mergedContra = m && JSON.parse(m.str).x1.flaggedContra;
  return out;
});
check('a record whose only typed field is a contraindication flag is not a placeholder', r.contraOnly === false, JSON.stringify(r));
check('a newer contraindication flag survives a pull against an older real record', r.mergedContra === 'Accutane', JSON.stringify(r));
check('a typed birthday makes a record real', r.birthdayOnly === false, JSON.stringify(r));
check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(done() ? 1 : 0);
