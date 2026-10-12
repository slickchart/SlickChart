// The roster gate must not latch. Ashley's paste: 775 clients saved on the device, 50 in memory,
// so _rosterNotReadYet() stayed true forever and syncClientEvents() returned on its first line on
// every poll. Nothing a client sent was read on that device at all.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;
const file=process.argv[2]||'slickchart.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

const EVENTS=[{id:'ev_newbooking',kind:'booking',client_id:'c_keep',created_at:Date.now(),
  payload:{client:'Ashley Watson',treatment:'New client',date:'2026-10-13',time:'12:00 PM'}}];

// A roster where most ids are on disk but deliberately absent from memory - merged, deleted or
// otherwise dropped by _purgeRemovedClients. Exactly her 775-vs-50 shape, in miniature.
const DISK={}; for(let i=0;i<40;i++)DISK['c_gone'+i]={id:'c_gone'+i,name:'Gone '+i};
DISK['c_keep']={id:'c_keep',name:'Kept Client'};

const page=await b.newPage({viewport:{width:390,height:844}});
await page.addInitScript(d=>{
  localStorage.setItem('sc_token','TESTTOKEN');
  localStorage.setItem('sc_onboarded','1');
  localStorage.setItem('sc_clients',JSON.stringify(d));
  localStorage.setItem('sc_bookings','[]');
  localStorage.setItem('sc_seen_events','[]');
},DISK);
const pushed=[];
await page.route('**/api/store*', async r=>{
  if(r.request().method()!=='GET'){
    try{pushed.push(JSON.parse(r.request().postData()||'{}'));}catch(e){}
    await r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});return;
  }
  await r.fulfill({status:200,contentType:'application/json',body:'{"data":{}}'});
});
await page.route('**/api/clients*', async r=>{
  await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,clients:[],events:EVENTS})});
});
await page.goto('http://localhost:8899/'+file,{waitUntil:'load'});
await page.waitForTimeout(4000);

const r=await page.evaluate(async ()=>{
  // Reproduce the steady state: the on-disk blob keeps every id, memory holds only the survivors.
  Object.keys(CL).forEach(k=>{ if(k!=='c_keep') delete CL[k]; });
  const diskCount=Object.keys(JSON.parse(localStorage.getItem('sc_clients')||'{}')).length;
  const memCount=Object.keys(CL).length;
  const gateBefore=_rosterNotReadYet();
  localStorage.setItem('sc_seen_events','[]');
  localStorage.setItem('sc_bookings','[]');
  await syncClientEvents();
  let bk=[];try{bk=JSON.parse(localStorage.getItem('sc_bookings')||'[]');}catch(e){}
  // The boot-window protection must survive: while the roster is still coming out of IndexedDB,
  // the gate must still hold the ingest back.
  const realAwait=window._awaitingHydration;
  window._awaitingHydration=function(k){return k==='sc_clients';};
  const gateWhileLoading=_rosterNotReadYet();
  window._awaitingHydration=realAwait;
  return {diskCount,memCount,gateBefore,gateWhileLoading,ids:bk.map(x=>x.id)};
});
await page.close(); await b.close();

console.log('file under test        :', file);
console.log('roster on disk / memory:', r.diskCount, '/', r.memCount);
console.log('gate says "not read"   :', r.gateBefore);
console.log('bookings materialised  :', JSON.stringify(r.ids));
console.log('pushed to the account  :', pushed.some(p=>p&&p.items&&('sc_bookings' in p.items))?'yes':'no');
let bad=0;
const landed=r.ids.includes('ev_newbooking');
console.log('\n  the request came through          :', landed?'YES':'*** NO - the gate is starving the ingest ***');
if(!landed)bad++;
console.log('  still blocks while roster loading :', r.gateWhileLoading?'YES (boot protection intact)':'*** NO - protection lost ***');
if(!r.gateWhileLoading)bad++;
console.log('\n'+(bad?('FAILURES: '+bad):'gate opens in steady state and still holds during boot'));
