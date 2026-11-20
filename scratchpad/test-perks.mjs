// Loyalty cards, memberships and packages (2026-11-20). Drives the provider app and the client app
// through every flow: create / edit / delete a plan, automatic punches from payments (and never
// twice), a full card and its reward at checkout with Undo, a membership's first payment, credits,
// rollover, member price, pause / resume / cancel / undo, card-on-file charge that cannot double
// charge, a payment link that holds the period, a package sold at checkout and used up, the ledger
// union across two devices (and merge(X,X)=X), and what the client's app shows.
//   node scratchpad/test-perks.mjs            (Chromium)
//   bash scratchpad/run-in-safari.sh scratchpad/test-perks.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
let ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
if (!fs.existsSync(ROOT)) ROOT = new URL('../../slickchart-vercel/', import.meta.url).pathname;   // run-in-safari.sh runs a copy one folder down
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : /\.woff2$/.test(f) ? 'font/woff2' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

async function provider(vp) {
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 300)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  const now = Date.now();
  const clients = {
    c1: { id: 'c1', name: 'Krys Test', email: 'k@ex.com', phone: '5550001111', squareId: 'SQC1', created: now, _ts: now, notes: [] },
    c2: { id: 'c2', name: 'Bea Moss', email: 'b@ex.com', created: now, _ts: now, notes: [] }
  };
  const seed = { sc_clients: JSON.stringify(clients), sc_onboarded: '1', sc_professions: JSON.stringify(['esthetician']), sc_hide_sample: '1' };
  await page.addInitScript(() => { try { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_login_email', 'p@ex.com'); localStorage.setItem('sc_hide_sample', '1'); } catch (e) {} window.open = () => null; });
  const charges = [];
  await page.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: seed }) });
    if (u.includes('/api/square/charge-card') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cards: [{ id: 'card1', last4: '4242', brand: 'VISA' }] }) });
    if (u.includes('/api/square/charge-card') && m === 'POST') { const b = JSON.parse(r.request().postData() || '{}'); charges.push(b); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'COMPLETED', paymentId: 'P' + b.idempotencyKey }) }); }
    if (u.includes('/api/square/payment-link')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://sq/link', id: 'L1', orderId: 'O1' }) });
    if (u.includes('/api/square/connection') || u.includes('/api/square/token-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"oauth":true,"connected":true}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"appointments":[],"items":[]}' }); });
  await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await page.goto('http://localhost:' + PORT + '/slickchart.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof Cloud !== 'undefined' && !Cloud._booting && Cloud._pulledOnce, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return { ctx, page, errs, charges };
}

const { page, errs, charges } = await provider({ width: 390, height: 844 });
const E = (f, a) => page.evaluate(f, a);
const wait = ms => page.waitForTimeout(ms);

// ── More screen row, Rewards screen, ideas ──
await E(() => nav('more')); await wait(200);
ok(await E(() => document.body.innerText.includes('Loyalty, memberships & packages')), 'More shows the Loyalty, memberships & packages row');
await E(() => nav('perks')); await wait(200);
ok(await E(() => /start from an idea/i.test(document.body.innerText)), 'empty Rewards screen offers editable ideas');

// ── create a loyalty card through the editor ──
await E(() => nav('perk-edit', { kind: 'loyalty', idea: 0 })); await wait(200);
ok(await E(() => document.getElementById('pke-punches').value === '10'), 'idea pre-fills 10 punches');
await E(() => { document.getElementById('pke-name').value = 'Glow card'; document.getElementById('pke-punches').value = '3'; document.getElementById('pke-rtype').value = 'pct'; document.getElementById('pke-rval').value = '20'; _pkEditSync(); _pkEditSave(); });
await wait(200);
let st = await E(() => ({ n: perkPlans.length, stored: JSON.parse(localStorage.getItem('sc_perk_plans') || '[]').length, ts: !!perkPlans[0]._ts, scr: _navCur.screen }));
ok(st.n === 1 && st.stored === 1 && st.scr === 'perks', 'loyalty card saved and stored (' + JSON.stringify(st) + ')');
ok(await E(() => { nav('perk-edit', { kind: 'loyalty' }); document.getElementById('pke-name').value = 'X'; document.getElementById('pke-punches').value = '0'; _pkEditSave(); return document.getElementById('pke-err').textContent; }).then(t => /1 to 500/.test(t)), 'bad punch count is refused with a plain message');

