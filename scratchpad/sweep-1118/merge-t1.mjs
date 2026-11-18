import {boot} from './merge-boot.mjs';
const {b,p}=await boot();
const r=await p.evaluate(()=>{
  const out={};
  const M=(s,l,k)=>_mergeAuthoredById(s,l,_LIB_TOMB[k],{keyFn:_libKeyFn(k),keepUnkeyed:true});
  // A. id-less default autos; device A toggles one (what _toggleAuto+persistAutos produce)
  const def=[
  {name:'Post-peel check-in',trigger:'48 hours after Chemical Peel',on:true,sent:24,_sample:true},
  {name:'Post-facial follow-up',trigger:'24h',on:true,sent:47,_sample:true},
  {name:'Birthday message',trigger:'bday',on:true,sent:12,_sample:true}];
  let server=JSON.stringify(def), A=JSON.parse(server);
  const log=[];
  for(let round=1;round<=4;round++){
    A[0].on=!A[0].on;                           // toggle on device A
    const m=M(server,JSON.stringify(A),'sc_autos');
    if(m.changed)server=m.str;                  // pushed back
    A=JSON.parse(m.str);
    log.push({round,rows:A.length,changed:m.changed});
  }
  out.autoToggle=log;
  // B. delete id-less auto on device A -> resurrect?
  server=JSON.stringify(def); A=JSON.parse(server);
  const gone=A.splice(1,1)[0]; _libForget('sc_autos',gone);
  const tomb=localStorage.getItem('sc_deleted_autos');
  const m2=M(server,JSON.stringify(A),'sc_autos');
  out.autoDelete={before:3,afterDelete:A.length,afterPull:JSON.parse(m2.str).length,tomb};
  // C. idempotence M(X,X)
  const m3=M(server,server,'sc_autos'); out.idem={rows:JSON.parse(m3.str).length,changed:m3.changed};
  return out;
});
console.log(JSON.stringify(r,null,1));
await b.close();
