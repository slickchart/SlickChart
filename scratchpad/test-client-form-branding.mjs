// "Every form defaults to Luxe + the provider's branding + logo" (Ashley, 2026-10-17), CLIENT side:
// the client app draws the form in Luxe when the provider never picked a style, puts her logo in the
// corner (her studio name when there is none), and her brand color on the accents only if readable.
import { BASE, launch, clientRecord, mockApi } from './sweep2-client-lib.mjs';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const LOGO='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const pf={formId:'lb-patch',title:'Patch test consent & record',assignedAt:Date.now(),qs:[{id:'a',label:'Client name',type:'Short text',required:true},{id:'b',label:'Before your tint',type:'Contraindications',required:false,items:['Eye infection now','Past reaction to tint']}]};
async function run(extra){
  const b=await launch();const page=await b.newPage({viewport:{width:390,height:844}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await mockApi(page,{records:{TOK:clientRecord('c1','Jen Test',Object.assign({pendingForms:[pf]},extra))}});
  await page.goto(BASE+'?c=TOK',{waitUntil:'load'});await page.waitForTimeout(1500);
  await page.evaluate(()=>{_fillFormId='lb-patch';nav('fill-form');});await page.waitForTimeout(400);
  const r=await page.evaluate(()=>{const s=document.querySelector('.scf');const img=s&&s.querySelector('.scf-logo img');return {style:s&&s.getAttribute('data-style'),img:!!img&&/^data:image\/png/.test(img.getAttribute('src')),logo:(s.querySelector('.scf-logo')||{}).textContent,acc:s&&getComputedStyle(s).getPropertyValue('--scf-acc').trim().toLowerCase(),ticks:document.querySelectorAll('.scf input[type=checkbox]').length,ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
  await b.close();return {r,errs};
}
let x=await run({brand:{primary:'#1f4e79',logoDataUrl:LOGO}});
check('no style picked: the client sees Luxe',x.r.style==='luxe',JSON.stringify(x.r));
check('with her logo in the corner',x.r.img,JSON.stringify(x.r));
check('and her brand color on the accents',x.r.acc==='#1f4e79',x.r.acc);
check('contraindications are still tick boxes, no sideways scroll',x.r.ticks===2&&x.r.ov===0&&!x.errs.length,x.errs.join('|'));
x=await run({formStyle:'blush',brand:{primary:'#ffe4ec'}});
check('a style she picked wins, a pale brand color is not used, no logo shows her studio name',x.r.style==='blush'&&x.r.acc==='#94524a'&&!x.r.img&&x.r.logo==='Studio c1',JSON.stringify(x.r));
const f=res.filter(v=>!v).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
