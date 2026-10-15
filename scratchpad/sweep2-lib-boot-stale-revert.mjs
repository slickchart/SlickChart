// sweep2: _purgeSample() runs on every boot and calls saveInv() / saveVendors() / persistPartners()
// unconditionally. While booting, _pushKeyNow holds those values in Cloud._pushBatch, and bootDone()
// sends the batch AFTER the pull — still carrying the PRE-PULL device copy. Those three libraries
// have no ids, so _dropBootShrinks cannot see them. Result: every relaunch of a device puts ITS OLD
// copy of inventory / vendors / partners over the account; the phone's newer stock count is lost on
// the phone's own next launch (unstamped rows: the account copy wins).
// FIX=1: bootDone refreshes each held batch value from the device's current (post-merge) value.
import { makeServer, launch, device, flush, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const FIX_JS = `(function(){const orig=Cloud.bootDone;Cloud.bootDone=function(){
  try{const bt=this._pushBatch;if(bt&&bt.items)for(const k in bt.items){const cur=_lsGet(k);if(cur!=null)bt.items[k]=String(cur);}}catch(e){}
  return orig.apply(this,arguments);};})();`;
const P = process.env.FIX ? FIX_JS : null;
const srv = makeServer({ sc_inventory: JSON.stringify([{ name: 'Retinol', sku: 'R1', qty: 10 }]), sc_partners: JSON.stringify([{ name: 'Dr Lee', discount: '10%' }]) });
const b = await launch();
const phone = await device(b, srv, 'phone', null, P);
const compSeed = await phone.evaluate(() => ({ sc_inventory: _lsGet('sc_inventory'), sc_partners: _lsGet('sc_partners') }));
await phone.evaluate(() => { inv[0].qty = 2; saveInv(); partners[0].discount = '15%'; persistPartners(); });
await flush(phone);
check('account has the phone\'s count', /"qty":2/.test(srv.kv.sc_inventory), srv.kv.sc_inventory);
const comp = await device(b, srv, 'computer', compSeed, P);   // relaunch with this morning's copy
await flush(comp); await sleep(6500); await flush(comp);
check('account still has the phone\'s count after the computer launches', /"qty":2/.test(srv.kv.sc_inventory), srv.kv.sc_inventory);
check('account still has the phone\'s partner edit', /15%/.test(srv.kv.sc_partners), srv.kv.sc_partners);
const phone2 = await device(b, srv, 'phone-relaunch', await phone.evaluate(() => ({ sc_inventory: _lsGet('sc_inventory'), sc_partners: _lsGet('sc_partners') })), P);
const q = await phone2.evaluate(() => inv.map(x => x.qty));
check('phone after its own relaunch still shows 2', q[0] === 2, q);
await b.close();
process.exit(report() ? 1 : 0);