// ── automatic punches from payments, never twice ──
const LID = await E(() => perkPlans[0].id);
await E(() => { nav('checkout', 'c1'); document.getElementById('co-amt').value = '80'; _coRecordPaid('c1', 'Cash'); });
await wait(100);
await E(() => { nav('checkout', 'c1'); document.getElementById('co-amt').value = '50'; _coRecordPaid('c1', 'Cash'); });
st = await E(id => _pkCardState(CL.c1, _pkPlan(id)), LID);
ok(st.total === 1, 'two payments the same day = one punch with "one a day" on (got ' + st.total + ')');
await E(id => { const p = _pkPlan(id); p.onePerDay = false; _savePerkPlans(); _pkScanPayments(); }, LID);
st = await E(id => _pkCardState(CL.c1, _pkPlan(id)), LID);
ok(st.total === 2, 'turning "one a day" off counts the other payment once (got ' + st.total + ')');
await E(() => { _pkScanPayments(); _pkScanPayments(); _savePayments(); });
st = await E(id => _pkCardState(CL.c1, _pkPlan(id)), LID);
ok(st.total === 2, 'rescanning never punches the same payment twice');
await E(() => { _addPayment({ clientId: 'c2', clientName: 'Bea', amount: 40, status: 'paid', date: '2020-01-01', note: 'old' }); });
ok(await E(id => _pkCardState(CL.c2, _pkPlan(id)).total === 0, LID), 'a payment dated before the card started does not punch');
await E(() => { _addPayment({ clientId: 'c2', clientName: 'Bea', amount: 40, status: 'unpaid', date: _todayISO(), note: 'link' }); });
ok(await E(id => _pkCardState(CL.c2, _pkPlan(id)).total === 0, LID), 'an unpaid payment does not punch');
await E(() => { const p = _payments.find(x => x.clientId === 'c2' && x.status === 'unpaid'); p.status = 'paid'; p.paidDate = _todayISO(); _savePayments(); });
ok(await E(id => _pkCardState(CL.c2, _pkPlan(id)).total === 1, LID), 'when that payment is marked paid later, it punches');

// ── full card, reward ready on profile and at checkout, apply + undo ──
await E(id => _pkPunch('c1', id), LID);
st = await E(id => _pkCardState(CL.c1, _pkPlan(id)), LID);
ok(st.ready === 1 && st.have === 0, 'third punch fills the card: reward ready');
await E(() => nav('client', 'c1')); await wait(200);
if (process.env.DBG) console.log(await E(() => { const t = document.body.innerText; const i = t.search(/rewards/i); return i + ' ' + t.slice(Math.max(0, i - 50), i + 400); }));
ok(await E(() => /Rewards & memberships/i.test(document.body.innerText) && /Reward ready/.test(document.body.innerText)), 'client profile shows the card and "Reward ready"');
await E(() => { nav('checkout', 'c1'); _coItems.push({ name: 'Facial', price: 100, qty: 1, variationId: 'VAR1', kind: 'service', taxable: false, note: '' }); _coRenderItems(); });
ok(await E(() => /Reward ready: 20% off/.test(document.getElementById('co-perks').innerText)), 'checkout shows the ready reward');
await E(id => _pkApplyReward('c1', id), LID);
st = await E(() => ({ price: _coItems[0].price, v: _coItems[0].variationId, name: _coItems[0].name }));
ok(st.price === 80 && st.v === null && /loyalty reward/.test(st.name), 'reward takes 20% off and the catalog line becomes a custom line (' + JSON.stringify(st) + ')');
ok(await E(id => _pkCardState(CL.c1, _pkPlan(id)).ready === 0, LID), 'reward is marked used');
await E(() => document.getElementById('pk-undo').click());
st = await E(id => ({ price: _coItems[0].price, v: _coItems[0].variationId, ready: _pkCardState(CL.c1, _pkPlan(id)).ready }), LID);
ok(st.price === 100 && st.v === 'VAR1' && st.ready === 1, 'Undo puts the price back and the reward back (' + JSON.stringify(st) + ')');
// free service reward
await E(id => { const p = _pkPlan(id); p.reward = { type: 'free', service: 'facial' }; _savePerkPlans(); _pkApplyReward('c1', id); }, LID);
ok(await E(() => _coItems[0].price === 0 && _coValidItems().length === 0), 'a free-service reward makes the facial line free');
// undo punch
await E(id => { _pkPunch('c1', id); }, LID);
const beforeUndo = await E(id => _pkCardState(CL.c1, _pkPlan(id)).total, LID);
await E(id => _pkUnpunch('c1', id), LID);
ok(await E(id => _pkCardState(CL.c1, _pkPlan(id)).total, LID) === beforeUndo - 1, 'Undo last punch removes one punch (as a void, not a delete)');
ok(await E(() => CL.c1.perks.some(e => e.t === 'void')), 'ledger keeps a void record');

