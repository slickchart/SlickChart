import {boot} from './merge-boot.mjs';
const {b,p}=await boot();
const r=await p.evaluate(()=>{
  const out={};
  // ---- A. submittedForms: same in-person form, before/after evId stamped (line 23251 / 34382)
  {
    const f0={formId:'intake',title:'Intake',signed:true,date:'Nov 18, 2026',at:1000,idem:'ipabc',answers:{a:1}};
    const B={id:'c1',name:'Jo',_uAt:100,submittedForms:[Object.assign({},f0)]};          // phone: before upload
    const A={id:'c1',name:'Jo',_uAt:200,submittedForms:[Object.assign({},f0,{evId:'ev_9'})]}; // iPad: after upload
    let srv=JSON.stringify({c1:A}), loc=JSON.stringify({c1:B});
    const counts=[];
    for(let i=0;i<3;i++){const m=_mergeClients(srv,loc); const v=JSON.parse(m.str); counts.push(v.c1.submittedForms.length+(m.changed?'(push)':'')); srv=m.changed?m.str:srv; loc=m.str;}
    out.formEvIdDup=counts;
  }
  // ---- B. sc_summary_guide_optout (_TOMB_OBJ, values are arrays; local wins on collision)
  {
    let server=JSON.stringify({c1:['g1']});
    let devA=JSON.stringify({c1:['g1']}), devB=JSON.stringify({c1:['g1']});
    devB=JSON.stringify({c1:['g1','g2']}); server=devB;     // B opts out of g2, pushes immediately
    const log=[];
    for(let i=0;i<3;i++){
      let m=_mergeTombstone('sc_summary_guide_optout',server,devA); devA=m; if(m!==server){server=m;log.push('A pushes '+m);} 
      m=_mergeTombstone('sc_summary_guide_optout',server,devB); devB=m; if(m!==server){server=m;log.push('B pushes '+m);}
    }
    out.optoutPingPong={pushes:log.length,first:log.slice(0,3),devA,devB};
  }
  // ---- C. sc_threads: order differs (34660 moves a thread to the front)
  {
    let server=JSON.stringify([{id:'x',preview:'new msg',unread:true},{id:'y',preview:'old'}]); // A received a message on x
    let devA=server, devB=JSON.stringify([{id:'y',preview:'old'},{id:'x',preview:'older msg',unread:false}]);
    let pushes=0;const seq=[];
    for(let i=0;i<4;i++){
      let m=_mergeThreads(server,devB); devB=m.str; if(m.changed){server=m.str;pushes++;seq.push('B');}
      m=_mergeThreads(server,devA); devA=m.str; if(m.changed){server=m.str;pushes++;seq.push('A');}
    }
    out.threadsPingPong={pushes,seq:seq.join(''),serverX:JSON.parse(server).find(t=>t.id==='x').preview,devAx:JSON.parse(devA).find(t=>t.id==='x').preview};
  }
  // ---- D. sc_bookings: upsertBooking unshifts on the device that ingested it, merge appends elsewhere
  {
    const b1={id:'b1',status:'pending',seen:false},b2={id:'b2',status:'pending',seen:false};
    let server=JSON.stringify([b2,b1]), devA=server, devB=JSON.stringify([b1]);
    let pushes=0;
    for(let i=0;i<4;i++){
      let m=_mergeBookings(server,devB); devB=m.str; if(m.changed){server=m.str;pushes++;}
      m=_mergeBookings(server,devA); devA=m.str; if(m.changed){server=m.str;pushes++;}
    }
    out.bookingsPingPong={pushes8pulls:pushes};
  }
  // ---- E. sc_forms: same content, map keys in a different order on the two devices
  {
    const t1={qs:['a'],_ts:5},t2={qs:['b'],_ts:6};
    let devA=JSON.stringify({tmpls:{f1:t1,f2:t2},guides:{},custom:[],emojis:{}});
    let devB=JSON.stringify({tmpls:{f2:t2,f1:t1},guides:{},custom:[],emojis:{}});
    let server=devA, pushes=0;
    for(let i=0;i<4;i++){
      let m=_mergeForms(server,devB); devB=m.str; if(m.changed){server=m.str;pushes++;}
      m=_mergeForms(server,devA); devA=m.str; if(m.changed){server=m.str;pushes++;}
    }
    const same=_sameSyncValue(devA,devB);
    out.formsKeyOrder={pushes8pulls:pushes,identicalByMeaning:same};
    // idempotence merge(X,X)
    const m=_mergeForms(devA,devA); out.formsIdem={changed:m.changed};
  }
  // ---- F. _unionEntryLists: an entry with no key is pushed from BOTH sides on every merge
  {
    let x=JSON.stringify({c1:[{pid:'',ts:0,phase:'before'}]});
    const lens=[];let s=x,l=x;
    for(let i=0;i<4;i++){const m=_mergeClientMap(s,l,'sc_photo_index'); l=m.str; if(m.changed)s=m.str; lens.push(JSON.parse(m.str).c1.length);}
    out.unkeyedEntryDoubling=lens;
  }
  return out;});
console.log(JSON.stringify(r,null,1));
await b.close();
