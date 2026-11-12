import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const hide=async p=>p.evaluate(()=>{document.querySelectorAll('body *').forEach(e=>{const t=(e.innerText||'').trim();if(e.children.length<=4&&/Live demo|Reset demo|Sample preview/.test(t)&&t.length<200)e.style.display='none';});const g=document.getElementById('getapp-banner');if(g)g.style.display='none';document.activeElement&&document.activeElement.blur&&document.activeElement.blur();});
const V={width:390,height:960};
async function prov(screen,out){const p=await b.newPage({viewport:V,deviceScaleFactor:3});
await p.goto('http://localhost:8898/slickchart-provider-demo.html',{waitUntil:'load'});await p.waitForTimeout(4000);
await p.evaluate(s=>nav(s),screen);await p.waitForTimeout(2500);await hide(p);await p.waitForTimeout(300);await p.screenshot({path:out});await p.close();}
async function cli(open,out){const p=await b.newPage({viewport:V,deviceScaleFactor:3});
await p.goto('http://localhost:8898/slickchart-client-demo.html',{waitUntil:'load'});await p.waitForTimeout(4000);
await p.evaluate(()=>{const e=[...document.querySelectorAll('button,[onclick],a')].find(e=>e.offsetParent&&(e.innerText||'').trim()==='Shop');e.click();});await p.waitForTimeout(2000);
if(open){await p.evaluate(()=>{const e=[...document.querySelectorAll('button')].find(e=>/4 ways/.test(e.innerText));e.click();});await p.waitForTimeout(1500);}
await hide(p);await p.waitForTimeout(300);await p.screenshot({path:out});await p.close();}
await prov('virtual','ph-consult.png');await prov('learn','ph-courses.png');await cli(true,'ph-shop.png');await cli(false,'ph-picks.png');
await b.close();
