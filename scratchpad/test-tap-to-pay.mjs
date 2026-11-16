// Tap to Pay inside the phone app (native plugin "SquareTapToPay", mocked here) — 2026-11-16.
//   node scratchpad/test-tap-to-pay.mjs   (serve slickchart-vercel on :8899; CHROME=path optional)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const browser = process.env.ENGINE==='webkit' ? await pw.webkit.launch() :
  await pw.chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
let fails=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)fails++;};

async function open({native=true, plugin=true, auth=200, payResult='completed', linked=false, capable=true}={}){
  const page = await browser.newPage({serviceWorkers:'block',viewport:{width:390,height:844}});
  const seen={auth:0};
  await page.addInitScript(([native,plugin,payResult,linked,capable])=>{
    try{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');}catch(e){}
    window.__ttp={calls:[]};
    if(!native)return;
    const T={
      status:async()=>{__ttp.calls.push(['status']);return {available:true,initialized:true,capable,authorized:true,linked:__ttp.linked};},
      authorize:async(o)=>{__ttp.calls.push(['authorize',o]);return {authorized:true};},
      linkAccount:async()=>{__ttp.calls.push(['linkAccount']);__ttp.linked=true;return {linked:true};},
      pay:async(o)=>{__ttp.calls.push(['pay',o]);if(payResult==='canceled')return {status:'canceled'};
        if(payResult==='error'){const e=new Error('Card declined.');e.code='PAYMENT_FAILED';throw e;}
        return {status:'completed',paymentId:'SQPAY1',amountCents:o.amountCents,tipCents:o.tipCents,totalCents:o.amountCents+o.tipCents};},
      deauthorize:async()=>{__ttp.calls.push(['deauthorize']);},
    };
    window.__ttp.linked=linked;
    window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios',Plugins:plugin?{SquareTapToPay:T}:{}};
  },[native,plugin,payResult,linked,capable]);
  await page.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'}));
  await page.route('**/api/square/connection*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"connected":true,"oauth":true}'}));
  await page.route('**/api/square/catalog*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"services":[],"retail":[]}'}));
  await page.route('**/api/square/tax-rate*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"rate":0}'}));
  await page.route('**/api/square/mobile-auth*', r=>{seen.auth++;
    if(auth===409)return r.fulfill({status:409,contentType:'application/json',body:'{"error":"Reconnect Square once to turn on Tap to Pay.","code":"reconnect"}'});
    r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"appId":"sq0idp-APP","accessToken":"EAAA-OWN","locationId":"LOC1"}'});});
  await page.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'}); await page.waitForTimeout(2600);
  await page.evaluate(()=>{[...document.querySelectorAll('body *')].filter(e=>getComputedStyle(e).position==='fixed'&&/signing in/.test(e.textContent)).forEach(e=>e.style.display='none');
    CL['t1']={id:'t1',name:'Test Client',email:'t@example.com',treatment:'New client'};});
  return {page,seen};
}
const btnText=p=>p.evaluate(()=>[...document.querySelectorAll('#S button, button')].map(b=>b.textContent.trim()).filter(t=>/Tap to Pay|QR to pay/.test(t)));

// 1. Browser (no native app): no Tap to Pay button, QR stays the main button
{ const {page}=await open({native:false});
  await page.evaluate(()=>nav('checkout','t1')); await page.waitForTimeout(400);
  const b=await btnText(page);
  ok(!b.some(t=>/Tap to Pay/.test(t)) && b.some(t=>/QR/.test(t)), 'browser: no Tap to Pay button ('+b.join(' | ')+')');
  ok(await page.evaluate(()=>/btnp/.test([...document.querySelectorAll('button')].find(b=>/QR to pay/.test(b.textContent)).className)), 'browser: QR is still the main button');
  await page.close(); }

// 2. Native app WITHOUT the plugin (today's store build): unchanged
{ const {page}=await open({plugin:false});
  await page.evaluate(()=>nav('checkout','t1')); await page.waitForTimeout(400);
  const b=await btnText(page);
  ok(!b.some(t=>/Tap to Pay/.test(t)), 'current store app (no plugin): no Tap to Pay button');
  await page.close(); }

