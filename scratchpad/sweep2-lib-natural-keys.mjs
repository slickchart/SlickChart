// sweep2: vendors, inventory and partners have no ids; their merge identity is the NAME (+sku).
// (1) RENAME on one device: the other device still holds the old name, so its next launch unions
//     both rows and pushes them — a duplicate vendor everywhere.
// (2) DELETE then RE-ADD the same name (an item that ran out and came back): the delete record is
//     grow-only and keyed on the name, so the re-added row is filtered out on the next pull.
// FIX=1 applies the proposed fix in-page: dated delete records lose to a row stamped AFTER them
// (_mergeAuthoredById), rows are stamped _ts on create/edit, and a rename records the old key.
import { makeServer, launch, device, flush, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const FIX = +(process.env.FIX || 0);
const FIX_JS = `(function(){
  window._tombStamps=function(keys){const out={};[].concat(keys||[]).forEach(function(tk){[(Cloud&&Cloud._incoming)?Cloud._incoming[tk]:null,_lsGet(tk)].forEach(function(raw){
    try{const v=JSON.parse(raw||'null');if(Array.isArray(v))v.forEach(function(x){if(x!=null)out[String(x)]=Math.max(out[String(x)]||0,1);});
      else if(v&&typeof v==='object')Object.keys(v).forEach(function(x){const t=Number(v[x])||1;out[x]=Math.max(out[x]||0,t);});}catch(e){}});});return out;};
  // A delete hides a row unless the row was saved AFTER it (re-added, restored, re-saved).
  window._tombHides=function(t,itemTs){t=Number(t)||0;const i=Number(itemTs)||0;if(!t)return false;if(t<=1||!i)return true;return t>=i;};
  window._mergeAuthoredById=function(serverStr,localStr,hiddenKey,opts){
    let srv,loc;try{srv=JSON.parse(serverStr||'[]');}catch(e){return null;}try{loc=JSON.parse(localStr||'[]');}catch(e){loc=[];}
    if(!Array.isArray(srv))return null;if(!Array.isArray(loc))loc=[];
    const keyOf=(opts&&opts.keyFn)||function(c){return (c&&c.id)?String(c.id):'';};const keepUnkeyed=!!(opts&&opts.keepUnkeyed);
    const hidden=_tombStamps(hiddenKey);const out=[],idx={};
    const take=function(c,fromLocal){if(!c)return;const cid=keyOf(c);if(!cid){if(keepUnkeyed)out.push(c);return;}
      if(_tombHides(hidden[cid],c._ts))return;
      if(!(cid in idx)){idx[cid]=out.length;out.push(c);return;}
      const cur=out[idx[cid]];const a=Number(cur&&cur._ts)||0,b=Number(c&&c._ts)||0;
      const pubCur=String((cur&&cur.status)||'')==='Published',pubNew=String((c&&c.status)||'')==='Published';
      if(b>a)out[idx[cid]]=c;else if(b===a&&pubNew&&!pubCur)out[idx[cid]]=c;else if(b===a&&pubCur&&!pubNew){}else if(!a&&!b&&!fromLocal)out[idx[cid]]=c;};
    srv.forEach(c=>take(c,false));loc.forEach(c=>take(c,true));
    const str=JSON.stringify(out);
    const srvFiltered=JSON.stringify(srv.filter(function(c){if(!c)return false;const k=keyOf(c);if(!k)return keepUnkeyed;return !_tombHides(hidden[k],c._ts);}));
    return {str:str,changed:str!==srvFiltered};};
})();`;
const srv = makeServer({
  sc_vendors: JSON.stringify([{ name: 'Glow', cat: 'Skincare', email: 'g@x.co' }]),
  sc_inventory: JSON.stringify([{ name: 'Gauze', sku: 'G1', qty: 50 }, { name: 'Retinol', sku: 'R1', qty: 3 }]),
});
const b = await launch();
const A = await device(b, srv, 'phone', null, FIX ? FIX_JS : null);
const Bseed = await A.evaluate(() => ({ sc_vendors: _lsGet('sc_vendors'), sc_inventory: _lsGet('sc_inventory') }));
// (1) phone renames the vendor (saveVendor's edit branch) and pushes
await A.evaluate((FIX) => { const v = vendors[0]; if (FIX) _libForget('sc_vendors', Object.assign({}, v)); v.name = 'Glow Supply Co'; if (FIX) v._ts = Date.now(); saveVendors(); }, FIX);
// (2) phone deletes Retinol (out of stock) ...
await A.evaluate(() => { const it = inv.find(x => x.sku === 'R1'); _libForget('sc_inventory', it); inv.splice(inv.indexOf(it), 1); saveInv(); });
await flush(A); await sleep(50);
// ... and re-adds it when the order arrives
await A.evaluate((FIX) => { const row = { name: 'Retinol', sku: 'R1', qty: 12 }; if (FIX) row._ts = Date.now(); inv.push(row); saveInv(); }, FIX);
await flush(A);
// the computer (still holding this morning's copy) launches
const B = await device(b, srv, 'computer', Bseed, FIX ? FIX_JS : null);
await flush(B);
const bv = await B.evaluate(() => vendors.map(v => v.name));
check('computer: one vendor after the rename, not two', bv.length === 1, bv);
const acctV = JSON.parse(srv.kv.sc_vendors).map(v => v.name);
check('account: one vendor after the rename', acctV.length === 1, acctV);
// the phone relaunches
const A2 = await device(b, srv, 'phone-relaunch', await A.evaluate(() => ({ sc_vendors: _lsGet('sc_vendors'), sc_inventory: _lsGet('sc_inventory'), sc_deleted_inventory: _lsGet('sc_deleted_inv'), sc_deleted_inv: _lsGet('sc_deleted_inv') })), FIX ? FIX_JS : null);
const ai = await A2.evaluate(() => inv.map(x => x.name + ':' + x.qty));
check('phone after relaunch: the re-added Retinol is still there', ai.some(x => /^Retinol:12/.test(x)), ai);
const bi = await B.evaluate(() => inv.map(x => x.name + ':' + x.qty));
check('computer: sees the re-added Retinol', bi.some(x => /^Retinol:12/.test(x)), bi);
await b.close();
process.exit(report() ? 1 : 0);
