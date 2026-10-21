// §2ae RE-CHECK (2026-10-21). On a busy account, did boot ever put the app's starter courses over her
// own 60? CLAUDE.md listed it as "open, serious, unfixed"; 2026-09-19q added _dropBootShrinks and
// 2026-10-15 added Cloud._holdUploads, but the original harness (scaleaudit.mjs) was never committed,
// so nobody re-measured. This boots a busy practice (800 clients, 60 of her own courses, a big
// catalog and message store) and records EVERY upload of sc_courses:
//   A. brand-new device, normal network      B. account answers slowly (7s, past the old 6s failsafe)
//   C. first read fails (500), retry works   D. the same device reopened
// Pass = no upload ever sends fewer than her 60 courses or any starter course, and the account and
// the screen both end with exactly her 60.
//   node scratchpad/test-busy-courses-boot.mjs     (needs a static server on :8899 in slickchart-vercel/)
const pw=(await import('/opt/node22/lib/node_modules/playwright/index.js')).default;
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const pad=n=>'x'.repeat(n);
function account(){
  const clients={};
  for(let i=0;i<800;i++){const id='c'+i;clients[id]={id,name:'Client '+i,phone:'555-'+String(i).padStart(4,'0'),treatment:'Facial',notes:pad(600),_ts:1758000000000};}
  const courses=Array.from({length:60},(_,i)=>({id:'mine'+i,title:'My course '+i,icon:'ti-book',status:'Published',price:'$19',modules:4,duration:'30 min',enrolled:i,revenue:0,progress:0,desc:'Her own course '+i+' '+pad(300),_ts:1758000000000+i}));
  const kv={
    sc_clients:JSON.stringify(clients),sc_courses:JSON.stringify(courses),sc_courses_custom:'1',
    sc_professions:JSON.stringify(['esty']),sc_hide_sample:'1',
    sc_bizinfo:JSON.stringify({name:'Busy Skin',phone:'555',_ts:1758000000000}),
    sc_square_catalog:JSON.stringify({items:Array.from({length:900},(_,i)=>({id:'sq'+i,name:'Item '+i,desc:pad(400)}))}),
    sc_msgstore:JSON.stringify(Object.fromEntries(Array.from({length:300},(_,i)=>['c'+i,[{t:'hi '+pad(800),ts:1}]]))),
  };
  return {kv,clients,courseIds:courses.map(c=>c.id)};
}
async function launch(ctx,server,mode){
  const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.addInitScript(()=>{if(!localStorage.getItem('__seeded')){localStorage.setItem('__seeded','1');localStorage.setItem('sc_token','eyJ1IjoicDEifQ.sig');localStorage.setItem('sc_onboarded','1');}});
  let gets=0;
  if(process.env.CONTROL){   // negative control: the same page with both boot guards switched off
    const fs=await import('fs');let html=fs.readFileSync(new URL('../slickchart-vercel/slickchart.html',import.meta.url),'utf8');
    html=html.replace('function _dropBootShrinks(items,where){','function _dropBootShrinks(items,where){return items;')
             .replace('_holdUploads(){return !!(','_holdUploads(){return false&&!!(');
    await page.route('**/slickchart.html',r=>r.fulfill({status:200,contentType:'text/html',body:html}));
  }
  await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'}));
  await page.route('**/api/cloud-status*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'}));
  await page.route('**/api/store*',async r=>{const q=r.request();
    if(q.method()==='GET'){gets++;
      if(mode==='fail-first'&&gets===1)return r.fulfill({status:500,contentType:'application/json',body:'{"error":"db"}'});
      if((mode==='slow'||mode==='forced')&&gets===1)await new Promise(x=>setTimeout(x,7000));
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:server.kv})}).catch(()=>{});}
    let b={};try{b=JSON.parse(q.postData()||'{}');}catch(e){}
    const items=b.items||{};
    if(process.env.TRACE)console.log('        POST +'+(Date.now()-server.t0)+'ms '+Object.keys(items).join(','));
    if('sc_courses' in items){let arr=[];try{arr=JSON.parse(items.sc_courses)||[];}catch(e){}server.courseUploads.push({t:Date.now()-server.t0,n:arr.length,ids:arr.map(c=>c&&c.id)});}
    Object.keys(items).forEach(k=>{if(items[k]===null)delete server.kv[k];else server.kv[k]=items[k];});
    return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});});
  await page.route('**/api/clients*',r=>{const q=r.request();
    if(q.method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,clients:Object.values(server.clients).map(c=>({id:c.id,name:c.name,email:'',phone:c.phone,data:c}))})});
    return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"clients":[]}'});});
  server.t0=Date.now();
  await page.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'}).catch(()=>{});
  // F: reproduce the ORIGINAL bug on purpose: while her account is still being read, something saves
  // the courses list, which still holds this device's starter courses. That save must never land.
  if(mode==='forced'){await page.waitForTimeout(1500);server.forcedBefore=await page.evaluate(()=>{const n=courses.length;try{persistCourses();}catch(e){}try{_pushFlushNow();}catch(e){}return n;});}
  await page.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:45000}).catch(()=>{});
  await page.waitForTimeout(9000);   // past every boot timer (6s failsafe, batch flush, retry)
  return {page,errs};
}
const engines=(process.env.ENGINES||'chromium,webkit').split(',');
for(const engine of engines){
  const browser=engine==='chromium'?await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}):await pw.webkit.launch();
  console.log(`\n[${engine}]`);
  for(const mode of ['normal','slow','fail-first','forced']){
    const A=account();const mine=new Set(A.courseIds);
    const server={kv:JSON.parse(JSON.stringify(A.kv)),clients:A.clients,courseUploads:[]};
    const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    const runs=mode==='normal'?['A. new device','D. same device reopened']:[{slow:'B. account answers in 7s','fail-first':'C. first read fails, retry works',forced:'F. starter list saved while her account is still loading'}[mode]];
    for(const label of runs){
      server.courseUploads.length=0;
      const {page,errs}=await launch(ctx,server,mode==='normal'?'normal':mode);
      const bad=server.courseUploads.filter(u=>u.n<60||u.ids.some(id=>!mine.has(id)));
      const acct=JSON.parse(server.kv.sc_courses||'[]');
      const screen=await page.evaluate(()=>courses.map(c=>c.id));
      check(`${engine} ${label}: no upload ever shrinks her courses or adds a starter one`,bad.length===0,
        `${server.courseUploads.length} course uploads `+JSON.stringify(server.courseUploads.map(u=>({t:u.t,n:u.n,foreign:u.ids.filter(id=>!mine.has(id))}))));
      check(`${engine} ${label}: account ends with exactly her 60`,acct.length===60&&acct.every(c=>mine.has(c.id)),`account ${acct.length}: foreign `+JSON.stringify(acct.map(c=>c.id).filter(id=>!mine.has(id))));
      check(`${engine} ${label}: screen shows exactly her 60`,screen.length===60&&screen.every(id=>mine.has(id)),`screen ${screen.length}: foreign `+JSON.stringify(screen.filter(id=>!mine.has(id))));
      if(label.startsWith('D')){   // the harness must SEE a course upload: edit one and save
        server.courseUploads.length=0;
        await page.evaluate(()=>{courses[0].title='Edited title';courses[0]._ts=Date.now();persistCourses();});
        await page.waitForTimeout(3000);
        check(`${engine} E. editing a course is seen as an upload of all 60`,server.courseUploads.some(u=>u.n===60)&&/Edited title/.test(server.kv.sc_courses),JSON.stringify(server.courseUploads.map(u=>u.n)));
      }
      if(errs.length)console.log('        page errors: '+errs.slice(0,3).join(' | '));
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
}
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
