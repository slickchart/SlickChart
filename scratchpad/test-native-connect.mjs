// Square / Google "Connect" in the installed app (2026-10-20 builds, Browser plugin): sign-in opens in
// the in-app browser with ?app=1, and slickchart://oauth?... closes it and lands back in the app with
// the same toast the web shows. Old builds (no Browser plugin) keep the old path.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
async function boot(browserPlugin,path){
  const ctx=await b.newContext({viewport:{width:390,height:844}});const seen=[];
  await ctx.route('**/api/**',r=>{const u=r.request().url();seen.push(u);
    if(u.includes('cloud-status'))return r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'});
    if(u.includes('/api/square/connect'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({url:'https://connect.squareup.com/oauth2/authorize?state=x'})});
    return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'});});
  await ctx.route('https://connect.squareup.com/**',r=>r.fulfill({status:200,body:'square'}));
  await ctx.addInitScript(bp=>{
    window.__calls=[];window.__listeners={};window.__toasts=[];
    Object.defineProperty(window,'proToast',{configurable:true,set(f){this._pt=function(m){__toasts.push(String(m));return f.apply(this,arguments);};},get(){return this._pt;}});
    const noop=new Proxy({},{get:(t,k)=>k==='then'?undefined:(...a)=>Promise.resolve({remove(){}})});
    const App=new Proxy({addListener:(ev,fn)=>{(__listeners[ev]=__listeners[ev]||[]).push(fn);return Promise.resolve({remove(){}});}},{get:(t,k)=>t[k]||(k==='then'?undefined:(...a)=>Promise.resolve({}))});
    const Browser={open:async o=>{__calls.push(['open',o.url]);},close:async()=>{__calls.push(['close']);}};
    window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios',isPluginAvailable:n=>n==='Browser'?bp:!['Filesystem','Share'].includes(n),
      Plugins:new Proxy({},{get:(t,k)=>k==='App'?App:k==='Browser'?(bp?Browser:undefined):(['Filesystem','Share'].includes(k)?undefined:noop)})};
  },browserPlugin);
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8899/slickchart.html');
  await p.evaluate(()=>{localStorage.clear();localStorage.setItem('sc_token','eyJ1IjoicDEifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_professions','["esty"]');});
  await p.goto('http://localhost:8899/slickchart.html'+(path||''));await p.waitForTimeout(3500);
  await p.evaluate(()=>{try{Cloud.token=Cloud.token||'eyJ1IjoicDEifQ.sig';}catch(e){}});
  return {ctx,p,errs,seen};
}
{
  const {ctx,p,errs,seen}=await boot(true);
  await p.evaluate(()=>_sqConnect());await p.waitForTimeout(500);
  const c=await p.evaluate(()=>__calls.splice(0));
  check('new build: Square Connect asks for an app return and opens the in-app browser',seen.some(u=>/\/api\/square\/connect\?app=1$/.test(u))&&c.length===1&&c[0][0]==='open'&&/connect\.squareup\.com/.test(c[0][1])&&p.url().endsWith('/slickchart.html'),JSON.stringify(c)+' '+p.url());
  await p.evaluate(()=>{const a=document.createElement('a');a.href='https://accounts.google.com/o/oauth2/v2/auth?state=y';a.textContent='g';document.body.appendChild(a);a.click();});await p.waitForTimeout(300);
  const g=await p.evaluate(()=>__calls.splice(0));
  check('new build: the Google Connect link opens in the in-app browser, not the app\'s own view',g.length===1&&/accounts\.google\.com/.test(g[0][1])&&p.url().endsWith('/slickchart.html'),JSON.stringify(g)+' '+p.url());
  const n=await p.evaluate(()=>(__listeners.appUrlOpen||[]).length);
  check('new build: the app listens for slickchart://oauth (alongside the client-link handler)',n>=1,String(n));
  await p.evaluate(()=>__listeners.appUrlOpen.forEach(f=>f({url:'slickchart://oauth?sq=connected'})));
  await p.waitForURL(/\/slickchart\?sq=connected|\/slickchart$/,{timeout:8000}).catch(()=>{});
  check('new build: the return closes the in-app browser and reloads into ?sq=connected',/\/slickchart(\?sq=connected)?$/.test(p.url()),p.url());
  check('new build: no page errors',!errs.length,errs.join(' | '));
  await ctx.close();
}
{
  const {ctx,p,errs}=await boot(true);
  await p.goto('http://localhost:8899/slickchart.html?gcal=connected');
  const t=await p.waitForFunction(()=>document.body.innerText.includes('Google Calendar connected'),null,{timeout:5000}).then(()=>true).catch(()=>false);
  await p.waitForTimeout(300);
  check('the ?gcal=connected return shows "Google Calendar connected" and tidies the address',t&&!/gcal=/.test(p.url()),p.url());
  await ctx.close();
}
{
  const {ctx,p,errs,seen}=await boot(false);
  await p.evaluate(()=>_sqConnect());await p.waitForTimeout(1200);
  check('old build: Square Connect unchanged (no ?app=1, navigates as before)',seen.some(u=>/\/api\/square\/connect$/.test(u))&&/connect\.squareup\.com/.test(p.url()),p.url());
  const n=await p.evaluate(()=>(window.__listeners.appUrlOpen||[]).length).catch(()=>0);
  await ctx.close();
}
await b.close();
// The server half: app-started callbacks answer with the slickchart:// page; web ones still redirect.
process.env.SESSION_SECRET='t';
const {appReturnPage}=await import('/home/user/SlickChart/slickchart-vercel/api/square/callback.js');
let out={};const fake={setHeader(k,v){out[k]=v;},status(c){out.code=c;return this;},end(b){out.body=b;}};
appReturnPage(fake,'slickchart://oauth?sq=connected','Square connected');
check('server: the return page links and redirects to slickchart://oauth',out.code===200&&/href="slickchart:\/\/oauth\?sq=connected"/.test(out.body)&&/location\.href="slickchart:\/\/oauth\?sq=connected"/.test(out.body),out.body.slice(-200));
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
