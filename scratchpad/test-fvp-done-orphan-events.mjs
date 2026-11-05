// Josie and Cooper (2026-11-05): both finished their first-visit packages, the app still said
// "First-visit package not done yet". Two causes, both covered here:
//  A. a welcome package picked per service (not the bundle marked "every new client") never counted;
//  B. a form submitted on a client copy that was later removed was dropped on every poll.
// CONTROL=1 swaps in the pre-fix functions and MUST fail.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;
const b=await chromium.launch();
const now=Date.now();
const EVENTS=[
  {id:'ev_cooper',kind:'form',client_id:'c_cooper_copy',created_at:now-86400000*20,
   payload:{formId:'intake',title:'New client intake & consent',answers:{},signed:true}},
  {id:'ev_josie',kind:'form',client_id:'c_josie',created_at:now-86400000*3,
   payload:{formId:'ec-facial',title:'Facial consultation',answers:{},signed:true}},
  {id:'ev_other',kind:'form',client_id:'c_other_copy',created_at:now-86400000*3,
   payload:{formId:'intake',title:'New client intake & consent',answers:{},signed:true}},
];
const EVENT_CLIENTS=[
  {id:'c_cooper_copy',name:'Cooper Howard',email:'cooper@example.com',phone:''},
  {id:'c_other_copy',name:'Somebody Else',email:'someone@example.com',phone:''},
];
const page=await b.newPage({viewport:{width:390,height:844}});
await page.addInitScript(()=>{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');});
await page.route('**/api/store*', r=>r.fulfill({status:200,contentType:'application/json',body:r.request().method()==='GET'?'{"data":{}}':'{"ok":true}'}));
await page.route('**/api/clients*', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,clients:[],events:EVENTS,eventClients:EVENT_CLIENTS})}));
await page.route('**/api/cloud-status*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'}));
await page.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'});
await page.waitForTimeout(4000);
const r=await page.evaluate(async (control)=>{
  if(control){
    window._routeOrphanEventClients=function(){return false;};
    window._hasIntakeOnFile=function(c){if(!c)return false;const intakeFid=_ncIntakeFormId();
      const byId=(c.submittedForms||[]).some(function(sf){const fid=String((sf&&sf.formId)||'');if(!fid)return false;
        if((intakeFid&&fid===intakeFid)||/(^|-)intake$/.test(fid))return true;
        const nb=_newClientBundle();if(nb&&nb.formIds.indexOf(fid)>=0)return true;return false;});
      if(byId)return true;const names=[...((c.submittedForms||[]).map(s=>s&&s.title)),...((c.signedForms||[])||[])];
      return names.some(n=>/intake/i.test(String(n||'')));};
  }
  Object.keys(CL).forEach(k=>delete CL[k]);
  const base={skin:'—',concerns:'—',allergies:'None noted',fitz:'—',lastVisit:'—',nextVisit:'Not scheduled',treatment:'New client',sessions:0,seriesTotal:0,touchUpDate:'—',conditions:'',notes:'',appInvited:true,_token:'t'};
  CL.c_josie=Object.assign({},base,{name:'Josie Statzer',email:'josie@example.com',pendingForms:[{formId:'ec-facial',assignedAt:1}]});
  CL.c_cooper=Object.assign({},base,{name:'Cooper Howard',email:'cooper@example.com'});
  CL.c_new=Object.assign({},base,{name:'Brand New',email:'new@example.com'});
  CL.c_diff=Object.assign({},base,{name:'Different Person',email:'diff@example.com'});
  if(!formTmpls['ec-facial'])formTmpls['ec-facial']={name:'Facial consultation',qs:[]};
  bundles.length=0;
  bundles.push({id:'b_new',name:'New client',formIds:['intake'],newClient:true});
  bundles.push({id:'b_facial',name:'Facial package',formIds:['ec-facial']});
  localStorage.setItem('sc_seen_events','[]');
  await syncClientEvents();
  const nud=id=>/First-visit package not done yet/.test(_firstVisitNudgeHTML(id)||'');
  return {josie:nud('c_josie'),cooper:nud('c_cooper'),fresh:nud('c_new'),diff:nud('c_diff'),
    cooperForms:(CL.c_cooper.submittedForms||[]).map(f=>f.evId),diffForms:(CL.c_diff.submittedForms||[]).length,
    josiePending:(CL.c_josie.pendingForms||[]).length,routed:_mergedInto.c_cooper_copy||null,otherRouted:_mergedInto.c_other_copy||null};
},!!process.env.CONTROL);
console.log(JSON.stringify(r));
let bad=0;const ck=(ok,msg)=>{console.log((ok?'  ok   ':'  FAIL ')+msg);if(!ok)bad++;};
ck(!r.josie,'Josie: finished the facial welcome package, no nudge');
ck(!r.cooper,'Cooper: form on a removed copy is on her live record, no nudge');
ck(r.cooperForms.includes('ev_cooper'),'Cooper: the form itself is on the chart');
ck(r.routed==='c_cooper',"Cooper's removed copy routes to the live record");
ck(r.fresh,'a client with nothing done is still nudged');
ck(r.diff&&r.diffForms===0&&!r.otherRouted,'a removed copy of a DIFFERENT person is not attached to anyone');
ck(r.josiePending===0,"Josie's done form left her to-do list");
console.log(bad?('\nFAILURES: '+bad):'\nall pass');
await b.close();process.exit(bad?1:0);
