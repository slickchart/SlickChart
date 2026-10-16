// CLIENT side, end to end: invite via blob -> home card -> capture (injected data URLs) -> answers ->
// refresh mid-way -> submit -> submitted state -> refresh before the provider processed it -> a second
// consult right after -> 390px layout -> privacy (draft/invite of client A never shows to client B).
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
const INV1 = { kind: 'skin', title: 'Photo consult', invitedAt: 111, photoLabels: ['Front', 'Left', 'Right'], askQuestions: ['Q1 how long?'], routine: true };
const rec = { TOK: clientRecord('c1', 'Cara Client', { vcInvite: INV1 }), TOKB: clientRecord('c2', 'Bea Other', { vcInvite: null }) };
const subs = [];
await mockApi(page, { records: rec, handler: (req, p, t, J) => { if (p === '/api/client-submit') { const j = JSON.parse(req.postData() || '{}'); subs.push({ t: j.t, kind: j.kind, payload: j.payload }); return J({ ok: true, id: 'ev' + subs.length }); } return null; } });
const boot = async (tok) => { await page.goto(BASE + '?c=' + tok, { waitUntil: 'load' }); await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await page.waitForTimeout(1500); };
await boot('TOK');
const home = await page.evaluate(() => { nav('home'); return { card: /invited you to a photo consult/i.test(document.getElementById('S').innerText), notif: (typeof notifs !== 'undefined' && Array.isArray(notifs)) ? notifs.filter(n => n && n.type === 'vcInvite').length : -1 }; });
check('home card for the invite missing', !home.card, JSON.stringify(home));
// capture 2 photos + an answer, then refresh
await page.evaluate(() => { nav('virtual-submit'); _vcSubmitState.photos.Front = { src: 'data:image/jpeg;base64,/9j/AAAA1', ts: 1 }; _vcSubmitState.photos.Left = { src: 'data:image/jpeg;base64,/9j/AAAA2', ts: 2 }; persistVcDraft(); renderVirtualSubmit(); });
await page.fill('#vc-ask-0', 'Two years');
await page.fill('#vc-goals', 'Calm redness');
const lay = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
check('virtual-submit overflows horizontally at 390px', lay.sw > lay.cw + 1, JSON.stringify(lay));
await boot('TOK');
const kept = await page.evaluate(() => { nav('virtual-submit'); return { n: Object.keys(_vcSubmitState.photos).length, a: (document.getElementById('vc-ask-0') || {}).value, g: (document.getElementById('vc-goals') || {}).value }; });
check('photos/answer lost on refresh', !(kept.n === 2 && kept.a === 'Two years'), JSON.stringify(kept));
check('goals text typed (not yet blurred) lost on refresh', kept.g !== 'Calm redness', JSON.stringify(kept));
await page.evaluate(() => { const g = document.getElementById('vc-goals'); if (g) g.value = 'Calm redness'; });
await page.click('#vc-submit-btn');
await page.waitForTimeout(2500);
const s1 = subs.filter(s => s.kind === 'vc_submit');
check('first consult not submitted exactly once', s1.length !== 1, JSON.stringify(s1.map(s => s.t)));
const pl = (s1[0] || {}).payload || {};
check('payload missing photos/answers/goals', !(pl.photos && pl.photos.length === 2 && pl.answers && pl.answers[0] && pl.answers[0].a === 'Two years' && pl.goals === 'Calm redness'), JSON.stringify({ n: (pl.photos || []).length, a: pl.answers, g: pl.goals }));
check('submission payload does not say which invite it answers (no invitedAt)', !('invitedAt' in pl), Object.keys(pl).join(','));
const after = await page.evaluate(() => { nav('journey'); const t = document.getElementById('S').innerText; return { inv: !!vcInvite, journey: /Submitted/.test(t) }; });
check('after submit: invite not cleared or journey missing', after.inv || !after.journey, JSON.stringify(after));
// refresh BEFORE the provider has processed it: blob still carries invite 111
await boot('TOK');
const r1 = await page.evaluate(() => { nav('home'); return { inv: !!vcInvite, card: /invited you to a photo consult/i.test(document.getElementById('S').innerText) }; });
check('submitted invite reappears after refresh', r1.inv || r1.card, JSON.stringify(r1));
// a second consult right after
rec.TOK = clientRecord('c1', 'Cara Client', { vcInvite: { kind: 'skin', title: 'Follow-up consult', invitedAt: 222, photoLabels: ['Front'], askQuestions: [], routine: false } });
await boot('TOK');
const r2 = await page.evaluate(() => { nav('virtual-submit'); return { inv: vcInvite && vcInvite.invitedAt, photos: Object.keys(_vcSubmitState.photos).length, title: document.getElementById('tt').textContent }; });
check('second invite not shown / not fresh', !(r2.inv === 222 && r2.photos === 0), JSON.stringify(r2));
await page.evaluate(() => { _vcSubmitState.photos.Front = { src: 'data:image/jpeg;base64,/9j/BBBB', ts: 3 }; renderVirtualSubmit(); });
await page.click('#vc-submit-btn'); await page.waitForTimeout(2500);
const j2 = await page.evaluate(() => { nav('journey'); return (activeProvider().virtualConsults || []).map(v => v.title); });
check('journey does not list both consults', j2.length !== 2, JSON.stringify(j2));
// privacy: another client's link in the same browser
await boot('TOKB');
const pv = await page.evaluate(() => ({ inv: !!vcInvite, draft: localStorage.getItem('sc_vc_draft'), vcs: (activeProvider().virtualConsults || []).length, saved: localStorage.getItem('sc_client_vc') }));
check('client B sees client A consult data', pv.inv || !!pv.draft || pv.vcs > 0 || !!pv.saved, JSON.stringify(pv));
check('page errors', errs.length > 0, errs.join(' | '));
await browser.close();
finish();
