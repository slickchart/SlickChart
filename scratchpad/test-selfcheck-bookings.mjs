// Does the BOOKING REQUESTS block in the self-check tell the truth about the ACCOUNT?
// It runs before boot, so Cloud._serverSeen is empty there; it must read the direct /api/store GET.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

const ACCOUNT_BOOKINGS=[
  {id:'ev_new', client:'Ashley Test', treatment:'Signature Facial', date:'2026-10-20', time:'2:00 PM', status:'pending'}
];
const EVENTS=[
  {id:'ev_new', kind:'booking', client_id:'c1', created_at:Date.now(),
   payload:{client:'Ashley Test', treatment:'Signature Facial', date:'2026-10-20', time:'2:00 PM'}}
];

async function run(label, {accountHasBookings, deviceHasIt, seenHere}){
  const p=await b.newPage({viewport:{width:390,height:844}});
  await p.addInitScript(([dev,seen])=>{
    localStorage.setItem('sc_token','TESTTOKEN');
    localStorage.setItem('sc_onboarded','1');
    localStorage.setItem('sc_bookings', JSON.stringify(dev));
    localStorage.setItem('sc_seen_events', JSON.stringify(seen));
  },[deviceHasIt?ACCOUNT_BOOKINGS:[], seenHere?['ev_new']:[]]);
  await p.route('**/api/store*', async route=>{
    if(route.request().method()!=='GET'){ await route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}); return; }
    const data={};
    if(accountHasBookings) data.sc_bookings=JSON.stringify(ACCOUNT_BOOKINGS);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data})});
  });
  await p.route('**/api/clients*', async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,clients:[],events:EVENTS})});
  });
  await p.goto('http://localhost:8899/slickchart.html?selfcheck=1',{waitUntil:'load'});
  await p.waitForFunction(()=>typeof window.__SC_SELFCHECK__==='string'&&window.__SC_SELFCHECK__.length>0,null,{timeout:20000});
  const txt=await p.evaluate(()=>window.__SC_SELFCHECK__);
  await p.close();
  const bk=txt.split('\n').filter(l=>/BOOKING REQUESTS/.test(l)||/^\s{2,}/.test(l)).join('\n');
  console.log('\n=== '+label+' ===');
  console.log(txt.split('\n').slice(txt.split('\n').findIndex(l=>l.startsWith('BOOKING REQUESTS')), txt.split('\n').findIndex(l=>l.startsWith('BOOKING REQUESTS'))+16).join('\n'));
  return txt;
}

let bad=0;
const a=await run('Account HAS it, device does NOT, event already seen here (the reported shape)',
  {accountHasBookings:true, deviceHasIt:false, seenHere:true});
if(/on the account: NOT PRESENT/.test(a)){console.log('*** BUG: said NOT PRESENT when the account has it');bad++;}
if(!/on the account: 1 request/.test(a)){console.log('*** BUG: did not report the account copy');bad++;}
if(!/on the account but NOT on this device: ev_new/.test(a)){console.log('*** BUG: did not name the missing id');bad++;}
if(!/marked seen here but NOT in this device/.test(a)){console.log('*** BUG: did not flag the seen-but-absent event');bad++;}

const c=await run('Account does NOT have it, event already seen here (push side never happened)',
  {accountHasBookings:false, deviceHasIt:false, seenHere:true});
if(!/on the account: NOT PRESENT/.test(c)){console.log('*** BUG: should say NOT PRESENT');bad++;}
if(!/booking events on the server: 1/.test(c)){console.log('*** BUG: did not read the event log');bad++;}

const d=await run('Everything in place (healthy)',
  {accountHasBookings:true, deviceHasIt:true, seenHere:true});
if(!/on the account but NOT on this device: none/.test(d)){console.log('*** BUG: healthy case not reported as none');bad++;}
if(/marked seen here but NOT in this device/.test(d)){console.log('*** BUG: flagged a healthy device');bad++;}

console.log('\n'+(bad?('FAILURES: '+bad):'the paste tells the truth in all three cases'));
await b.close();