// 3. Full flow: first use links Apple account, tip picker 20%, payment recorded
{ const {page,seen}=await open();
  await page.evaluate(()=>nav('checkout','t1')); await page.waitForTimeout(400);
  const b=await btnText(page);
  ok(b[0] && /Tap to Pay/.test(b[0]), 'app with plugin: Tap to Pay is the first button');
  await page.evaluate(()=>{document.getElementById('co-amt').value='100';document.getElementById('co-desc').value='Facial';});
  await page.evaluate(()=>{[...document.querySelectorAll('button')].find(b=>/Tap to Pay/.test(b.textContent)).click();});
  await page.waitForSelector('#ttp-tip',{timeout:4000});
  const tipUi=await page.evaluate(()=>{const o=document.getElementById('ttp-tip');const box=o.firstElementChild;return {t:o.textContent,overflow:box.scrollWidth>box.clientWidth+1};});
  ok(/\$100\.00/.test(tipUi.t) && /15%/.test(tipUi.t) && /\$20\.00/.test(tipUi.t) && /No tip/.test(tipUi.t), 'tip picker: total, percents with amounts, No tip');
  ok(!tipUi.overflow, 'tip picker: fits a phone');
  await page.evaluate(()=>{[...document.querySelectorAll('#ttp-tip button')].find(b=>/^20%/.test(b.textContent)).click();});
  await page.waitForTimeout(500);
  const r=await page.evaluate(()=>({calls:__ttp.calls,res:document.getElementById('co-result').textContent,p:_payments.find(p=>p.method==='Tap to Pay')}));
  const names=r.calls.map(c=>c[0]);
  ok(seen.auth===1 && names[0]==='authorize' && r.calls[0][1].accessToken==='EAAA-OWN' && r.calls[0][1].locationId==='LOC1', 'signs Square in with her own token and location');
  ok(names.includes('linkAccount') && names.indexOf('linkAccount')<names.indexOf('pay'), 'first use: Apple terms (link) before paying');
  const pay=r.calls.find(c=>c[0]==='pay')[1];
  ok(pay.amountCents===10000 && pay.tipCents===2000 && pay.attemptId, 'pay: $100 plus $20 tip, with an attempt id');
  ok(r.p && r.p.status==='paid' && r.p.amount===100 && r.p.tip===20 && r.p.squarePaymentId==='SQPAY1' && r.p.amountPaid===120, 'recorded: paid, amount, tip, Square id');
  ok(/Paid \$120\.00/.test(r.res) && /\$20\.00 tip/.test(r.res), 'screen says paid with tip ('+r.res.trim()+')');
  // second payment: already linked, tip off -> no picker
  const r2=await page.evaluate(async()=>{__ttp.calls=[];const cb=document.getElementById('co-tip-ask');cb.checked=false;cb.dispatchEvent(new Event('change'));
    document.getElementById('co-amt').value='40';await _coTapToPay('t1');return {calls:__ttp.calls.map(c=>c[0]),pay:(__ttp.calls.find(c=>c[0]==='pay')||[])[1],picker:!!document.getElementById('ttp-tip')};});
  ok(!r2.calls.includes('linkAccount') && !r2.picker && r2.pay && r2.pay.tipCents===0, 'second time, tips off: no link, no picker, no tip');
  // sign-out stops the phone's Square sign-in
  const d=await page.evaluate(async()=>{__ttp.calls=[];await _ttpSignOut();return __ttp.calls.map(c=>c[0]);});
  ok(d.includes('deauthorize'), 'sign-out: Square signed out on the phone');
  ok(/_ttpSignOut\(\)/.test(await page.evaluate(()=>_doLogout.toString())), 'sign-out: _doLogout calls it');
  await page.close(); }

// 4. Back from the tip picker, cancel in Square's sheet, error, reconnect
{ const {page}=await open({linked:true});
  await page.evaluate(()=>{nav('checkout','t1');document.getElementById('co-amt').value='50';_coTapToPay('t1');});
  await page.waitForSelector('#ttp-tip',{timeout:4000});
  await page.evaluate(()=>{[...document.querySelectorAll('#ttp-tip button')].find(b=>b.textContent.trim()==='Back').click();});
  await page.waitForTimeout(300);
  const r=await page.evaluate(()=>({pay:__ttp.calls.some(c=>c[0]==='pay'),n:_payments.filter(p=>p.method==='Tap to Pay').length,lock:_coActionLock}));
  ok(!r.pay && r.n===0 && !r.lock, 'Back on tip picker: no charge, nothing recorded, buttons usable');
  // custom tip
  await page.evaluate(()=>{_coTapToPay('t1');}); await page.waitForSelector('#ttp-tip');
  await page.evaluate(()=>{document.getElementById('ttp-tip-custom').value='7.50';[...document.querySelectorAll('#ttp-tip button')].find(b=>b.textContent.trim()==='Add').click();});
  await page.waitForTimeout(400);
  ok(await page.evaluate(()=>(__ttp.calls.filter(c=>c[0]==='pay').pop()||[])[1].tipCents===750), 'custom tip $7.50');
  await page.close(); }
{ const {page}=await open({linked:true,payResult:'canceled'});
  const r=await page.evaluate(async()=>{nav('checkout','t1');_coTip=false;document.getElementById('co-amt').value='50';await _coTapToPay('t1');return {t:document.getElementById('co-result').textContent,n:_payments.filter(p=>p.method==='Tap to Pay').length};});
  ok(/canceled/i.test(r.t) && r.n===0, 'canceled in Square sheet: says nothing was charged, nothing recorded');
  await page.close(); }
{ const {page}=await open({linked:true,payResult:'error'});
  const r=await page.evaluate(async()=>{nav('checkout','t1');_coTip=false;document.getElementById('co-amt').value='50';await _coTapToPay('t1');return {t:document.getElementById('co-result').textContent,n:_payments.filter(p=>p.method==='Tap to Pay').length};});
  ok(/declined/.test(r.t) && r.n===0, 'declined: shows the reason, nothing recorded');
  await page.close(); }
{ const {page}=await open({auth:409});
  const r=await page.evaluate(async()=>{nav('checkout','t1');document.getElementById('co-amt').value='50';await _coTapToPay('t1');const el=document.getElementById('co-result');return {t:el.textContent,btn:!!el.querySelector('button')};});
  ok(/Reconnect Square once/.test(r.t) && r.btn, 'old Square connection: asks to reconnect once, with the button');
  await page.close(); }
{ const {page}=await open({capable:false});
  const r=await page.evaluate(async()=>{nav('checkout','t1');document.getElementById('co-amt').value='50';await _coTapToPay('t1');return {t:document.getElementById('co-result').textContent,pay:__ttp.calls.some(c=>c[0]==='pay')};});
  ok(/can.t take Tap to Pay/.test(r.t) && !r.pay, 'phone that can\'t: says so, points to QR, no charge');
  await page.close(); }
{ const {page}=await open();
  const r=await page.evaluate(async()=>{nav('checkout','t1');await _coTapToPay('t1');return {t:document.getElementById('co-result').textContent,auth:__ttp.calls.length};});
  ok(/amount first/.test(r.t) && r.auth===0, 'no amount: asks for one, Square not touched');
  await page.close(); }

await browser.close();
console.log(fails?('\n'+fails+' FAILED'):'\nALL PASS'); process.exit(fails?1:0);
