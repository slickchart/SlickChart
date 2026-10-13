// WHAT HAPPENS WHEN THE PHONE'S FIRST REQUEST FAILS.
//
// Found while chasing Diana's vanishing summaries. Cloud.status() calls /api/cloud-status and
// requires {enabled:true}; ANY other answer (a flaky mobile network, a cold start, a 500, a captive
// portal returning HTML) leaves Cloud.enabled false. Boot then takes the local path and never calls
// _reloadAll(), so EVERY per-client library stays {} in memory while the disk still holds the data:
//
//   sessionSummaries, clientRecs, recReasons, clientHomecare, clientHealingStage, ...
//
// Each persistX() serialises that in-memory object. So an ordinary action in that state writes {}
// over the disk copy. Diana is on a phone, on one device, and reports losing exactly these.
//
// This sweep asks one question per scenario: after a bad launch and one ordinary action, does an
// UNTOUCHED client still have her work - on the device, and on the account once the network is back.
//
//   node scratchpad/sweep-offline-boot.mjs [file.html]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';

const results=[];
const check=(n,p,d)=>results.push({name:n,pass:p,detail:d||''});

function server(){
  const kv={};
  return {kv,
    put(items){Object.keys(items||{}).forEach(k=>{if(items[k]===null)delete kv[k];else kv[k]=items[k];});},
    get(){return {ok:true,data:kv};},
    summaries(id){try{return (JSON.parse(kv['sc_session_summaries']||'{}')[id]||[]).length;}catch(e){return -1;}},
    recs(id){try{return (JSON.parse(kv['sc_client_recs']||'{}')[id]||[]).length;}catch(e){return -1;}}};
}

const browser=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

async function open(srv,{storage,statusMode}){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.addInitScript(([s])=>{try{localStorage.clear();
    Object.keys(s||{}).forEach(k=>localStorage.setItem(k,s[k]));
    localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');}catch(e){}},[storage||{}]);
  await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:'{"ok":true,"data":{},"clients":[],"events":[]}'}));
  // The variable under test.
  await page.route('**/api/cloud-status*',r=>{
    if(statusMode==='ok')   return r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'});
    if(statusMode==='500')  return r.fulfill({status:500,contentType:'text/plain',body:'upstream error'});
    if(statusMode==='html') return r.fulfill({status:200,contentType:'text/html',body:'<html>captive portal</html>'});
    return r.abort();            // 'offline'
  });
  await page.route('**/api/store*',async r=>{const q=r.request();
    if(q.method()==='GET')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(srv.get())});
    let x={};try{x=JSON.parse(q.postData()||'{}');}catch(e){}
    srv.put(x.items||{});
    return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});});
  await page.route('**/api/clients*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"clients":[]}'}));
  await page.goto('http://localhost:8899/'+FILE,{waitUntil:'load'});
  await page.waitForTimeout(2800);
  return page;
}

const seed=page=>page.evaluate(()=>{
  const ts=Date.now(),dd='2026-10-12';
  ['cKEEP','cGOING'].forEach((id,n)=>{
    CL[id]={id:id,name:'Client '+n,treatment:'Facial',summaries:[]};
    sessionSummaries[id]=[{date:'Oct 12, 2026',treatment:'Facial',note:'NOTE-'+id,ts,_draftDate:dd,_clientSaved:true}];
    CL[id].summaries=[{date:'Oct 12, 2026',title:'Facial',note:'NOTE-'+id,ts,_draftDate:dd}];
    try{clientRecs[id]=[{id:'p1',name:'Her serum'}];}catch(e){}
  });
  persistSessionSummaries();try{persistClientRecs();}catch(e){}saveClients();
  _pushKeyNow('sc_session_summaries',_lsGet('sc_session_summaries')||'');
  try{_pushKeyNow('sc_client_recs',_lsGet('sc_client_recs')||'');}catch(e){}
});
const dump=page=>page.evaluate(()=>{
  const d=k=>{try{return JSON.parse(_lsGet(k)||'{}');}catch(e){return {};}};
  return {memSum:Object.keys(sessionSummaries||{}), diskSum:Object.keys(d('sc_session_summaries')),
          keepSum:(d('sc_session_summaries')['cKEEP']||[]).length,
          keepRecs:(d('sc_client_recs')['cKEEP']||[]).length,
          cloudEnabled:(typeof Cloud!=='undefined')?!!Cloud.enabled:'?'};
});

for(const mode of ['ok','500','html','offline']){
  const srv=server();
  const good=await open(srv,{statusMode:'ok'});
  await seed(good); await good.waitForTimeout(500);
  const storage=await good.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=localStorage.getItem(k);}return o;});
  await good.close();

  const page=await open(srv,{storage,statusMode:mode});
  const before=await dump(page);
  // One ordinary action: she deletes a client she no longer sees.
  await page.evaluate(()=>{try{_cleanupClientData('cGOING');delete CL['cGOING'];saveClients();}catch(e){}});
  await page.waitForTimeout(700);
  const after=await dump(page);

  const kept = after.keepSum>0 && after.keepRecs>0;
  check('cloud-status '+mode.padEnd(8)+' -> untouched client keeps her work', kept,
    'cloudEnabled='+after.cloudEnabled+' memAtBoot='+JSON.stringify(before.memSum)
    +' keepSum='+after.keepSum+' keepRecs='+after.keepRecs);

  // THE QUESTION THAT DECIDES SEVERITY: the network comes back and the app relaunches carrying the
  // DAMAGED disk. Does the empty map get pushed over the account's good copy? Carry the damaged
  // storage forward - rebooting from the original snapshot would test nothing.
  const damaged=await page.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=localStorage.getItem(k);}return o;});
  await page.close();
  const back=await open(srv,{storage:damaged,statusMode:'ok'});
  await back.waitForTimeout(1500);
  await back.evaluate(async()=>{try{await Cloud.pull();}catch(e){}try{_reloadAll();}catch(e){}});
  await back.waitForTimeout(900);
  await back.evaluate(()=>{try{persistSessionSummaries();}catch(e){}try{persistClientRecs();}catch(e){}});
  await back.waitForTimeout(900);
  check('cloud-status '+mode.padEnd(8)+' -> account survives the damaged device reconnecting',
    srv.summaries('cKEEP')>0 && srv.recs('cKEEP')>0,
    'account now holds '+srv.summaries('cKEEP')+' summar(ies) and '+srv.recs('cKEEP')+' plan item(s) for cKEEP');
  const healed=await dump(back);
  check('cloud-status '+mode.padEnd(8)+' -> device gets her work back on reconnect',
    healed.keepSum>0 && healed.keepRecs>0,
    'device now holds keepSum='+healed.keepSum+' keepRecs='+healed.keepRecs);
  await back.close();
}

await browser.close();
let bad=0;
for(const r of results){if(!r.pass)bad++;
  console.log('  '+(r.pass?'PASS':'FAIL')+'  '+r.name.padEnd(58)+(r.pass?'':('  <- '+r.detail)));}
console.log(bad?'\n'+bad+' of '+results.length+' FAILED'
  :'\na failing /api/cloud-status at launch does not cost her any saved work');
process.exit(bad?1:0);
