// SESSION SUMMARY SURVIVAL SWEEP — Diana's bug, driven end to end against a faithful server.
//
// WHY THIS FILE EXISTS, AND WHY IT IS COMMITTED.
// CLAUDE.md §3 tells every session to run `scratchpad/sweep-crossdevice.mjs` after ANY change to
// sync, storage or a loader. That file has NEVER been committed to this repo (`git log --all --
// '*crossdevice*'` is empty), along with freshaudit.mjs and scaleaudit.mjs. They were written in
// earlier ephemeral containers and went away with them. So all three fixes for Diana's summaries
// shipped with the sweep that was meant to catch exactly this never actually running. Commit this
// one. A sweep that does not survive the container is not a sweep.
//
// WHAT DIANA REPORTS (2026-10-12, SESSION-HANDOFF §2ai):
//   "I tried accessing it at 4:30 PM, and by 6:00 PM it had disappeared again."
//   "I'm only on my phone. I shut off the computer one and deleted from task tab."
// ONE DEVICE. Every previous harness tested two devices racing each other, which is the mechanism
// that has already been fixed three times. A single device losing a summary is a different bug and
// nothing we have ever run would have caught it.
//
// A summary lives in TWO places and must survive in BOTH:
//   sessionSummaries[clientId]   -> kv key sc_session_summaries   (provider side)
//   CL[clientId].summaries       -> clients.data.summaries        (client-facing, lives ONLY there)
//
// The fake server implements the REAL guard from lib/clients.js: a stored non-empty protected key is
// kept when the incoming one is empty OR carries an older _uAt. It is modelled, not imported (that
// needs Postgres — see scripts/test-clients-sql.mjs), so when this sweep and that one disagree, the
// SQL one is right.
//
//   node scratchpad/sweep-summaries.mjs [file.html]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';
const PROTECTED = ['summaries','pendingForms','animals','forms','progressPhotos','pendingGuides'];

function makeServer(){
  const kv = {};            // sc_* keys, as /api/store holds them
  const clients = {};       // id -> {name,email,phone,data}
  return {
    kv, clients,
    putStore(items){ Object.keys(items||{}).forEach(k=>{
      if(items[k]===null) delete kv[k]; else kv[k]=items[k]; }); },
    getStore(){ return {ok:true, data: kv}; },
    // lib/clients.js upsertClient, modelled.
    postClients(list){
      (list||[]).forEach(c=>{
        const id=c.id; const inc=c.data||{};
        const stored=(clients[id]&&clients[id].data)||null;
        let data=inc;
        if(stored){
          const keep={};
          PROTECTED.forEach(k=>{
            const sArr=Array.isArray(stored[k])?stored[k]:null;
            const iArr=Array.isArray(inc[k])?inc[k]:null;
            const sLen=sArr?sArr.length:0;
            const iLen=iArr?iArr.length:0;
            const sU=Number(stored._uAt)||0, iU=Number(inc._uAt)||0;
            if(sLen>0 && (iLen===0 || iU<sU)) keep[k]=stored[k];
          });
          data=Object.assign({},inc,keep);
        }
        clients[id]={name:c.name||'',email:c.email||'',phone:c.phone||'',data};
      });
      return {ok:true, clients:(list||[]).map(c=>({id:c.id, token:'tok_'+c.id}))};
    },
    getClients(){ return {ok:true, clients:Object.keys(clients).map(id=>Object.assign({id},clients[id]))}; },
    // What the account actually holds for one client, in both places.
    held(clientId){
      let kvList=[];
      try{ const m=JSON.parse(kv['sc_session_summaries']||'{}'); kvList=m[clientId]||[]; }catch(e){}
      const row=clients[clientId];
      const blobList=(row&&Array.isArray(row.data&&row.data.summaries))?row.data.summaries:[];
      return {kv:kvList, blob:blobList};
    }
  };
}

