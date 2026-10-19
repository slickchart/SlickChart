// THE NAIL ARTIST COLLECTION (2026-10-19). Same rules as the other collections (CLAUDE.md §1e):
// bundled (never stored unedited), shown to nail techs only, no leftover [placeholders], business
// name filled in, ticks on contraindications, Luxe by default, Library per document via
// /api/collection-pdf. Nothing taken from anyone who does not do nails.
//   node scratchpad/test-nail-artist-collection.mjs [file.html]   (served from slickchart-vercel on :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const DIRS={na:'/assets/na-97315595add70d4ee045ac48/',pm:'/assets/pm-8881ba4d736d7954ddb1e516/',hs:'/assets/hs-cd08c7917b34626fe2a21967/',lb:'/assets/lb-a5025eda48748f3494bcacd7/',ec:'/assets/ec-9308d13917a6f75f4f385060/'};
async function boot(profs,extra){
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  const pdfCalls=[];
  await ctx.route('**/api/**',async r=>{
    const u=r.request().url();
    if(u.includes('/api/cloud-status'))return r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'});
    if(u.includes('/api/collection-pdf')){const q=new URL(u).searchParams;pdfCalls.push(u);
      const doc=q.get('doc')||'';const key=(doc.match(/^(na|pm|hs|lb)-/)||[])[1]||(q.get('collection')||'ec');const D=DIRS[key]||DIRS.ec;
      const d=doc?{doc:{id:doc,style:q.get('style'),url:D+q.get('style')+'/'+doc.replace(/^(na|pm|hs|lb)-/,'')+'.pdf'}}:{};
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
  const {ctx,p,errs,pdfCalls}=await boot(['nail'],{sc_bizinfo:JSON.stringify({name:'Polished Nail Bar',phone:'555-222-3333'})});
  const r=await p.evaluate(()=>({
    na:Object.keys(formTmpls).filter(k=>/^na-/.test(k)).length,
    defs:_profFormDefs().filter(f=>/^na-/.test(f.id)).length,
    other:_profFormDefs().filter(f=>/^(ec|lb|hs|pm)-/.test(f.id)).length,
    stock:['nail-intake','nail-consent'].every(k=>formTmpls[k]&&formTmpls[k].qs.length)&&_profFormDefs().some(f=>f.id==='nail-intake'),
    guides:resources.filter(g=>/^g-na-/.test(g.id)).length,
    stockGuides:resources.filter(g=>!/^g-na-/.test(g.id)).length,
    brackets:(()=>{const out=[];const walk=(v,id)=>{if(typeof v==='string'){if(/\[[^\]]*\]/.test(v))out.push(id+': '+v.slice(0,60));}else if(v&&typeof v==='object')Object.values(v).forEach(x=>walk(x,id));};
      Object.keys(NA_FORMS).forEach(k=>walk(NA_FORMS[k],k));NA_GUIDES.forEach(g=>walk(g,g.id));return out;})(),
    card:Object.keys(NA_FORMS).filter(k=>/card on file|credit card|card saved|booking system/i.test(JSON.stringify(NA_FORMS[k]))),
    emailPhotos:Object.keys(NA_FORMS).filter(k=>/email (me |us )?(your )?photos/i.test(JSON.stringify(NA_FORMS[k]))).concat(NA_GUIDES.filter(g=>/email (me |us )?(your )?photos/i.test(JSON.stringify(g))).map(g=>g.id)),
  }));
  check('12 Nail Artist forms are added',r.na===12,r.na);
  check('all 12 show for a nail tech, and no other collection crowds her list',r.defs===12&&r.other===0,JSON.stringify(r));
  check('her stock nail forms are all still there',r.stock);
  check('all 8 Nail Artist guides are in her guides, added to the stock ones',r.guides===8&&r.stockGuides>0,JSON.stringify([r.guides,r.stockGuides]));
  check('no [placeholder] left in any form or guide',!r.brackets.length,r.brackets.join(' | '));
  check('no card-on-file question',!r.card.length,r.card.join(','));
  check('no "email photos" anywhere',!r.emailPhotos.length,r.emailPhotos.join(','));
  await p.evaluate(()=>{_fgTab='forms';nav('forms');});await p.waitForTimeout(500);
  const fs=await p.evaluate(()=>{const t=document.body.innerText;return {hs:t.includes('The Nail Artist Collection'),other:t.includes('The Esthetician Collection')||t.includes('The Lash & Brow Collection')||t.includes('The Hair Stylist Collection')||t.includes('The PMU Collection'),ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
  check('the Forms screen shows "The Nail Artist Collection" only',fs.hs&&!fs.other&&fs.ov===0,JSON.stringify(fs));
  const pv=[];
  for(const id of await p.evaluate(()=>Object.keys(NA_FORMS))){
    await p.evaluate(id=>nav('form-preview',id),id);await p.waitForTimeout(250);
    pv.push(await p.evaluate(id=>{const s=document.querySelector('.scf');const t=document.body.innerText;
      const ci=(NA_FORMS[id].qs.filter(q=>q.type==='Contraindications').reduce((n,q)=>n+q.items.length,0));
      return {id,style:s&&s.getAttribute('data-style'),kick:s&&s.querySelector('.scf-kick').textContent,token:/\{(business|phone|email)[^}]*\}/.test(t),ticks:document.querySelectorAll('input.ci-tick').length,ci,ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};},id));
  }
  const bad=pv.filter(x=>x.style!=='luxe'||x.token||x.ticks!==x.ci||x.ov>0);
  check('every Nail Artist form previews in Luxe, tokens filled, a tick box per check item, no sideways scroll',!bad.length,JSON.stringify(bad));
  const k=Object.fromEntries(pv.map(x=>[x.id,x.kick]));
  check('the headers read sensibly',k['na-consult']==='Consultation'&&k['na-allergy']==='Client record'&&k['na-gel-consent']==='Informed consent'&&k['na-policy']==='Appointment policies'&&k['na-intake']==='New client'&&k['na-photo']==='Optional · your choice',JSON.stringify(k));
  const biz=await p.evaluate(()=>{nav('form-preview','na-service-consent');return new Promise(r=>setTimeout(()=>r(document.body.innerText.includes('Polished Nail Bar')),250));});
  check('her business name fills the {business} spots',biz);
  await p.evaluate(()=>persistForms());await p.waitForTimeout(300);
  const st=await p.evaluate(()=>{const d=JSON.parse(_lsGet('sc_forms')||'{}');return Object.keys(d.tmpls||{}).filter(k=>/^na-/.test(k));});
  check('unedited Nail Artist forms are not stored on her account',!st.length,st.join(','));
  await p.evaluate(()=>{_fgTab='forms';nav('forms');});await p.waitForTimeout(300);
  await p.evaluate(()=>switchFgTab('library'));await p.waitForTimeout(300);
  const lib=await p.evaluate(()=>{const c=document.getElementById('fg-library-content');return {cards:c.querySelectorAll('.pl-card').length,colls:[...c.querySelectorAll('.pl-coll')].map(x=>x.getAttribute('data-coll')),all:[...c.querySelectorAll('.pl-all')].map(x=>x.textContent.trim())};});
  check('her Library lists the 33 Nail Artist documents only, "Get all 37 pages"',lib.cards===33&&lib.colls.join()==='na'&&lib.all.length===1&&/all 37 pages/.test(lib.all[0]),JSON.stringify(lib));
  await p.evaluate(()=>_openPracticeDoc('na-systems'));
  await p.waitForFunction(()=>document.querySelectorAll('#pl-pages canvas.pl-page').length>0,null,{timeout:20000}).catch(()=>{});
  const d=await p.evaluate(()=>({pages:document.querySelectorAll('#pl-pages canvas.pl-page').length,url:document.getElementById('pl-entry').getAttribute('data-url'),title:document.querySelector('#pl-entry [role=dialog]').getAttribute('aria-label')}));
  check('a Nail Artist document opens from its own Luxe file',d.pages===1&&/na-97315595add70d4ee045ac48\/luxe\/systems\.pdf$/.test(d.url)&&d.title==='Nail systems cheat sheet',JSON.stringify(d));
  await p.evaluate(()=>{const x=document.querySelector('#pl-entry button[aria-label="Close"]');x&&x.click();});
  const pop=p.context().waitForEvent('page',{timeout:3000}).catch(()=>null);
  await p.evaluate(()=>_downloadCollectionPdf('luxe','na'));await p.waitForTimeout(500);await pop;
  check('the whole-PDF button asks for the Nail Artist file',pdfCalls.some(u=>/collection-pdf\?collection=na$/.test(u)),pdfCalls.slice(-1)[0]);
  allErrs.push(...errs);await ctx.close();
}
{
  const {ctx,p,errs}=await boot(['esty','lash']);
  const r=await p.evaluate(()=>({pm:_profFormDefs().filter(f=>/^na-/.test(f.id)).length,g:resources.filter(g=>/^g-na-/.test(g.id)).length,lib:_plCollections().map(c=>c.key).join()}));
  check('an esthetician who does lashes gets no nail collection',r.pm===0&&r.g===0&&r.lib==='ec,lb',JSON.stringify(r));
  allErrs.push(...errs);await ctx.close();
}
{
  const {ctx,p,errs}=await boot(['nail','wax']);
  const r=await p.evaluate(()=>({na:_profFormDefs().filter(f=>/^na-/.test(f.id)).length,ec:_profFormDefs().filter(f=>/^ec-/.test(f.id)).length,lib:_plCollections().map(c=>c.key).join()}));
  check('a nail tech who also waxes gets both collections and both in the Library',r.na===12&&r.ec===16&&r.lib==='ec,na',JSON.stringify(r));
  allErrs.push(...errs);await ctx.close();
}
check('no page errors',allErrs.length===0,allErrs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
