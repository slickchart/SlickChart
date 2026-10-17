// DIANA, 2026-10-16 (SESSION-HANDOFF §2be): on her phone alone, summaries go missing and come back
// only after the computer pushes its copy. Two device-storage faults, both phone-shaped:
//
//  A. An IndexedDB write fails (iOS drops a backgrounded app's connection). The value falls back to
//     localStorage, but the OLD copy stays in IndexedDB, and the next cold start read it back and
//     deleted the newer one. Run offline on the relaunch so the account cannot paper over it.
//  B. The cached IndexedDB connection dies once. Every op used to fail for the rest of the session;
//     now it reopens and retries.
//
//   node scratchpad/test-offload-stale.mjs [file.html]      (served from slickchart-vercel on :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const browser=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

async function setup(ctx,online){
  await ctx.unrouteAll({behavior:'ignoreErrors'}).catch(()=>{});
  await ctx.route('**/api/**',r=>{
    if(!online)return r.abort();
    const u=r.request().url();
    if(u.includes('/api/cloud-status'))return r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'});
    return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'});
  });
}
const big=tag=>{const o={};for(let i=0;i<40;i++)o['c'+i]=[{date:'Oct 16, 2026',treatment:'Facial',note:tag+'-'+i+'-'+'x'.repeat(900),ts:Date.now()}];return o;};

// ---------- A ----------
{
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await setup(ctx,true);
  const p=await ctx.newPage();
  await p.goto('http://localhost:8899/'+FILE);
  await p.evaluate(()=>{localStorage.setItem('sc_token','eyJ1IjoicDEifQ.sig');localStorage.setItem('sc_onboarded','1');});
  await p.reload();await p.waitForTimeout(3000);
  await p.evaluate(o=>{Object.keys(sessionSummaries).forEach(k=>delete sessionSummaries[k]);Object.assign(sessionSummaries,o);persistSessionSummaries();},big('OLD'));
  await p.waitForTimeout(800);
  const inIdb=await p.evaluate(async()=>{const v=await _idb.get('lskv_sc_session_summaries');return typeof v==='string'&&v.includes('OLD-');});
  check('setup: the old copy is in IndexedDB',inIdb);
  // The phone loses its IndexedDB connection: every write is refused from here on.
  await p.evaluate(()=>{_idb.set=function(){return Promise.resolve(false);};_idb.del=function(){return Promise.resolve(false);};});
  await p.evaluate(o=>{Object.keys(sessionSummaries).forEach(k=>delete sessionSummaries[k]);Object.assign(sessionSummaries,o);persistSessionSummaries();},big('NEW'));
  await p.waitForTimeout(800);
  // Cold start with no signal: only what is on the device counts.
  await setup(ctx,false);
  await p.reload();await p.waitForTimeout(3500);
  const after=await p.evaluate(()=>{const v=_lsGet('sc_session_summaries')||'';return {news:v.includes('NEW-0-'),olds:v.includes('OLD-0-'),mem:JSON.stringify(sessionSummaries).includes('NEW-0-')};});
  check('A: after the relaunch the device holds the NEWER summaries',after.news&&!after.olds,JSON.stringify(after));
  check('A: and the app has them in memory',after.mem);
  await ctx.close();
}

// ---------- B ----------
{
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await setup(ctx,true);
  const p=await ctx.newPage();
  await p.goto('http://localhost:8899/'+FILE);await p.waitForTimeout(1500);
  const r=await p.evaluate(async()=>{
    await _idb.set('probe','1');
    // The connection dies once, the way iOS closes a backgrounded app's database.
    const orig=IDBDatabase.prototype.transaction;let n=0;
    IDBDatabase.prototype.transaction=function(){if(n++===0){throw new DOMException('The database connection is closing.','InvalidStateError');}return orig.apply(this,arguments);};
    const w=await _idb.set('probe2','2');const g=await _idb.get('probe2');
    IDBDatabase.prototype.transaction=orig;return {w,g};
  });
  check('B: a dropped connection is reopened and the write lands',r.w===true&&r.g==='2',JSON.stringify(r));
  await ctx.close();
}
await browser.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
