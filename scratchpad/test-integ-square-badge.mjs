// Integrations → Square badge says what is true (2026-11-24 sweep, area 2): an EXPIRED Square sign-in
// read "Not connected", and a check that could not reach the server also read "Not connected" while she
// was connected. Now: Connected / Sign-in expired / Not connected / Couldn't check, at phone and computer.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const E=process.env.PW_ENGINE||'chromium';const PORT=process.env.PORT||8900;
const b=E==='webkit'?await pw.webkit.launch():await pw.chromium.launch();
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  ok   ':'  FAIL ')+m);};
const CASES=[['connected',200,{connected:true,oauth:true,oauthConfigured:true,expired:false},'Connected'],
 ['expired',200,{connected:false,oauth:false,oauthConfigured:true,expired:true,expiredAt:'2026-11-20'},'Sign-in expired'],
 ['never',200,{connected:false,oauth:false,oauthConfigured:true,expired:false},'Not connected'],
 ['server 500',500,{error:'Something went wrong. Please try again.'},'Couldn’t check'],
 ['offline',0,null,'Couldn’t check']];
for (const [n,vp] of [['phone',{width:390,height:844}],['mac',{width:1440,height:900}]]) for (const [label,st,body,want] of CASES){
 const ctx=await b.newContext({viewport:vp,serviceWorkers:'block'});const p=await ctx.newPage();
 await p.addInitScript(()=>{localStorage.setItem('sc_token','eyJ1IjoicHJvdl9hc2gifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_cloud_seeded','1');});
 await p.route('**/api/**',r=>{const u=r.request().url();
  if(u.includes('/api/square/connection')){if(!st)return r.abort();return r.fulfill({status:st,contentType:'application/json',body:JSON.stringify(body)});}
  r.fulfill({status:200,contentType:'application/json',body:u.includes('cloud-status')?'{"enabled":true}':u.includes('/api/store')?'{"data":{}}':'{"ok":true,"data":{},"clients":[],"events":[],"items":[]}'})});
 await p.route(/^(?!http:\/\/localhost:\d+).*/,r=>r.abort());
 await p.goto(`http://localhost:${PORT}/slickchart.html`);await p.waitForTimeout(2200);
 await p.evaluate(()=>nav('integrations'));await p.waitForTimeout(900);
 const got=await p.evaluate(()=>{const e=document.getElementById('integ-square-badge');return e?e.textContent:null;});
 ok(got===want,`${n} ${label}: badge "${got}" (want "${want}")`);
 await ctx.close();}
await b.close();console.log(`${E} test-integ-square-badge: ${pass}/${pass+fail} passed`);process.exit(fail?1:0);
