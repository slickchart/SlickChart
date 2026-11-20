// First-login setup checklist (2026-11-20, build 2026-11-20b). Ashley: "the first time they log in
// there should be a whole flow that prompts them to bring over their clients (with a walkthrough
// tutorial), set up payments (the square flow), full square integration if they have it, etc."
//   - Get Set Up = ordered checklist, each step ticks itself from real data, one "Next step" card
//   - payments first, with the one-button referral sign-up / connect; cash-only choice ticks it
//   - Square connected -> payments done + "Your Square is synced" step appears
//   - Bring your clients over walkthrough: pick old app -> export steps (verified only) -> upload
//   - Home card follows the same checklist, stays for a set-up provider with many clients
//   - wizard's last step leads to the checklist; no overflow at phone and computer width
//   node scratchpad/test-setup-checklist.mjs   (serve slickchart-vercel on :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const ENGINE = process.env.ENGINE || 'chromium';
const browser = ENGINE==='webkit' ? await pw.webkit.launch() :
  await pw.chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const REF = 'https://squareup.com/refer/2832A5A0B0';
let fails = 0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)fails++;};
const errs=[];
async function open(conn, width=390){
  const ctx = await browser.newContext({serviceWorkers:'block',viewport:{width,height:844}});
  const page = await ctx.newPage();
  page.on('pageerror',e=>errs.push(e.message));
  await page.addInitScript(()=>{try{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');}catch(e){}});
  await page.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'}));
  await page.route('**/api/square/connection*', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(conn)}));
  await page.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'});
  await page.waitForTimeout(2600);
  await page.evaluate(()=>{const ls=document.getElementById('login-screen');if(ls)ls.remove();});
  return {ctx,page};
}
const NOSQ={connected:false,oauth:false,expired:false}, SQ={connected:true,oauth:true,expired:false};
const readSetup = page => page.evaluate(async()=>{
  nav('data-setup'); await new Promise(r=>setTimeout(r,500));
  const steps=[...document.querySelectorAll('[data-setup-step]')].map(e=>({id:e.dataset.setupStep,done:e.dataset.done==='1'}));
  const nc=document.querySelector('[data-setup-nextcard]');
  return {steps, next:nc&&nc.dataset.setupNextcard, nextText:nc?nc.textContent.replace(/\s+/g,' '):'',
    signup:(document.querySelector('[data-setup-sq="signup"]')||{}).href||null,
    count:(document.querySelector('[data-setup-count]')||{}).textContent,
    overflow:document.getElementById('S').scrollWidth>document.getElementById('S').clientWidth+1};
});

for (const width of [390,1280]) {
  const {ctx,page} = await open(NOSQ,width);
  const r = await readSetup(page);
  const ids=r.steps.map(s=>s.id).join(',');
  ok(ids==='pay,clients,services,hours,booking,forms,logo,invite,app', `${width}: checklist in order (${ids})`);
  ok(r.next==='pay' && /first \$1,000 in card sales, processed free/.test(r.nextText) && /run through your own Square account/.test(r.nextText) && /first \$1,000/.test(r.nextText), `${width}: next step is payments, says Square is needed, names $1,000`);
  ok(r.signup===REF, `${width}: payments button is the referral link`);
  ok(/of 9 done/.test(r.count||''), `${width}: progress count shown (${r.count})`);
  ok(!r.overflow, `${width}: no overflow`);
  await ctx.close();
}
// cash only ticks payments, next moves to clients
{ const {ctx,page} = await open(NOSQ);
  await readSetup(page);
  await page.click('[data-setup-sq="cash"]'); await page.waitForTimeout(300);
  const r = await readSetup(page);
  ok(r.steps[0].done && r.next==='clients', 'cash only: payments ticked, next is Bring your clients over');
  // tapping the payments row still brings the Square card back
  const back = await page.evaluate(async()=>{nav('data-setup','pay');await new Promise(r=>setTimeout(r,300));const n=document.querySelector('[data-setup-nextcard]');return n&&n.dataset.setupNextcard;});
  ok(back==='pay', 'cash only: tapping Set up card payments shows the Square card again');
  // sign-up turns into connect
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.click('[data-setup-sq="signup"]')]);
  await page.waitForTimeout(500);
  ok(/2832A5A0B0/.test(pop.url()), 'checklist sign-up opens Square with the referral ('+pop.url()+')');
  const hasConnect = await page.evaluate(()=>!!document.querySelector('[data-setup-sq="connect"]'));
  ok(hasConnect, 'after sign-up the card offers Connect my Square');
  await ctx.close(); }
