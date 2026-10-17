import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844}});
await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:r.request().url().includes('cloud-status')?'{"enabled":true}':'{"ok":true,"data":{},"clients":[],"events":[]}'}));
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8899/slickchart.html');
await p.evaluate(()=>{localStorage.setItem('sc_token','eyJ1IjoicDEifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_professions',JSON.stringify(['esty']));});
await p.reload();await p.waitForTimeout(3500);
const ids=await p.evaluate(()=>Object.keys(formTmpls).filter(k=>/^ec-/.test(k)));
const bad=[];
for(const id of ids){
  await p.evaluate(i=>nav('form-builder',i),id);await p.waitForTimeout(250);
  const r=await p.evaluate(i=>{const before=JSON.stringify(formTmpls[i].qs.map(q=>[q.label,q.type,!!q.required,q.options||null,q.items||null]));
    const {name,qs}=_readFormBuilder(i);const after=JSON.stringify(qs.map(q=>[q.label,q.type,!!q.required,(q.options&&q.options.length)?q.options:null,(q.items&&q.items.length)?q.items:null]));
    return {same:before===after,name:name===formTmpls[i].name,before:before.length,after:after.length};},id);
  if(!r.same||!r.name)bad.push(id+' '+JSON.stringify(r));
}
// sign on device shows the filled-in name
await p.evaluate(()=>{bizInfo.name='Glow Skin Studio';});
const sod=await p.evaluate(()=>{const q=formTmpls['ec-general-consent'].qs.find(q=>q.id==='ec-general-consent-11');return _sdQHTML(q);});
console.log('forms checked',ids.length,'mismatches',bad.length,bad.join('\n'));
console.log("sod",/Glow Skin Studio/.test(sod));console.log("errors",errs.length,errs.join('|'));
await b.close();
