// Build invoice with nothing on it (2026-11-24, real provider on iPhone: opened Build invoice, tapped a
// button 4 seconds later, got "Add line items or an amount first." and left, twice). There is no amount box
// on Build invoice, so: an empty list says what to do, the error names the two add buttons, and
// "Charge card on file" with no client says "Pick a client first." (it threw on c.squareId and did nothing).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const E=process.env.PW_ENGINE||'chromium';const PORT=process.env.PORT||8900;
const b=E==='webkit'?await pw.webkit.launch():await pw.chromium.launch();
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  ok   ':'  FAIL ')+m);};
for (const [n,vp] of [['phone',{width:390,height:844}],['mac',{width:1440,height:900}]]){
 const ctx=await b.newContext({viewport:vp,serviceWorkers:'block',hasTouch:n==='phone'});const p=await ctx.newPage();
 const errs=[];p.on('pageerror',e=>errs.push(String(e)));
 await p.addInitScript(()=>{localStorage.setItem('sc_token','eyJ1IjoicHJvdl9hc2gifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_cloud_seeded','1');});
 await p.route('**/api/**',r=>{const u=r.request().url();r.fulfill({status:200,contentType:'application/json',body:u.includes('cloud-status')?'{"enabled":true}':u.includes('/api/store')?'{"data":{}}':u.includes('/api/square/connection')?'{"connected":true,"oauth":true}':'{"ok":true,"data":{},"clients":[],"events":[],"items":[],"cards":[]}'})});
 await p.route(/^(?!http:\/\/localhost:\d+).*/,r=>r.abort());
 await p.goto(`http://localhost:${PORT}/slickchart.html`);await p.waitForTimeout(2200);
 await p.evaluate(()=>{CL['c1']={id:'c1',name:'Pat Lane',email:'pat@ex.com',squareId:'SQ1'};nav('build-invoice');});await p.waitForTimeout(600);
 const hint=await p.evaluate(()=>{const e=document.getElementById('bi-empty');return e&&e.offsetParent?e.textContent:'';});
 ok(/Nothing on this invoice yet/.test(hint),`${n}: empty invoice says what to do ("${hint}")`);
 const tap=async(label)=>{await p.evaluate(l=>{const bt=[...document.querySelectorAll('#scr button, button')].find(x=>x.offsetParent&&x.textContent.trim()===l);bt.click();},label);await p.waitForTimeout(500);return p.evaluate(()=>(document.getElementById('co-result')||{}).textContent||'');};
 let m=await tap('Charge card on file');
 ok(/Pick a client first/.test(m),`${n}: Charge card on file, no client: "${m}"`);
 await p.evaluate(()=>_biClientSet('c1'));
 m=await tap('Charge card on file');
 ok(/Add a line item first: tap Add from menu or Add custom line/.test(m)&&!/an amount/.test(m),`${n}: Charge card on file, no items: "${m}"`);
 for (const l of ['Preview invoice','Send invoice via Square','Text a payment link','Save as unpaid (mark paid later)']){m=await tap(l);ok(/line item/i.test(m)&&!/an amount/.test(m),`${n}: ${l}, no items: "${m}"`);}
 await p.evaluate(()=>{_coItems.push({name:'Facial',price:'80',qty:1});_coRenderItems();});await p.waitForTimeout(200);
 ok(await p.evaluate(()=>!document.getElementById('bi-empty')),`${n}: the hint goes once a line is added`);
 ok(!errs.length,`${n}: no page errors ${errs.slice(0,2).join(' | ')}`);
 await ctx.close();}
// Take payment keeps its own wording (it has an amount box): any screen without the Build invoice client row
{const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const p=await ctx.newPage();
 await p.addInitScript(()=>{localStorage.setItem('sc_token','eyJ1IjoicHJvdl9hc2gifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_cloud_seeded','1');});
 await p.route('**/api/**',r=>{const u=r.request().url();r.fulfill({status:200,contentType:'application/json',body:u.includes('cloud-status')?'{"enabled":true}':u.includes('/api/store')?'{"data":{}}':'{"ok":true,"data":{},"clients":[],"events":[],"items":[]}'})});
 await p.route(/^(?!http:\/\/localhost:\d+).*/,r=>r.abort());
 await p.goto(`http://localhost:${PORT}/slickchart.html`);await p.waitForTimeout(2200);
 const r=await p.evaluate(()=>{CL['c1']={id:'c1',name:'Pat Lane',squareId:'SQ1'};nav('home');const d=document.createElement('div');d.id='co-result';document.body.appendChild(d);_coItems.length=0;_coErr('Add line items or an amount first.');return {m:(document.getElementById('co-result')||{}).textContent||'',hint:!!document.getElementById('bi-empty')};});
 ok(/an amount/.test(r.m)&&!r.hint,`Take payment keeps "or an amount" and shows no invoice hint ("${r.m}")`);
 await ctx.close();}
await b.close();console.log(`${E} test-build-invoice-empty: ${pass}/${pass+fail} passed`);process.exit(fail?1:0);
