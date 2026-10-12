// The "Preferred service" chips must be HER catalog and nothing else, and the service the request
// carries must be one of them. Ashley, 2026-10-12: the chips did not match her catalog, and her own
// test requests arrived labelled "New client" - the client's last appointment name, not a service.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

async function run(label, services){
  const p=await b.newPage({viewport:{width:390,height:844}});
  await p.route('**/api/client-data*', async r=>{
    await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,client:{
      id:'c1', name:'Ashley Watson', email:'a@example.com',
      data:{
        providerName:'Botanical Aesthetics', providerFirst:'Ashley',
        treatment:'New client',                    // free text off the last appointment, NOT a service
        services,
        availability:{mon:{open:true,start:'09:00',end:'17:00'},tue:{open:true,start:'09:00',end:'17:00'},
                      wed:{open:true,start:'09:00',end:'17:00'},thu:{open:true,start:'09:00',end:'17:00'},
                      fri:{open:true,start:'09:00',end:'17:00'},sat:{open:false},sun:{open:false}}
      }
    }})});
  });
  await p.route('**/api/client-availability*', async r=>{
    await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,slots:['10:00 AM','2:00 PM'],openDays:['mon','tue','wed','thu','fri']})});
  });
  await p.goto('http://localhost:8899/slickchart-client.html?c=TESTTOKEN',{waitUntil:'load'});
  await p.waitForTimeout(2500);
  const out=await p.evaluate(()=>{
    nav('rebook');
    return new Promise(res=>setTimeout(()=>{
      // Scope to the service section: the date calendar also uses aria-pressed buttons.
      const h=[...document.querySelectorAll('h2')].find(x=>x.textContent.trim()==='Preferred service');
      const sec=h?h.closest('.sh').nextElementSibling:null;
      const btns=sec?[...sec.querySelectorAll('button[aria-pressed]')].map(x=>x.textContent.trim()):[];
      const on=sec?sec.querySelector('button[aria-pressed="true"]'):null;
      res({chips:btns, selected:on?on.textContent.trim():'', body:(document.body.innerText||'')});
    },600));
  });
  await p.close();
  console.log('\n=== '+label+' ===');
  console.log('  chips    :', JSON.stringify(out.chips));
  console.log('  selected :', JSON.stringify(out.selected));
  return out;
}

let bad=0;
const CAT=['Signature Facial','Dermaplane','Hydrafacial'];
const a=await run('Provider WITH a catalog', CAT);
if(JSON.stringify(a.chips)!==JSON.stringify(CAT)){console.log('  *** chips are not exactly her catalog');bad++;}
if(!CAT.includes(a.selected)){console.log('  *** selected service is not in her catalog:',a.selected);bad++;}
if(a.selected==='New client'){console.log('  *** still defaulting to the last appointment name');bad++;}
console.log('  chips are exactly her catalog    :', JSON.stringify(a.chips)===JSON.stringify(CAT)?'YES':'*** NO ***');
console.log('  request carries a real service   :', CAT.includes(a.selected)?'YES':'*** NO ***');

const c=await run('Provider with NO services listed', []);
if(c.chips.length){console.log('  *** invented chips for a provider with no catalog:',c.chips);bad++;}
if(c.selected){console.log('  *** invented a service name:',c.selected);bad++;}
const honest=/hasn't listed her services here yet/.test(c.body);
console.log('  no invented chips                :', c.chips.length?'*** NO ***':'YES');
console.log('  says so honestly instead         :', honest?'YES':'*** NO ***');
if(!honest)bad++;

console.log('\n'+(bad?('FAILURES: '+bad):'the picker shows her catalog and nothing else'));
await b.close();
