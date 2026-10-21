// JESSICA, Sep 22 (Feedback inbox): "i'm unable to edit the previsit check in. Even when I click add new
// question, it just says new question. And will not allow me to edit what it says." Every check-in
// option was a fixed label; now each is a text box, a new row opens with the cursor in it, and Save
// keeps what she typed and drops rows she left empty.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE=process.argv[2]||'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const pushed=[];
await p.addInitScript(()=>{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_hide_sample','1');localStorage.setItem('sc_cloud_seeded','1');localStorage.setItem('sc_professions',JSON.stringify(['esty']));});
const kv={sc_hide_sample:'1',sc_professions:JSON.stringify(['esty'])};
await p.route('**/api/**',r=>{const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('cloud-status'))return ok({enabled:true});
  if(u.includes('/api/store')&&r.request().method()==='GET')return ok({data:kv});
  if(u.includes('/api/store')){try{pushed.push(r.request().postData()||'');}catch(e){}}
  return ok({ok:true,clients:[],events:[]});});
await p.goto('http://localhost:8899/'+FILE);
await p.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:30000}).catch(()=>{});
await p.waitForTimeout(1500);
await p.evaluate(()=>nav('checkin-settings'));await p.waitForTimeout(400);
const before=await p.evaluate(()=>checkinCfg.skinQ.length);
await p.getByRole('button',{name:'+ Add question'}).click();
const focused=await p.evaluate(()=>{const a=document.activeElement;return a&&a.getAttribute('data-ci-edit');});
check('+ Add question puts the cursor in a new question box',focused==='skinQ',String(focused));
await p.keyboard.type('Are you pregnant or nursing?');
// edit an existing one too
const first=p.locator('input[data-ci-edit="skinQ"]').first();await first.fill('Any new skin concerns?');
// a drink, a snack, a music option
await p.getByRole('button',{name:'+ Add drink option'}).click();await p.keyboard.type('Green tea');
await p.getByRole('button',{name:'+ Add music option'}).click();await p.keyboard.type('Classical');
await p.locator('input[data-ci-edit="drinks"]').first().fill('Sparkling lemon water');
// an empty question that should not survive Save
await p.getByRole('button',{name:'+ Add question'}).click();
await p.getByRole('button',{name:'Save',exact:true}).click();await p.waitForTimeout(600);
const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('sc_checkin_cfg')));
check('the typed new question is saved',saved.skinQ.some(q=>q.label==='Are you pregnant or nursing?'&&q.on),JSON.stringify(saved.skinQ));
check('an existing question can be reworded',saved.skinQ[0].label==='Any new skin concerns?');
check('the empty row she never typed in is dropped',saved.skinQ.length===before+1,saved.skinQ.length+' vs '+before);
check('a drink can be added and renamed',saved.drinks.some(d=>d.label==='Green tea')&&saved.drinks[0].label==='Sparkling lemon water');
check('a music option can be added',saved.music.some(m=>m.label==='Classical'));
check('the saved check-in goes to the account',pushed.some(x=>x.includes('sc_checkin_cfg')&&x.includes('pregnant or nursing')));
await p.evaluate(()=>nav('checkin-preview'));await p.waitForTimeout(500);
check('the client preview shows the new question',await p.evaluate(()=>document.body.innerText.includes('Are you pregnant or nursing?')));
check('no sideways scroll on a phone',await p.evaluate(()=>{nav('checkin-settings');return document.documentElement.scrollWidth<=document.documentElement.clientWidth;}));
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
