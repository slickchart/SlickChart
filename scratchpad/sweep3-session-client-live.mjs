// Client is LOOKING AT their summary when the provider fixes a typo and re-sends. Does the open
// screen update by itself on the next poll (no tap)? And does a question being typed into
// "Ask about your aftercare" survive that refresh?
import { launch, mk, BASE } from './sweep3-session-lib.mjs';
const T = mk(); const { b } = await launch();
const cctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const cp = await cctx.newPage(); const cerr = []; cp.on('pageerror', e => cerr.push(e.message));
const mkSum = n => ({ date: 'Oct 15, 2026', title: 'Oct 15, 2026', note: n, homecare: ['SPF daily'], products: [], guides: [], ts: 1, _draftDate: '2026-10-15' });
const rec = { ok: true, client: { id: 'c1', name: 'Cooper Howard', data: { providerName: 'Ashley', studio: 'Botanical', profile: { nextVisit: 'Not scheduled', treatment: 'Facial' }, summaries: [mkSum('Your skin looked calmr today.')], aftercare: ['SPF daily'], products: [] } } };
await cp.route('**/api/**', r => { const u = new URL(r.request().url()); const J = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (u.pathname === '/api/client-data') return J(rec); if (u.pathname === '/api/client-prefs') return J({ ok: true, prefs: {} }); return J({ ok: true, messages: [] }); });
await cp.goto(BASE + '/slickchart-client.html?c=TOK_c1'); await cp.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await cp.waitForTimeout(1200);
await cp.evaluate(() => { _summaryIdx = 0; nav('summary'); });
const hasAsk = await cp.evaluate(() => { const i = document.querySelector('#S input, #S textarea'); if (i) { i.value = 'Can I wear makeup tomorrow?'; i.focus(); } return !!i; });
rec.client.data.summaries = [mkSum('Your skin looked calmer today.')];
await cp.evaluate(() => _pollRealClient()); await cp.waitForTimeout(1500);
const st = await cp.evaluate(() => ({ text: document.getElementById('S').innerText, q: (document.querySelector('#S input, #S textarea') || {}).value, screen: typeof currentScreen !== 'undefined' ? currentScreen : '' }));
T.check('open summary screen shows the corrected note without a tap', /calmer today/.test(st.text), st.screen + ' ' + st.text.slice(0, 200));
T.check('a question being typed into "Ask about your aftercare" survives the refresh', !hasAsk || st.q === 'Can I wear makeup tomorrow?', 'hasAsk=' + hasAsk + ' value now=' + JSON.stringify(st.q));
T.check('no page errors', !cerr.length, cerr.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
