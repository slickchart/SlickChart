// JESSICA, Sep 22 + Oct 5 (Feedback inbox): "slick chart keeps adding back a consultation service that I
// didn't add" / "a virtual consultation I don't offer in the service section that will not delete".
// Delete services from the Service menu, then let a stale account copy sync back in, and reload.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE=process.argv[2]||'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const M=[{id:'svc_a',name:'Virtual Consultation',price:0,_ts:1},{id:'svc_b',name:'Consultation',price:0,_ts:1},{id:'svc_c',name:'Signature Facial',price:95,_ts:1}];
await p.addInitScript(()=>{if(!sessionStorage.getItem('x')){sessionStorage.setItem('x','1');localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_hide_sample','1');localStorage.setItem('sc_cloud_seeded','1');localStorage.setItem('sc_professions',JSON.stringify(['esty']));}});
let kv={sc_hide_sample:'1',sc_professions:JSON.stringify(['esty']),sc_service_menu:JSON.stringify(M),sc_service_menu_custom:'1'};
const stale=JSON.parse(JSON.stringify(kv));
let serveStale=false;
await p.route('**/api/**',r=>{const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('cloud-status'))return ok({enabled:true});
  if(u.includes('/api/store')&&r.request().method()==='GET')return ok({data:serveStale?stale:kv});
  if(u.includes('/api/store')){try{const j=JSON.parse(r.request().postData()||'{}');const d=j.data||j;if(j.key)kv[j.key]=j.value;else Object.assign(kv,d);}catch(e){}}
  return ok({ok:true,clients:[],events:[]});});
const boot=async()=>{await p.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:30000}).catch(()=>{});await p.waitForTimeout(1500);};
await p.goto('http://localhost:8899/'+FILE);await boot();
{const bm=await p.evaluate(()=>_svcMenu.map(s=>s.name).join());check('a new device does not add its stock services to her menu',bm==='Virtual Consultation,Consultation,Signature Facial',bm);
 await p.waitForTimeout(800);const up=kv.sc_service_menu||'';check('and does not push them up to her account',!/svc_seed/.test(up),up.slice(0,200));}
await p.evaluate(()=>nav('service-menu'));await p.waitForTimeout(300);
const del=async n=>{const i=await p.evaluate(n=>_svcMenu.findIndex(s=>s.name===n),n);await p.locator('button[aria-label="Delete service"]').nth(i).click();await p.waitForTimeout(150);if(await p.locator('#_cf-ok').count())await p.locator('#_cf-ok').click();await p.waitForTimeout(300);};
await del('Virtual Consultation');await del('Consultation');
check('both are gone from the menu',await p.evaluate(()=>_svcMenu.map(s=>s.name).join())==='Signature Facial');
await p.waitForTimeout(1500);
serveStale=true;await p.evaluate(async()=>{await Cloud.pull();});await p.waitForTimeout(1200);
check('a stale account copy does not bring them back',await p.evaluate(()=>_svcMenu.map(s=>s.name).join()),'');
serveStale=false;await p.reload();await boot();
const after=await p.evaluate(()=>_svcMenu.map(s=>s.name).join());
check('still gone after reopening the app',after==='Signature Facial',after);
check('and the appointment picker does not offer them',await p.evaluate(()=>!_apptTxOptions().some(n=>/consult/i.test(n))),await p.evaluate(()=>_apptTxOptions().join()));
// Square-only provider: deletes every service in SlickChart
await p.evaluate(()=>nav('service-menu'));await del('Signature Facial');
await p.waitForTimeout(1200);await p.reload();await boot();
const empty=await p.evaluate(()=>({menu:_svcMenu.map(s=>s.name),picker:_apptTxOptions()}));
check('an emptied menu stays empty after reopening',empty.menu.length===0,JSON.stringify(empty));
check('and nothing called Consultation is made up for her',!empty.picker.some(n=>/consult/i.test(n)),JSON.stringify(empty.picker));
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
