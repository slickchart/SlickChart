// A form on the account whose id is on sc_hidden_forms (legacy recycled 'customN' id, tomb=1) and dated.
// Each device that loads it re-keys it to its OWN random id -> union -> duplicates.
import {makeServer,launch,device,flush,resync,sleep} from './boot-h.mjs';
const T=Date.now()-86400000;
const forms={tmpls:{custom3:{name:'Brow Lamination Consent',qs:[{id:'q1',label:'Name',type:'Short text'}],_ts:T}},guides:{},emojis:{},custom:[{id:'custom3',name:'Brow Lamination Consent',_ts:T}]};
const kv={sc_forms:JSON.stringify(forms),sc_hidden_forms:JSON.stringify({custom3:1}),sc_professions:JSON.stringify(['esthetician'])};
const srv=makeServer(kv);
const b=await launch();
const local={sc_forms:JSON.stringify(forms),sc_hidden_forms:JSON.stringify({custom3:1})};
const count=()=>{const f=JSON.parse(srv.kv.sc_forms||'{}');return (f.custom||[]).filter(x=>/Brow Lamination/.test(x.name)).map(x=>x.id);};
// Device B already has the copy on disk but is closed; A opens first.
const A=await device(b,srv,'A',local);await flush(A);await sleep(6500);await flush(A);
console.log('after A boot  account copies:',count());
const B=await device(b,srv,'B',local);await flush(B);await sleep(6500);await flush(B);
console.log('after B boot  account copies:',count());
const C=await device(b,srv,'C',local);await flush(C);await sleep(6500);await flush(C);
console.log('after C boot  account copies:',count());
for(let i=0;i<3;i++){await resync(A);await resync(B);await resync(C);}
console.log('after 3 resync rounds account copies:',count());
const onA=await A.evaluate(()=>customForms.filter(f=>/Brow Lamination/.test(f.name)).map(f=>f.id));
console.log('device A shows:',onA);
await b.close();