// ── membership ──
await E(() => { nav('perk-edit', { kind: 'membership' }); const s = (i, v) => { document.getElementById(i).value = v; }; s('pke-name', 'Facial club'); s('pke-price', '99'); s('pke-every', '1'); s('pke-interval', 'month'); s('pke-credits', '1'); s('pke-clabel', 'facial'); s('pke-roll', 'cap'); s('pke-cap', '1'); s('pke-svc', '10'); s('pke-prod', '15'); s('pke-term', '3'); _pkEditSync(); _pkEditSave(); });
const MID = await E(() => perkPlans.find(p => p.kind === 'membership').id);
ok(!!MID, 'membership plan saved');
await E(mid => { nav('client', 'c1'); _pkJoinSheet('c1'); document.getElementById('pk-join-plan').value = mid; document.getElementById('pk-join-start').value = _todayISO(); _pkJoinDo('c1'); }, MID);
await wait(100);
ok(await E(() => !!document.getElementById('pk-sheet') && /First payment/.test(document.getElementById('pk-sheet').innerText)), 'starting a membership asks for the first payment');
const JID = await E(() => _pkJoins(CL.c1)[0].id);
st = await E(j => _pkMemState(CL.c1, _pkFindEv(CL.c1, j)), JID);
ok(st.due && st.credits === 0 && st.status === 'active', 'new membership is due today with no credits yet');
await E(() => _pkClose());
ok(await E(() => _pkDueList().length === 1), 'due list shows it');
// card on file charge
await E(j => _pkMemCharge('c1', j), JID); await wait(600);
st = await E(j => _pkMemState(CL.c1, _pkFindEv(CL.c1, j)), JID);
ok(charges.length === 1 && charges[0].amount === 99 && /^sc-mb-/.test(charges[0].idempotencyKey), 'card on file charged $99 with a per-month idempotency key');
ok(!st.due && st.credits === 1 && st.per === 0, 'paid month adds 1 facial and is no longer due (' + JSON.stringify({ due: st.due, c: st.credits, per: st.per }) + ')');
const r2 = await E(j => _pkChargeOne('c1', j).then(x => x, e => ({ err: e.message })), JID);
ok(charges.length === 1 && /nothing is due/.test(r2.err || ''), 'a second charge before the next month is due is refused (' + JSON.stringify(r2) + ')');
// an early payment (her explicit tap) pays next month; rollover cap 1 keeps 1 + 1
await E(j => _pkMemCharge('c1', j), JID); await wait(600);
st = await E(j => _pkMemState(CL.c1, _pkFindEv(CL.c1, j)), JID);
ok(charges.length === 2 && charges[1].idempotencyKey !== charges[0].idempotencyKey && st.per === 1 && st.credits === 2, 'paying next month early: new key, rollover cap 1 gives 1 + 1 = 2 (' + st.credits + ')');
ok(await E(() => _payments.filter(p => /Membership/.test(p.note || '')).every(p => p.perkSkip === 1)), 'membership payments do not earn loyalty punches');
// use credit + undo
const c0 = st.credits;
await E(j => _pkUseCredit('c1', j), JID);
ok(await E(j => _pkMemState(CL.c1, _pkFindEv(CL.c1, j)).credits, JID) === c0 - 1, 'Use 1 facial takes one credit');
await E(() => document.getElementById('pk-undo').click());
ok(await E(j => _pkMemState(CL.c1, _pkFindEv(CL.c1, j)).credits, JID) === c0, 'Undo gives the credit back');
// member price at checkout
await E(() => { nav('checkout', 'c1'); _coItems.push({ name: 'Peel', price: 100, qty: 1, kind: 'service', taxable: false }); _coItems.push({ name: 'Serum', price: 40, qty: 1, kind: 'product', taxable: true }); _coRenderItems(); });
await E(j => _pkCoMemberPrice('c1', j), JID);
st = await E(() => _coItems.map(i => i.price));
ok(st[0] === 90 && st[1] === 34, 'member price: 10% off services, 15% off products (' + st + ')');
await E(j => _pkCoMemberPrice('c1', j), JID);
ok(await E(() => _coItems[0].price === 90), 'member price is not applied twice');
// pause / resume / cancel / undo
const states = await E(j => {
  const out = [];
  _pkMemEv('c1', j, 'pause'); out.push(_pkMemState(CL.c1, _pkFindEv(CL.c1, j)).status);
  out.push(_pkDueList().length);
  _pkMemEv('c1', j, 'resume'); const s = _pkMemState(CL.c1, _pkFindEv(CL.c1, j)); out.push(s.status, s.nextDue === _todayISO());
  _pkCancelDo('c1', j, _pkAddDays(_todayISO(), 10)); out.push(_pkMemState(CL.c1, _pkFindEv(CL.c1, j)).status);
  _pkMemEv('c1', j, 'uncancel'); out.push(_pkMemState(CL.c1, _pkFindEv(CL.c1, j)).status);
  _pkCancelDo('c1', j, _todayISO()); out.push(_pkMemState(CL.c1, _pkFindEv(CL.c1, j)).status, _pkMemState(CL.c1, _pkFindEv(CL.c1, j)).credits);
  _pkMemEv('c1', j, 'uncancel'); out.push(_pkMemState(CL.c1, _pkFindEv(CL.c1, j)).status);
  return out;
}, JID);
ok(JSON.stringify(states) === JSON.stringify(['paused', 0, 'active', true, 'cancelling', 'active', 'ended', 0, 'active']), 'pause, resume (due again from today), cancel later, undo, end today (credits gone), undo: ' + JSON.stringify(states));
// period maths: started 2 months ago, paid once: due for the second month
const pm = await E(() => {
  const a = _pkAddPeriods('2026-01-31', 'month', 1, 1), b = _pkAddPeriods('2026-01-15', 'week', 2, 2), c = _pkAddPeriods('2025-02-28', 'year', 1, 1);
  return [a, b, c];
});
ok(JSON.stringify(pm) === JSON.stringify(['2026-02-28', '2026-02-12', '2026-02-28']), 'period maths: month end, every 2 weeks, yearly (' + pm + ')');
// payment link for a month holds that month
await E(() => { _pkAdd('c2', { t: 'join', p: perkPlans.find(p => p.kind === 'membership').id, snap: _pkSnapOf(perkPlans.find(p => p.kind === 'membership')), start: _todayISO() }); });
const J2 = await E(() => _pkJoins(CL.c2)[0].id);
await E(j => { _pkMemCheckout('c2', j); }, J2); await wait(150);
await E(() => _coLink('c2')); await wait(600);
st = await E(j => ({ pend: !!_pkPendingPay(j, 0), due: _pkDueList().some(x => x.j.id === j), acts: (_payments.find(p => p.paymentLinkId === 'L1') || {}).perkActs }), J2);
ok(st.pend && !st.due, 'a payment link out for the month takes it off the due list (' + JSON.stringify(st) + ')');
const r3 = await E(j => _pkChargeOne('c2', j).then(() => 'charged', e => e.message), J2);
ok(/already out/.test(r3), 'and it cannot be charged again while the link is out');
await E(() => { const p = _payments.find(x => x.paymentLinkId === 'L1'); p.status = 'paid'; p.paidDate = _todayISO(); _savePayments(); });
st = await E(j => _pkMemState(CL.c2, _pkFindEv(CL.c2, j)), J2);
ok(st.per === 0 && st.credits === 1, 'when the link is paid, the month is recorded and the facial added');

