import pw from '/opt/node22/lib/node_modules/playwright/index.js';
export async function boot(){
  const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'});
  const ctx=await b.newContext(); const p=await ctx.newPage();
  await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('/api/'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:false,ok:true,data:{}})}); return r.fulfill({status:404,body:''});});
  await p.goto('file:///home/user/SlickChart/slickchart-vercel/slickchart.html',{waitUntil:'domcontentloaded'}).catch(e=>console.log('goto',e.message));
  await p.waitForTimeout(3000);
  return {b,p};
}
