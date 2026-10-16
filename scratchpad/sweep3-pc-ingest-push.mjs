// When a consult submission arrives (syncClientEvents -> vc_submit), what value of sc_pro_vc_subs
// actually goes up to the account? persistVcState pushes the new blob, then the flush line pushes
// _lsGet('sc_pro_vc_subs')||'' into the same batch (last write wins), and persistVcState keeps that
// key OUT of localStorage once IndexedDB has it.
import { launch, provider, check, finish } from './sweep3-pc-lib.mjs';
const browser = await launch();
let events = [];
const pushes = [];
const prov = await provider(browser, { handler: (r, u, J) => {
  const m = r.request().method();
  if (u.includes('/api/clients') && m === 'GET') return J(r, { ok: true, clients: [], events });
  if (m !== 'GET') { const b = r.request().postData() || ''; if (b.includes('sc_pro_vc_subs')) pushes.push({ u, b }); }
  return null;
} });
await prov.evaluate(async () => {
  CL.aw = { name: 'Ashley Watson', concerns: '' };
  CL.bb = { name: 'Bea Brown', concerns: '' };
  vcSubmissions.bb = { photos: [], goals: 'older consult, other client', answers: [{ q: 'Q', a: 'bea answer' }], kind: 'product', title: 'Product consult', date: 'Oct 1' };
  persistVcState();
  _productConsult('aw');
  await new Promise(r => setTimeout(r, 2500));
});
const ls1 = await prov.evaluate(() => ({ ls: localStorage.getItem('sc_pro_vc_subs'), lsGet: _lsGet('sc_pro_vc_subs') }));
pushes.length = 0;
events = [{ id: 'ev_p1', client_id: 'aw', kind: 'vc_submit', created_at: new Date().toISOString(),
  payload: { kind: 'product', title: 'Product consult', date: 'Oct 16', photos: [], goals: '', routine: [], answers: [{ q: 'What are you using now?', a: 'Cerave + SPF 30' }] } }];
await prov.evaluate(async () => { await syncClientEvents(); await new Promise(r => setTimeout(r, 3000)); });
const sent = pushes.map(p => { let o = null; try { o = JSON.parse(p.b); } catch (e) {} const find = x => { if (!x || typeof x !== 'object') return undefined; if ('sc_pro_vc_subs' in x) return x.sc_pro_vc_subs; for (const k of Object.keys(x)) { const r = find(x[k]); if (r !== undefined) return r; } }; return { u: p.u, v: o ? find(o) : p.b.slice(0, 200) }; });
const last = sent.length ? sent[sent.length - 1].v : undefined;
check('local copy of sc_pro_vc_subs is gone from localStorage once IndexedDB holds it', !ls1.lsGet, ls1);
check('after a submission arrives, the account is sent an EMPTY/stale sc_pro_vc_subs (answers + other clients\' consults not in it)', last !== undefined && !(String(last).includes('Cerave') && String(last).includes('bea answer')), sent.map(s => ({ u: s.u, v: String(s.v).slice(0, 200) })));
check('page errors', prov._errs.length > 0, prov._errs);
await browser.close(); finish();
