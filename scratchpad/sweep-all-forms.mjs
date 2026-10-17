// Ashley, 2026-10-17: "do a bug sweep for all the forms please".
// EVERY form in the app, end to end:
//  A. its build: duplicate ids, empty labels, choices with no options, lists with no items, a missing
//     or misplaced signature, leftover [placeholders] or {tokens} in what a client receives
//  B. Sign in person on the provider's device: every control answered by tapping, saved, nothing lost,
//     and the saved copy shows every answer on the client's file
//  C. The client app: the exact snapshot the provider sends, every control answered by tapping,
//     submitted, every answer present, no false "invalid email/phone" blocks
//   node scratchpad/sweep-all-forms.mjs   (served from slickchart-vercel on :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { BASE, clientRecord, mockApi } from './sweep2-client-lib.mjs';
const out=[];const bug=(where,fid,msg)=>out.push(where+' | '+fid+' | '+msg);
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_hide_sample','1');localStorage.setItem('sc_cloud_seeded','1');});
const kv={sc_hide_sample:'1',sc_professions:JSON.stringify(['esty']),sc_bizinfo:JSON.stringify({name:'Glow Studio',email:'hi@glow.test',phone:'555-0100'}),sc_clients:JSON.stringify({c1:{id:'c1',name:'Dana Client',_token:'t_c1'}})};
const posts=[];
await p.route('**/api/**',r=>{const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('cloud-status'))return ok({enabled:true});
  if(u.includes('/api/store')&&r.request().method()==='GET')return ok({data:kv});
  if(u.includes('/api/provider-form')){posts.push(JSON.parse(r.request().postData()||'{}'));return ok({ok:true,id:'ev_'+posts.length});}
  return ok({ok:true,clients:[],events:[]});});
await p.goto('http://localhost:8899/slickchart.html');
await p.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:30000}).catch(()=>{});
await p.waitForTimeout(1500);
const fids=await p.evaluate(()=>Object.keys(formTmpls).filter(k=>k!=='new'&&(formTmpls[k].qs||[]).length));
console.log('forms:',fids.length);

// ---- A. build + snapshot ----
const snaps=await p.evaluate(fids=>{
  const out={};
  fids.forEach(fid=>{
    const t=formTmpls[fid];const issues=[];const ids={};
    (t.qs||[]).forEach((q,i)=>{
      const k=String(q.id);if(ids[k])issues.push('duplicate question id '+k);ids[k]=1;
      if(!String(q.label||'').trim())issues.push('question '+(i+1)+' has no label');
      if((q.type==='Single select'||q.type==='Multiple choice')&&!(q.options&&q.options.length))issues.push('"'+String(q.label).slice(0,40)+'" is a '+q.type+' with no options');
      if(q.options){const seen={};q.options.forEach(o=>{if(seen[o])issues.push('"'+String(q.label).slice(0,40)+'" lists option "'+o+'" twice');seen[o]=1;if(!String(o).trim())issues.push('"'+String(q.label).slice(0,40)+'" has a blank option');});}
      if(q.type==='Contraindications'&&!(q.items&&q.items.length))issues.push('contraindication list with no items');
      if(!['Short text','Long text','Date','Single select','Multiple choice','Yes / No','Contraindications','Signature','Photo upload','File upload'].includes(q.type))issues.push('unknown question type "'+q.type+'"');
    });
    const sigs=(t.qs||[]).filter(q=>q.type==='Signature').length;if(sigs>1)issues.push(sigs+' signature questions');
    CL['cS']={id:'cS',name:'S',pendingForms:[],_token:'tS'};_assignPending(CL['cS'].pendingForms,'formId',fid);
    const d=_assembleClientData('cS');const pf=(d.pendingForms||[]).find(x=>x.formId===fid);
    if(!pf)issues.push('NOT SENT: no snapshot reached the client');
    else{pf.qs.forEach(q=>{const all=[q.label].concat(q.options||[],q.items||[]).join(' ');
      if(/\[[A-Za-z][^\]]{0,40}\]/.test(all))issues.push('placeholder left in "'+all.match(/\[[A-Za-z][^\]]{0,40}\]/)[0]+'"');
      if(/\{(business|phone|email)[^}]*\}/.test(all))issues.push('unfilled {token} in "'+String(q.label).slice(0,40)+'"');
      if(/undefined|null|NaN/.test(String(q.label)))issues.push('label shows "undefined/null": '+String(q.label).slice(0,40));});
      if(pf.qs.length!==t.qs.length)issues.push('snapshot has '+pf.qs.length+' of '+t.qs.length+' questions');}
    out[fid]={name:t.name,issues,pf};
  });
  return out;
},fids);
for(const fid of fids)snaps[fid].issues.forEach(m=>bug('build',fid,m));

