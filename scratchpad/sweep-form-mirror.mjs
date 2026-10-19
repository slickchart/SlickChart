// ASHLEY, 2026-10-17: "it should be clear on the provider side that there are clicks. I would like as
// many things as possible to mirror ... do a sweep to check that both apps follow this rule".
// For EVERY form: the provider Preview and Sign in person must draw each question with the same kind
// of control the client app draws (slickchart-client.html renderFillForm):
//   Yes / No -> 2 pick-one buttons | Single select -> one pick-one button per option
//   Multiple choice -> one check box per option | Contraindications -> one check box per item
// and tapping must visibly select. Sign in person must SAVE what was picked (lists stay lists).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE=process.argv[2]||'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_hide_sample','1');localStorage.setItem('sc_cloud_seeded','1');});
const kv={sc_hide_sample:'1',sc_professions:JSON.stringify(['esty','wax','brow','lash','hair','massage','nail','pmu','makeup','tattoo']),sc_clients:JSON.stringify({c1:{id:'c1',name:'Dana Client',_token:'t_c1'}})};
await p.route('**/api/**',r=>{const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('cloud-status'))return ok({enabled:true});
  if(u.includes('/api/store')&&r.request().method()==='GET')return ok({data:kv});
  if(u.includes('/api/provider-form'))return ok({ok:true,id:'ev_'+Math.random()});
  return ok({ok:true,clients:[],events:[]});});
await p.goto('http://localhost:8899/'+FILE);
await p.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:30000}).catch(()=>{});
await p.waitForTimeout(1200);
const fids=await p.evaluate(()=>Object.keys(formTmpls).filter(k=>k!=='new'&&(formTmpls[k].qs||[]).length));
console.log('forms:',fids.length);
// Count controls per question by rendering one question at a time through the same functions the screens use.
const audit=await p.evaluate(fids=>{
  const bad=[];let qn=0;
  const want=q=>q.type==='Yes / No'?{btn:2,box:0}:q.type==='Single select'&&q.options?{btn:q.options.length,box:0}:q.type==='Multiple choice'&&q.options?{btn:0,box:q.options.length}:q.type==='Contraindications'?{btn:0,box:(q.items||[]).length}:null;
  const count=html=>{const d=document.createElement('div');d.innerHTML=html;return {btn:d.querySelectorAll('button[onclick*="_mcPick"]').length,box:d.querySelectorAll('input[type=checkbox]').length,d};};
  fids.forEach(fid=>(formTmpls[fid].qs||[]).forEach(q=>{const w=want(q);if(!w)return;qn++;
    [['Preview',_formQHTML(q)],['Sign in person',_sdQHTML(q)]].forEach(([where,h])=>{const c=count(h);if(c.btn!==w.btn||c.box!==w.box)bad.push(where+' '+fid+' "'+String(q.label).slice(0,40)+'" ('+q.type+') got '+JSON.stringify({btn:c.btn,box:c.box})+' want '+JSON.stringify(w));});
  }));
  return {bad,qn};
},fids);
check('every pick-one / check-box question on both provider screens uses the client app\'s control ('+audit.qn+' questions)',audit.bad.length===0,audit.bad.slice(0,6).join(' | '));
// Clicking selects, in the real Preview
await p.evaluate(()=>nav('form-preview','ec-policies'));await p.waitForTimeout(400);
const clk=await p.evaluate(()=>{const btns=[...document.querySelectorAll('button[onclick*="_mcPick"]')];if(!btns.length)return {n:0};btns[0].click();return {n:btns.length,pressed:btns[0].getAttribute('aria-pressed'),other:btns[1].getAttribute('aria-pressed')};});
check('in Preview a tapped Yes / No shows as selected, the other not',clk.pressed==='true'&&clk.other==='false',JSON.stringify(clk));
// Sign in person saves every kind of answer, on a form with all four
const sod=await p.evaluate(async()=>{
  formTmpls['zz-mirror']={name:'Mirror test',qs:[{id:'m1',label:'Pregnant?',type:'Yes / No'},{id:'m2',label:'Skin type',type:'Single select',options:['Dry','Oily','Combination']},{id:'m3',label:'Goals',type:'Multiple choice',options:['Acne','Spots','Lines']},{id:'m4',label:'Any of these?',type:'Contraindications',items:['Accutane','Retinol']},{id:'m5',label:'Sign',type:'Signature',required:true}]};
  renderSignOnDevice('zz-mirror','c1');await new Promise(r=>setTimeout(r,300));
  const pick=(qid,txt)=>{const b=[...document.querySelectorAll('button[onclick*="_mcPick"]')].find(x=>x.getAttribute('onclick').includes("'sd-"+qid+"'")&&x.textContent.trim()===txt);b.click();};
  pick('m1','No');pick('m2','Oily');
  document.querySelectorAll('input.mc-tick').forEach(el=>{if(['Acne','Lines'].includes(el.getAttribute('data-opt')))el.click();});
  document.querySelectorAll('input.ci-tick').forEach(el=>{if(el.getAttribute('data-item')==='Retinol')el.click();});
  _signPadInk=true;submitSignOnDevice('zz-mirror','c1');await new Promise(r=>setTimeout(r,600));
  const f=(CL.c1.submittedForms||[]).find(x=>x.formId==='zz-mirror');return f?{a:f.answers,fl:f.flagged}:null;});
check('Sign in person saves Yes / No, single select, BOTH multiple choices, and the ticked contraindication',sod&&sod.a.m1==='No'&&sod.a.m2==='Oily'&&JSON.stringify(sod.a.m3)==='["Acne","Lines"]'&&JSON.stringify(sod.a.m4)==='["Retinol"]'&&JSON.stringify(sod.fl)==='["Retinol"]',JSON.stringify(sod));
// Fill intake for a client: choices are tapped, not typed
const pfi=await p.evaluate(async()=>{const qs=[{id:'x1',label:'Skin type',type:'Single select',options:['Dry','Oily']},{id:'x2',label:'Goals',type:'Multiple choice',options:['Acne','Spots']}];
  const h1=_pfiQHTML(qs[0],0),h2=_pfiQHTML(qs[1],1);const d=document.createElement('div');d.innerHTML=h1+h2;
  return {btn:d.querySelectorAll('button').length,box:d.querySelectorAll('input[type=checkbox]').length,text:d.querySelectorAll('input.fi').length};});
check('Fill intake shows tap-to-pick choices and check boxes, not a blank text box',pfi.btn===2&&pfi.box===2&&pfi.text===0,JSON.stringify(pfi));
// The collection says "check", like the client app, never "tick"
check('the collection\'s wording says "check", like the client app',await p.evaluate(()=>!Object.keys(formTmpls).filter(k=>/^(ec|lb|hs|pm|na)-/.test(k)).some(k=>formTmpls[k].qs.some(q=>/\btick/i.test(q.label)))));
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
