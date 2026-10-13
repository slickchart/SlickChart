// The past-due banner, driven in the real app.
//
// A provider whose card failed is now let in instead of being locked out, so the banner IS the whole
// notification. The ways it could quietly fail:
//   - it is rendered into #S, every screen rewrites S.innerHTML, and she sees it once and never again
//   - it points at the generic payment link, which starts a SECOND subscription on her email
//   - it shows an external payment link inside the native app, which breaks Apple's rules
//   - it shows for someone who is paying perfectly well
//
//   node scratchpad/test-billing-banner.mjs [file.html]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';
const INVOICE = 'https://invoice.stripe.com/i/acct_test/open_one';

const browser = await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

async function run({status, payUrl, native}){
  const page = await browser.newPage({viewport:{width:390,height:844}});
  await page.addInitScript(n=>{try{
    localStorage.setItem('sc_token','TESTTOKEN');
    localStorage.setItem('sc_onboarded','1');
    if(n)localStorage.setItem('sc_native','1');
  }catch(e){}}, native);

  await page.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',
    body:'{"ok":true,"data":{},"clients":[],"events":[]}'}));
  await page.route('**/api/billing-status*', r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({ok:true, subscription: status?{status, plan_amount:1000}:null,
                         payUrl: payUrl||'', payLabel: payUrl?'Update card':''})}));

  await page.goto('http://localhost:8899/'+FILE,{waitUntil:'load'});
  await page.waitForTimeout(2600);

  const res = await page.evaluate(async (isNative)=>{
    if(isNative){ try{ window._isNativeApp=()=>true; }catch(e){} }
    await _checkBillingBanner();
    await new Promise(r=>setTimeout(r,120));
    const read = () => {
      const el=document.getElementById('billing-banner');
      if(!el) return {missing:true};
      const shown = el.style.display!=='none' && el.offsetHeight>0;
      const a=el.querySelector('a');
      return {shown, text:(el.textContent||'').replace(/\s+/g,' ').trim(),
              href:a&&a.getAttribute('href')||null,
              action:(el.querySelector('a,button')||{}).textContent||null};
    };
    const first = read();
    // The failure this is really here for: navigate around, the way she would.
    try{ nav('clients'); }catch(e){}
    await new Promise(r=>setTimeout(r,160));
    try{ nav('calendar'); }catch(e){}
    await new Promise(r=>setTimeout(r,160));
    try{ nav('home'); }catch(e){}
    await new Promise(r=>setTimeout(r,160));
    const afterNav = read();
    // And that it sits ABOVE the screen, not inside it.
    const el=document.getElementById('billing-banner');
    const insideS = !!(el && document.getElementById('S').contains(el));
    // The visibility sweep cannot see this banner - it only renders for a past-due account - so it
    // carries its own WCAG check rather than quietly undoing a sweep that reached zero.
    let contrast=null;
    if(el && el.style.display!=='none'){
      const rgb=s=>(String(s).match(/[\d.]+/g)||[0,0,0]).map(Number);
      const L=c=>{const f=x=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);};
        return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]);};
      const cr=(a,b)=>{const l1=L(a),l2=L(b);return +(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05))).toFixed(2);};
      const bar=el.firstElementChild;
      const bg=rgb(getComputedStyle(bar).backgroundColor);
      const txt=el.querySelector('b');
      const act=el.querySelector('a,button');
      contrast={
        text: txt?cr(rgb(getComputedStyle(txt).color),bg):null,
        action: act?cr(rgb(getComputedStyle(act).color),rgb(getComputedStyle(act).backgroundColor)):null
      };
    }
    return {first, afterNav, insideS, contrast};
  }, !!native);

  await page.close();
  return res;
}

const CASES = [
  { name:'past_due with her invoice', opts:{status:'past_due', payUrl:INVOICE},
    want:{shown:true, href:INVOICE} },
  { name:'unpaid with her invoice',   opts:{status:'unpaid', payUrl:INVOICE},
    want:{shown:true, href:INVOICE} },
  { name:'past_due, no invoice',      opts:{status:'past_due', payUrl:''},
    want:{shown:true, href:null} },
  { name:'past_due in native app',    opts:{status:'past_due', payUrl:INVOICE, native:true},
    want:{shown:true, href:null} },
  { name:'active subscriber',         opts:{status:'active', payUrl:''},
    want:{shown:false} },
  { name:'no subscription row',       opts:{status:null, payUrl:''},
    want:{shown:false} },
];

let bad = 0;
for (const c of CASES) {
  const r = await run(c.opts);
  if (r.first.missing) { console.log('  ??   ' + c.name.padEnd(26) + ' no #billing-banner element'); bad++; continue; }

  const shownOk   = r.first.shown === c.want.shown;
  const hrefOk    = !c.want.shown || r.first.href === c.want.href;
  const survives  = !c.want.shown || r.afterNav.shown === true;      // the one that used to be missed
  const tellsHer  = !c.want.shown || /didn.t go through/i.test(r.first.text);
  const outsideS  = !r.insideS;
  // 1.4.3 AA: 4.5:1 for this size of text, for the message and for the action's own label.
  const cc = r.contrast || {};
  const readable = !c.want.shown
    || ((cc.text == null || cc.text >= 4.5) && (cc.action == null || cc.action >= 4.5));
  const ok = shownOk && hrefOk && survives && tellsHer && outsideS && readable;
  if (!ok) bad++;

  const where = !r.first.shown ? 'hidden'
              : r.first.href === INVOICE ? 'shown -> her invoice'
              : 'shown -> ' + (String(r.first.action||'').trim() || 'no action');
  console.log('  ' + (ok?'PASS':'FAIL') + '  ' + c.name.padEnd(26) + where.padEnd(24)
    + (c.want.shown ? ('survives nav: ' + (survives?'yes':'NO')
        + '   contrast ' + (cc.text!=null?cc.text.toFixed(2):'-') + ':1 text'
        + (cc.action!=null?(', '+cc.action.toFixed(2)+':1 action'):'')) : '')
    + (outsideS ? '' : '   <-- rendered INSIDE #S, a nav will wipe it'));
}

console.log(bad ? '\n' + bad + ' case(s) wrong'
  : '\nthe banner tells a past-due provider, survives navigating between screens, sends her\n'
  + 'to her OWN invoice, shows no external payment link in the native app, and stays away\n'
  + 'from anyone who is paying normally');
await browser.close();
process.exit(bad ? 1 : 0);
