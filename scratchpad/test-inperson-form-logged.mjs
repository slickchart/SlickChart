// A form filled in person on her device (Fill intake, Sign here) reaches the server's event log, even
// for a client with no server record yet and even when the first send fails (Josie, 2026-11-05).
// CONTROL=1 uses the old _pfiSave (no server copy) and MUST fail.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const b=await pw.chromium.launch();
const page=await b.newPage({viewport:{width:390,height:844}});
await page.addInitScript(()=>{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');});
const posts=[];let failFirst=true,rowMade=false;
await page.route('**/api/store*', r=>r.fulfill({status:200,contentType:'application/json',body:r.request().method()==='GET'?'{"data":{}}':'{"ok":true}'}));
await page.route('**/api/clients*', r=>{
  if(r.request().method()==='POST'){rowMade=true;const b=JSON.parse(r.request().postData()||'{}');return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,clients:(b.clients||[]).map(c=>({id:c.id,token:'tok_'+c.id}))})});}
  return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,clients:[],events:[]})});
});
await page.route('**/api/provider-form*', r=>{
  const body=JSON.parse(r.request().postData()||'{}');posts.push(body);
  if(!rowMade)return r.fulfill({status:404,contentType:'application/json',body:'{"error":"Client not found"}'});
  if(failFirst){failFirst=false;return r.fulfill({status:500,contentType:'application/json',body:'{}'});}
  return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,id:'ev_srv_'+posts.length})});
});
await page.route('**/api/cloud-status*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'}));
await page.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'});
await page.waitForTimeout(4000);
const r=await page.evaluate(async (control)=>{
  if(control)window._logInPersonForm=function(){};
  Object.keys(CL).forEach(k=>delete CL[k]);
  CL.c_josie={name:'Josie Statzer',email:'josie@example.com',skin:'—',concerns:'—',allergies:'None noted',fitz:'—',lastVisit:'—',nextVisit:'Not scheduled',treatment:'New client',sessions:0,seriesTotal:0,touchUpDate:'—',conditions:'',notes:''};
  const fid=_ncIntakeFormId();
  nav('client','c_josie');renderProviderFillIntake('c_josie');
  _pfiSave('c_josie',fid);
  await new Promise(r=>setTimeout(r,800));
  const afterFirst=_ipqRead().length;
  await _flushInPersonForms();
  await new Promise(r=>setTimeout(r,300));
  const f=(CL.c_josie.submittedForms||[])[0]||{};
  return {fid,afterFirst,queue:_ipqRead().length,evId:f.evId||null,token:CL.c_josie._token||'',hasIntake:_hasIntakeOnFile(CL.c_josie)};
},!!process.env.CONTROL);
console.log(JSON.stringify(r),'posts',posts.length);
let bad=0;const ck=(ok,m)=>{console.log((ok?'  ok   ':'  FAIL ')+m);if(!ok)bad++;};
ck(r.token==='tok_c_josie','a client with no server record gets one before the form is sent');
ck(posts.some(p=>p.clientId==='c_josie'&&p.formId===r.fid),'the in-person intake was sent to the server');
ck(r.afterFirst===1,'a failed send waits on the device');
ck(r.queue===0&&!!r.evId,'the retry lands and the chart copy carries the server id');
ck(new Set(posts.map(p=>p.idem)).size===1,'every retry uses the same idempotency key (no duplicates)');
ck(r.hasIntake,'intake counts as on file');
console.log(bad?'\nFAILURES: '+bad:'\nall pass');await b.close();process.exit(bad?1:0);
