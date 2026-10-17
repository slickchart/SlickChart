// Ashley 2026-10-17: "can you run the report or look into her app without me having to make her do
// it?" Each device now reports on itself (counts only) when the app opens, and the founder recovery
// screen shows it, with the account's signed-in devices and other accounts on the same network.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{localStorage.setItem('sc_token','eyJ1IjoicDEiLCJlIjoiZGlhbmFAZXguY29tIn0.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_cloud_seeded','1');});
const acct={sc_session_summaries:JSON.stringify({c1:[{date:'Sep 25, 2026',note:'Your first reset facial',ts:1}],c2:[{date:'Oct 1',note:'x',ts:2}]}),
  sc_clients:JSON.stringify({c1:{id:'c1',name:'Bonnie Prince'},c2:{id:'c2',name:'Amy'}})};
const reports=[];
await p.route('**/api/**',r=>{const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('cloud-status'))return ok({enabled:true});
  if(u.includes('/api/device-report')){reports.push(JSON.parse(r.request().postData()||'{}'));return ok({ok:true});}
  if(u.includes('/api/store')&&r.request().method()==='GET')return ok({ok:true,data:acct});
  return ok({ok:true,clients:[],events:[]});});
await p.goto('http://localhost:8899/slickchart.html');
await p.waitForTimeout(12000);
const r=reports[0]||{};const rep=r.report||{};
check('the device sends a report by itself after the app opens',reports.length===1,reports.length+' sent');
check('it carries the device and the counts',rep.platform==='iPhone'&&rep.build==='2026-10-17h'&&rep.summaryEntries===2&&rep.summaryClients===2&&typeof rep.idbWorks==='boolean'&&rep.kind==='browser',JSON.stringify(rep));
check('it carries no client names or notes',!/Bonnie|reset facial|Amy/.test(JSON.stringify(r)));
check('it has a device key that is not synced',/^d[a-z0-9]+$/.test(r.device||'')&&!(await p.evaluate(()=>_syncable('scdev_key'))));
// does not repeat on every focus
await p.evaluate(()=>_sendDeviceReport());await p.waitForTimeout(500);
check('no second report within 20 minutes',reports.length===1);
// The recovery screen and paste
const sample={ok:true,provider:{id:'p1',email:'diana@ex.com',name:'Diana'},verdict:{line:'ON THE SERVER RIGHT NOW: 10 summaries'},
  libraries:{sc_session_summaries:{onServer:true,clients:9,entries:10}},clients:[],counts:{rosterIds:13},
  devices:[{device:'dA',at:new Date().toISOString(),report:{platform:'iPhone',kind:'installed app',build:'2026-10-17h',summaryEntries:0,summaryClients:0,logo:false,idbWorks:false,clientsOpen:13,email:'diana@ex.com'}},
           {device:'dB',at:new Date().toISOString(),report:{platform:'Windows',kind:'browser',build:'2026-10-17h',summaryEntries:10,summaryClients:9,logo:true,idbWorks:true,clientsOpen:13}}],
  sessions:[{device:'iPhone · Safari',lastSeen:new Date().toISOString()}],sameNetwork:[{email:'diana.h@icloud.com',name:'Diana',device:'iPhone',lastSeen:new Date().toISOString()}]};
const out=await p.evaluate(s=>_recoverDeviceLines(s).join('\n'),sample);
check('the screen says the phone shows less than the account',/iPhone · installed app[\s\S]*0 on this device[\s\S]*10 on the account[\s\S]*SHOWING LESS/.test(out),out.split('\n').slice(0,4).join(' / '));
check('and that the phone storage is not working',/IndexedDB\): NOT WORKING/.test(out));
check('the computer is not flagged',!/Windows[^\n]*\n[^\n]*SHOWING LESS/.test(out));
check('another account on the same network is named',/OTHER ACCOUNTS[\s\S]*diana\.h@icloud\.com/.test(out));
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
