// An edit saved WHILE a pull is in flight: the PUT lands first, then the pull's older answer is applied.
import {makeServer,launch,device,flush,sleep} from './boot-h.mjs';
const now=Date.now();
const kv={sc_booking_page:JSON.stringify({on:true,note:'old note',depositAmount:0}),
  sc_client_recs:JSON.stringify({c1:['p1']}),
  sc_clients:JSON.stringify({c1:{id:'c1',name:'Amber Lee',_uAt:now-5e6}}),
  sc_professions:JSON.stringify(['esthetician'])};
const srv=makeServer(kv);
const b=await launch();
const A=await device(b,srv,'A',{});await flush(A);await sleep(6500);await flush(A);
srv.getDelay=2500;   // a phone on a weak signal: the account read takes 2.5 s
// what _resumePull does, started; she saves two things during the read
const res=A.evaluate(async()=>{const n=await Cloud.pull();try{_reloadAll();}catch(e){}try{_afterAccountRead();}catch(e){}return n;});
await sleep(400);
await A.evaluate(()=>{bookCfg.note='NEW note';saveBookCfg();
  clientRecs.c1=['p1','p2'];persistClientRecs();});
await sleep(800);
console.log('server right after her saves: booking.note=',JSON.parse(srv.kv.sc_booking_page).note,' recs.c1=',JSON.parse(srv.kv.sc_client_recs).c1);
await res;srv.getDelay=0;await sleep(500);
const after=await A.evaluate(()=>({note:bookCfg.note,ls:JSON.parse(localStorage.getItem('sc_booking_page')).note,recs:clientRecs.c1,lsRecs:JSON.parse(_lsGet('sc_client_recs')).c1}));
console.log('device after pull applied:',JSON.stringify(after));
// a later, unrelated edit to the same blob (she toggles deposits) and a plan edit on another client
await A.evaluate(()=>{bookCfg.depositAmount=25;saveBookCfg();clientRecs.c1=(clientRecs.c1||[]).slice();persistClientRecs();});
await flush(A);await sleep(500);
console.log('server after next save: booking.note=',JSON.parse(srv.kv.sc_booking_page).note,' recs.c1=',JSON.parse(srv.kv.sc_client_recs).c1);
await b.close();
