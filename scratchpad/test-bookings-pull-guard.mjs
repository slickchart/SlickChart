import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

async function run(label, queueLocalWrite){
  const p=await b.newPage({viewport:{width:390,height:844}});
  // The account holds BOTH: a request this device already declined, and a NEW one it has never seen.
  await p.route('**/api/store*', async route=>{
    if(route.request().method()!=='GET'){ await route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}); return; }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{
      sc_bookings: JSON.stringify([
        {id:'bk_old', client:'Callie', date:'2026-11-05', time:'10:00 AM', status:'pending'},
        {id:'bk_new', client:'Ashley Test', date:'2026-10-20', time:'2:00 PM', status:'pending'}
      ])
    }})});
  });
  await p.goto('http://localhost:8899/slickchart-provider-demo.html',{waitUntil:'load'});
  await p.waitForTimeout(3000);
  const r=await p.evaluate(async (queue)=>{
    // This device declined bk_old locally and has not pushed it yet.
    localStorage.setItem('sc_bookings', JSON.stringify([
      {id:'bk_old', client:'Callie', date:'2026-11-05', time:'10:00 AM', status:'declined', decidedAt:Date.now()}
    ]));
    Cloud.token='TESTTOKEN';
    Cloud._booting=false;
    Cloud._queue={}; Cloud._bootQueued={};
    if(queue) Cloud._queue['sc_bookings']=localStorage.getItem('sc_bookings');  // a real pending write
    await Cloud.pull();
    let after=[]; try{after=JSON.parse(localStorage.getItem('sc_bookings')||'[]');}catch(e){}
    return after.map(x=>x.id+':'+x.status);
  }, queueLocalWrite);
  const gotNew = r.some(x=>x.indexOf('bk_new')===0);
  const keptDecision = r.some(x=>x==='bk_old:declined');
  console.log('\n'+label);
  console.log('  after pull:', JSON.stringify(r));
  console.log('  received the new request from the account :', gotNew?'YES':'*** NO ***');
  console.log('  kept this device own decision             :', keptDecision?'YES':'*** NO ***');
  await p.close();
  return gotNew && keptDecision;
}

const a = await run('No pending local write (this case always worked)', false);
const c = await run('WITH a pending local write (the reported bug)', true);
console.log('\n'+((a&&c)?'both pass':'*** FAILURE ***'));
await b.close();
