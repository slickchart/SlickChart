// Two tabs of the provider app, same browser (shared localStorage). No cross-tab sync of sc_* keys.
import {makeServer,launch,device,flush,resync,sleep} from './boot-h.mjs';
const T=Date.now()-86400000;
const forms={tmpls:{custom_old1:{name:'Old Form',qs:[{id:'q1',label:'Name',type:'Short text'}],_ts:T}},guides:{},emojis:{},custom:[{id:'custom_old1',name:'Old Form',_ts:T}]};
const srv=makeServer({sc_forms:JSON.stringify(forms),sc_professions:JSON.stringify(['esthetician']),
  sc_clients:JSON.stringify({c1:{id:'c1',name:'Amber Lee',_uAt:T}})});
const b=await launch();
const A=await device(b,srv,'tabA',{});await flush(A);await sleep(6500);await flush(A);
const B=await device(b,srv,'tabB',{},{ctx:A.context()});await flush(B);await sleep(6500);await flush(B);
// Tab A: she makes a new form
await A.evaluate(()=>{const id='custom_tabA_new';formTmpls[id]={name:'Tab A New Form',qs:[{id:'q1',label:'Name',type:'Short text'}]};customForms.push({id,name:'Tab A New Form',_ts:Date.now()});persistForms();});
await flush(A);
const ids=()=>(JSON.parse(srv.kv.sc_forms||'{}').custom||[]).map(f=>f.id);
console.log('account after tab A saves:',ids());
// Tab B (opened earlier, not re-read since): she renames the old form there
await B.evaluate(()=>{formTmpls.custom_old1.name='Old Form (renamed in B)';customForms.find(f=>f.id==='custom_old1').name='Old Form (renamed in B)';persistForms();});
await flush(B);
console.log('account after tab B saves:',ids());
console.log('shared device storage now:',(JSON.parse(await A.evaluate(()=>_lsGet('sc_forms'))).custom||[]).map(f=>f.id));
await resync(A);
console.log('tab A after its next account read shows:',await A.evaluate(()=>customForms.map(f=>f.name)));
await b.close();