// ── package ──
await E(() => { nav('perk-edit', { kind: 'package' }); const s = (i, v) => { document.getElementById(i).value = v; }; s('pke-name', '3 peels'); s('pke-sessions', '3'); s('pke-service', 'peel'); s('pke-price', '300'); s('pke-expd', '30'); _pkEditSave(); });
await E(() => { nav('client', 'c1'); _pkSellSheet('c1'); document.getElementById('pk-sell-plan').value = perkPlans.find(p => p.kind === 'package').id; _pkSellCheckout('c1'); });
await wait(200);
ok(await E(() => _coItems.some(i => /Package: 3 peels/.test(i.name) && i.price === 300)), 'Sell a package opens checkout with the package line');
await E(() => _coRecordPaid('c1', 'Cash'));
let bs = await E(() => _pkBuys(CL.c1).map(b => Object.assign(_pkPkgState(CL.c1, b), { want: _pkAddDays(_todayISO(), 30) })));
ok(bs.length === 1 && bs[0].left === 3 && bs[0].exp === bs[0].want, 'paid package is on her profile: 3 left, use by 30 days out');
const B1 = await E(() => _pkBuys(CL.c1)[0].id);
await E(b => { _pkUsePkg('c1', b); _pkUsePkg('c1', b); _pkUsePkg('c1', b); _pkUsePkg('c1', b); }, B1);
bs = await E(b => _pkPkgState(CL.c1, _pkFindEv(CL.c1, b)), B1);
ok(bs.left === 0 && bs.used === 3 && !bs.open, 'three uses empty it and a fourth is refused');
await E(b => { _pkAdjust('c1', b, 1); }, B1);
ok(await E(b => _pkPkgState(CL.c1, _pkFindEv(CL.c1, b)).left, B1) === 1, 'Add a session gives one back');
await E(b => { _pkPkgManage('c1', b); document.getElementById('pk-exp').value = '2020-01-01'; _pkSetExp('c1', b); }, B1);
ok(await E(b => _pkPkgState(CL.c1, _pkFindEv(CL.c1, b)).expired, B1), 'an expiry date in the past marks it expired');
await E(() => _pkSellRecord('c1') /* no sheet open: safe no-op */);

