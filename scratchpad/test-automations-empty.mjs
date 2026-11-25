// Messages → Automations with none (2026-11-25 sweep): the tab showed "0 active" and three zero stats
// with nothing under them. Now it says what an automation is and offers New automation. Reminders'
// empty text says "license" (US spelling) not "licence".
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const E=process.env.PW_ENGINE||'chromium';const PORT=process.env.PORT||8900;
const b=E==='webkit'?await pw.webkit.launch():await pw.chromium.launch();
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  ok   ':'  FAIL ')+m);};
for (const [n,vp] of [['phone',{width:390,height:844}],['mac',{width:1440,height:900}]]){
 const ctx=await b.newContext({viewport:vp,serviceWorkers:'block'});const p=await ctx.newPage();
 const errs=[];p.on('pageerror',e=>errs.push(String(e)));
 await p.addInitScript(()=>{localStorage.setItem('sc_token','eyJ1IjoicHJvdl9hc2gifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_cloud_seeded','1');});
 await p.route('**/api/**',r=>{const u=r.request().url();r.fulfill({status:200,contentType:'application/json',body:u.includes('cloud-status')?'{"enabled":true}':u.includes('/api/store')?'{"data":{}}':'{"ok":true,"data":{},"clients":[],"events":[],"items":[]}'})});
 await p.route(/^(?!http:\/\/localhost:\d+).*/,r=>r.abort());
 await p.goto(`http://localhost:${PORT}/slickchart.html`);await p.waitForTimeout(2200);
 const tabText=async()=>{await p.evaluate(()=>{nav('messages');});await p.waitForTimeout(400);await p.evaluate(()=>{const t=[...document.querySelectorAll('button,div')].find(x=>x.offsetParent&&x.textContent.trim()==='Automations');t&&t.click();});await p.waitForTimeout(500);return p.evaluate(()=>document.getElementById('scr')?document.getElementById('scr').innerText:document.body.innerText);};
 // presets present: no empty state
 let t=await tabText();
 ok(!/No automations yet/.test(t)&&/active/.test(t),`${n}: with automations, no empty text`);
 await p.evaluate(()=>{autos.length=0;});
 t=await tabText();
 ok(/No automations yet/.test(t)&&/New automation/.test(t),`${n}: none: says what an automation is and offers New automation`);
 await p.evaluate(()=>{const bt=[...document.querySelectorAll('button')].find(x=>x.offsetParent&&/New automation/.test(x.textContent));bt.click();});await p.waitForTimeout(400);
 ok(await p.evaluate(()=>_navCur&&_navCur.screen==='add-automation'),`${n}: New automation opens the builder`);
 await p.evaluate(()=>nav('reminders'));await p.waitForTimeout(400);
 t=await p.evaluate(()=>document.body.innerText);
 ok(/renew your license/.test(t)&&!/licence/.test(t),`${n}: Reminders says "license"`);
 ok(!errs.length,`${n}: no page errors ${errs.slice(0,2).join(' | ')}`);
 await ctx.close();}
await b.close();console.log(`${E} test-automations-empty: ${pass}/${pass+fail} passed`);process.exit(fail?1:0);