async function openDevice(browser, server, {label, storage}){
  const page = await browser.newPage({viewport:{width:390,height:844}});
  await page.addInitScript(([s])=>{
    try{
      localStorage.clear();
      Object.keys(s||{}).forEach(k=>localStorage.setItem(k,s[k]));
      localStorage.setItem('sc_token','TESTTOKEN');
      localStorage.setItem('sc_onboarded','1');
    }catch(e){}
  },[storage||{}]);

  // The catch-all goes FIRST: Playwright gives the most recently added route precedence, so a broad
  // route registered last silently swallows the specific ones and every assertion reads "0".
  await page.route('**/api/**', route=>route.fulfill({status:200,contentType:'application/json',
    body:'{"ok":true,"data":{},"clients":[],"events":[]}'}));
  // /api/cloud-status MUST answer {enabled:true}: Cloud.status() throws 'status-shape' on anything
  // else, leaves the cloud disabled, and boot then SKIPS _reloadAll() - which silently made every
  // per-client library look empty and produced a false reproduction.
  await page.route('**/api/cloud-status*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'}));
  await page.route('**/api/store*', async route=>{
    const req=route.request();
    if(req.method()==='GET') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(server.getStore())});
    let b={}; try{ b=JSON.parse(req.postData()||'{}'); }catch(e){}
    server.putStore(b.items||{});
    return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
  });
  await page.route('**/api/clients*', async route=>{
    const req=route.request();
    if(req.method()==='GET') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(server.getClients())});
    let b={}; try{ b=JSON.parse(req.postData()||'{}'); }catch(e){}
    if(b.deleteIds) return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(server.postClients(b.clients||[]))});
  });
  await page.goto('http://localhost:8899/'+FILE,{waitUntil:'load'});
  await page.waitForTimeout(2600);
  page.__label=label;
  return page;
}

// Read this device's own two copies back out of the running app.
async function deviceHolds(page, clientId){
  return page.evaluate(id=>{
    const mem=(typeof sessionSummaries!=='undefined'&&sessionSummaries[id])||[];
    const rec=(typeof CL!=='undefined'&&CL[id])||{};
    let disk=[];
    try{ const m=JSON.parse(_lsGet('sc_session_summaries')||'{}'); disk=m[id]||[]; }catch(e){}
    return {mem:mem.map(x=>x.note||x.date||''), blob:(rec.summaries||[]).map(x=>x.note||x.date||''),
            disk:disk.map(x=>x.note||x.date||'')};
  }, clientId);
}

async function seedClientAndSummary(page, {clientId, name, note}){
  return page.evaluate(([id,nm,note])=>{
    // A real client, created the way the app creates one.
    CL[id]={id:id,name:nm,treatment:'Signature Facial',summaries:[]};
    if(typeof sessionSummaries==='undefined')window.sessionSummaries={};
    saveClients();
    // Save a summary through the app's own path if it is callable, else mirror what it writes.
    const date=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const dd=(typeof _isoToday==='function')?_isoToday():String(new Date().toISOString().slice(0,10));
    const ts=Date.now();
    const rec={date,treatment:'Signature Facial',note:note,obs:'',homecare:[],products:[],
               productDetail:{},providerNotes:'',guides:[],ts,_draftDate:dd,_clientSaved:true};
    if(!sessionSummaries[id])sessionSummaries[id]=[];
    sessionSummaries[id].unshift(rec);
    const entry={date,title:'Signature Facial',note:note,homecare:[],products:[],guides:[],ts,_draftDate:dd};
    if(!Array.isArray(CL[id].summaries))CL[id].summaries=[];
    CL[id].summaries.unshift(entry);
    try{persistSessionSummaries();}catch(e){}
    try{saveClients();}catch(e){}
    try{_pushKeyNow('sc_session_summaries',_lsGet('sc_session_summaries')||'');}catch(e){}
    try{_pushKeyNow('sc_clients',_lsGet('sc_clients')||'');}catch(e){}
    return true;
  },[clientId,name,note]);
}

