import {boot} from './merge-boot.mjs';
const {b,p}=await boot();
const r=await p.evaluate(()=>{
  const out={};
  const M=(s,l,k)=>_mergeAuthoredById(s,l,_LIB_TOMB[k],{keyFn:_libKeyFn(k),keepUnkeyed:true});
  // 1. EDIT a default (id-less) automation: saveAuto assigns an id (line 39786)
  const def=[{name:'Post-peel check-in',trigger:'48h',on:true,sent:24,_sample:true},{name:'Birthday message',trigger:'bday',on:true,sent:12,_sample:true}];
  let server=JSON.stringify(def), A=JSON.parse(server);
  Object.assign(A[0],{name:'Post-peel check-in (3 days)',trigger:'72h'}); A[0].id='auto_123'; A[0]._ts=Date.now();
  let m=M(server,JSON.stringify(A),'sc_autos'); server=m.str;
  const after1=JSON.parse(m.str).map(x=>x.name+(x.id?'#'+x.id:''));
  // now delete the edited one on A
  A=JSON.parse(m.str); const ix=A.findIndex(x=>x.id==='auto_123'); _libForget('sc_autos',A[ix]); A.splice(ix,1);
  m=M(server,JSON.stringify(A),'sc_autos');
  out.autoEdit={afterEdit:after1,afterDeleteEdited:JSON.parse(m.str).map(x=>x.name+(x.id?'#'+x.id:''))};
  // try to delete the ghost (no id) -> no tomb -> comes back
  A=JSON.parse(m.str); server=m.str; const g=A.findIndex(x=>!x.id&&x.name==='Post-peel check-in'); _libForget('sc_autos',A[g]); A.splice(g,1);
  m=M(server,JSON.stringify(A),'sc_autos');
  out.autoEdit.afterDeleteGhost=JSON.parse(m.str).map(x=>x.name);
  // 2. sample removal on A while device B still has sample autos -> resurrect cycle
  // 3. toggle 2 different autos over 4 rounds
  server=JSON.stringify(def); A=JSON.parse(server); const log=[];
  for(let i=0;i<4;i++){A[i%2].on=!A[i%2].on; A[i%2].sent++; m=M(server,JSON.stringify(A),'sc_autos'); if(m.changed)server=m.str; A=JSON.parse(m.str); log.push(A.length);}
  out.autoToggleSentRows=log;
  return out;});
console.log(JSON.stringify(r,null,1));
await b.close();