// ── union across devices, and merge(X,X)=X ──
const un = await E(() => {
  const A = JSON.parse(JSON.stringify(CL.c1)), B = JSON.parse(JSON.stringify(CL.c1));
  A.perks.push({ id: 'devA', t: 'punch', p: 'x', ts: 1 }); B.perks.push({ id: 'devB', t: 'punch', p: 'x', ts: 2 });
  const g1 = _unionClientForms(A, B);
  const X = JSON.parse(JSON.stringify(A)), g2 = _unionClientForms(X, JSON.parse(JSON.stringify(A)));
  return { g1, both: A.perks.some(e => e.id === 'devA') && A.perks.some(e => e.id === 'devB'), g2, same: JSON.stringify(X) === JSON.stringify(A) };
});
ok(un.g1 && un.both, 'two devices’ punches both survive the merge');
ok(!un.g2 && un.same, 'merge(X,X) = X and reports no change');
const plm = await E(() => { const v = localStorage.getItem('sc_perk_plans'); const m = _mergeAuthoredById(v, v, 'sc_deleted_perk_plans', { keyFn: _libKeyFn('sc_perk_plans'), keepUnkeyed: true }); return { changed: m && m.changed, same: m && JSON.parse(m.str).length === JSON.parse(v).length }; });
ok(plm.same && !plm.changed, 'plans merge(X,X) = X');

// ── what the client app is sent ──
const out = await E(() => _assembleClientData('c1').perks);
ok(out && out.cards.length === 1 && out.members.length === 1 && Array.isArray(out.packages) && out.offers.length === 2, 'client payload carries a summary: card, membership, offers');
ok(!JSON.stringify(out).includes('"t":"punch"') && !/"(id|ts)":/.test(JSON.stringify(out)), 'client payload never carries the raw ledger');
ok(await E(() => _assembleClientData('c2').perks.members[0].credits === 1), 'other client gets only their own');

