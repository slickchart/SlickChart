// sweep2: a FRESH device signing in (new phone, or after a sign-out purge) uploads its boot defaults
// over the account for libraries whose rows carry no id. Seeds the account with real rows in every
// library, boots one empty device, and reports every key whose account copy lost rows.
import { makeServer, launch, device, flush, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const now = Date.now();
const seed = {
  sc_inventory: [{ name: 'Retinol serum', sku: 'R1', qty: 10 }, { name: 'Gauze', sku: 'G1', qty: 50 }],
  sc_vendors: [{ name: 'Glow Supply', email: 'a@b.co' }],
  sc_partners: [{ name: 'Dr Lee', type: 'Derm' }],
  sc_autos: [{ id: 'au1', name: 'Rebook nudge', on: true, _ts: now }],
  sc_protocols: [{ id: 'pr1', name: 'My peel', steps: ['a'], _ts: now }],
  sc_docs: [{ id: 'd1', title: 'License', _ts: now }],
  sc_payments: [{ id: 'pay1', amount: 50, status: 'paid' }],
  sc_reminders: [{ id: 'r1', title: 'x', at: now + 86400000, _ts: now }],
  sc_msg_templates: [{ id: 'vc_review', text: 'Hi', _ts: now }],
  sc_note_starters: [{ id: 'st1', name: 'Mine', body: 'S:', _ts: now }],
  sc_service_menu: [{ id: 'svc1', name: 'Facial', price: 95, _ts: now }],
  sc_bundles: [{ id: 'b1', name: 'Pack', _ts: now }],
  sc_shop_bundles: [{ id: 'sb1', name: 'Kit' }],
  sc_vc_types: [{ id: 'vt1', title: 'Acne consult', _ts: now }],
  sc_custom_note_templates: [{ id: 'nt1', name: 'Mine', body: 'x' }],
  sc_needle_presets: [{ id: 'np1', name: '0.5mm' }],
  sc_affiliate_links: [{ id: 'a1', name: 'My serum', custom: true, url: 'https://x.co', _ts: now }],
  sc_courses: [{ id: 'c_mine', title: 'Mine', status: 'Published', lessons: [], _ts: now }],
  sc_resources: [{ id: 'g-custom-1', title: 'My guide', _ts: now }],
  sc_manual_appts: [{ id: 'ma1', client: 'Jen', date: '2026-12-01', time: '10:00 AM', _ts: now }],
  sc_checkins: [{ id: 'ci1', clientId: 'c1', at: now, dateLabel: 'December 1' }],
  sc_routines: { esty: [{ id: 'rt1', name: 'AM', items: [], _ts: now }] },
};
const kv = {}; Object.entries(seed).forEach(([k, v]) => { kv[k] = JSON.stringify(v); });
kv.sc_courses_custom = '1'; kv.sc_protocols_custom = '1'; kv.sc_service_menu_custom = '1'; kv.sc_affiliate_custom = '1';
const srv = makeServer(kv);
const b = await launch();
// FIX=1: bootDone sends each held key's CURRENT device value (post-merge), not the boot-time snapshot.
const FIX_JS = `(function(){const orig=Cloud.bootDone;Cloud.bootDone=function(){
  try{const bt=this._pushBatch;if(bt&&bt.items)for(const k in bt.items){const cur=_lsGet(k);if(cur!=null)bt.items[k]=String(cur);}}catch(e){}
  return orig.apply(this,arguments);};})();`;
// FIX=2: the shrink guard reads the natural keys of the id-less libraries (vendors, inventory, partners).
const FIX2_JS = `(function(){const orig=_idsOf;window._idsOf=function(str){const r=orig(str);if(r)return r;return null;};
  const origDrop=_dropBootShrinks;window._dropBootShrinks=function(items,where){
    try{const seen=Cloud._serverSeen||{};for(const k in items){if(!_LIB_NATURAL[k]||!(k in seen))continue;
      const kf=_libKeyFn(k);const ids=function(s){try{const v=JSON.parse(s);return Array.isArray(v)?v.map(kf).filter(Boolean):null;}catch(e){return null;}};
      const had=ids(seen[k]),now=ids(items[k]);if(!had||!now)continue;const have={};now.forEach(function(i){have[i]=1;});
      const gone=_allDeletedIds();const lost=had.filter(function(i){return !have[i]&&!gone[i];});
      if(lost.length){console.warn('[SlickChart] refused to drop '+lost.length+' from '+k);delete items[k];}}}catch(e){}
    return origDrop(items,where);};})();`;
const p = await device(b, srv, 'new-phone', null, process.env.FIX === '2' ? FIX2_JS : process.env.FIX ? FIX_JS : null);
await flush(p); await sleep(7000); await flush(p);   // past the 6s boot failsafe
const rows = (s) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.length : Object.values(v).reduce((n, x) => n + (Array.isArray(x) ? x.length : 1), 0); } catch (e) { return -1; } };
for (const k of Object.keys(seed)) {
  const before = rows(kv[k]) , after = rows(srv.kv[k]);
  const devN = await p.evaluate((k) => { try { const v = JSON.parse(_lsGet(k)); return Array.isArray(v) ? v.length : Object.values(v).reduce((n, x) => n + (Array.isArray(x) ? x.length : 1), 0); } catch (e) { return -1; } }, k);
  check(k + ': account kept its rows after a new device signed in', after >= before, 'account ' + seed[k].length + '->' + after + ', device ' + devN);
}
console.log('uploads:', srv.puts.map(x => x.dev + ':' + x.keys.filter(k => seed[k]).join('+')).join(' | '));
await b.close();
process.exit(report() ? 1 : 0);
