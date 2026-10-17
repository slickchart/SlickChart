// DIANA'S IPHONE, REBUILT (2026-10-17). Her phone showed 0 summaries for a client the account holds a
// summary for, and the default logo instead of hers (obs 47-50), while her computer showed both.
// Both are LARGE values (a logo data URL; the summaries map). This boots a brand-new device against
// an account shaped like a real practice, in Chromium AND WebKit, and checks what the screen gets:
//   A. fresh sign-in, online            B. reopen the app (same device, IndexedDB kept)
//   C. reopen with no signal            D. a device whose IndexedDB is broken
//   E. save a summary, close the app 150 ms later: did it reach the account?
// One browser CONTEXT per device so localStorage + IndexedDB survive a relaunch, like a real phone.
//   node scratchpad/test-iphone-account-scale.mjs [small|heavy]
process.env.PLAYWRIGHT_BROWSERS_PATH=process.env.SC_WEBKIT||'/tmp/claude-0/-home-user-SlickChart/be0fe3b4-54df-5d41-bda7-89dbec145231/scratchpad/pw-webkit';
const pw=(await import('/opt/node22/lib/node_modules/playwright/index.js')).default;
const SIZE=process.argv[2]||'heavy';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const pad=n=>'x'.repeat(n);
function account(){
  const nClients=SIZE==='heavy'?400:60, perSum=SIZE==='heavy'?6:2;
  const clients={},sums={};
  for(let i=0;i<nClients;i++){
    const id='c'+i;
    const s=[];for(let j=0;j<perSum;j++)s.push({date:'Sep '+(1+j)+', 2026',treatment:'Facial',note:'Summary '+j+' for client '+i+'. '+pad(SIZE==='heavy'?1400:300),obs:'',homecare:[],products:[],ts:1758000000000+j,_clientSaved:true});
    sums[id]=s;
    clients[id]={id,name:(i===7?'Bonnie Prince':'Client '+i),phone:'(626) 945-33'+String(i).padStart(2,'0'),treatment:'Facial',summaries:s.map(x=>({date:x.date,title:'Facial',note:x.note,ts:x.ts})),notes:pad(SIZE==='heavy'?2500:200),_ts:1758000000000};
  }
  const logo='data:image/png;base64,'+'iVBORw0KGgo'+'A'.repeat(SIZE==='heavy'?240000:120000);
  const kv={
    sc_clients:JSON.stringify(clients),
    sc_session_summaries:JSON.stringify(sums),
    sc_brand_colors:JSON.stringify({primary:'#7a3b52',secondary:'#c8b078',logoDataUrl:logo,_ts:1758000000000}),
    sc_bizinfo:JSON.stringify({name:'Diana Skin',phone:'555',_ts:1758000000000}),
    sc_professions:JSON.stringify(['esty']),sc_hide_sample:'1',
    sc_checkin_cfg:JSON.stringify({skinQ:[{id:'s1',label:'Any skin changes?',on:true}],drinks:[],music:[],heat:[],blankets:[],extraNotes:true}),
  };
  if(SIZE==='heavy'){kv.sc_square_catalog=JSON.stringify({items:Array.from({length:900},(_,i)=>({id:'sq'+i,name:'Item '+i,desc:pad(400)}))});
    kv.sc_msgstore=JSON.stringify(Object.fromEntries(Array.from({length:200},(_,i)=>['c'+i,[{t:'hi '+pad(800),ts:1}]])));}
  return {kv,clients,logoLen:logo.length,nClients,total:Object.values(kv).reduce((a,v)=>a+v.length,0)};
}
async function device(browser,server,opt){
  const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  ctx.__server=server;ctx.__opt=opt||{};
  return ctx;
}
async function launch(ctx,{offline,idbBroken}={}){
  const server=ctx.__server;const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.addInitScript(([broken])=>{
    if(!localStorage.getItem('__seeded')){localStorage.setItem('__seeded','1');localStorage.setItem('sc_token','eyJ1IjoicDEifQ.sig');localStorage.setItem('sc_onboarded','1');}
    if(broken){const fail=function(){const r={};setTimeout(function(){r.error=new DOMException('Connection to Indexed Database server lost. Refresh the page to try again','UnknownError');if(r.onerror)r.onerror({target:r});},5);return r;};
      try{Object.defineProperty(window,'indexedDB',{value:{open:fail,deleteDatabase:fail},configurable:true});}catch(e){}}
  },[!!(idbBroken||ctx.__opt.idbBroken)]);
  if(offline){await page.route('**/api/**',r=>r.abort('internetdisconnected'));}
  else{
    await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'}));
    await page.route('**/api/cloud-status*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'}));
    await page.route('**/api/store*',async r=>{const q=r.request();
      if(q.method()!=='GET'&&server.dropPuts)return r.abort('connectionaborted');
      if(q.method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:server.kv})});
      let b={};try{b=JSON.parse(q.postData()||'{}');}catch(e){}
      Object.keys(b.items||{}).forEach(k=>{if(b.items[k]===null)delete server.kv[k];else server.kv[k]=b.items[k];});server.posts.push(Object.keys(b.items||{}));
      return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});});
    await page.route('**/api/clients*',async r=>{const q=r.request();
      if(q.method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,clients:Object.values(server.clients).map(c=>({id:c.id,name:c.name,email:'',phone:c.phone,data:c}))})});
      return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"clients":[]}'});});
  }
  await page.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'}).catch(()=>{});
  await page.waitForFunction(()=>typeof Cloud!=='undefined'&&(Cloud._pulledOnce||!Cloud.enabled)&&!Cloud._booting,null,{timeout:30000}).catch(()=>{});
  await page.waitForTimeout(2500);
  return {page,errs};
}
async function read(page){
  return page.evaluate(()=>{
    const n=Object.values(typeof sessionSummaries!=='undefined'?sessionSummaries:{}).reduce((a,l)=>a+(Array.isArray(l)?l.length:0),0);
    const bp=Object.values(CL).find(c=>c&&c.name==='Bonnie Prince');
    const used=(()=>{let t=0;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);t+=k.length+(Cloud._origGet(k)||'').length;}return t;})();
    return {summaries:n,clients:Object.keys(CL).length,bonnie:bp?((sessionSummaries[bp.id]||[]).length):-1,
      logo:(brandColors&&brandColors.logoDataUrl||'').length,headerLogo:!!document.querySelector('#hdr-logo img,.hdr-logo img,header img[src^="data:image"]'),
      offloaded:Object.keys(Cloud._offloaded||{}).filter(k=>Cloud._offloaded[k]),lsChars:used,mem:Object.keys(Cloud._mem||{})};
  });
}
for(const engine of ['chromium','webkit']){
  const browser=engine==='chromium'?await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}):await pw.webkit.launch();
  const A=account();const tag=`[${engine}, ${SIZE}: ${A.nClients} clients, ${(A.total/1e6).toFixed(1)}M chars]`;
  console.log('\n'+tag);
  for(const variant of ['idb ok','idb broken']){
    const server={kv:JSON.parse(JSON.stringify(A.kv)),clients:A.clients,posts:[]};
    const ctx=await device(browser,server,{idbBroken:variant==='idb broken'});
    const want=Object.values(JSON.parse(A.kv.sc_session_summaries)).reduce((a,l)=>a+l.length,0);
    let {page,errs}=await launch(ctx);let r=await read(page);
    check(`${engine} ${variant} A. fresh sign-in: every summary, Bonnie's summaries, her logo`,r.summaries===want&&r.bonnie>0&&r.logo===A.logoLen&&r.clients===A.nClients,JSON.stringify({...r,mem:r.mem.length,want}));
    await page.close();
    ({page,errs}=await launch(ctx));r=await read(page);
    check(`${engine} ${variant} B. reopen: still all there`,r.summaries===want&&r.bonnie>0&&r.logo===A.logoLen,JSON.stringify({summaries:r.summaries,bonnie:r.bonnie,logo:r.logo,off:r.offloaded.length,ls:r.lsChars}));
    await page.close();
    ({page,errs}=await launch(ctx,{offline:true}));r=await read(page);
    const offOK=r.summaries===want&&r.bonnie>0&&r.logo===A.logoLen;
    check(`${engine} ${variant} C. reopen with no signal: still all there`+(variant==='idb broken'?' (expected to need the network if IndexedDB is broken)':''),offOK||variant==='idb broken',JSON.stringify({summaries:r.summaries,bonnie:r.bonnie,logo:r.logo,ls:r.lsChars}));
    if(variant==='idb broken')console.log('        offline with IndexedDB broken shows: '+JSON.stringify({summaries:r.summaries,bonnie:r.bonnie,logo:r.logo}));
    await page.close();
    ({page,errs}=await launch(ctx));
    server.posts.length=0;
    await page.evaluate(()=>{const id=Object.keys(CL).find(k=>CL[k].name==='Bonnie Prince');
      const rec={date:'Oct 17, 2026',treatment:'Facial',note:'PHONE-SAVE-TEST',obs:'',homecare:[],products:[],ts:Date.now(),_clientSaved:true};
      sessionSummaries[id]=[rec].concat(sessionSummaries[id]||[]);persistSessionSummaries();});
    await page.waitForTimeout(150);await page.close();
    await new Promise(r=>setTimeout(r,800));
    const landedNow=/PHONE-SAVE-TEST/.test(server.kv.sc_session_summaries||'');
    ({page,errs}=await launch(ctx));r=await read(page);
    const landed=/PHONE-SAVE-TEST/.test(server.kv.sc_session_summaries||'');
    check(`${engine} ${variant} E. a summary saved then the app closed 150 ms later reaches the account (at once or on the next open)`,landed,'at once: '+landedNow);
    check(`${engine} ${variant} F. and it is on the phone on the next open`,await page.evaluate(()=>JSON.stringify(sessionSummaries).includes('PHONE-SAVE-TEST')),JSON.stringify({bonnie:r.bonnie}));
    // G. She edits her check-in questions, the upload is cut off (iOS froze the app), the app closes.
    // sc_checkin_cfg has no timestamp and plain-overwrites on pull: before the outbox, the next launch
    // put the account's OLDER copy straight back over her edit.
    server.dropPuts=true;
    await page.evaluate(()=>{checkinCfg.skinQ.push({id:'gq',label:'G-TEST question',on:true});saveCheckinCfg();});
    await page.waitForTimeout(400);await page.close();server.dropPuts=false;
    ({page,errs}=await launch(ctx));
    await page.waitForTimeout(1500);
    const g=await page.evaluate(()=>{try{loadCheckinCfg();}catch(e){}return JSON.stringify(checkinCfg).includes('G-TEST');});
    check(`${engine} ${variant} G. an edit whose upload was cut off survives the next open and reaches the account`,g&&/G-TEST/.test(server.kv.sc_checkin_cfg||''),JSON.stringify({device:g,account:/G-TEST/.test(server.kv.sc_checkin_cfg||'')}));
    if(variant==='idb ok'){
      await page.evaluate(()=>{localStorage.setItem('sc_outbox',JSON.stringify({owner:'someone-else',keys:{sc_bizinfo:Date.now()}}));});
      await page.close();server.posts.length=0;
      ({page,errs}=await launch(ctx));await page.waitForTimeout(1200);
      const sentBiz=server.posts.some(p=>p.includes('sc_bizinfo'));
      const ob=await page.evaluate(()=>JSON.parse(localStorage.getItem('sc_outbox')||'{}'));
      check(`${engine} H. another account's unsent list is thrown away, never sent`,!sentBiz&&!Object.keys(ob.keys||{}).includes('sc_bizinfo'),JSON.stringify({sentBiz,ob}));
    }
    if(errs.length)console.log('        page errors: '+errs.slice(0,3).join(' | '));
    await ctx.close();
  }
  await browser.close();
}
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
