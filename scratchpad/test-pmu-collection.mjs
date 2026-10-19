// THE PMU COLLECTION (2026-10-19). Same rules as the other collections (CLAUDE.md §1e):
// bundled (never stored unedited), shown to PMU artists only, no leftover [placeholders], business
// name filled in, ticks on contraindications, Luxe by default, Library per document via
// /api/collection-pdf. Nothing taken from anyone who does not do PMU.
//   node scratchpad/test-pmu-collection.mjs [file.html]   (served from slickchart-vercel on :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const DIRS={pm:'/assets/pm-8881ba4d736d7954ddb1e516/',hs:'/assets/hs-cd08c7917b34626fe2a21967/',lb:'/assets/lb-a5025eda48748f3494bcacd7/',ec:'/assets/ec-9308d13917a6f75f4f385060/'};
async function boot(profs,extra){
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  const pdfCalls=[];
  await ctx.route('**/api/**',async r=>{
    const u=r.request().url();
    if(u.includes('/api/cloud-status'))return r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'});
    if(u.includes('/api/collection-pdf')){const q=new URL(u).searchParams;pdfCalls.push(u);
      const doc=q.get('doc')||'';const key=(doc.match(/^(pm|hs|lb)-/)||[])[1]||(q.get('collection')||'ec');const D=DIRS[key]||DIRS.ec;
      const d=doc?{doc:{id:doc,style:q.get('style'),url:D+q.get('style')+'/'+doc.replace(/^(pm|hs|lb)-/,'')+'.pdf'}}:{};
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(Object.assign({ok:true,files:[{style:'luxe',label:'Luxe',url:D+'luxe.pdf'}]},d))});}
    return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'});
  });
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8899/'+FILE);
  await p.evaluate(([profs,extra])=>{localStorage.clear();localStorage.setItem('sc_token','eyJ1IjoicDEifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_professions',JSON.stringify(profs));
    for(const k in (extra||{}))localStorage.setItem(k,extra[k]);},[profs,extra]);
  await p.reload();await p.waitForTimeout(3500);
  return {ctx,p,errs,pdfCalls};
}
const allErrs=[];
{
  const {ctx,p,errs,pdfCalls}=await boot(['pmu'],{sc_bizinfo:JSON.stringify({name:'Fine Line Brow Studio',phone:'555-222-3333'})});
  const r=await p.evaluate(()=>({
    pm:Object.keys(formTmpls).filter(k=>/^pm-/.test(k)).length,
    defs:_profFormDefs().filter(f=>/^pm-/.test(f.id)).length,
    other:_profFormDefs().filter(f=>/^(ec|lb|hs)-/.test(f.id)).length,
    stock:['pmu-intake','consent-pmu'].every(k=>formTmpls[k]&&formTmpls[k].qs.length)&&_profFormDefs().some(f=>f.id==='pmu-intake'),
    guides:resources.filter(g=>/^g-pm-/.test(g.id)).length,
    stockGuides:resources.filter(g=>!/^g-pm-/.test(g.id)).length,
    brackets:(()=>{const out=[];const walk=(v,id)=>{if(typeof v==='string'){if(/\[[^\]]*\]/.test(v))out.push(id+': '+v.slice(0,60));}else if(v&&typeof v==='object')Object.values(v).forEach(x=>walk(x,id));};
      Object.keys(PM_FORMS).forEach(k=>walk(PM_FORMS[k],k));PM_GUIDES.forEach(g=>walk(g,g.id));return out;})(),
    card:Object.keys(PM_FORMS).filter(k=>/card on file|credit card|card saved|booking system/i.test(JSON.stringify(PM_FORMS[k]))),
    emailPhotos:Object.keys(PM_FORMS).filter(k=>/email (me |us )?(your )?photos/i.test(JSON.stringify(PM_FORMS[k]))).concat(PM_GUIDES.filter(g=>/email (me |us )?(your )?photos/i.test(JSON.stringify(g))).map(g=>g.id)),
  }));
  check('15 PMU forms are added',r.pm===15,r.pm);
  check('all 15 show for a PMU artist, and no other collection crowds her list',r.defs===15&&r.other===0,JSON.stringify(r));
  check('her stock PMU forms are all still there',r.stock);
  check('all 10 PMU guides are in her guides, added to the stock ones',r.guides===10&&r.stockGuides>0,JSON.stringify([r.guides,r.stockGuides]));
  check('no [placeholder] left in any form or guide',!r.brackets.length,r.brackets.join(' | '));
  check('no card-on-file question',!r.card.length,r.card.join(','));
  check('no "email photos" anywhere',!r.emailPhotos.length,r.emailPhotos.join(','));
  await p.evaluate(()=>{_fgTab='forms';nav('forms');});await p.waitForTimeout(500);
  const fs=await p.evaluate(()=>{const t=document.body.innerText;return {hs:t.includes('The PMU Collection'),other:t.includes('The Esthetician Collection')||t.includes('The Lash & Brow Collection')||t.includes('The Hair Stylist Collection'),ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
  check('the Forms screen shows "The PMU Collection" only',fs.hs&&!fs.other&&fs.ov===0,JSON.stringify(fs));
  const pv=[];
  for(const id of await p.evaluate(()=>Object.keys(PM_FORMS))){
    await p.evaluate(id=>nav('form-preview',id),id);await p.waitForTimeout(250);
    pv.push(await p.evaluate(id=>{const s=document.querySelector('.scf');const t=document.body.innerText;
      const ci=(PM_FORMS[id].qs.filter(q=>q.type==='Contraindications').reduce((n,q)=>n+q.items.length,0));
      return {id,style:s&&s.getAttribute('data-style'),kick:s&&s.querySelector('.scf-kick').textContent,token:/\{(business|phone|email)[^}]*\}/.test(t),ticks:document.querySelectorAll('input.ci-tick').length,ci,ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};},id));
  }
  const bad=pv.filter(x=>x.style!=='luxe'||x.token||x.ticks!==x.ci||x.ov>0);
  check('every PMU form previews in Luxe, tokens filled, a tick box per check item, no sideways scroll',!bad.length,JSON.stringify(bad));
  const k=Object.fromEntries(pv.map(x=>[x.id,x.kick]));
  check('the headers read sensibly',k['pm-touchup']==='Perfecting session'&&k['pm-patch-test']==='Client record'&&k['pm-brow-design']==='Design approval'&&k['pm-microblading-consent']==='Informed consent'&&k['pm-policy']==='Appointment policies'&&k['pm-intake']==='New client',JSON.stringify(k));
  const biz=await p.evaluate(()=>{nav('form-preview','pm-consent');return new Promise(r=>setTimeout(()=>r(document.body.innerText.includes('Fine Line Brow Studio')),250));});
  check('her business name fills the {business} spots',biz);
  await p.evaluate(()=>persistForms());await p.waitForTimeout(300);
  const st=await p.evaluate(()=>{const d=JSON.parse(_lsGet('sc_forms')||'{}');return Object.keys(d.tmpls||{}).filter(k=>/^pm-/.test(k));});
  check('unedited PMU forms are not stored on her account',!st.length,st.join(','));
  await p.evaluate(()=>{_fgTab='forms';nav('forms');});await p.waitForTimeout(300);
  await p.evaluate(()=>switchFgTab('library'));await p.waitForTimeout(300);
  const lib=await p.evaluate(()=>{const c=document.getElementById('fg-library-content');return {cards:c.querySelectorAll('.pl-card').length,colls:[...c.querySelectorAll('.pl-coll')].map(x=>x.getAttribute('data-coll')),all:[...c.querySelectorAll('.pl-all')].map(x=>x.textContent.trim())};});
  check('her Library lists the 40 PMU documents only, "Get all 45 pages"',lib.cards===40&&lib.colls.join()==='pm'&&lib.all.length===1&&/all 45 pages/.test(lib.all[0]),JSON.stringify(lib));
  await p.evaluate(()=>_openPracticeDoc('pm-color-theory'));
  await p.waitForFunction(()=>document.querySelectorAll('#pl-pages canvas.pl-page').length>0,null,{timeout:20000}).catch(()=>{});
  const d=await p.evaluate(()=>({pages:document.querySelectorAll('#pl-pages canvas.pl-page').length,url:document.getElementById('pl-entry').getAttribute('data-url'),title:document.querySelector('#pl-entry [role=dialog]').getAttribute('aria-label')}));
  check('a PMU document opens from its own Luxe file',d.pages===1&&/pm-8881ba4d736d7954ddb1e516\/luxe\/color-theory\.pdf$/.test(d.url)&&d.title==='Pigment & color theory',JSON.stringify(d));
  await p.evaluate(()=>{const x=document.querySelector('#pl-entry button[aria-label="Close"]');x&&x.click();});
  const pop=p.context().waitForEvent('page',{timeout:3000}).catch(()=>null);
  await p.evaluate(()=>_downloadCollectionPdf('luxe','pm'));await p.waitForTimeout(500);await pop;
  check('the whole-PDF button asks for the PMU file',pdfCalls.some(u=>/collection-pdf\?collection=pm$/.test(u)),pdfCalls.slice(-1)[0]);
  allErrs.push(...errs);await ctx.close();
}
{
  const {ctx,p,errs}=await boot(['esty','lash']);
  const r=await p.evaluate(()=>({pm:_profFormDefs().filter(f=>/^pm-/.test(f.id)).length,g:resources.filter(g=>/^g-pm-/.test(g.id)).length,lib:_plCollections().map(c=>c.key).join()}));
  check('an esthetician who does lashes gets no PMU collection',r.pm===0&&r.g===0&&r.lib==='ec,lb',JSON.stringify(r));
  allErrs.push(...errs);await ctx.close();
}
{
  const {ctx,p,errs}=await boot(['pmu','brow']);
  const r=await p.evaluate(()=>({pm:_profFormDefs().filter(f=>/^pm-/.test(f.id)).length,lb:_profFormDefs().filter(f=>/^lb-/.test(f.id)).length,lib:_plCollections().map(c=>c.key).join()}));
  check('a PMU artist who also does brows gets both collections and both in the Library',r.pm===15&&r.lb>0&&r.lib==='lb,pm',JSON.stringify(r));
  allErrs.push(...errs);await ctx.close();
}
check('no page errors',allErrs.length===0,allErrs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
