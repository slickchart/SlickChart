import {boot} from './merge-boot.mjs';
const {b,p}=await boot();
const r=await p.evaluate(()=>{
  // A got a new client message on x (unread:true, moved to front). B last saw x read, older preview.
  let server=JSON.stringify([{id:'x',preview:'new msg',ts:200,unread:true},{id:'y',preview:'old',ts:50}]);
  let devA=server, devB=JSON.stringify([{id:'y',preview:'old',ts:50},{id:'x',preview:'older msg',ts:100,unread:false}]);
  let m=_mergeThreads(server,devB); devB=m.str; server=m.changed?m.str:server;
  m=_mergeThreads(server,devA); devA=m.str;
  return {devB_x:JSON.parse(devB).find(t=>t.id==='x'),devA_x_after:JSON.parse(devA).find(t=>t.id==='x')};
});
console.log(JSON.stringify(r));
// merge idempotence sweep: merge(X,X) equal & unchanged for many merges
const r2=await p.evaluate(()=>{
  const X={
    clients:JSON.stringify({c1:{id:'c1',name:'a',_uAt:5,submittedForms:[{formId:'f',signed:true,date:'d',title:'t'}],summaries:[{ts:3,_draftDate:'2026-01-01'}]}}),
    arr:JSON.stringify([{id:'a',_ts:1},{id:'b'}]),
    bk:JSON.stringify([{id:'b1',status:'pending'}]),
    th:JSON.stringify([{id:'t1',unread:true}]),
    ms:JSON.stringify({c1:[{from:'me',text:'hi',_mid:'m1'},{from:'them',text:'yo'}]}),
    se:JSON.stringify(['e1','e2']),
    ws:JSON.stringify({clientRecs:{c1:['p']},recReasons:{},clientHomecare:{},customProducts:[{id:'p'}],inOffice:{},codes:{}}),
    cm:JSON.stringify({c1:[{ts:2,_draftDate:'2026-01-01'}]}),
    sd:JSON.stringify({note:{c1:'x'},obs:{},src:{},_ts:{note:{c1:3},obs:{},src:{}}}),
    sr:JSON.stringify({esty:{c1:{name:'r',ts:1}}}),
    at:JSON.stringify({k:5}),
    ib:JSON.stringify([{id:'ib1',at:Date.now()}]),
  };
  const res={};
  const chk=(n,f,x)=>{const m=f(x,x);const s=m&&(m.str!=null?m.str:m);res[n]={changed:!!(m&&m.changed),same:_sameSyncValue(s,x),bytesSame:s===x};};
  chk('clients',_mergeClients,X.clients);
  chk('authored',(a,b)=>_mergeAuthoredById(a,b,'sc_deleted_docs',{keepUnkeyed:true}),X.arr);
  chk('bookings',_mergeBookings,X.bk);
  chk('threads',_mergeThreads,X.th);
  chk('msgstore',_mergeMsgStore,X.ms);
  chk('seen',_mergeSeenEvents,X.se);
  chk('workspace',_mergeWorkspace,X.ws);
  chk('summaries',(a,b)=>_mergeClientMap(a,b,'sc_session_summaries'),X.cm);
  chk('recs',(a,b)=>_mergeClientMap(a,b,'sc_client_recs'),JSON.stringify({c1:['p1']}));
  chk('sumDrafts',_mergeSummaryDrafts,X.sd);
  chk('sentRoutines',_mergeSentRoutines,X.sr);
  chk('routines',(a,b)=>_mergeAuthoredMap(a,b,'sc_deleted_routines',{}),JSON.stringify({esty:[{id:'r1'}]}));
  chk('attn',_mergeAttnSeen,X.at);
  chk('impBatches',_mergeImportBatches,X.ib);
  chk('stamped',_mergeStamped,JSON.stringify({a:1,_ts:3}));
  chk('tombArr',(a,b)=>_mergeTombstone('sc_notif_read',a,b),JSON.stringify(['a','b']));
  chk('tombObj',(a,b)=>_mergeTombstone('sc_deleted_docs',a,b),JSON.stringify({a:5}));
  chk('courses',_mergeCourses,JSON.stringify([{id:'c1',_ts:1}]));
  return res;});
console.log(JSON.stringify(r2));
await b.close();
