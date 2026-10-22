// "X hasn't done their check-in" cards: Clear all must clear them, the same as each card's own X.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;
const URL=process.env.APP_URL||'http://localhost:8899/slickchart.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:390,height:844}});
await p.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{}}'}));
await p.goto(URL,{waitUntil:'load'});
await p.waitForTimeout(3000);
const count=()=>p.evaluate(()=>(document.body.innerText.match(/hasn't done their check-in/g)||[]).length);
await p.evaluate(()=>{
  const lbl=h=>{const d=new Date(Date.now()+h*3600000);return d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})+' · '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});};
  ['Amber Test','Bella Test','Cara Test'].forEach((n,i)=>{CL['zz_ci_'+i]={name:n,treatment:'Facial',nextVisit:lbl(2+i),lastVisit:'2026-09-01'};});
  const ls=document.getElementById('login-screen');if(ls)ls.remove();const ob=document.getElementById('onboard-overlay');if(ob)ob.remove();
  nav('home');
});
await p.waitForTimeout(800);
const before=await count();
await p.evaluate(()=>{const btn=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Clear all');btn.click();});
await p.waitForTimeout(800);
const after=await count();
const stored=await p.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('sc_ci_dismissed')||'{}')).filter(k=>k.startsWith('zz_ci_')).length);
await p.evaluate(()=>nav('home'));await p.waitForTimeout(500);
const afterRenav=await count();
console.log({before,after,stored,afterRenav});
const ok=before>=3&&after===0&&stored===3&&afterRenav===0;
console.log(ok?'PASS':'*** FAIL ***');
await b.close();process.exit(ok?0:1);
