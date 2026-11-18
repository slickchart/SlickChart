import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs'; import path from 'path';
const ROOT='/home/user/SlickChart/slickchart-vercel';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function makeServer(seedKv){return {kv:Object.assign({sc_hide_sample:'1',sc_onboarded:'1'},seedKv||{}),rows:{},puts:[],gets:0,getDelay:0,snapAtGet:null};}
export async function launch(){return pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'});}
export async function device(browser,srv,name,localSeed,opts={}){
  const ctx=opts.ctx||await browser.newContext();
  const p=await ctx.newPage();p._errs=[];p.on('pageerror',e=>p._errs.push(e.message));
  if(!opts.ctx)await p.addInitScript((seed)=>{if(localStorage.getItem('__seeded'))return;localStorage.setItem('__seeded','1');
    localStorage.setItem('sc_token','TESTTOKEN');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_hide_sample','1');localStorage.setItem('sc_cloud_seeded','1');
    Object.entries(seed||{}).forEach(([k,v])=>localStorage.setItem(k,v));},localSeed||{});
  await p.route('**/*',async r=>{
    const u=new URL(r.request().url()),m=r.request().method();
    const ok=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
    if(u.pathname.startsWith('/api/')){
      if(u.pathname.includes('cloud-status'))return ok({enabled:true});
      if(u.pathname==='/api/store'){
        if(m==='GET'){srv.gets++;const snap=JSON.stringify(srv.kv);if(srv.getDelay)await sleep(srv.getDelay);return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:JSON.parse(snap)})});}
        let body={};try{body=JSON.parse(r.request().postData()||'{}');}catch(e){}
        if(body.rescue)return ok({ok:true});
        const items=body.items||{};
        Object.entries(items).forEach(([k,v])=>{srv.kv[k]=v==null?null:String(v);});
        srv.puts.push({dev:name,t:Date.now(),keys:Object.keys(items),sizes:Object.fromEntries(Object.entries(items).map(([k,v])=>[k,String(v).length])),items});
        return ok({ok:true,saved:Object.keys(items).length});
      }
      if(u.pathname.startsWith('/api/clients')){
        if(m==='GET')return ok({ok:true,clients:[],events:srv.events||[]});
        return ok({ok:true,saved:0,clients:[],failed:[]});
      }
      return ok({ok:true,data:{},clients:[],events:srv.events||[],customers:[],bookings:[]});
    }
    let f=path.join(ROOT,decodeURIComponent(u.pathname));
    if(fs.existsSync(f)&&fs.statSync(f).isFile()){
      const ext=path.extname(f);const ct={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'}[ext]||'application/octet-stream';
      return r.fulfill({status:200,contentType:ct,body:fs.readFileSync(f)});
    }
    return r.fulfill({status:404,body:''});
  });
  await p.goto('http://app.test/slickchart.html');
  await p.waitForFunction(()=>typeof Cloud!=='undefined'&&Cloud._pulledOnce&&!Cloud._booting,null,{timeout:40000}).catch(()=>{});
  await sleep(1500);
  return p;
}
export async function flush(p){await p.evaluate(async()=>{try{_pushFlushNow();}catch(e){}try{clearTimeout(Cloud._timer);await Cloud._flush(0);}catch(e){}});await sleep(700);}
export async function resync(p){await p.evaluate(async()=>{await Cloud.pull();try{_reloadAll();}catch(e){}try{_afterAccountRead();}catch(e){}});await sleep(500);await flush(p);}
