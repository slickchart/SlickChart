// Lisa 2026-11-15: "Is there any way for me to only send the form ... without sending the app link?"
// A form send now carries ?s=previsit so the client page opens straight into that form, not Home.
import { BASE, clientRecord, mockApi } from './sweep2-client-lib.mjs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const ENGINE=process.env.ENGINE||'chromium';
const launch=()=>ENGINE==='webkit'?pw.webkit.launch():pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const PRO='http://localhost:8899/slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await launch();
// 1. Provider side: the link in the send message.
{
  const ctx=await b.newContext({serviceWorkers:'block'});const page=await ctx.newPage();
  await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await page.goto(PRO,{waitUntil:'load'});await page.waitForTimeout(2500);
  const out=await page.evaluate(()=>{
    CL.c1={id:'c1',name:'Jen Test',_token:'TOK123'};
    const r={};
    r.app=_clientAppLink('c1');r.form=_clientFormLink('c1');
    let captured=null;window.openSendSheet=o=>{captured=o;};
    const fid=Object.keys(formTmpls)[0];
    shareFormLink(fid,'c1');
    r.msg=captured&&captured.message;
    CL.c2={id:'c2',name:'No Token'};r.none=_clientFormLink('c2');
    return r;
  });
  check('form link = client link + s=previsit',out.form===out.app+'&s=previsit',out.form);
  check('the send message carries the form link',!!out.msg&&out.msg.includes(out.form),out.msg);
  check('no token gives no link (never a demo link)',out.none==='');
  check('plain client invite link is unchanged',!/s=previsit/.test(out.app));
  await ctx.close();
}
// 2. Client side: opening that link lands on the form.
for (const withS of [true,false]) {
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
  const pf={formId:'f1',title:'Client intake',assignedAt:Date.now(),qs:[{id:'q1',label:'Any allergies?',type:'Short text',required:false}]};
  await mockApi(page,{records:{TOK:clientRecord('c1','Jen Test',{pendingForms:[pf]})}});
  await page.goto(BASE+'?c=TOK'+(withS?'&s=previsit':''),{waitUntil:'load'});await page.waitForTimeout(2500);
  const st=await page.evaluate(()=>({scr:currentScreen,txt:(document.getElementById("S")||document.body).innerText,url:location.search}));
  if(withS){
    check('client opens straight into the form',st.scr==='fill-form'||st.scr==='previsit',st.scr);
    check('the form question is on screen',/Any allergies/.test(st.txt),st.txt.slice(0,120));
    check('s= is stripped so a refresh does not re-jump',!/s=previsit/.test(st.url),st.url);
  } else check('without s= the client still lands on Home',st.scr==='home',st.scr);
  check('no page errors ('+(withS?'form link':'plain link')+')',!errs.length,errs.join(' | '));
  await ctx.close();
}
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+ENGINE+': '+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
