// Ashley 2026-11-10: "why isnt the phone letting the app use its storage". The device report only
// said storage did not work. It now says why (the browser's own error), whether the app gave up for
// the session, and how much space the app may use, so the brief reads it instead of asking anyone.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const engine=process.env.ENGINE==='webkit'?pw.webkit:pw.chromium;
const b=await engine.launch(process.env.ENGINE==='webkit'?{}:{executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
async function run(failIdb){
  const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript((fail)=>{localStorage.setItem('sc_token','eyJ1IjoicDEiLCJlIjoiZGlhbmFAZXguY29tIn0.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_cloud_seeded','1');
    if(fail){const o=indexedDB.open.bind(indexedDB);indexedDB.open=function(){const rq={};setTimeout(function(){rq.error=new DOMException('Connection to Indexed Database server lost. Refresh the page to try again','UnknownError');rq.onerror&&rq.onerror();},5);return rq;};}},failIdb);
  const reports=[];
  await p.route('**/api/**',r=>{const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
    if(u.includes('cloud-status'))return ok({enabled:true});
    if(u.includes('/api/device-report')){reports.push(JSON.parse(r.request().postData()||'{}'));return ok({ok:true});}
    if(u.includes('/api/store')&&r.request().method()==='GET')return ok({ok:true,data:{}});
    return ok({ok:true,clients:[],events:[]});});
  await p.goto('http://localhost:8899/slickchart.html');
  for(let i=0;i<30&&!reports.length;i++)await p.waitForTimeout(500);
  const rep=(reports[0]||{}).report||{};
  const lines=await p.evaluate(r=>_recoverDeviceLines({devices:[{device:'dA',at:new Date().toISOString(),report:r}],sessions:[],sameNetwork:[]}).join('\n'),rep);
  await ctx.close();return {rep,errs,lines};
}
const good=await run(false);
check('working storage: idbWorks true, no reason, space reported',good.rep.idbWorks===true&&good.rep.idbWhy===''&&good.rep.idbOff===false&&(good.rep.diskQuotaMB==null||good.rep.diskFreeMB>=0),JSON.stringify({w:good.rep.idbWorks,why:good.rep.idbWhy,off:good.rep.idbOff,f:good.rep.diskFreeMB,q:good.rep.diskQuotaMB}));
check('no page errors (working)',good.errs.length===0,good.errs.join(' | '));
const bad=await run(true);
check('failing storage: idbWorks false',bad.rep.idbWorks===false,JSON.stringify(bad.rep.idbWorks));
check('it says the browser\'s own reason',/open failed: UnknownError Connection to Indexed Database server lost/.test(bad.rep.idbWhy||''),bad.rep.idbWhy);
check('it says the app switched storage off after 3 failed opens',bad.rep.idbOff===true);
check('the founder screen prints the reason',/NOT WORKING \(open failed: UnknownError/.test(bad.lines),bad.lines.split('\n').find(l=>/IndexedDB/.test(l)));
check('the report still carries no names or notes',!/@|note/i.test(JSON.stringify({w:bad.rep.idbWhy})));
check('no page errors (failing)',bad.errs.length===0,bad.errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
