// App side of sign-in pass renewal (2026-10-29a): a pull that returns `renew` swaps in the new pass
// and saves it; a pull without one leaves the pass alone; a pass changed during the pull (sign-out or
// another account) is never overwritten by the renewal.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE=process.argv[2]||'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{if(!sessionStorage.getItem('x')){sessionStorage.setItem('x','1');localStorage.setItem('sc_token','OLD.tok');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_hide_sample','1');localStorage.setItem('sc_cloud_seeded','1');localStorage.setItem('sc_professions',JSON.stringify(['esty']));}});
let renew=null,hold=null;const seen=[];
await p.route('**/api/**',async r=>{const u=r.request().url();const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
  if(u.includes('cloud-status'))return ok({enabled:true});
  if(u.includes('/api/store')&&r.request().method()==='GET'&&!u.includes('key=')){seen.push(r.request().headers()['authorization']);if(hold)await hold;const o={data:{sc_hide_sample:'1',sc_professions:JSON.stringify(['esty'])}};if(renew)o.renew=renew;return ok(o);}
  return ok({ok:true,clients:[],events:[],data:{}});});
await p.goto('http://localhost:8899/'+FILE);
await p.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:30000}).catch(()=>{});await p.waitForTimeout(1200);
check('boot pull with no renew keeps the pass',await p.evaluate(()=>Cloud.token==='OLD.tok'&&localStorage.getItem('sc_token')==='OLD.tok'));
renew='NEW.tok';await p.evaluate(()=>Cloud.pull());
check('a renew swaps in the new pass',await p.evaluate(()=>Cloud.token==='NEW.tok'),await p.evaluate(()=>Cloud.token));
check('and saves it for the next launch',await p.evaluate(()=>localStorage.getItem('sc_token')==='NEW.tok'));
renew='NEWER.tok';await p.evaluate(()=>Cloud.pull());
check('the next pull is sent with the renewed pass',seen[seen.length-1]==='Bearer NEW.tok',seen[seen.length-1]);
let release;hold=new Promise(r=>release=r);renew='STALE.tok';
await p.evaluate(()=>{window._pp=Cloud.pull();});await p.waitForTimeout(300);
await p.evaluate(()=>{Cloud.token='OTHER.acct';});release();await p.evaluate(()=>window._pp);hold=null;
check('a pass changed during the pull is not overwritten',await p.evaluate(()=>Cloud.token==='OTHER.acct'),await p.evaluate(()=>Cloud.token));
let release2;hold=new Promise(r=>release2=r);renew='STALE2.tok';
await p.evaluate(()=>{window._pp=Cloud.pull();});await p.waitForTimeout(300);
await p.evaluate(()=>{Cloud.logout();});release2();await p.evaluate(()=>window._pp);hold=null;
check('a sign-out during the pull stays signed out',await p.evaluate(()=>!Cloud.token&&!localStorage.getItem('sc_token')));
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
