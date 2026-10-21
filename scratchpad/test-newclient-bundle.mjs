// JESSICA, Oct 5 (Feedback inbox): "The forms that are automatically sent to clients also do not update
// with the new client bundle I selected." A bundle marked "Send to every new client" now IS the
// first-visit package; unmarked, the package sends the standard intake exactly as before.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE=process.argv[2]||'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_hide_sample','1');localStorage.setItem('sc_cloud_seeded','1');localStorage.setItem('sc_professions',JSON.stringify(['esty']));});
const kv={sc_hide_sample:'1',sc_professions:JSON.stringify(['esty']),
  sc_clients:JSON.stringify({c1:{id:'c1',name:'Vivian New',_token:'t_c1'},c2:{id:'c2',name:'Olive Old',_token:'t_c2'}})};
const clientPosts=[];
await p.route('**/api/**',r=>{const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('cloud-status'))return ok({enabled:true});
  if(u.includes('/api/store')&&r.request().method()==='GET')return ok({data:kv});
  if(u.includes('/api/clients')&&r.request().method()!=='GET'){clientPosts.push(r.request().postData()||'');}
  return ok({ok:true,clients:[],events:[]});});
await p.goto('http://localhost:8899/'+FILE);
await p.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:30000}).catch(()=>{});
await p.waitForTimeout(1500);
// Standard behaviour first: no bundle marked
await p.evaluate(()=>sendFirstVisitPackage('c2'));await p.waitForTimeout(800);
const std=await p.evaluate(()=>({pf:(CL.c2.pendingForms||[]).map(x=>x.formId),intake:_ncIntakeFormId()}));
check('with no bundle marked, the package sends the standard intake',std.pf.length===1&&std.pf[0]===std.intake,JSON.stringify(std));
const closeSheets=()=>p.evaluate(()=>{['invite-sheet','share-link-sheet'].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});document.querySelectorAll('.shell > div[style*="position:fixed"]').forEach(x=>x.remove());});
await closeSheets();
// Her own policies waiver + a bundle
await p.evaluate(()=>{const id='cf_policies';formTmpls[id]={name:'My policies waiver',qs:[{id:'q1',label:'I agree to the policies',type:'Yes / No',required:true}]};customForms.push({id,name:'My policies waiver'});try{persistForms();}catch(e){}});
const bid=await p.evaluate(()=>_newBundle());
await p.evaluate(b=>{nav('edit-bundle',b);},bid);await p.waitForTimeout(300);
await p.evaluate(()=>{document.getElementById('bnd-name').value='New client bundle';document.getElementById('bnd-name').dispatchEvent(new Event('input'));});
const listed=await p.evaluate(()=>document.body.innerText.includes('My policies waiver'));
check('her own policies waiver can be ticked into a bundle',listed);
await p.evaluate(b=>{_toggleBundleItem(b,'formIds','cf_policies');const ik=_ncIntakeFormId();_toggleBundleItem(b,'formIds',ik);},bid);
await p.locator('#bnd-newclient').check();await p.waitForTimeout(300);
check('the bundle is marked for new clients',await p.evaluate(b=>!!bundles.find(x=>x.id===b).newClient,bid));
const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('sc_bundles')).find(x=>x.newClient));
check('the mark is saved with the bundle (syncs with it)',saved&&saved.name==='New client bundle',JSON.stringify(saved));
await p.evaluate(()=>nav('forms'));await p.waitForTimeout(400);
check('the Forms screen says the package sends her bundle',await p.evaluate(()=>/Invite to app \+ your .New client bundle. bundle/.test(document.body.innerText)));
await p.evaluate(()=>sendFirstVisitPackage('c1'));await p.waitForTimeout(800);
const got=await p.evaluate(()=>(CL.c1.pendingForms||[]).map(x=>x.formId));
check('the first-visit package sends the waiver AND the intake from her bundle',got.includes('cf_policies')&&got.length===2,JSON.stringify(got));
check('and it reached the server',clientPosts.some(x=>x.includes('cf_policies')),clientPosts.length+' posts');
check('finishing only her waiver counts as the package done',await p.evaluate(()=>_hasIntakeOnFile({submittedForms:[{formId:'cf_policies',title:'My policies waiver'}]})));
// Unmark: back to the standard intake
await p.evaluate(b=>_setNewClientBundle(b,false),bid);
check('unticking goes back to the standard intake',await p.evaluate(()=>_newClientBundle()===null));
// Only one bundle can be the new-client one
const b2=await p.evaluate(()=>{const id=_newBundle();_toggleBundleItem(id,'formIds','cf_policies');return id;});
await p.evaluate(([a,c])=>{_setNewClientBundle(a,true);_setNewClientBundle(c,true);},[bid,b2]);
check('marking a second bundle unmarks the first',await p.evaluate(()=>bundles.filter(x=>x.newClient).length===1&&_newClientBundle().b.id===bundles[bundles.length-1].id));
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
