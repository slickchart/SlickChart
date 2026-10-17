// 2026-10-17: in WebKit (every iPhone/iPad/Mac Safari) `localStorage.setItem = fn` stores an ITEM named
// "setItem" instead of replacing the method, so the app's whole storage layer never ran on iPhones:
// saves were not mirrored to the account, big lists never moved to IndexedDB, the guards were off.
// Run this in Safari's engine:  bash scratchpad/run-in-safari.sh scratchpad/test-safari-storage-hook.mjs [file]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE=process.argv[2]||'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{localStorage.setItem('sc_token','eyJ1IjoicDEifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_cloud_seeded','1');});
const puts=[];
await p.route('**/api/**',r=>{const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('cloud-status'))return ok({enabled:true});
  if(u.includes('/api/store')&&r.request().method()!=='GET'){try{const x=JSON.parse(r.request().postData()||'{}');puts.push(Object.keys(x.items||{}));}catch(e){}return ok({ok:true});}
  if(u.includes('/api/store'))return ok({ok:true,data:{}});
  return ok({ok:true,clients:[],events:[]});});
await p.goto('http://localhost:8899/'+FILE);
await p.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:30000}).catch(()=>{});
await p.waitForTimeout(2000);
const engine=await p.evaluate(()=>/Chrome/.test(navigator.userAgent)?'Chromium':'WebKit (Safari)');
console.log('engine:',engine);
check('no junk items named setItem/getItem/removeItem in storage',await p.evaluate(()=>['setItem','getItem','removeItem'].every(n=>Cloud._origGet(n)===null)));
// A plain save, the way ~150 call sites do it, must reach the account
await p.evaluate(()=>{puts_before=0;localStorage.setItem('sc_rec_reasons',JSON.stringify({c1:{p1:'because'}}));});
await p.waitForTimeout(2500);
check('an ordinary save on this device is sent to the account',puts.some(k=>k.includes('sc_rec_reasons')),JSON.stringify(puts.slice(-3)));
// A big list must go to IndexedDB, not the 5MB box
const big={};for(let i=0;i<40;i++)big['c'+i]=[{date:'Oct 17',note:'N-'+i+'-'+'x'.repeat(900),ts:Date.now()}];
await p.evaluate(o=>{localStorage.setItem('sc_session_summaries',JSON.stringify(o));},big);
await p.waitForTimeout(1500);
const r=await p.evaluate(async()=>{const v=await _idb.get('lskv_sc_session_summaries');const small=Cloud._origGet('sc_session_summaries');return {inIdb:!!v&&v.length>30000,inSmallBox:!!small,readsBack:(localStorage.getItem('sc_session_summaries')||'').length>30000};});
check('a big list is kept in IndexedDB, not the 5MB box',r.inIdb&&!r.inSmallBox,JSON.stringify(r));
check('and reads back through the normal call',r.readsBack);
// The "null" guard
await p.evaluate(()=>{localStorage.setItem('sc_bizinfo','null');});
check('the guard refuses to save the word null over her settings',await p.evaluate(()=>localStorage.getItem('sc_bizinfo')!=='null'));
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
