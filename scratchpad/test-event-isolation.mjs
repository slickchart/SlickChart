// One client event that cannot be processed must not block the others.
// Before the fix, the ingest was a single unprotected forEach: a throw aborted every later event,
// skipped the flush, and skipped the seen-marking, so it repeated forever in silence.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

// Server order is newest-first; the ingest reverses it and processes oldest-first.
// So the poison sits BETWEEN the two bookings in processing order.
const EVENTS=[
  {id:'ev_late',  kind:'booking', client_id:'c_ok', created_at:Date.now(),
   payload:{client:'Later Client', treatment:'Dermaplane', date:'2026-11-07', time:'1:00 PM'}},
  {id:'ev_bad',   kind:'message', client_id:'BAD',  created_at:Date.now()-1000, payload:{text:'poison'}},
  {id:'ev_early', kind:'booking', client_id:'c_ok', created_at:Date.now()-2000,
   payload:{client:'Earlier Client', treatment:'Signature Facial', date:'2026-11-06', time:'10:00 AM'}},
];

const page=await b.newPage({viewport:{width:390,height:844}});
await page.addInitScript(()=>{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');});
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
await page.route('**/api/cloud-status*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'}));   // as production answers
await page.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'});
await page.waitForTimeout(4000);

const r=await page.evaluate(async ()=>{
  // Top-level function declarations are overridable window props (CLAUDE.md 2).
  window._resolveClientId=function(id){ if(id==='BAD') throw new Error('boom: a client event the app could not route'); return id; };
  localStorage.setItem('sc_bookings','[]');
  localStorage.setItem('sc_seen_events','[]');
  localStorage.removeItem('sc_ev_fails');
  await syncClientEvents();
  let bk=[],seen=[],fails=[];
  try{bk=JSON.parse(localStorage.getItem('sc_bookings')||'[]');}catch(e){}
  try{seen=JSON.parse(localStorage.getItem('sc_seen_events')||'[]');}catch(e){}
  try{fails=JSON.parse(localStorage.getItem('sc_ev_fails')||'[]');}catch(e){}
  return {ids:bk.map(x=>x.id), seen, fails};
});
await page.close();

console.log('bookings materialised :', JSON.stringify(r.ids));
console.log('events marked seen    :', JSON.stringify(r.seen));
console.log('failures recorded     :', JSON.stringify(r.fails.map(f=>f.id+': '+f.msg)));
console.log('pushes to the account :', pushed.length, pushed.length?Object.keys(pushed[0].items||{}).join(','):'');

let bad=0;
const gotEarly=r.ids.includes('ev_early'), gotLate=r.ids.includes('ev_late');
console.log('\n  event BEFORE the bad one landed :', gotEarly?'YES':'*** NO ***');
console.log('  event AFTER  the bad one landed :', gotLate?'YES':'*** NO - one bad event blocked it ***');
if(!gotEarly)bad++;
if(!gotLate)bad++;
const badSeen=r.seen.includes('ev_bad');
console.log('  the bad event left UNSEEN (retryable):', badSeen?'*** NO - it was marked handled and is now lost ***':'YES');
if(badSeen)bad++;
const goodSeen=r.seen.includes('ev_early')&&r.seen.includes('ev_late');
console.log('  the good events marked seen         :', goodSeen?'YES':'*** NO ***');
if(!goodSeen)bad++;
const recorded=r.fails.some(f=>f.id==='ev_bad'&&/boom/.test(f.msg||''));
console.log('  the failure is recorded, not swallowed:', recorded?'YES':'*** NO ***');
if(!recorded)bad++;
const pushedBookings=pushed.some(p=>p&&p.items&&Object.prototype.hasOwnProperty.call(p.items,'sc_bookings'));
console.log('  requests reached the account        :', pushedBookings?'YES':'*** NO ***');
if(!pushedBookings)bad++;

console.log('\n'+(bad?('FAILURES: '+bad):'one bad event no longer blocks the rest'));
await b.close();
