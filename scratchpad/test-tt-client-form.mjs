// A client fills in and signs every Tattoo Artist Collection form
// using the exact snapshot the provider app sends (formTmpls -> _assembleClientData shape).
import { BASE, launch, clientRecord, mockApi } from './sweep2-client-lib.mjs';
import fs from 'fs';
const src=fs.readFileSync('/home/user/SlickChart/scratchpad/tt/tt-data.js','utf8');
const F=new Function(src+';return TT_FORMS')();
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
for (const fid of Object.keys(F)) {
  const t=F[fid];
  const pf={formId:fid,title:t.name,assignedAt:Date.now(),qs:t.qs.map(q=>({id:q.id,label:q.label,type:q.type,required:!!q.required,options:q.options||null,items:q.items||null}))};
  const b=await launch();const page=await b.newPage({viewport:{width:390,height:844}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
  const log=await mockApi(page,{records:{TOK:clientRecord('c1','Jen Test',{pendingForms:[pf]})}});
  await page.goto(BASE+'?c=TOK',{waitUntil:'load'});await page.waitForTimeout(1500);
  await page.evaluate(id=>{_fillFormId=id;nav('fill-form');},fid);await page.waitForTimeout(400);
  const shown=await page.evaluate(()=>document.querySelectorAll('[id^="ff-"]').length);
  // Answer everything the way a client would, by tapping the real controls.
  await page.evaluate(()=>{
    const qs=_orderedFormQs(_pendingForm().qs);
    qs.forEach((q,i)=>{
      const el=document.getElementById('ff-'+i);
      if(q.type==='Yes / No'){const btn=[...document.querySelectorAll('.ff-choice[data-i="'+i+'"]')].find(x=>x.textContent.trim()==='Yes');if(btn)btn.click();}
      else if(q.type==='Single select'){const btns=[...document.querySelectorAll('[data-i="'+i+'"]')];if(btns.length)btns[btns.length-1].click();else _ffSetChoice(i,q.options[q.options.length-1]);}
      else if(q.type==='Multiple choice'){const c=document.getElementById('ff-'+i+'-0');if(c){c.checked=true;c.dispatchEvent(new Event('change'));}}
      else if(q.type==='Date'&&el){el.value=el.type==='date'?'1990-01-01':'01/01/1990';el.dispatchEvent(new Event('input'));}
      else if(el&&(q.type==='Short text'||q.type==='Long text'||q.type==='Signature')){el.value=/e-?mail/i.test(q.label)?'jen@example.com':(/phone|mobile|cell/i.test(q.label)?'5555551234':'Jen Test');el.dispatchEvent(new Event('input'));}
    });
  });
  await page.waitForTimeout(200);
  await page.evaluate(()=>_submitFillForm());await page.waitForTimeout(1200);
  const sub=log.filter(e=>e.path==='/api/client-submit');
  const ok=sub.length>0;
  let n=0;try{const body=JSON.parse(sub[0].body);n=JSON.stringify(body).length;}catch(e){}
  check(fid+': shows '+shown+' fields, client can sign and submit',ok&&shown>0&&!errs.length,ok?('sent '+n+' bytes'):('not submitted; '+errs.join(' | ')+' '+(await page.evaluate(()=>document.body.innerText.slice(0,200)))));
  await b.close();
}
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
