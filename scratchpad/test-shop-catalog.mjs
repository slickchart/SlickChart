// The client-facing Shop must list only products the provider actually sells.
// Ashley, 2026-10-12: "lets remove all demo items from the shop area. it should only be listing
// people's real product catalog." Her client saw five app-seeded starters under "Everything Ashley
// offers", each reading "Ask Ashley about this at your next visit" because there was nothing to buy.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:390,height:844}});
await p.route('**/api/**', async r=>{
  if(r.request().method()!=='GET'){await r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});return;}
  await r.fulfill({status:200,contentType:'application/json',body:'{"data":{}}'});
});
await p.goto('http://localhost:8899/slickchart.html',{waitUntil:'load'});
await p.waitForTimeout(3500);

let r=await p.evaluate(()=>{
  // affiliateLinks is a top-level binding; mutate in place rather than reassigning (CLAUDE.md 2).
  affiliateLinks.length=0;
  affiliateLinks.push(
    {id:'wa_p1',name:'Ingrown Hair Serum',brand:'PFB Vanish',active:true},            // seeded, untouched
    {id:'wa_p3',name:'Soothing Aloe Gel',brand:'Studio',active:true},                 // seeded, untouched
    {id:'a1',   name:'Vitamin C Serum',brand:'Sample',active:true},                   // esty sample, untouched
    {id:'wa_p4',name:'Tend Skin Solution',brand:'Tend Skin',active:true,inOffice:true},// seeded but SHE STOCKS IT
    {id:'la_p3',name:'Lash Coating Sealant',brand:'Studio',active:true,url:'https://shop.example/lash'}, // seeded, she linked it
    {id:'own1', name:'Her Own Cleanser',brand:'Botanical',active:true},               // her own product
    {id:'own2', name:'Retired Product',brand:'Botanical',active:false}                // hers, switched off
  );
  const cat=_buildShopCatalog();
  // The cleaned catalog is SMALLER than the one on the account. _dropBootShrinks holds back a
  // shrink unless the missing ids are tombstoned, so if this shape ever grew an `id` the upload
  // would be blocked and this fix would silently stop working. _idsOf must keep reading it as
  // "not a record collection".
  const guardApplies=(typeof _idsOf==='function')?(_idsOf(JSON.stringify(cat))!==null):null;
  return {names:cat.map(x=>x.name), guardApplies};
});
await p.close(); await b.close();

const guardApplies=r.guardApplies; r=r.names;
console.log('client-facing catalog:', JSON.stringify(r,null,0));
const want=['Tend Skin Solution','Lash Coating Sealant','Her Own Cleanser'];
let bad=0;
['Ingrown Hair Serum','Soothing Aloe Gel','Vitamin C Serum'].forEach(n=>{
  if(r.includes(n)){console.log('  *** untouched starter still shown to clients:',n);bad++;}
});
want.forEach(n=>{ if(!r.includes(n)){console.log('  *** a real product was dropped:',n);bad++;} });
if(r.includes('Retired Product')){console.log('  *** an inactive product was shown');bad++;}
console.log('\n  app-seeded products she never set up :', r.some(n=>['Ingrown Hair Serum','Soothing Aloe Gel','Vitamin C Serum'].includes(n))?'*** STILL SHOWN ***':'gone');
console.log('  a starter she stocks / linked       :', (r.includes('Tend Skin Solution')&&r.includes('Lash Coating Sealant'))?'kept':'*** DROPPED ***');
console.log('  her own product                     :', r.includes('Her Own Cleanser')?'kept':'*** DROPPED ***');
console.log('  shrink guard would block the push    :', guardApplies?'*** YES - the cleaned catalog cannot upload ***':'no');
if(guardApplies)bad++;
console.log('\n'+(bad?('FAILURES: '+bad):'only real products reach a client, and the smaller catalog can upload'));