// ---- B. Sign in person ----
for(const fid of fids){
  const r=await p.evaluate(async fid=>{
    CL.c1.submittedForms=[];
    renderSignOnDevice(fid,'c1');await new Promise(r=>setTimeout(r,120));
    const t=formTmpls[fid];const expect={};
    (t.qs||[]).forEach(q=>{const key='sd-'+q.id;
      if(q.type==='Yes / No'||q.type==='Single select'){const btn=[...document.querySelectorAll('button[onclick*="_mcPick"]')].filter(x=>x.getAttribute('onclick').includes("'"+key+"'"));const want=q.type==='Yes / No'?'Yes':(q.options||[]).slice(-1)[0];const bb=btns=>btns.find(x=>x.textContent.trim()===want);const hit=bb(btn);if(hit){hit.click();expect[q.id]=want;}else expect[q.id]='__MISSING_CONTROL__';}
      else if(q.type==='Multiple choice'){const boxes=[...document.querySelectorAll('input.mc-tick')].filter(x=>x.getAttribute('data-key')===key);boxes.slice(0,2).forEach(x=>x.click());expect[q.id]=JSON.stringify(boxes.slice(0,2).map(x=>x.getAttribute('data-opt')));if(!boxes.length)expect[q.id]='__MISSING_CONTROL__';}
      else if(q.type==='Contraindications'){const boxes=[...document.querySelectorAll('input.ci-tick')].filter(x=>x.getAttribute('data-qid')===String(q.id));if(boxes[0])boxes[0].click();expect[q.id]=JSON.stringify(boxes[0]?[boxes[0].getAttribute('data-item')]:[]);}
      else if(q.type==='Short text'||q.type==='Long text'){const el=document.getElementById(key);if(el){el.value=/e-?mail/i.test(q.label)?'dana@example.com':/phone|mobile|cell/i.test(q.label)?'5555551234':'Answer '+q.id;el.dispatchEvent(new Event('input',{bubbles:true}));expect[q.id]=el.value;}else expect[q.id]='__MISSING_CONTROL__';}
      else if(q.type==='Date'){const el=document.getElementById(key);if(el){if(el.type==='date')el.value='1990-01-02';else{el.value='01/02/1990';}el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));expect[q.id]='__ANY__';}else expect[q.id]='__MISSING_CONTROL__';}
    });
    _signPadInk=true;const toasts=[];const ot=window.proToast;window.proToast=m=>toasts.push(String(m));
    try{submitSignOnDevice(fid,'c1');}catch(e){window.proToast=ot;return {err:String(e)};}
    await new Promise(r=>setTimeout(r,250));window.proToast=ot;
    const rec=(CL.c1.submittedForms||[]).find(x=>x.formId===fid);if(!rec)return {notSaved:true,toasts};
    const miss=[];Object.keys(expect).forEach(id=>{const want=expect[id];const got=rec.answers[id];
      if(want==='__MISSING_CONTROL__'){miss.push('no control for question '+id);return;}
      if(want==='__ANY__'){if(got==null||got==='')miss.push('date '+id+' not saved');return;}
      const g=Array.isArray(got)?JSON.stringify(got):got;if(g!==want)miss.push('q '+id+' saved '+JSON.stringify(got)+' want '+want);});
    // the client file shows the answers
    let shown=[];try{const html=_buildClientFileHTML('c1');const d=document.createElement('div');d.innerHTML=html;const txt=d.textContent;
      (t.qs||[]).forEach(q=>{if(['Short text','Long text'].includes(q.type)&&rec.answers[q.id]&&!txt.includes(rec.answers[q.id]))shown.push('answer to '+q.id+' not shown on client file');});}catch(e){shown.push('client file render threw '+e);}
    return {miss,shown,toasts};
  },fid);
  if(r.err)bug('sign in person',fid,'threw '+r.err);
  else if(r.notSaved)bug('sign in person',fid,'not saved; said: '+r.toasts.join(' / '));
  else{r.miss.forEach(m=>bug('sign in person',fid,m));r.shown.forEach(m=>bug('client file',fid,m));}
}

