import {boot} from './merge-boot.mjs';
const {b,p}=await boot();
const r=await p.evaluate(()=>{
  const out={};
  // push() drops a value _sameSyncValue-equal to what the account holds (line 4774/26423); model that.
  const pushed=(server,str)=>!_sameSyncValue(server,str);
  {let server=JSON.stringify([{id:'x',preview:'new msg',ts:200,unread:true},{id:'y',preview:'old',ts:50}]);
   let devA=server, devB=JSON.stringify([{id:'y',preview:'old',ts:50},{id:'x',preview:'older msg',ts:100,unread:false}]);let n=0;
   for(let i=0;i<5;i++){let m=_mergeThreads(server,devB);devB=m.str;if(m.changed&&pushed(server,m.str)){server=m.str;n++;}
     m=_mergeThreads(server,devA);devA=m.str;if(m.changed&&pushed(server,m.str)){server=m.str;n++;}}
   out.threads={realPushesIn10Pulls:n};}
  {const b1={id:'b1',status:'pending',seen:false},b2={id:'b2',status:'pending',seen:false};
   let server=JSON.stringify([b2,b1]),devA=server,devB=JSON.stringify([b1]);let n=0;
   for(let i=0;i<5;i++){let m=_mergeBookings(server,devB);devB=m.str;if(m.changed&&pushed(server,m.str)){server=m.str;n++;}
     m=_mergeBookings(server,devA);devA=m.str;if(m.changed&&pushed(server,m.str)){server=m.str;n++;}}
   out.bookings={realPushesIn10Pulls:n};}
  {const t1={qs:['a'],_ts:5},t2={qs:['b'],_ts:6};
   let devA=JSON.stringify({tmpls:{f1:t1,f2:t2},guides:{},custom:[],emojis:{}}),devB=JSON.stringify({tmpls:{f2:t2,f1:t1},guides:{},custom:[],emojis:{}});
   let server=devA,n=0;
   for(let i=0;i<5;i++){let m=_mergeForms(server,devB);devB=m.str;if(m.changed&&pushed(server,m.str)){server=m.str;n++;}
     m=_mergeForms(server,devA);devA=m.str;if(m.changed&&pushed(server,m.str)){server=m.str;n++;}}
   out.forms={realPushesIn10Pulls:n};}
  {let server=JSON.stringify({c1:['g1','g2']}),devA=JSON.stringify({c1:['g1']}),devB=server;let n=0;
   for(let i=0;i<5;i++){let m=_mergeTombstone('sc_summary_guide_optout',server,devA);devA=m;if(m!==server&&pushed(server,m)){server=m;n++;}
     m=_mergeTombstone('sc_summary_guide_optout',server,devB);devB=m;if(m!==server&&pushed(server,m)){server=m;n++;}}
   out.optout={realPushesIn10Pulls:n,devA,devB};}
  return out;});
console.log(JSON.stringify(r));
await b.close();
