// Saving files inside the installed app (2026-10-20 builds): with the Filesystem + Share plugins every
// download/print goes to the share sheet; an OLD build (no plugins) keeps the Android toast and the
// iPhone's old behaviour. Capacitor is faked before the page loads.
//   node scratchpad/test-native-files.mjs   (slickchart-vercel served on :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
async function boot(platform,plugins){
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  await ctx.route('**/api/**',r=>{const u=r.request().url();
    if(u.includes('cloud-status'))return r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'});
    if(u.includes('collection-pdf'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,files:[{style:'luxe',label:'Luxe',url:'/assets/ec-9308d13917a6f75f4f385060/luxe/intake.pdf'}]})});
    return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'});});
  await ctx.addInitScript(([platform,plugins])=>{
    window.__calls=[];const noop=new Proxy({},{get:(t,k)=>k==='then'?undefined:(...a)=>Promise.resolve({remove(){}})});
    const P={Filesystem:{writeFile:async o=>{__calls.push(['write',o.path,o.directory,o.data.length]);return {uri:'file:///cache/'+o.path};}},
      Share:{share:async o=>{__calls.push(['share',o.title,o.files&&o.files[0]]);return {};}}};
    window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>platform,isPluginAvailable:n=>plugins||!['Filesystem','Share'].includes(n),
      Plugins:new Proxy(P,{get:(t,k)=>(plugins&&t[k])?t[k]:(['Filesystem','Share'].includes(k)?undefined:noop)})};
  },[platform,plugins]);
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8899/slickchart.html');
  await p.evaluate(()=>{localStorage.clear();localStorage.setItem('sc_token','eyJ1IjoicDEifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_professions','["esty"]');});
  await p.reload();await p.waitForTimeout(3500);
  return {ctx,p,errs};
}
const toast=p=>p.evaluate(()=>{const t=[...document.querySelectorAll('.pro-toast,#pro-toast,[class*=toast]')].map(x=>x.textContent).join(' | ');return t;});
for(const platform of ['ios','android']){
  const {ctx,p,errs}=await boot(platform,true);
  await p.evaluate(()=>_downloadFile('export.json','{"a":1}','application/json'));await p.waitForTimeout(600);
  let c=await p.evaluate(()=>__calls.splice(0));
  check(platform+' new build: a data export is written to the cache and shared',c.length===2&&c[0][0]==='write'&&c[0][2]==='CACHE'&&/export\.json$/.test(c[0][1])&&c[1][0]==='share'&&/export\.json$/.test(c[1][2]),JSON.stringify(c));
  await p.evaluate(()=>{const a=document.createElement('a');a.href='data:text/csv;base64,'+btoa('x,y');a.download='clients.csv';document.body.appendChild(a);a.click();});await p.waitForTimeout(600);
  c=await p.evaluate(()=>__calls.splice(0));
  check(platform+' new build: a CSV data link is shared too',c.length===2&&/clients\.csv$/.test(c[1][2]),JSON.stringify(c));
  const id=await p.evaluate(()=>{const id='c_t1';CL[id]={id,name:'Jen Test',treatment:'Facial',notes:[],photos:[]};return id;});
  await p.evaluate(id=>_printClientFile(id),id);await p.waitForTimeout(1200);
  c=await p.evaluate(()=>__calls.splice(0));
  check(platform+' new build: Print hands the page to the share sheet as a file',c.length===2&&/\.html$/.test(c[1][1]),JSON.stringify(c));
  await p.evaluate(()=>_downloadCollectionPdf('luxe','ec'));await p.waitForTimeout(1200);
  c=await p.evaluate(()=>__calls.splice(0));
  check(platform+' new build: the Library PDF is shared, and the app does not navigate away',c.length===2&&/\.pdf$/.test(c[1][1])&&p.url().endsWith('/slickchart.html'),JSON.stringify(c)+' '+p.url());
  check(platform+' new build: no page errors',!errs.length,errs.join(' | '));
  await ctx.close();
}
{
  const {ctx,p,errs}=await boot('android',false);
  const r=await p.evaluate(()=>_downloadFile('export.json','{}','application/json'));await p.waitForTimeout(300);
  const t=await p.evaluate(()=>document.body.innerText.includes('Saving files does not work inside the Android app yet'));
  check('android OLD build: keeps the honest "open it in Chrome" message',r==='native'&&t,String(r));
  check('android OLD build: no page errors',!errs.length,errs.join(' | '));
  await ctx.close();
}
{
  const {ctx,p,errs}=await boot('ios',false);
  const r=await p.evaluate(()=>_downloadFile('export.json','{}','application/json'));
  check('iPhone OLD build: unchanged (normal download path, no share call)',r===true&&(await p.evaluate(()=>__calls.length))===0,String(r));
  await ctx.close();
}
{ // the browser: nothing changes
  const ctx=await b.newContext();await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  const p=await ctx.newPage();await p.goto('http://localhost:8899/slickchart.html');await p.waitForTimeout(1500);
  const dl=p.waitForEvent('download',{timeout:5000}).catch(()=>null);
  await p.evaluate(()=>_downloadFile('export.json','{"a":1}','application/json'));
  const d=await dl;check('browser: still a normal download',!!d&&d.suggestedFilename()==='export.json');
  await ctx.close();
}
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
