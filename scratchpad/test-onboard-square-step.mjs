// Setup's "Get paid right in SlickChart" step (2026-11-20, build 2026-11-20b). Ashley: Square sign-up
// must be impossible to miss in provider setup, one button, with the $1,000 referral filled in.
//   - step says plainly a Square account is needed for card payments, lists what it powers
//   - ONE big button: "Set up Square payments" -> the referral link (code is in the link)
//   - tapping it turns the card into "Connect my Square" (runs _sqConnect / OAuth), survives a reload
//   - "Already have Square? Connect it" runs the connect
//   - already connected -> "Square is connected", footer says Next
//   - bottom button is "Skip for now", not a big "Decide this later"; skip moves on
//   - phone and computer width, no overflow
//   node scratchpad/test-onboard-square-step.mjs   (serve slickchart-vercel on :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const ENGINE = process.env.ENGINE || 'chromium';
const browser = ENGINE==='webkit' ? await pw.webkit.launch() :
  await pw.chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const REF = 'https://squareup.com/refer/2832A5A0B0';
let fails = 0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)fails++;};

async function open(conn, width=390){
  const ctx = await browser.newContext({serviceWorkers:'block',viewport:{width,height:844}});
  const page = await ctx.newPage();
  await page.addInitScript(()=>{try{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_login_email','p@example.com');localStorage.setItem('sc_onboarded','1');}catch(e){}});
  await page.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'}));
  await page.route('**/api/square/connection*', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(conn)}));
  await page.route('https://squareup.com/**', r=>r.fulfill({status:200,contentType:'text/html',body:'<h1>Square</h1>'}));
  await page.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'});
  await page.waitForTimeout(2600);
  return {ctx,page};
}
const toSquareStep = page => page.evaluate(async()=>{
  const w=ms=>new Promise(r=>setTimeout(r,ms));
  const ls=document.getElementById('login-screen'); if(ls) ls.remove();   // test boots signed-out
  showOnboarding(); onboardStep=ONBOARD_STEPS.indexOf('square'); renderOnboard(); await w(300);
});
const read = page => page.evaluate(()=>{
  const o=document.getElementById('onboard-overlay'); const st=o&&o.querySelector('[data-ob-square]');
  const prim=o&&o.querySelector('[data-ob-primary]');
  const sign=o&&o.querySelector('[data-ob-sq="signup"]');
  return {text:st?st.textContent.replace(/\s+/g,' ').trim():'', signupHref:sign&&sign.getAttribute('href'),
    signupText:sign&&sign.textContent.trim(), connect:!!(o&&o.querySelector('[data-ob-sq="connect"]')),
    have:!!(o&&o.querySelector('[data-ob-sq="have"]')), primary:prim&&prim.textContent.trim(),
    overflow: st? st.scrollWidth>st.clientWidth+1 : true,
    signupBox: sign? sign.getBoundingClientRect().height : 0,
    offerFirst: !!(st&&st.firstElementChild&&st.firstElementChild.dataset.sqOffer)};
});

for (const width of [390, 1280]) {
  const {ctx,page} = await open({connected:false,oauth:false,expired:false}, width);
  await toSquareStep(page);
  let r = await read(page);
  ok(/need a Square account to take card payments/i.test(r.text), `${width}: says Square is needed for card payments`);
  ok(/Payment links/.test(r.text) && /Deposits/.test(r.text) && /membership billing/i.test(r.text), `${width}: lists what Square powers`);
  ok(/first \$1,000 in card sales, processed free/.test(r.text) && /nothing to type/i.test(r.text) && r.offerFirst, `${width}: the free $1,000 leads the step, nothing to type`);
  ok(r.signupHref===REF, `${width}: the one big button is the referral link`);
  ok(r.signupText==='Set up Square payments' && r.signupBox>=44, `${width}: button reads "Set up Square payments", tap-sized`);
  ok(r.have, `${width}: "Already have Square? Connect it" offered`);
  ok(r.primary==='Skip for now', `${width}: footer is "Skip for now"`);
  ok(!r.overflow, `${width}: no overflow`);
  // tap the big button: a new tab opens on the referral, the card becomes "Connect my Square"
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.click('[data-ob-sq="signup"]')]);
  await pop.waitForLoadState().catch(()=>{});
  console.log('  popup url:',pop.url()); ok(/2832A5A0B0/.test(pop.url()), `${width}: tapping it opens Square sign-up with the referral`);
  await page.waitForTimeout(500);
  r = await read(page);
  ok(r.connect && !r.signupHref, `${width}: after sign-up the card offers "Connect my Square"`);
  const called = await page.evaluate(async()=>{let c=false;window._sqConnect=()=>{c=true;};
    document.querySelector('[data-ob-sq="connect"]').click(); await new Promise(r=>setTimeout(r,50)); return c;});
  ok(called, `${width}: "Connect my Square" runs the Square connect`);
  await ctx.close();
}
// resume after a reload keeps the connect state
{ const {ctx,page} = await open({connected:false,oauth:false,expired:false});
  await page.evaluate(()=>localStorage.removeItem('sc_onboarded'));
  await toSquareStep(page);
  await page.evaluate(()=>{_obSqSignup(null);});
  await page.waitForTimeout(500);
  await page.reload({waitUntil:'load'}); await page.waitForTimeout(3000);
  await page.evaluate(async()=>{const ls=document.getElementById('login-screen');if(ls)ls.remove();showOnboarding(true);await new Promise(r=>setTimeout(r,300));});
  const r = await read(page);
  ok(r.connect, 'reload mid-setup: comes back on "Connect my Square"');
  await ctx.close(); }
// already-have path
{ const {ctx,page} = await open({connected:false,oauth:false,expired:false});
  await toSquareStep(page);
  const called = await page.evaluate(async()=>{let c=false;window._sqConnect=()=>{c=true;};
    document.querySelector('[data-ob-sq="have"]').click(); await new Promise(r=>setTimeout(r,50)); return c;});
  ok(called, '"Already have Square? Connect it" runs the Square connect');
  await ctx.close(); }
// skip moves on
{ const {ctx,page} = await open({connected:false,oauth:false,expired:false});
  await toSquareStep(page);
  const next = await page.evaluate(async()=>{document.querySelector('[data-ob-primary]').click();await new Promise(r=>setTimeout(r,200));return ONBOARD_STEPS[onboardStep];});
  ok(next!=='square', 'Skip for now moves to the next step ('+next+')');
  await ctx.close(); }
// connected
{ const {ctx,page} = await open({connected:true,oauth:true,expired:false});
  await toSquareStep(page); await page.waitForTimeout(300);
  const r = await read(page);
  ok(/Square is connected/.test(r.text) && !r.signupHref && r.primary==='Next', 'connected: says so, no sign-up pitch, footer Next');
  await ctx.close(); }
// Get Set Up's checklist is covered by test-setup-checklist.mjs
await browser.close();
console.log(fails?`\n${fails} FAILED`:'\nALL PASS'); process.exit(fails?1:0);
