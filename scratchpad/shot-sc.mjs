import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;
const OUT=process.argv[2];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:760,height:1100},deviceScaleFactor:3});
await p.goto('http://localhost:8899/slickchart-provider-demo.html',{waitUntil:'load'});
await p.waitForTimeout(4000);
await p.click('#ni-clients'); await p.waitForTimeout(1200);
await p.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.offsetParent&&/^Maya/.test((e.innerText||'').trim())&&e.children.length<6);(el.closest('[onclick]')||el).click();});
await p.waitForTimeout(2200);
await p.evaluate(()=>{
  document.querySelectorAll('body *').forEach(e=>{
    const t=(e.innerText||'').trim();
    if(e.children.length<=4 && /Live demo/.test(t) && t.length<200) e.style.display='none';
  });
  const g=document.getElementById('getapp-banner'); if(g) g.style.display='none';
});
await p.waitForTimeout(400);
const m = await p.evaluate(()=>{
  const a=document.getElementById('S').getBoundingClientRect();
  return {appL:a.left, appW:a.width};
});
// Fixed 4:3 window over the part of the chart the post is about: the allergy banner, the three
// recorded facts, and the five tabs. Deterministic numbers beat hunting for elements whose
// bounding boxes include half the screen.
const w = 504, h = 378, y = 372;
const x = Math.round(m.appL - (w - m.appW) / 2);
console.log('clip', JSON.stringify({x,y,w,h}), 'app fills', ((m.appW/w)*100).toFixed(0)+'%');
await p.screenshot({path:OUT+'/slickchart-gbp.png', clip:{x, y, width:w, height:h}});
await b.close();