// ── delete a plan writes a delete record ──
await E(() => { nav('perk-edit', perkPlans.find(p => p.kind === 'package').id); _pkDeleteSheet(); _pkDeleteDo(); });
st = await E(() => ({ n: perkPlans.filter(p => p.kind === 'package').length, del: Object.keys(JSON.parse(localStorage.getItem('sc_deleted_perk_plans') || '{}')).length, still: _pkBuys(CL.c1).length }));
ok(st.n === 0 && st.del === 1 && st.still === 1, 'deleting a package plan records the delete and leaves what she already sold (' + JSON.stringify(st) + ')');

// ── every screen draws, phone width ──
if (process.env.SHOT) { const sh = async (n, f) => { await E(f); await wait(250); await page.screenshot({ path: '/tmp/claude-0/-home-user/70f2d1dd-1af0-502d-9805-0b91ea31b4bf/scratchpad/perks/' + n + '.png', fullPage: false }); };
  await sh('1-perks', () => { _pkTab = 'membership'; nav('perks'); });
  await sh('2-edit', () => nav('perk-edit', perkPlans.find(p => p.kind === 'membership').id));
  await sh('3-client', () => { nav('client', 'c1'); setTimeout(() => { const el = [...document.querySelectorAll('h2')].find(h => /Rewards/.test(h.textContent)); if (el) el.scrollIntoView(); }, 50); });
  await sh('4-checkout', () => { nav('checkout', 'c1'); const el = document.getElementById('co-perks'); if (el) el.scrollIntoView(); });
  await sh('5-manage', () => { nav('client', 'c1'); _pkMemManage('c1', _pkJoins(CL.c1)[0].id); });
  await E(() => _pkClose());
  await sh('6-loyedit', () => nav('perk-edit', perkPlans.find(p => p.kind === 'loyalty').id));
}
for (const tab of ['loyalty', 'membership', 'package']) { await E(t => { _pkTab = t; nav('perks'); }, tab); await wait(80); }
await E(() => nav('client', 'c1')); await E(() => nav('checkout', 'c2')); await wait(150);
const ovf = await E(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
ok(ovf, 'no sideways scroll at phone width');
ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));

// ── the client app ──
const cp = await browser.newPage({ viewport: { width: 390, height: 844 } });
const cerrs = []; cp.on('pageerror', e => cerrs.push(String(e.message).slice(0, 200)));
await cp.route('**/api/client-data*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, client: { id: 'c1', name: 'Krys Test', email: 'k@ex.com', data: Object.assign({ providerName: 'Glow Studio', providerFirst: 'Ashley' }, { perks: out }) } }) }));
await cp.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await cp.goto('http://localhost:' + PORT + '/slickchart-client.html?c=TESTTOKEN', { waitUntil: 'load' }); await cp.waitForTimeout(2500);
const home = await cp.evaluate(() => document.body.innerText);
ok(/Glow card/.test(home) && /Facial club/.test(home), 'client Home shows their card and membership');
await cp.evaluate(() => nav('shop')); await cp.waitForTimeout(300);
const shop = await cp.evaluate(() => document.body.innerText);
if (process.env.SHOT) { await cp.screenshot({ path: '/tmp/claude-0/-home-user/70f2d1dd-1af0-502d-9805-0b91ea31b4bf/scratchpad/perks/8-client-shop.png' }); await cp.evaluate(() => nav('home')); await cp.waitForTimeout(300); await cp.evaluate(() => { const h = [...document.querySelectorAll('div')].find(d => /Glow card/.test(d.textContent) && d.children.length < 4); if (h) h.scrollIntoView(); }); await cp.screenshot({ path: '/tmp/claude-0/-home-user/70f2d1dd-1af0-502d-9805-0b91ea31b4bf/scratchpad/perks/7-client-home.png' }); }
ok(/Glow card/.test(shop), 'client Shop shows their card');
ok(cerrs.length === 0, 'client app: no page errors' + (cerrs.length ? ': ' + cerrs.join(' | ') : ''));

await browser.close(); srv.close();
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
