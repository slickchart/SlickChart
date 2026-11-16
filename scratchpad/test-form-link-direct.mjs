// Lisa 2026-11-15 (iPhone, Safari from Messages): "I tried to send myself only the client intake & health
// information form but it sent all of this also" -- her screen showed an older pending form, the
// pre-visit check-in, and a "get the app" card. A one-form send now opens THAT form only.
import { BASE, clientRecord, mockApi } from './sweep2-client-lib.mjs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const ENGINE=process.env.ENGINE||'chromium';
const launch=()=>ENGINE==='webkit'?pw.webkit.launch():pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const PRO='http://localhost:8899/slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await launch();
// 1. Provider side.
{
  const ctx=await b.newContext({serviceWorkers:'block'});const page=await ctx.newPage();
  await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await page.goto(PRO,{waitUntil:'load'});await page.waitForTimeout(2500);
  const out=await page.evaluate(()=>{
    CL.c1={id:'c1',name:'Jen Test',_token:'TOK123'};
    const r={};r.app=_clientAppLink('c1');
    let captured=null;window.openSendSheet=o=>{captured=o;};
    const fid=Object.keys(formTmpls).find(k=>/intake/.test(k))||Object.keys(formTmpls)[0];r.fid=fid;
    shareFormLink(fid,'c1');r.msg=captured&&captured.message;
    CL.c2={id:'c2',name:'No Token'};r.none=_clientFormLink('c2','x');
    return r;
  });
  const want=out.app+'&s=form&f='+encodeURIComponent(out.fid);
  check('one-form send carries a form-only link',!!out.msg&&out.msg.includes(want),out.msg);
  check('no token gives no link (never a demo link)',out.none==='');
  check('plain client link is unchanged',!/s=/.test(out.app));
  await ctx.close();
}
// 2. Client side, her situation: an older pending form + check-in configured, she sent "Client intake & health history".
const older={formId:'new-intake',title:'New client intake & consent',assignedAt:Date.now()-86400000,qs:[{id:'o1',label:'Old question',type:'Short text',required:false}]};
const sent={formId:'intake',title:'Client intake & health history',assignedAt:Date.now(),qs:[{id:'q1',label:'Any allergies?',type:'Short text',required:false}]};
async function open(q,extra){
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
  const log=await mockApi(page,{records:{TOK:clientRecord('c1','Jen Test',Object.assign({pendingForms:[older,sent]},extra||{}))}});
  await page.goto(BASE+'?c=TOK'+q,{waitUntil:'load'});await page.waitForTimeout(2800);
  return {ctx,page,errs,log};
}
{
  const {ctx,page,errs,log}=await open('&s=form&f=intake');
  let st=await page.evaluate(()=>({scr:currentScreen,fid:_fillFormId,txt:(document.getElementById('S')||document.body).innerText,url:location.search,nudge:!!document.getElementById('sc-appnudge')}));
  check('opens straight on the form she sent',st.scr==='fill-form'&&st.fid==='intake',st.scr+' '+st.fid);
  check('the sent form question is showing',/Any allergies/.test(st.txt));
  check('no "Step 1 of N" (it is the only thing to do)',!/Step \d of \d/i.test(st.txt),st.txt.slice(0,160));
  check('the older form is not shown',!/Old question|New client intake/.test(st.txt));
  check('no "get the app" card',!st.nudge);
  check('s= and f= stripped from the address',!/s=|f=/.test(st.url),st.url);
  await page.evaluate(()=>{const el=document.getElementById('ff-0');if(el){el.value='None';el.dispatchEvent(new Event('input'));}});
  await page.evaluate(()=>_submitFillForm());await page.waitForTimeout(1500);
  st=await page.evaluate(()=>({scr:currentScreen,txt:(document.getElementById('S')||document.body).innerText,nudge:!!document.getElementById('sc-appnudge')}));
  const sub=log.filter(e=>e.path==='/api/client-submit');
  check('the form reached the provider',sub.length===1&&/"formId":"intake"/.test(sub[0].body),sub.length+'');
  check('after sending: a thank-you, not the check-in or the other form',/Thank you/.test(st.txt)&&!/check-in|Old question/i.test(st.txt),st.txt.slice(0,160));
  await page.waitForTimeout(1500);
  check('still no "get the app" card after sending',!(await page.evaluate(()=>!!document.getElementById('sc-appnudge'))));
  check('no page errors (form-only link)',!errs.length,errs.join(' | '));
  await ctx.close();
}
{ // a failed send keeps her on the form-only path (restore)
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});const page=await ctx.newPage();
  await mockApi(page,{records:{TOK:clientRecord('c1','Jen Test',{pendingForms:[older,sent]})}});
  await page.route('**/api/client-submit',r=>r.fulfill({status:500,body:'{}'}));
  await page.goto(BASE+'?c=TOK&s=form&f=intake',{waitUntil:'load'});await page.waitForTimeout(2800);
  await page.evaluate(()=>_submitFillForm());await page.waitForTimeout(4000);
  const st=await page.evaluate(()=>({fo:_formOnlyId,pend:(activeProvider().pendingForms||[]).map(x=>x.formId)}));
  check('a failed send keeps the form (nothing lost) and stays form-only',st.fo==='intake'&&st.pend.includes('intake'),JSON.stringify(st));
  await ctx.close();
}
{ // form already done / not there: lands on Home, normal
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});const page=await ctx.newPage();
  await mockApi(page,{records:{TOK:clientRecord('c1','Jen Test',{pendingForms:[older]})}});
  await page.goto(BASE+'?c=TOK&s=form&f=intake',{waitUntil:'load'});await page.waitForTimeout(2800);
  check('form already filled: opens Home, no error',await page.evaluate(()=>currentScreen)==='home');
  await ctx.close();
}
{ const {ctx,page,errs}=await open('');
  const st=await page.evaluate(()=>currentScreen);
  check('a plain link still opens Home with everything',st==='home');
  check('no page errors (plain link)',!errs.length,errs.join(' | '));
  await ctx.close(); }
{ const {ctx,page}=await open('&s=previsit');
  check('push deep link s=previsit still lands on the to-do flow',/fill-form|previsit|checkin/.test(await page.evaluate(()=>currentScreen)));
  await ctx.close(); }
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+ENGINE+': '+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
