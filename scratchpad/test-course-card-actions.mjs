// Courses tab: Edit / Preview / Delete / Send to client never overlap or squash on a phone
// (2026-11-23 sweep: on an iPhone-width screen "Preview" ran into the Delete icon). Also: the card's
// lesson count matches what Preview shows (a starter said "6 modules" and opened to "0 lessons"), and
// Preview's edit button has a word on it, not a lone pencil.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const E=process.env.PW_ENGINE||'chromium';const PORT=process.env.PORT||8900;
const b=E==='webkit'?await pw.webkit.launch():await pw.chromium.launch();
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'  ok   ':'  FAIL ')+m);};
for (const [n,vp] of [['small phone',{width:360,height:740}],['phone',{width:390,height:844}],['ipad',{width:1032,height:1376}],['mac',{width:1440,height:900}]]){
 const ctx=await b.newContext({viewport:vp,serviceWorkers:'block'});const p=await ctx.newPage();
 await p.addInitScript(()=>{localStorage.setItem('sc_token','eyJ1IjoicHJvdl9hc2gifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_cloud_seeded','1');});
 await p.route('**/api/**',r=>{const u=r.request().url();r.fulfill({status:200,contentType:'application/json',body:u.includes('cloud-status')?'{"enabled":true}':u.includes('/api/store')?'{"data":{}}':'{"ok":true,"data":{},"clients":[],"events":[],"items":[]}'})});
 await p.route(/^(?!http:\/\/localhost:\d+).*/,r=>r.abort());
 await p.goto(`http://localhost:${PORT}/slickchart.html`);await p.waitForTimeout(2500);
 await p.evaluate(()=>{_fgTab='courses';nav('forms');});await p.waitForTimeout(600);
 const r=await p.evaluate(()=>{const rows=[...document.querySelectorAll('.course-card')].filter(c=>c.offsetParent);const bad=[];let n=0;
  for(const card of rows){const btns=[...card.querySelectorAll('button')].filter(x=>/Edit|Preview|Delete|Send to client/.test(x.innerText));n+=btns.length;
   const bx=btns.map(x=>{const r=x.getBoundingClientRect();return {t:x.innerText.trim(),l:r.left,r:r.right,tp:r.top,b:r.bottom,clip:x.scrollWidth>x.clientWidth+1};});
   const cr=card.getBoundingClientRect();
   for(let i=0;i<bx.length;i++){if(bx[i].clip)bad.push(bx[i].t+' squashed');if(bx[i].r>cr.right+1)bad.push(bx[i].t+' past the card');
    for(let j=i+1;j<bx.length;j++){const a=bx[i],c=bx[j];if(a.l<c.r-1&&c.l<a.r-1&&a.tp<c.b-1&&c.tp<a.b-1)bad.push(a.t+' overlaps '+c.t);}}}
  return {cards:rows.length,n,bad:[...new Set(bad)]};});
 ok(r.cards>0&&r.n>=r.cards*4,`${n}: ${r.cards} course cards, ${r.n} action buttons`);
 ok(!r.bad.length,`${n}: no button overlaps, squashes or runs past the card${r.bad.length?' ('+r.bad.join(', ')+')':''}`);
 if(n==='phone'){
  const m=await p.evaluate(async()=>{const out=[];for(const c of courses){_fgTab='courses';nav('forms');await new Promise(r=>setTimeout(r,200));
   const card=[...document.querySelectorAll('.course-card')].find(x=>x.innerText.includes(c.title));const meta=card&&card.querySelector('.course-meta')?card.querySelector('.course-meta').innerText:'';
   nav('course-detail',c.id);await new Promise(r=>setTimeout(r,200));const S=document.getElementById('S').innerText;const n=(S.match(/(\d+) lessons?/)||[])[1]||'0';
   const eb=[...document.querySelectorAll('#S button')].find(x=>/course-builder/.test(x.getAttribute('onclick')||'')&&x.closest('.btng,button.btng'));
   out.push({t:c.title,meta,n,edit:eb?eb.innerText.trim():'(none)'});}return out;});
  for(const x of m){ok(x.n==='0'?/No lessons yet/.test(x.meta):new RegExp('^'+x.n+' lesson').test(x.meta),`card "${x.meta}" matches Preview's ${x.n} lessons (${x.t})`);ok(/Edit/.test(x.edit),`Preview's edit button says "${x.edit}" (${x.t})`);}
  // a course with real lessons
  const r2=await p.evaluate(async()=>{courses.push({id:'ct_real',title:'Real One',icon:'ti-book',bg:'',ic:'',bdg:'bg',status:'Draft',price:'Free',lessons:[{title:'A'},{title:'B'}],modules:2,duration:'2 lessons'});_fgTab='courses';nav('forms');await new Promise(r=>setTimeout(r,200));const card=[...document.querySelectorAll('.course-card')].find(x=>x.innerText.includes('Real One'));return card.querySelector('.course-meta').innerText;});
  ok(/^2 lessons · Free$/.test(r2),`a course with 2 lessons reads "${r2}"`);}
 await ctx.close();}
await b.close();console.log(`${E} test-course-card-actions: ${pass}/${pass+fail} passed`);process.exit(fail?1:0);
