import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const EVENTS=[{id:'ev_bad',kind:'message',client_id:'BAD',created_at:Date.now(),payload:{text:'poison'}}];
const ctx=await b.newContext({viewport:{width:390,height:844}});
await ctx.addInitScript(()=>{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');});
await ctx.route('**/api/store*', async r=>{
  if(r.request().method()!=='GET'){await r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});return;}
  await r.fulfill({status:200,contentType:'application/json',body:'{"data":{}}'});
});
await ctx.route('**/api/clients*', async r=>{
  await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,clients:[],events:EVENTS})});
});
// 1. a poll that hits a bad event
const p1=await ctx.newPage();
await p1.route('**/api/cloud-status*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'}));   // as production answers
await p1.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'});
await p1.waitForTimeout(4000);
await p1.evaluate(async ()=>{
  window._resolveClientId=function(id){ if(id==='BAD') throw new Error('boom: could not route this client'); return id; };
  localStorage.setItem('sc_seen_events','[]');
  await syncClientEvents();
});
await p1.close();
// 2. a FRESH page load running the self-check - the failure must survive into the paste
const p2=await ctx.newPage();
await p2.route('**/api/cloud-status*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'}));
await p2.goto('http://localhost:8899/slickchart.html?selfcheck=1',{waitUntil:'load'});
await p2.waitForFunction(()=>typeof window.__SC_SELFCHECK__==='string'&&window.__SC_SELFCHECK__.length>0,null,{timeout:20000});
const txt=await p2.evaluate(()=>window.__SC_SELFCHECK__);
await p2.close();
const lines=txt.split('\n');
const i=lines.findIndex(l=>l.startsWith('BOOKING REQUESTS'));
console.log(lines.slice(i,i+22).join('\n'));
let bad=0;
if(!/EVENTS THIS DEVICE COULD NOT PROCESS: 1/.test(txt)){console.log('\n*** the paste does not name the failure');bad++;}
if(!/ev_bad .*boom: could not route this client/.test(txt)){console.log('*** the paste does not carry the error message');bad++;}
if(!/events of ANY kind not yet handled on this device: 1/.test(txt)){console.log('*** the paste does not list unseen events of every kind');bad++;}
if(!/client events are being read at all: yes/.test(txt)){console.log('*** the paste does not report the roster gate');bad++;}
console.log('\n'+(bad?('FAILURES: '+bad):'the failure survives a reload and is named in the paste'));
await b.close();
