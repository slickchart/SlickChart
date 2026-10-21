// JESSICA, Sep 2 (Feedback inbox): "I'm confused about how to change my business name. It isn't changing
// even though it says the changes were saved." Change it, reopen, and check every place it shows.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE=process.argv[2]||'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{if(!sessionStorage.getItem('x')){sessionStorage.setItem('x','1');localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_hide_sample','1');localStorage.setItem('sc_cloud_seeded','1');localStorage.setItem('sc_professions',JSON.stringify(['esty']));}});
const kv={sc_hide_sample:'1',sc_professions:JSON.stringify(['esty']),sc_bizinfo:JSON.stringify({name:'Old Studio',_ts:1}),sc_wsname:'Old Studio'};
await p.route('**/api/**',r=>{const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('cloud-status'))return ok({enabled:true});
  if(u.includes('/api/store')&&r.request().method()==='GET')return ok({data:kv});
  if(u.includes('/api/store')){try{const j=JSON.parse(r.request().postData()||'{}');if(j.key)kv[j.key]=j.value;else Object.assign(kv,j.items||j.data||{});}catch(e){}}
  return ok({ok:true,clients:[],events:[]});});
const boot=async()=>{await p.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:30000}).catch(()=>{});await p.waitForTimeout(1500);};
await p.goto('http://localhost:8899/'+FILE);await boot();
await p.evaluate(()=>nav('biz-info'));await p.waitForTimeout(400);
await p.locator('#bi-name').fill('Glow by Jess');
await p.getByRole('button',{name:'Save',exact:true}).first().click();await p.waitForTimeout(1200);
const st=await p.evaluate(()=>({biz:bizInfo.name,ws:workspace.name}));
check('saved in the app',st.biz==='Glow by Jess'&&st.ws==='Glow by Jess',JSON.stringify(st));
check('saved to the account',JSON.parse(kv.sc_bizinfo).name==='Glow by Jess'&&kv.sc_wsname==='Glow by Jess',kv.sc_wsname);
await p.reload();await boot();
const st2=await p.evaluate(()=>({biz:bizInfo.name,ws:workspace.name,home:(nav('home'),document.body.innerText.includes('Glow by Jess'))}));
check('still the new name after reopening',st2.biz==='Glow by Jess'&&st2.ws==='Glow by Jess',JSON.stringify(st2));
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
