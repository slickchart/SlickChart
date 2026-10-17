// "Make it match" (Ashley, 2026-10-17): the pre-visit check-in uses the same paper-form look as every
// other form (Luxe by default, her logo, her brand color) in the client app, on the one-page "Before
// your visit" package, and in the provider's Preview. Checks the look AND that every control still
// records the answer and the check-in still submits with what was flagged.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { launch, mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const LOGO='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const cfg={skinQ:[{id:'s1',label:'New medications since your last visit?',on:true},{id:'s2',label:'Any sunburn?',on:true}],drinks:[{emoji:'💧',label:'Water',sub:'Cold'},{emoji:'🍵',label:'Tea',sub:'Hot'}],music:[{emoji:'🎷',label:'Jazz'},{emoji:'🌊',label:'Spa sounds'}],heat:[{id:'h1',label:'Bed warmer',on:true}],blankets:[{emoji:'🧣',label:'Light'},{emoji:'🛏️',label:'Heavy'},{emoji:'🚫',label:'None'}],referencePhotoOn:true,extraNotes:true};
const b=await launch();
async function open(extra){
  const page=await b.newPage({viewport:{width:390,height:844}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
  const log=await mockApi(page,{records:{TOK:clientRecord('c1','Cara Client',Object.assign({checkinReqAt:Date.now(),brand:{primary:'#1f4e79',logoDataUrl:LOGO},checkinCfg:cfg},extra||{}))}});
  await page.addInitScript(c=>{localStorage.setItem('sc_client_checkin_cfg',JSON.stringify(c));},cfg);
  await page.goto(BASE+'?c=TOK',{waitUntil:'load'});await page.waitForTimeout(1500);
  return {page,errs,log};
}
const tap=(page,sel,txt)=>page.evaluate(([sel,txt])=>{const el=[...document.querySelectorAll(sel)].find(x=>x.textContent.replace(/\s+/g,' ').trim().includes(txt));if(!el)return false;el.click();return true;},[sel,txt]);
// 1. the wizard
{
  const {page,errs,log}=await open();
  await page.evaluate(()=>nav('checkin'));await page.waitForTimeout(400);
  const a=await page.evaluate(()=>{const s=document.querySelector('.scf');return {style:s&&s.getAttribute('data-style'),kick:(s.querySelector('.scf-kick')||{}).textContent,title:(s.querySelector('.scf-title')||{}).textContent,logo:!!s.querySelector('.scf-logo img'),acc:getComputedStyle(s).getPropertyValue('--scf-acc').trim().toLowerCase(),sub:(s.querySelector('.scf-sub')||{}).textContent,ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
  check('the check-in is a Luxe paper form with her logo and brand color',a.style==='luxe'&&a.kick==='Pre-visit check-in'&&a.title==='Since your last visit'&&a.logo&&a.acc==='#1f4e79'&&a.ov===0,JSON.stringify(a));
  check('no "Not scheduled appointment" wording when nothing is booked',!/not scheduled/i.test(a.sub||''),a.sub);
  await tap(page,'.scf-opt','Yes');await page.waitForTimeout(150);
  const y=await page.evaluate(()=>({v:checkinAnswers.s1,pressed:document.querySelector('.scf-opt[aria-pressed="true"]')&&document.querySelector('.scf-opt[aria-pressed="true"]').textContent.trim(),detail:!!document.querySelector('textarea.scf-in')}));
  check('Yes records the answer, shows pressed, and opens the details box',y.v==='yes'&&y.pressed==='Yes'&&y.detail,JSON.stringify(y));
  await page.fill('textarea.scf-in','Started tretinoin');await page.evaluate(()=>{checkinStep++;_renderCheckinStep();});await page.waitForTimeout(200);
  await tap(page,'.scf-opt','Tea');await tap(page,'.scf-opt','Jazz');await tap(page,'.scf-opt','High');await tap(page,'.scf-opt','Heavy');await page.waitForTimeout(150);
  const c=await page.evaluate(()=>({drink:checkinAnswers.drink,music:checkinAnswers.music,h1:checkinAnswers.h1,cov:checkinAnswers.covering,pressed:document.querySelectorAll('.scf-opt[aria-pressed="true"]').length}));
  check('drink, music, warmer and covering all record and show pressed',c.drink===1&&c.music===0&&c.h1==='High'&&c.cov===1&&c.pressed===4,JSON.stringify(c));
  await page.evaluate(()=>{checkinStep=_ciSteps().length-1;_renderCheckinStep();});await page.waitForTimeout(200);
  const f=await page.evaluate(()=>{const p=document.querySelector('.scf-panel');return p?p.textContent.replace(/\s+/g,' '):'';});
  check('the last step shows what she flagged, with her details',/New medications/.test(f)&&/tretinoin/.test(f),f);
  await page.evaluate(()=>submitCheckin());await page.waitForTimeout(3000);
  const sent=log.filter(e=>e.path==='/api/client-submit'&&/checkin/.test(e.body));
  let body='';try{body=sent.length?sent[sent.length-1].body:'';}catch(e){}
  check('the check-in submits with the flag and the comfort picks',sent.length>0&&/New medications/.test(body)&&/tretinoin/.test(body)&&/Tea/.test(body)&&/Jazz/.test(body),sent.map(e=>e.path).join(',')+' '+body.slice(0,160));
  check('no page errors (wizard)',!errs.length,errs.join(' | '));
  await page.close();
}
// 2. the one-page package (intake + check-in)
{
  const pf={formId:'lb-patch',title:'Patch test consent & record',assignedAt:Date.now(),qs:[{id:'a',label:'Client name',type:'Short text',required:true}]};
  const {page,errs}=await open({pendingForms:[pf],formStyle:'blush'});
  await page.evaluate(()=>renderPrevisitPackage());await page.waitForTimeout(400);
  const a=await page.evaluate(()=>({papers:[...document.querySelectorAll('.scf')].map(s=>s.getAttribute('data-style')),heading:(document.getElementById('page-heading')||{}).className,inner:!!document.querySelector('.scf #ci-package-body'),ov:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
  check('the package shows the intake and the check-in as two paper forms in her chosen style',a.papers.join()==='blush,blush'&&a.heading==='scf-title'&&a.inner&&a.ov===0,JSON.stringify(a));
  await tap(page,'#ci-package-body .scf-opt','Spa sounds');await page.waitForTimeout(150);
  const t=await page.evaluate(()=>({music:checkinAnswers.music,still:!!document.getElementById('page-heading'),pressed:[...document.querySelectorAll('#ci-package-body .scf-opt[aria-pressed="true"]')].map(x=>x.textContent.replace(/\s+/g,' ').trim())}));
  check('a tap in the package records it and keeps the intake on the page',t.music===1&&t.still&&t.pressed.some(x=>/Spa sounds/.test(x)),JSON.stringify(t));
  check('no page errors (package)',!errs.length,errs.join(' | '));
  await page.close();
}
await b.close();
// 3. the provider's Preview matches
{
  const br=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}).catch(()=>null)||await launch();
  const p=await br.newPage({viewport:{width:390,height:844}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:r.request().url().includes('cloud-status')?'{"enabled":true}':'{"ok":true,"data":{}}'}));
  await p.goto('http://localhost:8899/slickchart.html');
  await p.evaluate(l=>{localStorage.setItem('sc_token','eyJ1IjoicDEifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_professions','["esty"]');localStorage.setItem('sc_bizinfo',JSON.stringify({name:'Glow Skin Studio'}));localStorage.setItem('sc_brand_colors',JSON.stringify({primary:'#1f4e79',logoDataUrl:l}));},LOGO);
  await p.reload();await p.waitForTimeout(3000);
  await p.evaluate(()=>nav('checkin-preview'));await p.waitForTimeout(400);
  const a=await p.evaluate(()=>{const s=document.querySelector('.scf');return {style:s&&s.getAttribute('data-style'),kick:s&&s.querySelector('.scf-kick').textContent,logo:!!(s&&s.querySelector('.scf-logo img')),yn:document.querySelectorAll('.scf-yn').length,grids:document.querySelectorAll('.scf-grid').length,ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
  check("the provider's check-in Preview is the same Luxe paper form, logo, Yes/No rows and choice grids",a.style==='luxe'&&a.kick==='Pre-visit check-in'&&a.logo&&a.yn>0&&a.grids>0&&a.ov===0,JSON.stringify(a));
  check('no page errors (provider preview)',!errs.length,errs.join(' | '));
  await br.close();
}
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
