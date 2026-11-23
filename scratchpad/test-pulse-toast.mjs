// Quick pulse: a send that WORKED never says "Couldn't send" (2026-11-22: the error toast hung off the
// rating>=4 branch, so a 1-3 or a time-only answer showed it right after "Thanks"). A failed send still says so.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const E=process.env.PW_ENGINE||'chromium';const PORT=process.env.PORT||8900;
const b=E==='webkit'?await pw.webkit.launch():await pw.chromium.launch();
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  ok   ':'  FAIL ')+m);};
const cases=[['rating 2, sent',{rating:2},200,false],['time only, sent',{time:'less'},200,false],['rating 3, sent',{rating:3},200,false],['rating 5, sent',{rating:5},200,false],['rating 2, server down',{rating:2},500,true],['rating 5, server down',{rating:5},500,true]];
for(const [name,ans,status,wantErr] of cases){
 const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const p=await ctx.newPage();
 await p.addInitScript(()=>{localStorage.setItem('sc_token','eyJ1IjoicHJvdl9hc2gifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_cloud_seeded','1');});
 await p.route('**/api/**',r=>{const u=r.request().url();if(u.includes('/api/feedback'))return r.fulfill({status,contentType:'application/json',body:'{"ok":'+(status===200)+'}'});r.fulfill({status:200,contentType:'application/json',body:u.includes('cloud-status')?'{"enabled":true}':u.includes('/api/store')?'{"data":{}}':'{"ok":true,"data":{},"clients":[],"events":[],"items":[]}'})});
 await p.route(/^(?!http:\/\/localhost:\d+).*/,r=>r.abort());
 await p.goto(`http://localhost:${PORT}/slickchart.html`);await p.waitForTimeout(2500);
 const toasts=await p.evaluate(async a=>{const seen=[];const o=window.proToast;window.proToast=function(m){seen.push(String(m));};window._refMoment=()=>{};window._quoteAskMaybe=()=>false;
   _pulseAnswers.rating=a.rating;_pulseAnswers.timeSaved=a.time;await _sendPulse();await new Promise(r=>setTimeout(r,300));return seen;},ans);
 const err=toasts.some(t=>/couldn.t send/i.test(t)),thanks=toasts.some(t=>/thanks/i.test(t));
 ok(wantErr?(err&&!thanks):(thanks&&!err),`${name}: ${JSON.stringify(toasts)}`);
 await ctx.close();}
await b.close();console.log(`${E} test-pulse-toast: ${pass}/${pass+fail} passed`);process.exit(fail?1:0);
