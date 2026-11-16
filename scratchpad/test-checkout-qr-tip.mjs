// Pay-by-QR, tipping and "fill checkout from today's visit" (2026-11-16, build 2026-11-16h).
//   node scratchpad/test-checkout-qr-tip.mjs   (serve slickchart-vercel on :8899; CHROME=path optional)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const browser = process.env.ENGINE==='webkit' ? await pw.webkit.launch() :
  await pw.chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
let fails=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)fails++;};

async function open(width=390){
  const page = await browser.newPage({serviceWorkers:'block',viewport:{width,height:844}});
  const seen={links:[],status:0};
  await page.addInitScript(()=>{try{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');}catch(e){}});
  await page.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'}));
  await page.route('**/api/square/connection*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"connected":true,"oauth":true}'}));
  await page.route('**/api/square/catalog*', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({services:[{name:'Signature Facial',price:120,variations:[{id:'V1',name:'Regular',price:120}]}],retail:[{name:'Vitamin C Serum',price:48,variations:[{id:'V2',name:'Regular',price:48}]},{name:'Night Cream',price:60}]})}));
  await page.route('**/api/square/booking-options*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"services":[]}'}));
  await page.route('**/api/square/tax-rate*', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"rate":0}'}));
  await page.route('**/api/square/payment-link*', r=>{const b=JSON.parse(r.request().postData()||'{}');seen.links.push(b);
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({url:'https://square.link/u/TEST'+seen.links.length,id:'PL'+seen.links.length,orderId:'ORD'+seen.links.length})});});
  await page.route('**/api/square/pay-status*', r=>{seen.status++;
    const paid = seen.status>=2;
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,paid,total:paid?173:0,tip:paid?5:0,paymentId:paid?'PAY1':''})});});
  await page.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'}); await page.waitForTimeout(2600);
  await page.evaluate(()=>{[...document.querySelectorAll('body *')].filter(e=>getComputedStyle(e).position==='fixed'&&/signing in/.test(e.textContent)).forEach(e=>e.style.display='none');
    CL['t1']={id:'t1',name:'Test Client',email:'t@example.com',treatment:'Signature Facial'};});
  return {page,seen};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

// 1. Prefill from today's visit + tip default + QR paid on its own
{ const {page,seen}=await open();
  const r1=await page.evaluate(async()=>{
    sessionSummaries['t1']=[{_draftDate:_todayISO(),treatment:'Signature Facial',products:['Vitamin C Serum']}];
    nav('checkout','t1'); await new Promise(r=>setTimeout(r,900));
    return {items:_coItems.map(i=>i.name+':'+i.price), amt:document.getElementById('co-amt').value,
      note:(document.getElementById('co-prefill-note')||{}).textContent||'', tipChecked:document.getElementById('co-tip-ask').checked};
  });
  ok(r1.items.join('|')==='Signature Facial:120|Vitamin C Serum:48', 'prefill: today\'s service + recommended product ('+r1.items.join('|')+')');
  ok(r1.amt==='168.00', 'prefill: amount is the total ('+r1.amt+')');
  ok(/today/.test(r1.note), 'prefill: says it came from today\'s visit');
  ok(r1.tipChecked, 'tip: on to start');
  await page.evaluate(()=>{_coQr('t1');}); await page.waitForTimeout(1200);
  ok(seen.links[0]&&seen.links[0].allowTip===true && seen.links[0].amount===168, 'QR: link asks for a tip, right amount');
  const sheet=await page.evaluate(()=>{const o=document.getElementById('coqr-sheet');const img=o&&o.querySelector('img');const box=o&&o.firstElementChild;
    return {open:!!o,img:!!(img&&img.naturalWidth>0),text:o?o.textContent:'',overflow:box?box.scrollWidth>box.clientWidth+1:true};});
  ok(sheet.open && sheet.img, 'QR: sheet with a real QR image');
  ok(/\$168\.00/.test(sheet.text) && /tip/.test(sheet.text), 'QR: shows amount and tip wording');
  ok(!sheet.overflow, 'QR: no overflow at phone width');
  await page.waitForTimeout(7000);
  const after=await page.evaluate(()=>{const p=_payments.find(p=>p.squareOrderId==='ORD1');return {st:(document.getElementById('coqr-status')||{}).textContent||'',p};});
  ok(/Paid/.test(after.st) && /\$5\.00 tip/.test(after.st), 'QR: turns to Paid with the tip ('+after.st.trim()+')');
  ok(after.p && after.p.status==='paid' && after.p.tip===5 && after.p.amount===168 && after.p.squarePaymentId==='PAY1', 'QR: record paid, amount kept, tip beside it');
  const polls=seen.status; await page.evaluate(()=>_coQrClose()); await page.waitForTimeout(4000);
  ok(seen.status===polls, 'QR: closing stops checking Square');
  await page.close(); }

