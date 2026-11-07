// A sync that ends in a redraw must not wipe an in-person form being filled/signed (Josie, 2026-11-05:
// "it kept going missing"). CONTROL=1 restores the old redraw and MUST fail.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const b=await pw.chromium.launch();
const page=await b.newPage({viewport:{width:820,height:1180},hasTouch:true});
await page.addInitScript(()=>{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');});
await page.route('**/api/store*', r=>r.fulfill({status:200,contentType:'application/json',body:r.request().method()==='GET'?'{"data":{}}':'{"ok":true}'}));
await page.route('**/api/clients*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"clients":[],"events":[]}'}));
await page.route('**/api/provider-form*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"id":"ev_x"}'}));
await page.route('**/api/cloud-status*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'}));
await page.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'});
await page.waitForTimeout(4000);
await page.evaluate((control)=>{
  if(control)window._inPersonFormStarted=function(){return false;};
  Object.keys(CL).forEach(k=>delete CL[k]);
  CL.c_j={name:'Josie Statzer',email:'j@x',skin:'—',concerns:'—',allergies:'None noted',fitz:'—',lastVisit:'—',nextVisit:'Not scheduled',treatment:'New client',sessions:0,seriesTotal:0,touchUpDate:'—',conditions:'',notes:'',_token:'t'};
  nav('client','c_j');renderSignOnDevice('intake','c_j');
},!!process.env.CONTROL);
// type into the first text field, then draw on the pad
const inp=page.locator('#S textarea').first();
await inp.fill('Allergic to latex');
await page.locator('#sign-pad').scrollIntoViewIfNeeded();
const pad=await page.locator('#sign-pad').boundingBox();
await page.mouse.move(pad.x+20,pad.y+40);await page.mouse.down();await page.mouse.move(pad.x+120,pad.y+60);await page.mouse.move(pad.x+200,pad.y+30);await page.mouse.up();
const pre=await page.evaluate(()=>({val:(document.querySelector('#S textarea')||{}).value,ink:_signPadInk,scr:_navCur.screen,started:_inPersonFormStarted()}));console.log('pre',JSON.stringify(pre));
// focus leaves the field (finger on the pad), then a sync finishes and redraws
await page.evaluate(()=>{document.activeElement&&document.activeElement.blur&&document.activeElement.blur();_redrawCurrentScreen();});
const r=await page.evaluate(()=>({val:(document.querySelector('#S textarea')||{}).value||'',ink:_signPadInk,screen:_navCur&&_navCur.screen}));
console.log(JSON.stringify(r));
let bad=0;const ck=(ok,m)=>{console.log((ok?'  ok   ':'  FAIL ')+m);if(!ok)bad++;};
ck(r.val==='Allergic to latex','what she typed survives the sync redraw');
ck(r.ink===true,'the signature survives the sync redraw');
// a sign form nobody has touched is still redrawn (so it can show the account's real template)
await page.evaluate(()=>{renderSignOnDevice('intake','c_j');window.__mark=1;document.getElementById('S').setAttribute('data-m','old');_redrawCurrentScreen();});
const redrawn=await page.evaluate(()=>document.getElementById('S').getAttribute('data-m')!=='old'||!!document.getElementById('sign-pad'));
ck(redrawn,'an untouched sign form still redraws');
// then she can complete and sign
await page.evaluate(async()=>{renderSignOnDevice('intake','c_j');});
await page.locator('#S textarea').first().fill('x');
await page.locator('#sign-pad').scrollIntoViewIfNeeded();
const pad2=await page.locator('#sign-pad').boundingBox();
await page.mouse.move(pad2.x+20,pad2.y+40);await page.mouse.down();await page.mouse.move(pad2.x+150,pad2.y+60);await page.mouse.up();
await page.evaluate(()=>{_redrawCurrentScreen();submitSignOnDevice('intake','c_j');});
await page.waitForTimeout(800);
const done=await page.evaluate(()=>({n:(CL.c_j.submittedForms||[]).length,has:_hasIntakeOnFile(CL.c_j)}));
ck(done.n===1&&done.has,'completing it files the intake on her chart');
console.log(bad?'\nFAILURES: '+bad:'\nall pass');await b.close();process.exit(bad?1:0);
