import {boot} from './merge-boot.mjs';
const {b,p}=await boot();
const r=await p.evaluate(()=>{
  const M=(s,l,k)=>_mergeAuthoredById(s,l,_LIB_TOMB[k],{keyFn:_libKeyFn(k),keepUnkeyed:true});
  const local=[{name:'HA Serum',size:'1oz',qty:3,_ts:1},{name:'HA Serum',size:'2oz',qty:5,_ts:2}];
  const m=M(JSON.stringify([]),JSON.stringify(local),'sc_inventory');
  const m2=M(JSON.stringify(local),JSON.stringify(local),'sc_inventory');
  return {pushNew:JSON.parse(m.str).map(x=>x.size),sameBothSides:JSON.parse(m2.str).map(x=>x.size),changed:m2.changed};
});
console.log(JSON.stringify(r));
await b.close();