// Square connected
{ const {ctx,page} = await open(SQ);
  await readSetup(page); await page.waitForTimeout(500);
  const r = await readSetup(page);
  ok(r.steps[0].id==='pay'&&r.steps[0].done, 'Square connected: payments ticked');
  ok(r.steps.some(s=>s.id==='square'&&s.done), 'Square connected: "Your Square is synced" step shows');
  ok(r.next!=='pay' && !r.signup, 'Square connected: no sign-up pitch');
  await ctx.close(); }
// real data ticks steps
{ const {ctx,page} = await open(NOSQ);
  const r = await page.evaluate(async()=>{
    CL['c1']={id:'c1',name:'Real Client',email:'r@example.com'};
    brandColors.logoDataUrl='data:image/png;base64,AAAA';
    _setupMark('cash');
    nav('data-setup'); await new Promise(r=>setTimeout(r,400));
    return [...document.querySelectorAll('[data-setup-step]')].filter(e=>e.dataset.done==='1').map(e=>e.dataset.setupStep);
  });
  ok(r.includes('clients') && r.includes('logo') && r.includes('pay'), 'real client, logo and cash choice tick their steps ('+r.join(',')+')');
  await ctx.close(); }
// clients walkthrough
{ const {ctx,page} = await open(NOSQ);
  const r = await page.evaluate(async()=>{
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    nav('setup-clients'); await w(800);
    const chips=[...document.querySelectorAll('[data-cli-src]')].map(b=>b.dataset.cliSrc);
    document.querySelector('[data-cli-src="vagaro"]').click(); await w(200);
    const vag=document.getElementById('S').textContent.replace(/\s+/g,' ');
    const imp=!!document.querySelector('[data-cli-go="import"]');
    document.querySelector('[data-cli-go="import"]').click(); await w(400);
    const scr=_navCur.screen, src=_impSource;
    nav('setup-clients'); await w(200);
    document.querySelector('[data-cli-src="square"]').click(); await w(200);
    const sq=!!document.querySelector('[data-cli-go="square"]');
    document.querySelector('[data-cli-src="paper"]').click(); await w(200);
    const add=!!document.querySelector('[data-cli-go="add"]');
    const ov=document.getElementById('S').scrollWidth>document.getElementById('S').clientWidth+1;
    return {chips,vag,imp,scr,src,sq,add,ov};
  });
  ok(r.chips[0]==='square' && r.chips.includes('vagaro') && r.chips.includes('other') && r.chips.includes('paper'), 'walkthrough: pick where clients are now ('+r.chips.length+' choices)');
  ok(/look for Export or Download/.test(r.vag) && /Upload it here/.test(r.vag), 'walkthrough: unverified app gets honest generic export steps, then upload');
  ok(r.scr==='import-clients' && r.src==='vagaro', 'walkthrough: Upload opens the importer set to that app');
  ok(r.sq, 'walkthrough: Square option connects instead of exporting');
  ok(r.add, 'walkthrough: paper option adds the first client');
  ok(!r.ov, 'walkthrough: no overflow');
  await ctx.close(); }
// Home card
{ const {ctx,page} = await open(NOSQ);
  const r = await page.evaluate(async()=>{
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    _setupMark('started');
    for(let i=0;i<5;i++)CL['h'+i]={id:'h'+i,name:'Client '+i};
    nav('home'); await w(600);
    const card=document.querySelector('[data-gs-card]');
    return {card:!!card, steps:card?[...card.querySelectorAll('[data-gs-step]')].map(e=>e.dataset.gsStep):[], all:!!document.querySelector('[data-gs-all]')};
  });
  ok(r.card && r.steps[0]==='pay' && r.all, 'Home: set-up provider with 5 clients still sees the checklist card, payments first ('+r.steps.join(',')+')');
  const r2 = await page.evaluate(async()=>{_setupMark('started',false);nav('home');await new Promise(r=>setTimeout(r,400));return !!document.querySelector('[data-gs-card]');});
  ok(!r2, 'Home: established provider (old rule, 3+ clients, never set up) sees no card');
  await ctx.close(); }
// wizard end leads to the checklist
{ const {ctx,page} = await open(NOSQ);
  const r = await page.evaluate(async()=>{
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    showOnboarding(); onboardStep=ONBOARD_STEPS.indexOf('done'); renderOnboard(); await w(200);
    const t=document.querySelector('#onboard-overlay [data-ob-primary]').textContent.trim();
    document.querySelector('#onboard-overlay [data-ob-primary]').click(); await w(500);
    return {t, scr:_navCur&&_navCur.screen, started:localStorage.getItem('scsetup_started')};
  });
  ok(r.t==='Start my setup checklist →' && r.scr==='data-setup' && r.started==='1', 'wizard end: "Start my setup checklist" opens the checklist');
  await ctx.close(); }
ok(!errs.length, 'no page errors'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
await browser.close();
console.log(fails?`\n${fails} FAILED`:'\nALL PASS'); process.exit(fails?1:0);
