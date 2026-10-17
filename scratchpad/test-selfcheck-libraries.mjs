// Diana 2026-10-17: phone shows 0 summaries + default logo, computer shows them. The self-check must
// print the device-vs-account comparison for summaries, logo, homecare and clients, the app kind, the
// signed-in email and whether IndexedDB works, so ONE report from each device settles it.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const tok=Buffer.from(JSON.stringify({u:'p1',e:'diana@example.com'})).toString('base64url')+'.sig';
await p.addInitScript(t=>{localStorage.setItem('sc_token',t);localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_cloud_seeded','1');},tok);
const acct={sc_session_summaries:JSON.stringify({c1:[{date:'Sep 25, 2026',note:'Your first reset facial',ts:1}]}),sc_brand_colors:JSON.stringify({logoDataUrl:'data:image/png;base64,AAA'})};
await p.route('**/api/**',r=>{const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('cloud-status'))return ok({enabled:true});
  if(u.includes('/api/store')&&r.request().method()==='GET')return ok({ok:true,data:acct});
  return ok({ok:true,clients:[],events:[]});});
await p.goto('http://localhost:8899/slickchart.html');
await p.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:30000}).catch(()=>{});await p.waitForTimeout(1500);
// the phone's situation: its own copy has lost the summaries and the logo
await p.evaluate(()=>{localStorage.setItem('sc_session_summaries','{}');localStorage.setItem('sc_brand_colors','{}');});
await p.evaluate(()=>_runSelfCheck());await p.waitForTimeout(3000);
const t=await p.evaluate(()=>document.body.innerText);
check('says what kind of app it is',/Kind of app/.test(t)&&/web browser|home-screen|installed app/.test(t));
check('says which email it is signed in as',/Signed in as[\s\S]{0,40}diana@example\.com/.test(t));
check('tests the phone storage',/IndexedDB\)[\s\S]{0,20}works/.test(t));
check('compares summaries: device 0 vs account 1',/Session summaries[\s\S]{0,80}this device: 0 clients, 0 summaries · your account: 1 clients, 1 summaries/.test(t),(t.match(/Session summaries[^\n]*\n?[^\n]*/)||[''])[0]);
check('compares the logo',/Your logo[\s\S]{0,60}this device: no logo · your account: your logo is set/.test(t));
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
