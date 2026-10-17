// THE LASH & BROW COLLECTION (2026-10-17) and "every form defaults to Luxe + her branding + logo".
// Same rules as the Esthetician Collection: bundled (never stored unedited), shown to the right
// professions, no leftover [placeholders], business name filled in, ticks on contraindications,
// Library per document behind /api/collection-pdf. Plus: a lash pro who already uses the Esthetician
// Collection keeps it; forms default to Luxe with her logo and (readable) brand color.
//   node scratchpad/test-lash-brow-collection.mjs [file.html]   (served from slickchart-vercel on :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const LOGO='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
async function boot(profs,extra){
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  const pdfCalls=[];
  await ctx.route('**/api/**',async r=>{
    const u=r.request().url();
    if(u.includes('/api/cloud-status'))return r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'});
    if(u.includes('/api/collection-pdf')){const q=new URL(u).searchParams;pdfCalls.push(u);
      const lb=q.get('collection')==='lb'||/^lb-/.test(q.get('doc')||'');
      const D=lb?'/assets/lb-a5025eda48748f3494bcacd7/':'/assets/ec-9308d13917a6f75f4f385060/';
      const doc=q.get('doc')?{doc:{id:q.get('doc'),style:q.get('style'),url:D+q.get('style')+'/'+String(q.get('doc')).replace(/^lb-/,'')+'.pdf'}}:{};
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(Object.assign({ok:true,files:[{style:'luxe',label:'Luxe',url:D+'luxe.pdf'}]},doc))});}
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

// 1. A lash & brow artist
{
  const {ctx,p,errs,pdfCalls}=await boot(['lash','brow'],{sc_bizinfo:JSON.stringify({name:'Lux Lash Lounge',phone:'555-123-4567'})});
  const r=await p.evaluate(()=>({
    lb:Object.keys(formTmpls).filter(k=>/^lb-/.test(k)).length,
    defs:_profFormDefs().filter(f=>/^lb-/.test(f.id)).length,
    ecDefs:_profFormDefs().filter(f=>/^ec-/.test(f.id)).length,
    stock:['lash','lash-intake','lash-lift','brow-intake','brow-lam'].every(k=>formTmpls[k]&&formTmpls[k].qs.length),
    guides:resources.filter(g=>/^g-lb-/.test(g.id)).map(g=>g.id).sort(),
    brackets:(()=>{const out=[];const walk=(v,id)=>{if(typeof v==='string'){if(/\[[^\]]*\]/.test(v))out.push(id+': '+v.slice(0,60));}else if(v&&typeof v==='object')Object.values(v).forEach(x=>walk(x,id));};
      Object.keys(LB_FORMS).forEach(k=>walk(LB_FORMS[k],k));LB_GUIDES.forEach(g=>walk(g,g.id));return out;})(),
    card:Object.keys(LB_FORMS).filter(k=>/card on file|credit card|card details/i.test(JSON.stringify(LB_FORMS[k]))),
  }));
  check('13 Lash & Brow forms are added',r.lb===13,r.lb);
  check('all 13 show for a lash & brow artist',r.defs===13,r.defs);
  check('the Esthetician Collection does not crowd her list (she never used it)',r.ecDefs===0,r.ecDefs);
  check('her stock lash & brow forms are all still there',r.stock);
  check('all 8 Lash & Brow guides are in her guides',r.guides.length===8,r.guides.join(','));
  check('no [placeholder] left in any form or guide',!r.brackets.length,r.brackets.join(','));
  check('no card-on-file question',!r.card.length,r.card.join(','));
  await p.evaluate(()=>{_fgTab='forms';nav('forms');});await p.waitForTimeout(500);
  const fs=await p.evaluate(()=>{const t=document.body.innerText;return {lb:t.includes('The Lash & Brow Collection'),ec:t.includes('The Esthetician Collection'),ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
  check('the Forms screen shows "The Lash & Brow Collection" and not the Esthetician one',fs.lb&&!fs.ec&&fs.ov===0,JSON.stringify(fs));
  // every form previews in Luxe, with her business name filled in and ticks on contraindications
  const pv=[];
  for(const id of await p.evaluate(()=>Object.keys(LB_FORMS))){
    await p.evaluate(id=>nav('form-preview',id),id);await p.waitForTimeout(250);
    pv.push(await p.evaluate(id=>{const s=document.querySelector('.scf');const t=document.body.innerText;
      const ci=(LB_FORMS[id].qs.filter(q=>q.type==='Contraindications').reduce((n,q)=>n+q.items.length,0));
      return {id,style:s&&s.getAttribute('data-style'),token:/\{(business|phone|email)[^}]*\}/.test(t),ticks:document.querySelectorAll('input.ci-tick').length,ci,ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};},id));
  }
  const bad=pv.filter(x=>x.style!=='luxe'||x.token||x.ticks!==x.ci||x.ov>0);
  check('every Lash & Brow form previews in Luxe, tokens filled, a tick box per contraindication, no sideways scroll',!bad.length,JSON.stringify(bad));
  const biz=await p.evaluate(()=>{nav('form-preview','lb-policy');return new Promise(r=>setTimeout(()=>r(document.body.innerText.includes('Lux Lash Lounge')),250));});
  check('her business name fills the {business} spots',biz);
  // nothing stored unedited
  await p.evaluate(()=>persistForms());await p.waitForTimeout(300);
  const st=await p.evaluate(()=>{const d=JSON.parse(_lsGet('sc_forms')||'{}');return Object.keys(d.tmpls||{}).filter(k=>/^lb-/.test(k));});
  check('unedited Lash & Brow forms are not stored on her account',!st.length,st.join(','));
  // Library: only the Lash & Brow docs
  await p.evaluate(()=>{_fgTab='forms';nav('forms');});await p.waitForTimeout(300);
  await p.evaluate(()=>switchFgTab('library'));await p.waitForTimeout(300);
  const lib=await p.evaluate(()=>{const c=document.getElementById('fg-library-content');return {cards:c.querySelectorAll('.pl-card').length,colls:[...c.querySelectorAll('.pl-coll')].map(x=>x.getAttribute('data-coll')),all:[...c.querySelectorAll('.pl-all')].map(x=>x.textContent.trim()),chip:(c.querySelector('.pl-style[aria-pressed="true"]')||{}).textContent};});
  check('her Library lists the 34 Lash & Brow documents only, Luxe picked',lib.cards===34&&lib.colls.join()==='lb'&&lib.chip==='Luxe',JSON.stringify(lib));
  check('"Get all 38 pages as one PDF"',lib.all.length===1&&/all 38 pages/.test(lib.all[0]),lib.all.join('|'));
  await p.evaluate(()=>_openPracticeDoc('lb-contra-chart'));
  await p.waitForFunction(()=>document.querySelectorAll('#pl-pages canvas.pl-page').length>0,null,{timeout:20000}).catch(()=>{});
  const d=await p.evaluate(()=>({pages:document.querySelectorAll('#pl-pages canvas.pl-page').length,url:document.getElementById('pl-entry').getAttribute('data-url'),title:document.querySelector('#pl-entry [role=dialog]').getAttribute('aria-label')}));
  check('a Lash & Brow document opens from its own Luxe file',d.pages===1&&/lb-a5025eda48748f3494bcacd7\/luxe\/contra-chart\.pdf$/.test(d.url)&&d.title==='Contraindication chart',JSON.stringify(d));
  await p.evaluate(()=>{const x=document.querySelector('#pl-entry button[aria-label="Close"]');x&&x.click();});
  const pop=p.context().waitForEvent('page',{timeout:3000}).catch(()=>null);
  await p.evaluate(()=>_downloadCollectionPdf('luxe','lb'));await p.waitForTimeout(500);await pop;
  check('the whole-PDF button asks for the Lash & Brow file',pdfCalls.some(u=>/collection-pdf\?collection=lb$/.test(u)),pdfCalls.slice(-1)[0]);
  allErrs.push(...errs);await ctx.close();
}

// 2. A lash artist who already used an Esthetician Collection form keeps it
{
  const {ctx,p,errs}=await boot(['lash'],{sc_forms:JSON.stringify({tmpls:{'ec-tint':{name:'My tint consent',qs:[{id:'x',label:'Name',type:'Short text'}]}},guides:{},custom:[],emojis:{}})});
  const r=await p.evaluate(()=>({ec:_profFormDefs().filter(f=>/^ec-/.test(f.id)).length,lb:_profFormDefs().filter(f=>/^lb-/.test(f.id)).length,lib:_plCollections().map(c=>c.key).join(),
    lashOnly:resources.filter(g=>/^g-lb-/.test(g.id)).map(g=>g.id).sort().join()}));
  check('a lash artist who edited an Esthetician Collection form still has all 16 of them',r.ec===16&&r.lb===13,JSON.stringify(r));
  check('her Library shows both collections',r.lib==='ec,lb',r.lib);
  check('a lash-only artist gets the lash guides and the shared prep guide, not the brow ones',r.lashOnly==='g-lb-ext,g-lb-lift,g-lb-prep,g-lb-removal,g-lb-retention',r.lashOnly);
  allErrs.push(...errs);await ctx.close();
}

// 3. An esthetician: unchanged, no Lash & Brow
{
  const {ctx,p,errs}=await boot(['esty']);
  const r=await p.evaluate(()=>({ec:_profFormDefs().filter(f=>/^ec-/.test(f.id)).length,lb:_profFormDefs().filter(f=>/^lb-/.test(f.id)).length,lib:_plCollections().map(c=>c.key).join(),g:resources.filter(g=>/^g-lb-/.test(g.id)).length}));
  check('an esthetician sees the Esthetician Collection and not the Lash & Brow one',r.ec===16&&r.lb===0&&r.lib==='ec'&&r.g===0,JSON.stringify(r));
  allErrs.push(...errs);await ctx.close();
}

// 4. Luxe + her logo + her brand color, and her own style choice still wins
{
  const {ctx,p,errs}=await boot(['esty','lash'],{sc_bizinfo:JSON.stringify({name:'Glow Studio'}),sc_brand_colors:JSON.stringify({primary:'#1f4e79',logoDataUrl:LOGO})});
  await p.evaluate(()=>nav('form-preview','lb-intake'));await p.waitForTimeout(300);
  const a=await p.evaluate(()=>{const s=document.querySelector('.scf');const img=s.querySelector('.scf-logo img');return {style:s.getAttribute('data-style'),img:!!img&&/^data:image\/png/.test(img.getAttribute('src')),alt:img&&img.alt,acc:getComputedStyle(s).getPropertyValue('--scf-acc').trim()};});
  check('a form defaults to Luxe with her logo in the corner',a.style==='luxe'&&a.img&&a.alt==='Glow Studio',JSON.stringify(a));
  check('her brand color is on the accents',a.acc.toLowerCase()==='#1f4e79',a.acc);
  await p.evaluate(()=>{brandColors.primary='#f6d6e0';delete brandColors.logoDataUrl;nav('form-preview','lb-intake');});await p.waitForTimeout(300);
  const b2=await p.evaluate(()=>{const s=document.querySelector('.scf');return {acc:getComputedStyle(s).getPropertyValue('--scf-acc').trim(),logo:(s.querySelector('.scf-logo')||{}).textContent};});
  check('a pale brand color that would be hard to read is not used; no logo falls back to her name',b2.acc==='#8a6a2c'&&b2.logo==='Glow Studio',JSON.stringify(b2));
  await p.evaluate(()=>{_plSetStyle('blush');nav('form-preview','lb-intake');});await p.waitForTimeout(300);
  check('a style she picks still wins over the Luxe default',await p.evaluate(()=>document.querySelector('.scf').getAttribute('data-style')==='blush'&&bizInfo.formStyle==='blush'));
  const both=await p.evaluate(()=>{_fgTab='library';nav('forms');const c=document.getElementById('fg-library-content');return {cards:c.querySelectorAll('.pl-card').length,all:c.querySelectorAll('.pl-all').length,ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
  check('an esthetician who also does lashes sees both collections in the Library (47 + 34)',both.cards===81&&both.all===2&&both.ov===0,JSON.stringify(both));
  allErrs.push(...errs);await ctx.close();
}
check('no page errors',allErrs.length===0,allErrs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
