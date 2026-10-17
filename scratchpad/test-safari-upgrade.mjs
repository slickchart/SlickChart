// An iPhone that has been running the OLD build (storage layer inert in Safari, so everything sits in
// the 5MB box plus junk "setItem"/"getItem"/"removeItem" items) opens the FIXED build. Nothing it holds
// may be lost, the junk goes, and the next save moves big lists to IndexedDB.
//   bash scratchpad/run-in-safari.sh scratchpad/test-safari-upgrade.mjs <old.html>
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const OLD=process.argv[2];
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844}});
let online=true;
await ctx.route('**/api/**',r=>{if(!online)return r.abort();const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('cloud-status'))return ok({enabled:true});
  if(u.includes('/api/store')&&r.request().method()==='GET')return ok({ok:true,data:{}});
  return ok({ok:true,clients:[],events:[]});});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8899/'+OLD);
await p.evaluate(()=>{localStorage.setItem('sc_token','eyJ1IjoicDEifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_cloud_seeded','1');});
await p.reload();await p.waitForTimeout(3500);
// The old build saves her work the way it does on an iPhone today
const big={};for(let i=0;i<40;i++)big['c'+i]=[{date:'Oct 17',note:'HERS-'+i+'-'+'x'.repeat(900),ts:Date.now()}];
await p.evaluate(o=>{Object.keys(sessionSummaries).forEach(k=>delete sessionSummaries[k]);Object.assign(sessionSummaries,o);persistSessionSummaries();},big);
await p.waitForTimeout(800);
const before=await p.evaluate(()=>({len:(localStorage.getItem('sc_session_summaries')||'').length,junk:['setItem','getItem','removeItem'].filter(n=>Cloud._origGet(n)!==null)}));
console.log('old build left:',JSON.stringify(before));
// Open the FIXED build, offline, so only what is on the phone counts
online=false;
await p.goto('http://localhost:8899/slickchart.html');await p.waitForTimeout(5000);
const after=await p.evaluate(()=>({mem:JSON.stringify(sessionSummaries).includes('HERS-39-'),stored:(localStorage.getItem('sc_session_summaries')||'').includes('HERS-0-'),junk:['setItem','getItem','removeItem'].filter(n=>Cloud._origGet(n)!==null)}));
check('every summary the phone held is still there after the update',after.mem&&after.stored,JSON.stringify(after));
check('the junk items the old build left are gone',after.junk.length===0,JSON.stringify(after.junk));
// next save moves it to IndexedDB
online=true;
await p.evaluate(()=>{sessionSummaries.c0[0].note+=' edited';persistSessionSummaries();});await p.waitForTimeout(1500);
const moved=await p.evaluate(async()=>{const v=await _idb.get('lskv_sc_session_summaries');return {inIdb:!!v&&v.includes('HERS-39-')&&v.includes(' edited'),smallBox:!!Cloud._origGet('sc_session_summaries')};});
check('the next save moves the summaries into IndexedDB, edit included',moved.inIdb&&!moved.smallBox,JSON.stringify(moved));
await p.reload();await p.waitForTimeout(4000);
check('and they are all there after another relaunch',await p.evaluate(()=>JSON.stringify(sessionSummaries).includes('HERS-39-')&&JSON.stringify(sessionSummaries).includes(' edited')));
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
