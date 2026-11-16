// "Get paid" card on Take payment / Payments / Build invoice (2026-11-16, build 2026-11-16g).
// A trial provider canceled because she had "no direct pay options". With no Square of her own,
// those screens must lead with: open Square via the referral link, or connect the one she has.
//   - not connected -> card with the referral link + connect button, on all three screens
//   - connected     -> no card (never nag a provider who can already take cards)
//   - expired       -> reconnect line, no signup pitch
//   - read fails    -> nothing (demo / offline must not claim "not connected")
//   - deposits toggle with no Square -> modal goes to the Square guide
//   node scratchpad/test-square-pay-cta.mjs   (serve slickchart-vercel on :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const ENGINE = process.env.ENGINE || 'chromium';
const browser = ENGINE==='webkit' ? await pw.webkit.launch() :
  await pw.chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const REF = 'https://squareup.com/refer/2832A5A0B0';
let fails = 0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)fails++;};

async function run(conn, width=390){
  const page = await browser.newPage({serviceWorkers:'block',viewport:{width,height:844}});
  await page.addInitScript(()=>{try{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');}catch(e){}});
  await page.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'}));
  await page.route('**/api/square/connection*', r=> conn==='fail' ? r.abort() :
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(conn)}));
  await page.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'});
  await page.waitForTimeout(2600);
  const out = await page.evaluate(async ()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    CL['t1']={id:'t1',name:'Test Client',email:'t@example.com',treatment:'Facial'};
    const read=slot=>{const el=document.getElementById(slot);if(!el)return {missing:true};
      const a=el.querySelector('a');const b=[...el.querySelectorAll('button')].map(x=>x.textContent.trim());
      return {text:el.textContent.replace(/\s+/g,' ').trim(),href:a&&a.getAttribute('href'),buttons:b,
        visible:el.offsetHeight>0, overflow: el.scrollWidth>el.clientWidth+1};};
    const r={};
    nav('checkout','t1'); await wait(400); r.checkout=read('co-sqcta');
    nav('payments'); await wait(400); r.payments=read('pay-sqcta');
    nav('build-invoice'); await wait(400); r.invoice=read('bi-sqcta');
    // connect button wiring
    let called=false; const orig=window._sqConnect; window._sqConnect=()=>{called=true;};
    const btn=[...document.querySelectorAll('#bi-sqcta button')].find(b=>/connect/i.test(b.textContent));
    if(btn)btn.click(); r.connectCalled=called; window._sqConnect=orig;
    return r;
  });
  await page.close(); return out;
}

{ const r = await run({connected:false,oauth:false,expired:false});
  for (const k of ['checkout','payments','invoice']){
    ok(r[k].href===REF, `not connected: ${k} shows the referral link`);
    ok(/first \$1,000/.test(r[k].text), `not connected: ${k} names the $1,000 offer`);
    ok(r[k].buttons.some(b=>/already have Square/i.test(b)), `not connected: ${k} offers connect`);
    ok(r[k].visible && !r[k].overflow, `not connected: ${k} card visible, no overflow`);
  }
  ok(r.connectCalled, 'connect button runs _sqConnect');
}
{ const r = await run({connected:false,oauth:false,expired:false}, 1280);
  ok(r.checkout.href===REF && !r.checkout.overflow, 'computer width: card shows, no overflow'); }
{ const r = await run({connected:true,oauth:true,expired:false});
  for (const k of ['checkout','payments','invoice']) ok(r[k].text==='', `connected: ${k} shows nothing`); }
{ const r = await run({connected:false,oauth:false,expired:true});
  for (const k of ['checkout','payments','invoice']) ok(/expired/i.test(r[k].text) && !r[k].href, `expired: ${k} asks to reconnect, no signup pitch`); }
{ const r = await run('fail');
  for (const k of ['checkout','payments','invoice']) ok(r[k].text==='', `read fails: ${k} shows nothing`); }

// deposits toggle with no Square
{ const page = await browser.newPage({serviceWorkers:'block',viewport:{width:390,height:844}});
  await page.addInitScript(()=>{try{localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');}catch(e){}});
  await page.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'}));
  await page.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'}); await page.waitForTimeout(2600);
  const r = await page.evaluate(async ()=>{
    _bookSquare=false; bookCfg.depositOn=false; let went=null; const n=window.nav; window.nav=(s)=>{went=s;};
    _bookDepositToggle(); await new Promise(r=>setTimeout(r,200));
    const m=document.getElementById('confirm-modal'); const txt=m?m.textContent:'';
    const b=m&&[...m.querySelectorAll('button')].find(x=>/Set up Square/.test(x.textContent)); if(b)b.click();
    await new Promise(r=>setTimeout(r,200)); window.nav=n; return {txt,went,depositOn:bookCfg.depositOn};
  });
  ok(/\$1,000/.test(r.txt), 'deposits modal mentions the offer');
  ok(r.went==='square-guide', 'deposits modal "Set up Square" opens the Square guide');
  ok(!r.depositOn, 'deposits stay off without Square');
  await page.close(); }

await browser.close();
console.log(fails? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails?1:0);
