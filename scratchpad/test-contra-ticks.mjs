// ASHLEY, 2026-10-17 (screenshot, provider Preview of the collection's dermaplaning form): "there is no
// way to 'tick' anything here - if it is possible to make that happen so it is flagged please do".
// The client app already had tick boxes; the provider Preview and Sign-in-person showed a plain list,
// and Sign-in-person saved flagged:[] every time. Now both tick, and a tick in person raises the flag.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE=process.argv[2]||'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const posts=[];
await p.addInitScript(()=>{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_hide_sample','1');localStorage.setItem('sc_cloud_seeded','1');localStorage.setItem('sc_professions',JSON.stringify(['esty']));});
const kv={sc_hide_sample:'1',sc_professions:JSON.stringify(['esty']),sc_clients:JSON.stringify({c1:{id:'c1',name:'Dana Client',_token:'t_c1'}})};
await p.route('**/api/**',r=>{const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('cloud-status'))return ok({enabled:true});
  if(u.includes('/api/store')&&r.request().method()==='GET')return ok({data:kv});
  if(u.includes('/api/provider-form')){posts.push(JSON.parse(r.request().postData()||'{}'));return ok({ok:true,id:'ev_'+posts.length});}
  return ok({ok:true,clients:[],events:[]});});
await p.goto('http://localhost:8899/'+FILE);
await p.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:30000}).catch(()=>{});
await p.waitForTimeout(1500);
// Provider Preview
await p.evaluate(()=>nav('form-preview','ec-derma'));await p.waitForTimeout(500);
const pv=await p.evaluate(()=>({boxes:document.querySelectorAll('input.ci-tick').length,items:(formTmpls['ec-derma'].qs.find(q=>q.type==='Contraindications')||{}).items.length,ov:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
check('the Preview shows a tick box for every item',pv.boxes>0&&pv.boxes===pv.items,JSON.stringify(pv));
const ticked=await p.evaluate(()=>{const b=document.querySelectorAll('input.ci-tick');b[0].click();return b[0].checked;});
check('a box can be ticked',ticked);
// Sign in person, ticking two items
await p.evaluate(()=>{renderSignOnDevice('ec-derma','c1');});await p.waitForTimeout(400);
const picked=await p.evaluate(()=>{const b=[...document.querySelectorAll('input.ci-tick')];b[0].click();b[2].click();
  document.querySelectorAll('[id^="sd-"]').forEach(el=>{if('value' in el&&!el.value&&el.tagName!=='SELECT')el.value='x';});
  window._sdAns=window._sdAns||{};(formTmpls['ec-derma'].qs||[]).forEach(q=>{if(q.type==='Yes / No'||q.type==='Single select')window._sdAns['sd-'+q.id]=q.type==='Yes / No'?'Yes':(q.options||[''])[0];});
  _signPadInk=true;return [b[0].getAttribute('data-item'),b[2].getAttribute('data-item')];});
await p.evaluate(()=>submitSignOnDevice('ec-derma','c1'));await p.waitForTimeout(1200);
const r=await p.evaluate(()=>{const f=(CL.c1.submittedForms||[]).find(x=>x.formId==='ec-derma');const qid=(formTmpls['ec-derma'].qs.find(q=>q.type==='Contraindications')||{}).id;
  return {rec:!!f,flagged:f&&f.flagged,ans:f&&f.answers[qid],alert:CL.c1.flaggedContra&&CL.c1.flaggedContra.items,home:typeof _clientTabHasFlag==='function'&&_clientTabHasFlag(CL.c1)};});
check('signing in person saves the form',r.rec,JSON.stringify(r).slice(0,300));
check('the ticked items are saved as flags on that form',JSON.stringify(r.flagged)===JSON.stringify(picked),JSON.stringify(r.flagged));
check('and raise the contraindication alert on the client',Array.isArray(r.alert)&&picked.every(x=>r.alert.includes(x))&&r.home,JSON.stringify(r.alert));
check('the server copy carries the flags too',posts.length&&JSON.stringify(posts[posts.length-1].flagged)===JSON.stringify(picked),JSON.stringify(posts.map(x=>x.flagged)));
// The client file shows them
await p.evaluate(()=>nav('client','c1'));await p.waitForTimeout(600);
check('her client file shows the flag',await p.evaluate(t=>document.body.innerText.includes(t),picked[0]));
check('the policies form no longer asks about a card on file',await p.evaluate(()=>!formTmpls['ec-policies'].qs.some(q=>/card on file/i.test(q.label))));
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
