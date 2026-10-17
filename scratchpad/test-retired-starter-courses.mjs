// ASHLEY, 2026-10-17: "please remove these demo courses (lash and brow)". Untouched samples go,
// with a delete record; a sample she edited, and every other course, stays.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE=process.argv[2]||'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const lash={id:'cls1',title:'Lash Care & Retention',icon:'ti-eye',bg:'var(--p-surf2)',ic:'var(--p-green)',bdg:'bg',status:'Draft',price:'Free',modules:3,duration:'15 min',enrolled:0,revenue:0,progress:0,desc:'Cleansing, brushing, and habits that make a full set last longer.'};
const brow={id:'cbr1',title:'Brow Care Between Visits',icon:'ti-eye',bg:'var(--p-purple-bg)',ic:'var(--p-purple)',bdg:'bp',status:'Draft',price:'Free',modules:3,duration:'15 min',enrolled:0,revenue:0,progress:0,desc:'Aftercare and maintenance for laminated, tinted, and shaped brows.'};
const mine={id:'c-mine',title:'Vitality Reset Program',status:'Published',price:'$97',modules:7,lessons:[{title:'a'}],_ts:5};
const pushed={};const account={sc_courses:JSON.stringify([mine,lash,brow]),sc_courses_custom:'1',sc_professions:JSON.stringify(['esty','lash','brow']),sc_onboarded:'1'};
const ctx=await b.newContext({viewport:{width:390,height:844}});
await ctx.route('**/api/**',r=>{const u=r.request().url();if(u.includes('cloud-status'))return r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'});
  if(u.includes('/api/store')&&r.request().method()!=='GET'){try{const x=JSON.parse(r.request().postData()||'{}');Object.assign(pushed,x.items||x.data||{});}catch(e){}}
  if(u.includes('/api/store')&&r.request().method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:account})});
  return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'});});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8899/'+FILE);
await p.evaluate(([l,b,m])=>{localStorage.setItem('sc_token','eyJ1IjoicDEifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_professions',JSON.stringify(['esty','lash','brow']));
  localStorage.setItem('sc_courses',JSON.stringify([m,l,b]));localStorage.setItem('sc_courses_custom','1');},[lash,brow,mine]);
await p.reload();await p.waitForTimeout(3500);
await p.evaluate(()=>{_fgTab='courses';nav('forms');});await p.waitForTimeout(600);
const r=await p.evaluate(()=>({ids:courses.map(c=>c.id),txt:document.body.innerText,hid:JSON.parse(_lsGet('sc_hidden_courses')||'{}'),stored:JSON.parse(_lsGet('sc_courses')||'[]').map(c=>c.id)}));
check('the lash and brow sample courses are gone from her list',!r.ids.includes('cls1')&&!r.ids.includes('cbr1')&&!/Lash Care & Retention|Brow Care Between Visits/.test(r.txt),JSON.stringify(r.ids));
check('her own course stays',r.ids.includes('c-mine')&&r.txt.includes('Vitality Reset Program'));
check('the removal is saved and recorded as a delete (other devices follow)',!r.stored.includes('cls1')&&r.hid.cls1>0&&r.hid.cbr1>0,JSON.stringify(r.hid));
await p.waitForTimeout(1500);
check('the account copy is updated without them (not held back)',typeof pushed.sc_courses==='string'&&!/cls1|cbr1/.test(pushed.sc_courses)&&/c-mine/.test(pushed.sc_courses),String(pushed.sc_courses).slice(0,80));
// An edited sample is hers: kept
await p.evaluate(l=>{const e=Object.assign({},l,{id:'cls1',title:'My lash course'});delete hiddenCourses.cls1;_saveHiddenCourses();courses.push(e);persistCourses();_fgTab='courses';nav('forms');},lash);await p.waitForTimeout(500);
check('a sample she edited is kept',await p.evaluate(()=>courses.some(c=>c.id==='cls1'&&c.title==='My lash course')));
// A brand-new lash/brow account gets no sample course
const ctx2=await b.newContext();await ctx2.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:r.request().url().includes('cloud-status')?'{"enabled":true}':'{"ok":true,"data":{},"clients":[],"events":[]}'}));
const p2=await ctx2.newPage();await p2.goto('http://localhost:8899/'+FILE);
await p2.evaluate(()=>{localStorage.setItem('sc_token','eyJ1IjoicDIifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_professions',JSON.stringify(['lash','brow']));});
await p2.reload();await p2.waitForTimeout(3500);
check('a new lash or brow account starts with no sample course',await p2.evaluate(()=>!courses.some(c=>c.id==='cls1'||c.id==='cbr1')));
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
