// A client has a PHOTO consult (with photos) on file, then gets a PRODUCT consult. Both live in
// vcInvites[cid] / vcSubmissions[cid]. What survives, on this device and on her other device?
import { launch, provider, check, finish } from './sweep3-pc-lib.mjs';
const browser = await launch();
const PIX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let events = [];
const prov = await provider(browser, { handler: (r, u, J) => {
  if (u.includes('/api/clients') && r.request().method() === 'GET') return J(r, { ok: true, clients: [], events });
  return null;
} });
// --- same device: reviewed photo consult, then a product consult is answered ---
const s1 = await prov.evaluate(async ([PIX]) => {
  CL.aw = { name: 'Ashley Watson', concerns: '' };
  vcInvites.aw = { invited: true, submitted: true, reviewed: true, kind: 'skin', title: 'Photo consult', photoLabels: ['Front', 'Left', 'Right'], invitedAt: 1 };
  vcSubmissions.aw = { photos: [{ label: 'Front', src: PIX }, { label: 'Left', src: PIX }, { label: 'Right', src: PIX }], goals: 'glow', kind: 'skin', title: 'Photo consult', date: 'Oct 1', at: Date.parse('2026-10-01T12:00:00Z') };
  persistVcState();
  _productConsult('aw');
  const afterInvite = (vcSubmissions.aw.photos || []).length;
  return { afterInvite };
}, [PIX]);
events = [{ id: 'ev_prod_1', client_id: 'aw', kind: 'vc_submit', created_at: new Date().toISOString(),
  payload: { kind: 'product', title: 'Product consult', date: 'Oct 16', photos: [], refs: null, goals: '', routine: [], answers: [{ q: 'What are you using now?', a: 'Cerave + SPF 30' }] } }];
const s2 = await prov.evaluate(async () => {
  await syncClientEvents();
  const n = vcNotifs = (notifFeed || []).find(n => n.id === 'evvev_prod_1');
  return { prevPhotos: ((vcSubmissions.aw.prev && vcSubmissions.aw.prev.photos) || []).length, photos: (vcSubmissions.aw.photos || []).length, answers: vcSubmissions.aw.answers, kind: vcSubmissions.aw.kind,
    notif: n ? { title: n.title, body: n.body } : null };
}).catch(e => ({ err: String(e) }));
check('same device: the earlier PHOTO consult (3 photos) is wiped by the product submission (one slot per client)', s1.afterInvite === 3 && s2.photos === 0 && s2.prevPhotos !== 3, { before: s1.afterInvite, after: s2 });
check('product-consult arrival is announced as "Photo consult submitted / sent photos"', !!(s2.notif && /photo/i.test(s2.notif.title + s2.notif.body)), s2.notif);

// --- other device: still holds the photo consult; the account now holds the product consult ---
const s3 = await prov.evaluate(([PIX]) => {
  const productSub = { photos: [], refs: null, goals: '', answers: [{ q: 'What are you using now?', a: 'Cerave + SPF 30' }], routine: [], kind: 'product', title: 'Product consult', date: 'Oct 16', at: Date.parse('2026-10-16T12:00:00Z') };   // the app stamps the submit time (2026-10-16)
  const photoSub = { photos: [{ label: 'Front', src: PIX }, { label: 'Left', src: PIX }, { label: 'Right', src: PIX }], goals: 'glow', kind: 'skin', title: 'Photo consult', date: 'Oct 1' };
  // Device B: has the photo consult; the pull brings the product consult.
  vcSubmissions.aw = JSON.parse(JSON.stringify(photoSub));
  const tookB = _hydrateVcSubs(JSON.stringify({ aw: productSub }));
  const onB = { kind: vcSubmissions.aw.kind, answers: vcSubmissions.aw.answers || null, photos: vcSubmissions.aw.photos.length };
  // Device B's view of the review (vcInvites says product, submitted, via the stamped invite merge).
  vcInvites.aw = { invited: true, submitted: true, reviewed: false, kind: 'product', title: 'Product consult', photoLabels: [], askQuestions: ['What are you using now?'] };
  _vcBack = 'client'; nav('virtual-client', 'aw');
  const t = document.getElementById('S').innerText;
  // Device A: has the product consult; a pull brings device B's (photo) copy back.
  vcSubmissions.aw = JSON.parse(JSON.stringify(productSub));
  const tookA = _hydrateVcSubs(JSON.stringify({ aw: photoSub }));
  const onA = { kind: vcSubmissions.aw.kind, answers: vcSubmissions.aw.answers || null, photos: vcSubmissions.aw.photos.length };
  return { tookB, onB, reviewShowsAnswers: /Cerave/.test(t), reviewShowsPhotoTools: /Can.t read these/.test(t), tookA, onA };
}, [PIX]);
check('device B never takes the product submission (fewer photos never replaces more)', s3.tookB === false && s3.onB.kind === 'skin', s3.onB);
check('device B review of the product consult does NOT show her answers', !s3.reviewShowsAnswers, { photoTools: s3.reviewShowsPhotoTools });
check('device A loses her answers when device B\'s photo copy comes back on a pull', s3.tookA === true && !s3.onA.answers, s3.onA);
check('page errors', prov._errs.length > 0, prov._errs);
await browser.close(); finish();
