// ANDROID LAYOUT SWEEP (2026-10-21): the three open items from the 2026-10-19 Android sweep.
//   1. tablets: a touch screen wider than a phone must get the whole screen, not a 390px card
//   2. composer bars (messages, chat, notes): no strip of page showing between the bar and the menu
//   3. Chrome's 130% zoom: a 412px phone becomes ~317px of CSS, a 360px one ~277px. Nothing may run
//      off the right edge of the app at those widths.
// Screens are visited with nav(); a few take a client. Screenshots go to $OUT (default ./.android-shots).
//   node scratchpad/sweep-android-layout.mjs [tablet|zoom|composer|all]
const pw=(await import('/opt/node22/lib/node_modules/playwright/index.js')).default;
import fs from 'fs';
const WHAT=process.argv[2]||'all';
const OUT=process.env.OUT||new URL('./.android-shots/',import.meta.url).pathname;fs.mkdirSync(OUT,{recursive:true});
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const SCREENS=['home','clients','client','notes','write-note','summary-history','session-summary','messages','chat','calendar','payments','forms','form-builder','form-preview','client-forms','shop','bundles','inventory','add-inventory-item','vault','photos','room','virtual','vc-inbox','requests','rebook','new-client','course-builder','course-detail','checkin-detail','checkin-settings','protocols','new-protocol','partners','vendors','settings','account','security-billing','integrations','square-sync','connect-calendar','service-menu','invite-clients','import-clients','import-products','merge-clients','help','whats-new','notifications-feed','build-invoice','upload-doc','add-resource','add-affiliate','switch-app'];
const clients={};for(let i=0;i<12;i++){const id='c'+i;clients[id]={id,name:'Jacqueline Montgomery-Richardson '+i,email:'longaddress.client'+i+'@verylongdomainname-example.com',phone:'(925) 555-01'+String(i).padStart(2,'0'),treatment:'Signature Hydrating Facial with Dermaplaning',notes:'Sensitive skin, retinol pause two weeks before peels. '.repeat(4),_ts:1758000000000};}
const kv={sc_clients:JSON.stringify(clients),sc_professions:JSON.stringify(['esty']),sc_hide_sample:'1',sc_bizinfo:JSON.stringify({name:'Botanical Aesthetics',phone:'555',_ts:1758000000000})};
async function open(browser,opt){
  const ctx=await browser.newContext({viewport:opt.vp,deviceScaleFactor:opt.dpr||2,isMobile:!!opt.mobile,hasTouch:!!opt.touch,serviceWorkers:'block',userAgent:opt.ua});
  const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.addInitScript((d)=>{window.__DBG=d;localStorage.setItem('sc_token','eyJ1IjoicDEifQ.sig');localStorage.setItem('sc_onboarded','1');window.open=()=>null;},!!process.env.DBG);
  await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'}));
  await page.route('**/api/cloud-status*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'}));
  await page.route('**/api/store*',r=>r.request().method()==='GET'?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:kv})}):r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await page.route('**/api/clients*',r=>r.request().method()==='GET'?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,clients:Object.values(clients).map(c=>({id:c.id,name:c.name,email:c.email,phone:c.phone,data:c}))})}):r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await page.route(/^(?!http:\/\/localhost:8899).*/,r=>/cdn\.jsdelivr|fonts\.g|cdnjs|unpkg/.test(r.request().url())?r.continue():r.abort());
  await page.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'});
  await page.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:30000}).catch(()=>{});
  await page.waitForTimeout(1500);
  return {ctx,page,errs};
}
async function go(page,s){
  return page.evaluate(s=>{
    document.querySelectorAll('body > div[id]').forEach(x=>{try{if(getComputedStyle(x).position==='fixed')x.remove();}catch(e){}});
    const cid=Object.keys(CL)[0];
    try{['client','notes','write-note','summary-history','session-summary','chat','room','photos','rebook','client-forms'].includes(s)?nav(s,cid):nav(s);}catch(e){return 'nav threw: '+e.message;}
    return null;},s);
}
// Everything visible inside the app that sticks out past the shell's right edge.
const overflow=page=>page.evaluate(()=>{
  // The screen (#S) scrolls; content wider than it makes the whole screen slide sideways, which is
  // what 130% zoom did. So measure against #S itself, and name the widest things sticking out.
  const sh=document.querySelector('.shell');const S=document.getElementById('S')||sh;const R=S.getBoundingClientRect();const out=[];
  const extra=S.scrollWidth-S.clientWidth;
  if(extra<=1&&document.documentElement.scrollWidth<=innerWidth+1)return [];
  S.scrollLeft=0;
  S.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect();if(!r.width||!r.height)return;const cs=getComputedStyle(e);if(cs.visibility==='hidden'||cs.display==='none')return;
    if(r.right>R.right+1.5){
      let p=e.parentElement,clipped=false;while(p&&p!==S){const pc=getComputedStyle(p);if(/(auto|scroll|hidden|clip)/.test(pc.overflowX)&&p.getBoundingClientRect().right<=R.right+1.5){clipped=true;break;}p=p.parentElement;}
      // report only the outermost sticking-out element
      let q=e.parentElement,inner=false;while(q&&q!==S){if(q.getBoundingClientRect().right>R.right+1.5){inner=true;break;}q=q.parentElement;}
      if(!clipped&&!inner)out.push((e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.split(' ')[0]:'')+' "'+(e.textContent||e.getAttribute('placeholder')||'').trim().replace(/\s+/g,' ').slice(0,40)+'" +'+Math.round(r.right-R.right)+'px'+(window.__DBG?'\n      PARENT: '+e.parentElement.outerHTML.replace(/\s+/g,' ').slice(0,700):'')));}});
  return out.length?out.slice(0,6):['screen slides sideways by '+extra+'px'];
});
const browser=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const UA_TAB='Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const UA_PH='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
if(WHAT==='tablet'||WHAT==='all'){
  for(const [name,vp] of [['tablet portrait',{width:800,height:1280}],['tablet landscape',{width:1280,height:800}]]){
    console.log('\n['+name+']');
    const {ctx,page}=await open(browser,{vp,touch:true,mobile:true,ua:UA_TAB});
    const sh=await page.evaluate(()=>{const r=document.querySelector('.shell').getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),vw:innerWidth,vh:innerHeight};});
    check(`${name}: the app fills the screen`,sh.w>=sh.vw-1&&sh.h>=sh.vh-1,JSON.stringify(sh));
    for(const s of SCREENS){const e=await go(page,s);await page.waitForTimeout(120);const o=await overflow(page);if(o.length||e)check(`${name} ${s}: nothing off the edge`,!o.length,e||o.join(' | '));}
    for(const s of ['home','clients','client','messages','calendar','settings'])  {await go(page,s);await page.waitForTimeout(250);await page.screenshot({path:OUT+name.replace(' ','-')+'-'+s+'.png'});}
    await ctx.close();
  }
  console.log('\n[desktop with a mouse keeps the phone frame]');
  const {ctx,page}=await open(browser,{vp:{width:1280,height:900}});
  const w=await page.evaluate(()=>Math.round(document.querySelector('.shell').getBoundingClientRect().width));
  check('desktop: still the 390px frame',w===390,'width '+w);await ctx.close();
}
if(WHAT==='zoom'||WHAT==='all'){
  for(const [name,vp] of [['130% zoom on a 412px phone',{width:317,height:700}],['130% zoom on a 360px phone',{width:277,height:600}]]){
    console.log('\n['+name+']');
    const {ctx,page}=await open(browser,{vp,touch:true,mobile:true,dpr:2.6,ua:UA_PH});
    let bad=0;
    for(const s of SCREENS){const e=await go(page,s);await page.waitForTimeout(120);const o=await overflow(page);if(o.length||e){bad++;check(`${name} ${s}: nothing off the edge`,!o.length,e||o.join(' | '));if(o.length)await page.screenshot({path:OUT+'zoom'+vp.width+'-'+s+'.png'});}}
    check(`${name}: ${SCREENS.length} screens checked`,bad===0,bad+' with something off the edge');
    await ctx.close();
  }
}
if(WHAT==='composer'||WHAT==='all'){
  for(const [name,vp] of [['Pixel 7',{width:412,height:915}],['360x740',{width:360,height:740}]]){
    console.log('\n['+name+' composer bars]');
    const {ctx,page}=await open(browser,{vp,touch:true,mobile:true,ua:UA_PH});
    const sw=await page.evaluate(()=>Math.round(document.querySelector('.shell').getBoundingClientRect().width));
    check(`${name}: the app is as wide as the phone (no strips at the sides)`,sw===vp.width,'shell '+sw+' of '+vp.width);
    for(const s of ['chat','messages','write-note','notes','vc-inbox']){
      await go(page,s);await page.waitForTimeout(300);
      const g=await page.evaluate(()=>{
        const nav=document.querySelector('.shell .nav');if(!nav||!nav.offsetHeight)return null;const N=nav.getBoundingClientRect();
        // the lowest visible fixed/sticky or bottom-anchored bar above the nav
        const bars=[...document.querySelectorAll('.shell *')].filter(e=>{const cs=getComputedStyle(e);if(!(cs.position==='sticky'||cs.position==='fixed'||cs.position==='absolute'))return false;const r=e.getBoundingClientRect();return r.height>30&&r.width>200&&r.bottom<=N.top+2&&r.bottom>N.top-80&&e.querySelector('textarea,input');});
        if(!bars.length)return {none:true};
        const b=bars.sort((a,c)=>c.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0];const r=b.getBoundingClientRect();
        return {gap:Math.round(N.top-r.bottom),bar:b.className||b.id};
      });
      if(g&&!g.none)check(`${name} ${s}: composer sits on the menu`,g.gap<=1,JSON.stringify(g));
      await page.screenshot({path:OUT+'composer-'+vp.width+'-'+s+'.png'});
    }
    await ctx.close();
  }
}
if(WHAT==='sheets'||WHAT==='all'){
  // Pop-ups were drawn at a fixed 390px. Now that the app fills a tablet or a wide phone, their dimmed
  // backdrop must cover the whole screen too, or the page shows at the sides.
  for(const [name,vp,ua] of [['tablet landscape',{width:1280,height:800},UA_TAB],['Pixel 7',{width:412,height:915},UA_PH]]){
    console.log('\n['+name+' pop-ups]');
    const {ctx,page}=await open(browser,{vp,touch:true,mobile:true,ua});
    for(const [label,fn] of [['edit client',"_editClientDetails(Object.keys(CL)[0])"],['chat share sheet',"nav('chat',Object.keys(CL)[0]);_chatShareSheet(Object.keys(CL)[0])"]]){
      await page.evaluate(f=>{document.querySelectorAll('body > div[id]').forEach(x=>{try{if(getComputedStyle(x).position==='fixed')x.remove();}catch(e){}});try{(0,eval)(f);}catch(e){}},fn);await page.waitForTimeout(400);
      const w=await page.evaluate(()=>{const ov=[...document.querySelectorAll('body > div, .shell > div')].filter(e=>getComputedStyle(e).position==='fixed'&&e.getBoundingClientRect().height>200).pop();return ov?Math.round(ov.getBoundingClientRect().width):-1;});
      check(`${name} ${label}: backdrop covers the screen`,w>=vp.width-1,'backdrop '+w+' of '+vp.width);
      await page.screenshot({path:OUT+'sheet-'+vp.width+'-'+label.replace(/ /g,'-')+'.png'});
    }
    await ctx.close();
  }
}
await browser.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
