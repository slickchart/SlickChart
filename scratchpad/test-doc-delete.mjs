// JESSICA, Sep 26 (Feedback inbox): "the delete button in the documents section doesn't work".
// Delete a document in My Docs, then let the account (which still holds it) sync back in.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE=process.argv[2]||'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const D=[{id:'d1',name:'State license',issuer:'Board',cat:'License',expires:'2027-05-01',_ts:1},{id:'d2',name:'Insurance',issuer:'Hiscox',cat:'Insurance',expires:'2027-01-01',_ts:1}];
await p.addInitScript(()=>{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_hide_sample','1');localStorage.setItem('sc_cloud_seeded','1');localStorage.setItem('sc_professions',JSON.stringify(['esty']));});
const kv={sc_hide_sample:'1',sc_professions:JSON.stringify(['esty']),sc_docs:JSON.stringify(D)};
await p.route('**/api/**',r=>{const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('cloud-status'))return ok({enabled:true});
  if(u.includes('/api/store')&&r.request().method()==='GET')return ok({data:kv});
  return ok({ok:true,clients:[],events:[]});});
await p.goto('http://localhost:8899/'+FILE);
await p.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:30000}).catch(()=>{});
await p.waitForTimeout(1500);
check('both documents loaded',await p.evaluate(()=>docs.length)===2);
await p.evaluate(()=>nav('doc-detail','d1'));await p.waitForTimeout(300);
await p.getByRole('button',{name:'Delete'}).click();await p.waitForTimeout(200);
await p.locator('#_cf-ok').click();await p.waitForTimeout(500);
const after=await p.evaluate(()=>({ids:docs.map(d=>d.id),screen:_navCur&&_navCur.screen,txt:document.body.innerText.includes('State license')}));
check('the document is gone and the list is shown',after.ids.join()==='d2'&&!after.txt,JSON.stringify(after));
await p.evaluate(async()=>{Cloud._lastPull=0;await Cloud.pull();});await p.waitForTimeout(1500);
{const ids=await p.evaluate(()=>docs.map(d=>d.id).join());check('it stays deleted after the account syncs back in',ids==='d2',ids);}
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
