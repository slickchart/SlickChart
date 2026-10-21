// Feedback Inbox "Daily brief in Claude" card (2026-10-21d): owner sees it, makes a key, sees it copied,
// switches it off. A non-owner (no `monitor` in the reply) sees no card.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE=process.argv[2]||'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844}});await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://localhost:8899'});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{if(!sessionStorage.getItem('x')){sessionStorage.setItem('x','1');localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_hide_sample','1');localStorage.setItem('sc_cloud_seeded','1');localStorage.setItem('sc_professions',JSON.stringify(['esty']));}});
let mon={on:false},owner=true;const posts=[];
await p.route('**/api/**',r=>{const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('cloud-status'))return ok({enabled:true});
  if(u.includes('/api/feedback')&&r.request().method()==='GET')return ok(owner?{items:[{id:'1',message:'forms vanish',email:'j@x.com',name:'Jess',ts:Date.now()}],monitor:mon}:{items:[]});
  if(u.includes('/api/feedback')){const j=JSON.parse(r.request().postData()||'{}');posts.push(j.action);if(j.action==='monitor-key'){mon={on:true,lastUsed:0};return ok({ok:true,key:'KEY.abc123'});}if(j.action==='monitor-off'){mon={on:false};return ok({ok:true,off:true});}}
  if(u.includes('/api/store')&&r.request().method()==='GET')return ok({data:{}});
  return ok({ok:true,clients:[],events:[]});});
await p.goto('http://localhost:8899/'+FILE);
await p.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:30000}).catch(()=>{});await p.waitForTimeout(1200);
await p.evaluate(()=>nav('feedback-inbox'));await p.waitForTimeout(800);
const card=()=>p.evaluate(()=>(document.getElementById('fbmon')||{}).innerText||'');
check('owner sees the brief card, off',/Daily brief in Claude/.test(await card())&&/Off\./.test(await card()),await card());
check('the feedback itself still lists',(await p.evaluate(()=>document.getElementById('fbin').innerText)).includes('forms vanish'));
await p.getByRole('button',{name:/Copy key for Claude/}).click();await p.waitForTimeout(600);
check('key made',posts.includes('monitor-key'));
const clip=await p.evaluate(()=>navigator.clipboard.readText()).catch(()=>'');
check('key copied to the clipboard',clip==='KEY.abc123',clip);
check('tells her where to paste it',/Paste it into your Claude feedback thread/.test(await card()),await card());
check('shows on, with Switch off',/On\./.test(await card())&&/Switch off/.test(await card()));
await p.getByRole('button',{name:'Switch off'}).click();await p.waitForTimeout(600);
check('switched off',posts.includes('monitor-off')&&/Off\./.test(await card()),await card());
owner=false;await p.evaluate(()=>nav('feedback-inbox'));await p.waitForTimeout(800);
check('no card without owner status from the server',(await card())==='');
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
