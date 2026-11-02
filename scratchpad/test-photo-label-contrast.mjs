// Labels drawn on a dark photo overlay (Before/After badges, angle tags) must stay readable in
// LIGHT mode. They used theme ink colours that are dark in light mode: "Before" #1a1a1a and
// "After" #166456 on rgba(0,0,0,.65), angle tags #54645e on rgba(0,0,0,.6). Found 2026-11-02.
//   node scratchpad/test-photo-label-contrast.mjs   (run from the repo root; serves slickchart-vercel/)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const {chromium}=pw;
const root=path.resolve('slickchart-vercel');
const FILE=process.env.FILE||'slickchart-provider-demo.html';
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':'application/octet-stream'});r.end(d);});}).listen(0);
const port=srv.address().port;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:390,height:900}});
await p.addInitScript(()=>{try{localStorage.setItem('sc_provider_theme','light')}catch(e){}});
await p.goto(`http://localhost:${port}/${FILE}`,{waitUntil:'load'});
await p.waitForTimeout(3500);
await p.click('#ni-clients'); await p.waitForTimeout(1000);
await p.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.offsetParent&&/^Maya/.test((e.innerText||'').trim())&&e.children.length<6);(el.closest('[onclick]')||el).click();});
await p.waitForTimeout(1500);
const clickTxt=async re=>p.evaluate(s=>{const r=new RegExp(s);const el=[...document.querySelectorAll('button,[onclick]')].find(e=>e.offsetParent&&r.test((e.innerText||'').trim()));el&&el.click();return !!el;},re);
await clickTxt('^Photos'); await p.waitForTimeout(1000);
await clickTxt('Open their photos'); await p.waitForTimeout(1500);
const res=await p.evaluate(()=>{
  const rgba=s=>{const m=s.match(/[\d.]+/g).map(Number);return {r:m[0],g:m[1],b:m[2],a:m.length>3?m[3]:1};};
  const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b)};
  const out=[];
  for(const e of document.querySelectorAll('*')){
    if(!e.offsetParent||e.children.length)continue;
    const t=(e.textContent||'').trim(); if(!t||t.length>20)continue;
    // nearest ancestor with a translucent black background = a photo overlay label
    let n=e,ov=null; while(n&&n!==document.body){const bg=rgba(getComputedStyle(n).backgroundColor);if(bg.r===0&&bg.g===0&&bg.b===0&&bg.a>=.4){ov=bg;break;}n=n.parentElement;}
    if(!ov)continue;
    // worst case underneath: white (an empty light placeholder), composited with the overlay
    const under=255*(1-ov.a); const back={r:under,g:under,b:under};
    const fg=rgba(getComputedStyle(e).color);
    const L1=lum(fg),L2=lum(back); const cr=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
    out.push({t,cr:+cr.toFixed(2)});
  }
  return out;
});
srv.close(); await b.close();
let fail=0;
for(const r of res){const ok=r.cr>=4.5; if(!ok)fail++; console.log(`${ok?'PASS':'FAIL'} "${r.t}" contrast ${r.cr}:1`);}
if(!res.length){console.log('FAIL no overlay labels found');fail++;}
console.log(fail?`${fail} FAIL`:`ALL PASS (${res.length} labels)`); process.exit(fail?1:0);
