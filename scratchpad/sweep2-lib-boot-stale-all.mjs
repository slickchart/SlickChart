// sweep2: which libraries does a RELAUNCHING device (holding an older copy of the same rows) put back
// over the account during boot? The account holds v:'new' (edited elsewhere), the device v:'old'.
// Rows unstamped on both sides (the common case for most libraries). Reports every key whose account
// copy went back to 'old'. FIX=1 = bootDone refreshes held batch values from the post-merge device copy.
import { makeServer, launch, device, flush, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const FIX_JS = `(function(){const orig=Cloud.bootDone;Cloud.bootDone=function(){
  try{const bt=this._pushBatch;if(bt&&bt.items)for(const k in bt.items){const cur=_lsGet(k);if(cur!=null)bt.items[k]=String(cur);}}catch(e){}
  return orig.apply(this,arguments);};})();`;
const libs = {
  sc_inventory: v => [{ name: 'Gauze', sku: 'G1', qty: 50, v }], sc_vendors: v => [{ name: 'Glow', v }], sc_partners: v => [{ name: 'Dr Lee', v }],
  sc_autos: v => [{ id: 'au1', name: 'Rebook', v }], sc_protocols: v => [{ id: 'pr1', name: 'Peel', v }], sc_docs: v => [{ id: 'd1', title: 'Lic', v }],
  sc_payments: v => [{ id: 'pay1', amount: 50, status: 'unpaid', v }], sc_reminders: v => [{ id: 'r1', title: 'x', at: Date.now() + 9e7, v }],
  sc_service_menu: v => [{ id: 'svc1', name: 'Facial', price: 95, v }], sc_bundles: v => [{ id: 'b1', name: 'Pack', v }],
  sc_vc_types: v => [{ id: 'vt1', title: 'Acne', v }], sc_affiliate_links: v => [{ id: 'a1', name: 'Serum', custom: true, v }],
  sc_courses: v => [{ id: 'c_mine', title: 'Mine', status: 'Published', lessons: [], v }], sc_resources: v => [{ id: 'g-custom-1', title: 'G', v }],
  sc_manual_appts: v => [{ id: 'ma1', client: 'Jen', date: '2026-12-01', time: '10:00 AM', v }],
  sc_checkins: v => [{ id: 'ci1', clientId: 'c1', at: Date.now(), dateLabel: 'December 1', v }],
  sc_checkin_cfg: v => ({ welcome: v, drinks: [{ id: 'dr1', label: v }] }), sc_booking_page: v => ({ headline: v }),
  sc_notif_settings: v => ({ quiet: v }), sc_shop_bundles: v => [{ id: 'sb1', name: 'Kit', v }],
};
const kv = {}, local = {};
Object.entries(libs).forEach(([k, f]) => { kv[k] = JSON.stringify(f('new')); local[k] = JSON.stringify(f('old')); });
Object.assign(kv, { sc_courses_custom: '1', sc_protocols_custom: '1', sc_service_menu_custom: '1', sc_affiliate_custom: '1' });
const srv = makeServer(kv);
const b = await launch();
const p = await device(b, srv, 'relaunch', local, process.env.FIX ? FIX_JS : null);
await flush(p); await sleep(6500); await flush(p);
for (const k of Object.keys(libs)) check(k + ': account not reverted by a relaunching device', !/"old"/.test(srv.kv[k] || ''), (srv.kv[k] || '').slice(0, 90));
await b.close();
process.exit(report() ? 1 : 0);
