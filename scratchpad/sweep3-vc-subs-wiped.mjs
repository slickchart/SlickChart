// PHOTO CONSULT: processing a client's vc_submit event uploads sc_pro_vc_subs = '' to the account.
// syncClientEvents' flush (slickchart.html ~29419) does persistVcState() and THEN
// _pushKeyNow('sc_pro_vc_subs', _lsGet('sc_pro_vc_subs')||''). persistVcState keeps the consults in
// IndexedDB and REMOVES the localStorage copy, so _lsGet is null and '' replaces the real value in the
// same push batch. The account loses EVERY client's consult (photos, answers, goals), and a new
// device / reinstalled phone boots with none of them.
import { launch, page as provPage, mk } from './sweep2-ui-lib.mjs';
const T = mk();
const px = n => 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(n);
const server = {
  sc_clients: JSON.stringify({ c1: { name: 'Cara Client', _uAt: 1, _token: 'T1' }, c2: { name: 'Dana Other', _uAt: 1, _token: 'T2' } }),
  sc_pro_vc_subs: JSON.stringify({ c2: { photos: [{ label: 'Front', src: px(5) }], goals: 'Dana earlier consult', date: 'Sep 1', kind: 'skin', title: 'Photo consult' } }),
  sc_pro_vc_invites: JSON.stringify({ c2: { invited: true, submitted: true, reviewed: true, invitedAt: 5, kind: 'skin', photoLabels: ['Front'], ts: 5 } })
};
const EV = { id: 'ev1', client_id: 'c1', kind: 'vc_submit', created_at: new Date().toISOString(),
  payload: { kind: 'skin', title: 'Photo consult', photos: [{ label: 'Front', src: px(9) }], goals: 'Cara new consult', answers: [], date: 'Oct 16' } };
let give = false;
const handler = async (r, u) => { if (u.includes('/api/clients') && r.request().method() === 'GET' && give) { await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, clients: [{ id: 'c1', name: 'Cara Client', token: 'T1' }, { id: 'c2', name: 'Dana Other', token: 'T2' }], events: [EV] }) }); return true; } return false; };
const { b, ctx } = await launch();
const phone = await provPage(ctx, server, { handler });
await phone.p.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await phone.p.waitForTimeout(3000);
give = true;
await phone.p.evaluate(async () => { try { await syncClientEvents(); } catch (e) {} });
await phone.p.waitForTimeout(3000);
const local = await phone.p.evaluate(() => Object.keys(vcSubmissions));
T.check('phone holds both consults in memory', local.includes('c1') && local.includes('c2'), JSON.stringify(local));
const acct = String(server.sc_pro_vc_subs || '');
T.check('account sc_pro_vc_subs still holds the consults after the event is processed', /Cara new consult/.test(acct) && /Dana earlier/.test(acct), 'account value = ' + JSON.stringify(acct.slice(0, 120)));
// a brand-new device (new phone, reinstall) signs in
const ctx3 = await b.newContext({ viewport: { width: 390, height: 844 } });
give = false;
const fresh = await provPage(ctx3, server, { handler });
await fresh.p.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await fresh.p.waitForTimeout(3500);
const f = await fresh.p.evaluate(() => ({ keys: Object.keys(vcSubmissions), c1: _vcStatus('c1'), c2: _vcStatus('c2') }));
T.check('a new device gets the consults (photos/answers) back', f.keys.includes('c1') && f.keys.includes('c2'), JSON.stringify(f));
T.check('no page errors', !phone.errs.length && !fresh.errs.length, phone.errs.concat(fresh.errs).join(' | '));
await b.close();
process.exit(T.done() ? 1 : 0);
