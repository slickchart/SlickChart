// Equestrian (Heather): the session is for a HORSE (CL[h1].ownerId='o1'). The owner's space shows each
// horse's summaries from the OWNER's blob (_assembleClientData(o1).animals[].summaries). sendSummary(h1)
// pushes only h1's own row (_pushClientNow(h1)), so the owner's app never gets the horse's summary until
// something else re-syncs the owner.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ o1: { name: 'Olivia Owner', treatment: 'Bodywork', _token: 'TOKO1', email: 'o@x.com' }, h1: { name: 'Thunder', treatment: 'Equine massage', ownerId: 'o1', isAnimal: true, species: 'Horse' } }) };
const pm = []; const P = await page(ctx, server, { handler: async (r, u) => { if (u.includes('/api/provider-message')) { pm.push(JSON.parse(r.request().postData() || '{}')); await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); return true; } } }); await boot(P.p);
await P.p.waitForTimeout(3500);
const before = P.clientPosts.length;
await P.p.evaluate(() => { nav('session-summary', 'h1'); summaryNoteDraft.h1 = 'Thunder was relaxed, poll release achieved.'; sendSummary('h1'); });
await P.p.waitForTimeout(6000);
const after = P.clientPosts.slice(before);
const ownerPosts = after.filter(x => x.id === 'o1');
const ownerHas = ownerPosts.some(x => (x.data.animals || []).some(a => a.id === 'h1' && (a.summaries || []).some(s => /poll release/.test(s.note || ''))));
T.check("the owner's space receives the horse's new summary", ownerHas, 'posts after send: ' + JSON.stringify(after.map(x => x.id)));
T.check('the "your summary is ready" notice goes to the OWNER (who has the app), addressed to the owner', pm.some(m => m.clientId === 'o1') && !pm.some(m => /Hi Thunder/.test(m.text || '')), JSON.stringify(pm.map(m => ({ to: m.clientId, idem: m.idem, text: (m.text || '').slice(0, 40) }))));
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