// ---- C. the client app ----
const cp=await ctx.newPage();const cerrs=[];cp.on('pageerror',e=>cerrs.push(e.message));
for(const fid of fids){
  const pf=snaps[fid].pf;if(!pf)continue;
  const log=[];await cp.unrouteAll({behavior:'ignoreErrors'}).catch(()=>{});
  await mockApi(cp,{log,records:{TOK:clientRecord('c1','Jen Test',{pendingForms:[pf]})}});
  cerrs.length=0;
  await cp.goto(BASE+'?c=TOK&f='+Date.now(),{waitUntil:'load'});await cp.waitForTimeout(700);
  await cp.evaluate(id=>{_fillFormId=id;nav('fill-form');},fid);await cp.waitForTimeout(150);
  const exp=await cp.evaluate(()=>{
    const qs=_orderedFormQs(_pendingForm().qs);const e={};
    qs.forEach((q,i)=>{
      const el=document.getElementById('ff-'+i);
      if(q.type==='Yes / No'){const btn=[...document.querySelectorAll('.ff-choice[data-i="'+i+'"]')].find(x=>x.textContent.trim()==='Yes');if(btn){btn.click();e[q.id]='Yes';}else e[q.id]='__MISSING_CONTROL__';}
      else if(q.type==='Single select'){const btns=[...document.querySelectorAll('.ff-choice[data-i="'+i+'"]')];if(btns.length){btns[btns.length-1].click();e[q.id]=q.options[q.options.length-1];}else e[q.id]='__MISSING_CONTROL__';}
      else if(q.type==='Multiple choice'){const c=document.getElementById('ff-'+i+'-0');if(c){c.click();e[q.id]=JSON.stringify([q.options[0]]);}else e[q.id]='__MISSING_CONTROL__';}
      else if(q.type==='Contraindications'){const c=document.getElementById('ff-'+i+'-0');if(c){c.click();e[q.id]=JSON.stringify([q.items[0]]);}else e[q.id]='__MISSING_CONTROL__';}
      else if(q.type==='Date'&&el){el.value=el.type==='date'?'1990-01-02':'01/02/1990';el.dispatchEvent(new Event('input'));e[q.id]='__ANY__';}
      else if(el&&(q.type==='Short text'||q.type==='Long text'||q.type==='Signature')){el.value=(/e-?mail/i.test(q.label)&&/phone|mobile|cell/i.test(q.label))?'555 555 1234':(/e-?mail/i.test(q.label)?'jen@example.com':(/phone|mobile|cell/i.test(q.label)?'5555551234':'Jen Test'));el.dispatchEvent(new Event('input'));if(q.type!=='Signature')e[q.id]=el.value;}
      else if(q.type!=='Photo upload'&&q.type!=='File upload')e[q.id]='__MISSING_CONTROL__';
    });return e;});
  await cp.waitForTimeout(100);
  await cp.evaluate(()=>_submitFillForm());await cp.waitForTimeout(700);
  const sub=log.filter(e=>e.path==='/api/client-submit');
  if(!sub.length){bug('client app',fid,'could not submit: '+(await cp.evaluate(()=>{const t=document.body.innerText;const m=t.match(/[^\n]*(valid|required|missing|please)[^\n]*/i);return m?m[0]:t.slice(0,120);})).slice(0,140));continue;}
  let body={};try{body=JSON.parse(sub[0].body);}catch(e){}
  const pay=body.payload||body.form||body;const ans=(pay&&pay.answers)||{};
  Object.keys(exp).forEach(id=>{const want=exp[id];const got=ans[id];
    if(want==='__MISSING_CONTROL__'){bug('client app',fid,'no control for question '+id);return;}
    if(want==='__ANY__'){if(got==null||got==='')bug('client app',fid,'date '+id+' not sent');return;}
    const g=Array.isArray(got)?JSON.stringify(got):got;if(g!==want)bug('client app',fid,'q '+id+' sent '+JSON.stringify(got)+' want '+want);});
  if(cerrs.length)bug('client app',fid,'page error: '+cerrs.join(' | '));
}
if(errs.length)bug('provider app','-','page errors: '+[...new Set(errs)].join(' | '));
await b.close();
console.log('\n'+fids.length+' forms swept. '+out.length+' problems:');
out.forEach(x=>console.log('  '+x));
process.exit(out.length?1:0);
