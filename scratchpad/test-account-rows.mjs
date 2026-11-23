// Account → Account settings rows: icon, words and chevron on ONE line at phone, iPad and computer
// width (2026-11-22 sweep: the chevron dropped onto its own line because .nr had no CSS), and the
// AI Features screen never shows a developer setting name (GROQ_API_KEY) to a provider.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const E=process.env.PW_ENGINE||'chromium';const PORT=process.env.PORT||8900;
const b=E==='webkit'?await pw.webkit.launch():await pw.chromium.launch();
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  ok   ':'  FAIL ')+m);};
for (const [n,vp] of [['phone',{width:390,height:844}],['ipad',{width:1032,height:1376}],['mac',{width:1440,height:900}]]){
 const ctx=await b.newContext({viewport:vp,serviceWorkers:'block'});const p=await ctx.newPage();
 await p.addInitScript(()=>{localStorage.setItem('sc_token','eyJ1IjoicHJvdl9hc2gifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_cloud_seeded','1');});
 await p.route('**/api/**',r=>{const u=r.request().url();r.fulfill({status:200,contentType:'application/json',body:u.includes('cloud-status')?'{"enabled":true}':u.includes('/api/store')?'{"data":{}}':'{"ok":true,"data":{},"clients":[],"events":[],"items":[]}'})});
 await p.route(/^(?!http:\/\/localhost:\d+).*/,r=>r.abort());
 await p.goto(`http://localhost:${PORT}/slickchart.html`);await p.waitForTimeout(2500);
 await p.evaluate(()=>nav('account'));await p.waitForTimeout(700);
 const rows=await p.evaluate(()=>[...document.querySelectorAll('.nr')].filter(r=>r.offsetParent).map(r=>{const ch=r.querySelector('.ti-chevron-right').getBoundingClientRect();const tx=r.children[1].getBoundingClientRect();const rr=r.getBoundingClientRect();return {name:r.children[1].firstElementChild.textContent,same:ch.top<tx.bottom&&ch.bottom>tx.top&&ch.left>=tx.right-1,inside:ch.right<=rr.right+1,h:rr.height};}));
 ok(rows.length>=8,`${n}: ${rows.length} account rows drawn`);
 const bad=rows.filter(r=>!r.same||!r.inside);ok(!bad.length,`${n}: chevron beside the words on every row${bad.length?' (not: '+bad.map(r=>r.name).join(', ')+')':''}`);
 await p.evaluate(()=>nav('ai-settings'));await p.waitForTimeout(700);
 const txt=await p.evaluate(()=>document.body.innerText);ok(!/GROQ|API_KEY/.test(txt),`${n}: AI Features shows no developer setting name`);
 await ctx.close();}
await b.close();console.log(`${E} test-account-rows: ${pass}/${pass+fail} passed`);process.exit(fail?1:0);