// 2. Tip off is remembered; links follow it; nothing prefilled without a visit today; typed amount untouched
{ const {page,seen}=await open();
  const r=await page.evaluate(async()=>{
    nav('checkout','t1'); await new Promise(r=>setTimeout(r,900));
    const noPrefill=_coItems.length;
    const cb=document.getElementById('co-tip-ask'); cb.checked=false; cb.dispatchEvent(new Event('change'));
    const stored=JSON.parse(localStorage.getItem('sc_bizinfo')||'{}').tipAsk;
    nav('build-invoice'); await new Promise(r=>setTimeout(r,300)); const biTip=_coTip;
    nav('checkout','t1'); await new Promise(r=>setTimeout(r,300));
    const checked=document.getElementById('co-tip-ask').checked;
    document.getElementById('co-amt').value='50'; await _coLink('t1');
    return {noPrefill,stored,biTip,checked};
  });
  ok(r.noPrefill===0, 'prefill: nothing when there is no visit today (chart service alone is not a visit)');
  ok(r.stored===false && r.biTip===false && r.checked===false, 'tip: off is saved to her settings and remembered on both screens');
  ok(seen.links[0] && seen.links[0].allowTip===false, 'tip: payment link follows her choice');
  // typed amount is never overwritten by a late prefill
  const r2=await page.evaluate(async()=>{
    sessionSummaries['t1']=[{_draftDate:_todayISO(),treatment:'Signature Facial',products:[]}];
    _coMenu=null; nav('checkout','t1'); document.getElementById('co-amt').value='75';
    await new Promise(r=>setTimeout(r,900)); return {n:_coItems.length,v:document.getElementById('co-amt').value};
  });
  ok(r2.n===0 && r2.v==='75', 'prefill: never overwrites an amount she typed');
  await page.close(); }

// 3. A texted link marks itself paid on the next sync; "Paid another way"
{ const {page,seen}=await open();
  const r=await page.evaluate(async()=>{
    _payments.length=0;
    _addPayment({clientId:'t1',clientName:'Test Client',amount:40,method:'Square',status:'unpaid',date:_todayISO(),note:'Payment link',source:'square',publicUrl:'x',squareOrderId:'ORDX'});
    await _paySyncLinks(); await _paySyncLinks();
    const p=_payments[0];
    const q=_addPayment({clientId:'t1',clientName:'Test Client',amount:20,method:'Square',status:'unpaid',date:_todayISO(),squareOrderId:'ORDY',publicUrl:'https://square.link/u/Y'});
    await _loadQrLib(); _coQrSheet(q,20); _coQrMarkPaid(q.id);
    return {st:p.status,tip:p.tip,q:q.status,qm:q.method,sheet:!!document.getElementById('coqr-sheet')};
  });
  ok(r.st==='paid' && r.tip===5, 'sync: texted link marked paid with its tip');
  ok(r.q==='paid' && /Cash/.test(r.qm) && !r.sheet, '"Paid another way" marks it paid and closes');
  await page.close(); }

// 4. Computer width
{ const {page}=await open(1280);
  await page.evaluate(async()=>{sessionSummaries['t1']=[{_draftDate:_todayISO(),treatment:'Signature Facial',products:[]}];nav('checkout','t1');await new Promise(r=>setTimeout(r,900));await _coQr('t1');});
  await page.waitForTimeout(800);
  const s=await page.evaluate(()=>{const o=document.getElementById('coqr-sheet');const b=o&&o.firstElementChild;const r=b&&b.getBoundingClientRect();return {open:!!o,w:r&&r.width,h:r&&r.height,vh:innerHeight};});
  ok(s.open && s.w<=420 && s.h<=s.vh, 'computer width: QR sheet fits ('+Math.round(s.w)+'x'+Math.round(s.h)+')');
  await page.screenshot({path:process.env.SHOT||'/tmp/claude-0/qr-desktop.png'});
  await page.close(); }

await browser.close();
console.log(fails?`\n${fails} FAILED`:'\nALL PASS'); process.exit(fails?1:0);
