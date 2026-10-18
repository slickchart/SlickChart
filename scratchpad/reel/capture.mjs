// Captures the current demo apps' screens for the landing-page tour reel.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const OUT=process.argv[2];
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
async function open(file){
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:3});
  await p.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await p.goto('http://localhost:8899/'+file);await p.waitForTimeout(3500);
  // hide the demo banner and any install / setup prompts so the shot looks like the real app
  await p.addStyleTag({content:'#demo-banner,.demo-banner,[id*="demoBanner"],[class*="install-nudge"]{display:none!important}'});
  await p.evaluate(()=>{document.querySelectorAll('div,section').forEach(el=>{if(/^\s*🧪?\s*Live demo/.test(el.textContent||'')&&el.children.length<6&&el.offsetHeight<200)el.style.display='none';});
    document.querySelectorAll('button,[role=button]').forEach(x=>{if(/Reset demo/.test(x.textContent))x.closest('div').style.display='none';});});
  return p;
}
async function shot(p,name,fn,wait=900){try{await p.evaluate(fn);}catch(e){console.log(name,'ERR',e.message);}await p.waitForTimeout(wait);
  await p.addStyleTag({content:'*:focus,*:focus-visible{outline:none!important;box-shadow:none!important}'});
  await p.evaluate(()=>{try{document.activeElement&&document.activeElement.blur();}catch(e){}
    document.querySelectorAll('div').forEach(el=>{const t=el.textContent||'';
      if((/For the best experience/.test(t)||/Let.s get you set up/.test(t)||/Sample clients \(Maya/.test(t))&&el.offsetHeight<420&&el.offsetHeight>40&&!el.querySelector('#S'))el.style.display='none';
      if(/^\s*✨?\s*Sample preview/.test(t)&&el.offsetHeight<90)el.style.display='none';});
    document.querySelectorAll('span').forEach(x=>{if(x.textContent.trim()==='DEMO')x.style.display='none';});});
  await p.waitForTimeout(150);
  await p.screenshot({path:OUT+'/'+name+'.png'});console.log('shot',name);}
const P=await open('slickchart-provider-demo.html');
const ids=await P.evaluate(()=>Object.keys(CL).map(k=>[k,CL[k].name]));console.log(JSON.stringify(ids));
const maya=(ids.find(x=>/Maya/.test(x[1]))||ids[0])[0];
await shot(P,'p1-home',()=>nav('home'));
await shot(P,'p2-clients',()=>nav('clients'));
await shot(P,'p3-client',(id)=>nav('client',id));
await P.evaluate(id=>nav('client',id),maya);await P.waitForTimeout(900);await P.screenshot({path:OUT+'/p3-client.png'});
await shot(P,'p4-forms',()=>{_fgTab='forms';nav('forms');});
await shot(P,'p5-form',()=>nav('form-preview','ec-peel'));
await shot(P,'p6-messages',()=>nav('messages'));
await shot(P,'p7-calendar',()=>nav('calendar'));
await shot(P,'p8-vc',()=>nav('vc-inbox'));
await shot(P,'p9-library',()=>{_fgTab='library';nav('forms');});
await shot(P,'p10-checkin',()=>nav('checkin-preview'));
const C=await open('slickchart-client-demo.html');
await shot(C,'c1-home',()=>nav('home'));
await shot(C,'c2-journey',()=>nav('journey'));
await shot(C,'c3-homecare',()=>nav('homecare'));
await shot(C,'c4-messages',()=>nav('messages'));
await shot(C,'c5-checkin',()=>nav('checkin'));
await shot(C,'c6-summary',()=>nav('summary'));
await b.close();