const browser = await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const results=[];
function check(name, pass, detail){ results.push({name,pass,detail}); }

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 1. DIANA'S CASE: one device, nothing else running, a summary saved and then normal use.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
{
  const server=makeServer();
  const phone=await openDevice(browser,server,{label:'phone'});
  await seedClientAndSummary(phone,{clientId:'cDIANA',name:'Her Client',note:'SUMMARY-ONE'});
  await phone.waitForTimeout(500);
  await phone.evaluate(()=>_syncClientsToServer({}));
  await phone.waitForTimeout(400);

  const afterSave=await deviceHolds(phone,'cDIANA');
  check('one device: saved summary is in memory', afterSave.mem.includes('SUMMARY-ONE'), JSON.stringify(afterSave.mem));
  check('one device: saved summary is on disk', afterSave.disk.includes('SUMMARY-ONE'), JSON.stringify(afterSave.disk));
  check('one device: saved summary is in the client record', afterSave.blob.includes('SUMMARY-ONE'), JSON.stringify(afterSave.blob));

  let held=server.held('cDIANA');
  check('one device: reached the account (sc_session_summaries)', held.kv.some(x=>x.note==='SUMMARY-ONE'), 'kv has '+held.kv.length);
  check('one device: reached the account (client blob)', held.blob.some(x=>x.note==='SUMMARY-ONE'), 'blob has '+held.blob.length);

  // Now the 90 minutes she describes: the app polls, she moves around, it pushes.
  for(let round=0; round<6; round++){
    await phone.evaluate(async()=>{ try{await Cloud.pull();}catch(e){} });
    await phone.evaluate(()=>{ try{nav('clients');}catch(e){} });
    await phone.waitForTimeout(120);
    await phone.evaluate(()=>{ try{nav('home');}catch(e){} });
    await phone.evaluate(async()=>{ try{await _syncClientsToServer({});}catch(e){} });
    await phone.waitForTimeout(150);
  }
  const afterSoak=await deviceHolds(phone,'cDIANA');
  held=server.held('cDIANA');
  check('one device: survives 6 pull/nav/push rounds (device)', afterSoak.mem.includes('SUMMARY-ONE')&&afterSoak.blob.includes('SUMMARY-ONE'),
    'mem '+afterSoak.mem.length+', blob '+afterSoak.blob.length);
  check('one device: survives 6 pull/nav/push rounds (account)',
    held.kv.some(x=>x.note==='SUMMARY-ONE')&&held.blob.some(x=>x.note==='SUMMARY-ONE'),
    'kv '+held.kv.length+', blob '+held.blob.length);

  // She closes the app and opens it again. Same device, same storage, fresh page.
  const storage=await phone.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=localStorage.getItem(k);}return o;});
  await phone.close();
  const relaunch=await openDevice(browser,server,{label:'phone-relaunch',storage});
  await relaunch.waitForTimeout(1200);
  const afterRelaunch=await deviceHolds(relaunch,'cDIANA');
  held=server.held('cDIANA');
  check('one device: survives closing and reopening the app (device)',
    afterRelaunch.mem.includes('SUMMARY-ONE')&&afterRelaunch.blob.includes('SUMMARY-ONE'),
    'mem '+JSON.stringify(afterRelaunch.mem)+' blob '+JSON.stringify(afterRelaunch.blob));
  check('one device: survives closing and reopening the app (account)',
    held.kv.some(x=>x.note==='SUMMARY-ONE')&&held.blob.some(x=>x.note==='SUMMARY-ONE'),
    'kv '+held.kv.length+', blob '+held.blob.length);
  await relaunch.close();
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 2. HER OBSERVATION 14: "after logging out and logging back in, the summary had disappeared."
// ─────────────────────────────────────────────────────────────────────────────────────────────────
{
  const server=makeServer();
  const phone=await openDevice(browser,server,{label:'logout'});
  await seedClientAndSummary(phone,{clientId:'cLOGOUT',name:'Her Client',note:'SUMMARY-LOGOUT'});
  await phone.waitForTimeout(400);
  await phone.evaluate(()=>_syncClientsToServer({}));
  await phone.waitForTimeout(400);
  await phone.evaluate(async()=>{ try{ await _doLogout(); }catch(e){ try{Cloud.logout();}catch(_){} } });
  await phone.waitForTimeout(800);
  await phone.close();

  // Signing back in is a fresh app with only the token: everything must come from the account.
  const back=await openDevice(browser,server,{label:'login-again'});
  await back.evaluate(async()=>{ try{await Cloud.pull();}catch(e){} try{_reloadAll();}catch(e){} });
  await back.waitForTimeout(900);
  const got=await deviceHolds(back,'cLOGOUT');
  const held=server.held('cLOGOUT');
  check('logout then login: the account still has it',
    held.kv.some(x=>x.note==='SUMMARY-LOGOUT')&&held.blob.some(x=>x.note==='SUMMARY-LOGOUT'),
    'kv '+held.kv.length+', blob '+held.blob.length);
  check('logout then login: it comes back on the device',
    got.mem.includes('SUMMARY-LOGOUT'), JSON.stringify(got.mem));
  await back.close();
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 3. THE OLD MECHANISM, kept as a regression guard: a stale second device must not wipe it.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
{
  const server=makeServer();
  const phone=await openDevice(browser,server,{label:'phone'});
  // The laptop knows the client but has NO summaries - the stale copy that used to destroy them.
  await phone.evaluate(()=>{ CL['cBOTH']={id:'cBOTH',name:'Shared Client',treatment:'Facial',summaries:[]}; saveClients(); });
  await phone.evaluate(()=>_syncClientsToServer({}));
  await phone.waitForTimeout(300);
  const staleStorage=await phone.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=localStorage.getItem(k);}return o;});

  await seedClientAndSummary(phone,{clientId:'cBOTH',name:'Shared Client',note:'SUMMARY-PHONE'});
  await phone.waitForTimeout(300);
  await phone.evaluate(()=>_syncClientsToServer({}));
  await phone.waitForTimeout(300);

  const laptop=await openDevice(browser,server,{label:'laptop',storage:staleStorage});
  await laptop.waitForTimeout(800);
  await laptop.evaluate(async()=>{ try{await Cloud.pull();}catch(e){} try{_reloadAll();}catch(e){} });
  await laptop.waitForTimeout(500);
  await laptop.evaluate(async()=>{ try{await _syncClientsToServer({});}catch(e){} });
  await laptop.waitForTimeout(400);

  const held=server.held('cBOTH');
  check('stale second device does not wipe the account copy',
    held.kv.some(x=>x.note==='SUMMARY-PHONE')&&held.blob.some(x=>x.note==='SUMMARY-PHONE'),
    'kv '+held.kv.length+', blob '+held.blob.length);
  const onLaptop=await deviceHolds(laptop,'cBOTH');
  check('the summary reaches the second device', onLaptop.mem.includes('SUMMARY-PHONE'), JSON.stringify(onLaptop.mem));
  await laptop.close(); await phone.close();
}

await browser.close();

let bad=0;
for(const r of results){ if(!r.pass)bad++;
  console.log('  '+(r.pass?'PASS':'FAIL')+'  '+r.name.padEnd(56)+(r.pass?'':('   <- '+r.detail))); }
console.log(bad ? '\n'+bad+' of '+results.length+' checks FAILED'
                : '\nall '+results.length+' checks pass: a saved summary survives on one device across\n'
                  +'polls, navigation, relaunch and a logout/login, and a stale second device\n'
                  +'cannot wipe the account copy');
process.exit(bad?1:0);
