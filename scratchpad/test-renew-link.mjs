// A provider whose card failed gets 402 from /api/login with a checkoutUrl, and saw
// "Your subscription isn't active. Please renew to continue." with NOTHING to click -
// billing lives behind the login she is being refused. Reported 2026-10-13.
//
// This mocks the exact 402 api/login.js:82 sends and asserts the renew link renders,
// on BOTH login steps (a provider with 2FA hits the same wall one step later), and that
// it stays hidden in the native app, where an external payment link breaks Apple's rules.
//
//   node scratchpad/test-renew-link.mjs [file.html]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';
const PAYLINK = 'https://buy.stripe.com/test_renew_link';
const INVOICE = 'https://invoice.stripe.com/i/acct_test/test_open_invoice';
const MSG = 'Your subscription isn’t active. Please renew to continue.';

const browser = await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

async function run({native, totp, pastDue}){
  const page = await browser.newPage({viewport:{width:390,height:844}});
  await page.addInitScript(n=>{try{
    localStorage.clear();
    if(n)localStorage.setItem('sc_native','1');
  }catch(e){}}, native);

  // Register the catch-all FIRST: Playwright gives the most recently added route precedence,
  // so a broad route registered last silently swallows the specific one.
  await page.route('**/api/**', r=>r.fulfill({status:200,contentType:'application/json',
    body:'{"ok":true,"data":{},"clients":[],"events":[]}'}));

  let loginHits = 0;
  await page.route('**/api/login', r=>{
    loginHits++;
    // First call: ask for the 2FA code (only in the totp run). Second (or first): the paywall 402.
    if(totp && loginHits===1)
      return r.fulfill({status:401,contentType:'application/json',
        body:JSON.stringify({requiresTotp:true,error:'Enter your authenticator code'})});
    return r.fulfill({status:402,contentType:'application/json',
      body: pastDue
        ? JSON.stringify({error:MSG, checkoutUrl:INVOICE, checkoutLabel:'Pay now'})
        : JSON.stringify({error:MSG, checkoutUrl:PAYLINK})});
  });
  await page.goto('http://localhost:8899/'+FILE,{waitUntil:'load'});
  await page.waitForTimeout(2400);

  const res = await page.evaluate(async ([isTotp])=>{
    // Force the login screen up, whatever boot decided.
    try{ _loginMode='login'; if(typeof renderLogin==='function')renderLogin(); }catch(e){}
    try{ if(typeof _isNativeApp==='function' && localStorage.getItem('sc_native')==='1')
           window._isNativeApp=()=>true; }catch(e){}
    const set=(id,v)=>{const el=document.getElementById(id); if(el)el.value=v;};
    set('login-email','jaimie@example.com'); set('login-pw','hunter2hunter2');
    if(!document.getElementById('login-err'))return {err:'no login screen'};
    doLogin();
    await new Promise(r=>setTimeout(r,500));
    if(isTotp){
      set('login-totp','123456');
      if(typeof doLoginTotp!=='function')return {err:'no doLoginTotp'};
      doLoginTotp();
      await new Promise(r=>setTimeout(r,500));
    }
    const er=document.getElementById('login-err');
    const a=er&&er.querySelector('a');
    let contrast=null;
    if(a){
      const L=c=>{const f=x=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);};
        return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]);};
      const rgb=s=>(String(s).match(/\d+/g)||[0,0,0]).map(Number);
      let bg=null;
      for(let n=a;n&&n!==document.documentElement;n=n.parentElement){
        const c=getComputedStyle(n).backgroundColor;
        if(c&&!/rgba\(0, 0, 0, 0\)|transparent/.test(c)){bg=rgb(c);break;}
      }
      if(!bg)bg=rgb(getComputedStyle(document.body).backgroundColor);
      const fg=rgb(getComputedStyle(a).color);
      const l1=L(fg),l2=L(bg);
      contrast=+(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)).toFixed(2));
    }
    return {text:(er&&er.textContent||'').trim(), href:a&&a.getAttribute('href')||null,
            label:a&&a.textContent.trim()||null, contrast};
  }, [totp]);

  await page.close();
  return res;
}

const cases = [
  // A provider who is merely BEHIND is no longer refused here at all - api/login.js lets her in and
  // the app banners her (scratchpad/test-past-due.mjs, scratchpad/test-billing-banner.mjs). The only
  // login that still 402s is a subscription that genuinely ENDED, and for that a fresh checkout IS
  // the right destination.
  {name:'ended: password login',   opts:{native:false,totp:false}, want:PAYLINK, label:'Renew now'},
  {name:'ended: login + 2FA',      opts:{native:false,totp:true},  want:PAYLINK, label:'Renew now'},
  {name:'native app: no pay link', opts:{native:true, totp:false}, want:null},
];

let bad=0;
for(const c of cases){
  const r = await run(c.opts);
  if(r.err){console.log('  ??   '+c.name.padEnd(26)+' '+r.err);bad++;continue;}
  const hasMsg  = r.text.includes('Please renew to continue');
  const rightUrl = c.want ? (r.href===c.want) : (r.href===null);
  // the rendered label carries the trailing arrow
  const rightLabel = !c.label || String(r.label||'').replace(/\s*→\s*$/,'')===c.label;
  const readable = !c.want || (r.contrast!=null && r.contrast>=4.5);
  const ok = hasMsg && rightUrl && rightLabel && readable;
  if(!ok)bad++;
  console.log('  '+(ok?'PASS':'FAIL')+' '+c.name.padEnd(26)
    +' message:'+(hasMsg?'yes':'NO ')
    +'  link:'+(r.href?('"'+r.label+'" -> '+(r.href===INVOICE?'her open invoice':r.href===PAYLINK?'NEW subscription':r.href)):'none')
    +(r.contrast!=null?('  '+r.contrast.toFixed(2)+':1'):'')
    );
}
console.log(bad? '\n'+bad+' case(s) wrong'
  : '\na provider whose subscription ENDED gets a way to pay from both login steps, and the\nnative app shows no payment link at all');
await browser.close();
process.exit(bad?1:0);
