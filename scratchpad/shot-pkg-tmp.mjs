import { launch, mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const SP=process.argv[2];
const b=await launch();const page=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});const errs=[];page.on('pageerror',e=>errs.push(e.message));
const logo=await page.evaluate(()=>'');
const cfg={skinQ:[{id:'s1',label:'New medications since your last visit?',on:true},{id:'s2',label:'Any sunburn or irritation?',on:true}],drinks:[{emoji:'💧',label:'Water',sub:'Cold'},{emoji:'🍵',label:'Tea',sub:'Hot'}],music:[{emoji:'🎷',label:'Jazz'},{emoji:'🌊',label:'Spa sounds'}],heat:[{id:'h1',label:'Bed warmer',on:true}],blankets:[{emoji:'🧣',label:'Light'},{emoji:'🛏️',label:'Heavy'},{emoji:'🚫',label:'None'}],referencePhotoOn:true,extraNotes:true};
const rec=clientRecord('c1','Cara Client',{checkinReqAt:Date.now(),brand:{primary:'#7a3b52'},checkinCfg:cfg,pendingForms:[{formId:'lb-patch',title:'Patch test consent & record',assignedAt:Date.now(),qs:[{id:'a',label:'Client name',type:'Short text',required:true},{id:'b',label:'Before your tint',type:'Contraindications',required:false,items:['Eye infection now','Past reaction to tint']}]}]});
await mockApi(page,{records:{TOK:rec}});
await page.addInitScript(c=>{localStorage.setItem('sc_client_checkin_cfg',JSON.stringify(c));},cfg);
await page.goto(BASE+'?c=TOK',{waitUntil:'load'});await page.waitForTimeout(1800);
await page.evaluate(()=>renderPrevisitPackage());await page.waitForTimeout(600);await page.screenshot({path:SP+'/pkg.png',fullPage:true});console.log('pkg',await page.evaluate(()=>({papers:document.querySelectorAll('.scf').length,head:!!document.getElementById('page-heading'),ci:document.querySelectorAll('#ci-package-body .scf-q').length})));await page.evaluate(()=>{const b=[...document.querySelectorAll('#ci-package-body .scf-opt')].find(x=>x.textContent.includes('Jazz'));b.click();});await page.waitForTimeout(200);console.log('after tap',await page.evaluate(()=>({music:checkinAnswers.music,pressed:[...document.querySelectorAll('#ci-package-body .scf-opt[aria-pressed=true]')].map(x=>x.textContent.trim())})));process.exit(0);
await page.screenshot({path:SP+'/ci-1.png'});
await page.evaluate(()=>{const b=[...document.querySelectorAll('.scf-opt')].find(x=>/^Yes$/i.test(x.textContent.trim()));b&&b.click();});await page.waitForTimeout(300);
await page.screenshot({path:SP+'/ci-1b.png',fullPage:true});
for(let i=0;i<3;i++){await page.evaluate(()=>{if(checkinStep<_ciSteps().length-1){checkinStep++;_renderCheckinStep();}});await page.waitForTimeout(300);await page.screenshot({path:SP+'/ci-'+(i+2)+'.png',fullPage:true});}
console.log('steps',await page.evaluate(()=>_ciSteps().map(s=>s.title+':'+(s.questions||[]).map(q=>q.type).join(','))),'errs',errs, 'ov',await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth));
await b.close();
