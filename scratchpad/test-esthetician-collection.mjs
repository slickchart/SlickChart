// THE ESTHETICIAN COLLECTION (2026-10-16): Ashley's 16 forms, 13 guides and practice library built
// into the provider app. Checks that they ADD to what was there (stock forms and guides unchanged),
// show for an esthetician, reach a client as a snapshot, never get stored on an account unedited,
// and that the Library tab and PDF download work.
//   node scratchpad/test-esthetician-collection.mjs [file.html]   (served from slickchart-vercel on :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844}});
const pushed={};
await ctx.route('**/api/**',async r=>{
  const u=r.request().url();
  if(u.includes('/api/cloud-status'))return r.fulfill({status:200,contentType:'application/json',body:'{"enabled":true}'});
  if(u.includes('/api/collection-pdf'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,files:[{style:'neutral',label:'Neutral',url:'/assets/x/neutral.pdf'}]})});
  if(u.includes('/api/store')&&r.request().method()!=='GET'){try{const x=JSON.parse(r.request().postData()||'{}');Object.assign(pushed,x.items||{});}catch(e){}}
  return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'});
});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8899/'+FILE);
await p.evaluate(()=>{localStorage.setItem('sc_token','eyJ1IjoicDEifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_professions',JSON.stringify(['esty']));});
await p.reload();await p.waitForTimeout(3500);

const r1=await p.evaluate(()=>({
  stock:['intake','peel','micro','derma','facial','photo'].every(k=>formTmpls[k]&&formTmpls[k].qs.length),
  ec:Object.keys(formTmpls).filter(k=>/^ec-/.test(k)).length,
  ecIntakeNoGeneric:!formTmpls['ec-intake'].qs.some(q=>q.id==='pr-taken'),
  stockIntakeHasGeneric:formTmpls['intake'].qs.some(q=>q.id==='pr-taken'),
  defs:_profFormDefs().filter(f=>/^ec-/.test(f.id)).length,
  guides:resources.filter(g=>/^g-esty-ec-/.test(g.id)).length,
  oldGuides:resources.filter(g=>/^g-esty-(peel|micro|derma|spf|prep)$/.test(g.id)).length,
  lib:EC_LIBRARY.length,
}));
check('the stock forms are all still there, unchanged in kind',r1.stock);
check('16 collection forms are added',r1.ec===16,r1.ec);
check('the collection intake keeps its own photo questions, no generic ones bolted on',r1.ecIntakeNoGeneric);
check('the stock intake still gets its usual photo release',r1.stockIntakeHasGeneric);
check('an esthetician sees all 16 in her forms list',r1.defs===16,r1.defs);
check('13 collection guides show in her guides',r1.guides===13,r1.guides);
check('her old stock guides are still there',r1.oldGuides===5,r1.oldGuides);

// Forms screen draws the section
await p.evaluate(()=>{_fgTab='forms';nav('forms');});await p.waitForTimeout(500);
const r2=await p.evaluate(()=>{const t=document.body.innerText;return {sec:t.includes('The Esthetician Collection'),peel:t.includes('Chemical peel consent')};});
check('the Forms screen shows "The Esthetician Collection" section',r2.sec&&r2.peel);
// Library tab
await p.evaluate(()=>switchFgTab('library'));await p.waitForTimeout(300);
const r3=await p.evaluate(()=>{const c=document.getElementById('fg-library-content');return {shown:!!c&&c.style.display==='',cards:c?c.querySelectorAll('.pl-card').length:0,ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
check('the Library tab lists the 17 practice entries',r3.shown&&r3.cards===17,JSON.stringify(r3));
await p.evaluate(()=>_openPracticeEntry('pl-contra'));await p.waitForTimeout(200);
const r4=await p.evaluate(()=>{const o=document.getElementById('pl-entry');return {open:!!o,tables:o?o.querySelectorAll('table').length:0};});
check('a library entry opens, with its tables',r4.open&&r4.tables>=1,JSON.stringify(r4));
await p.evaluate(()=>{const o=document.getElementById('pl-entry');if(o)o.remove();});
await p.evaluate(()=>_downloadCollectionPdf('neutral'));await p.waitForTimeout(500);
const r5=await p.evaluate(()=>document.getElementById('pl-pdf-status').textContent);
check('the PDF button asks the server and opens the file',/opened/.test(r5),r5);

// Send a collection form to a client: the client's copy is a snapshot with every question
const r6=await p.evaluate(()=>{
  CL['cT']={id:'cT',name:'Test Client',pendingForms:[],_token:'tok'};
  _assignPending(CL['cT'].pendingForms,'formId','ec-derma');
  const d=_assembleClientData('cT');const pf=(d.pendingForms||[]).find(x=>x.formId==='ec-derma');
  return {has:!!pf,qs:pf?pf.qs.length:0,want:formTmpls['ec-derma'].qs.length,sig:pf?pf.qs.filter(q=>q.type==='Signature').length:0,title:pf&&pf.title};
});
check('a sent collection form reaches the client with every question',r6.has&&r6.qs===r6.want&&r6.sig===1,JSON.stringify(r6));

// Nothing about the collection is stored on her account unless she edits it
await p.evaluate(()=>{try{persistForms();}catch(e){}});await p.waitForTimeout(800);
const stored=await p.evaluate(()=>_lsGet('sc_forms')||'');
check('saving her forms does not copy the 16 collection forms into her account',!/ec-intake|ec-derma/.test(stored),stored.length+' chars');
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
