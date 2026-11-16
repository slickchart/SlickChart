// Desktop/tablet apps fill their window (2026-11-16). A desktop BROWSER keeps the 390px phone frame;
// the Mac/Windows app (window.slickchartDesktop) and the store app (Capacitor native) fill the window,
// and the desktop app does not show the "download the app" banner. Serves slickchart-vercel on :8899.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const engine = process.env.PW_ENGINE==='webkit' ? pw.webkit : pw.chromium;
const b = await engine.launch(process.env.PW_ENGINE==='webkit'?{}:{executablePath:'/opt/pw-browsers/chromium'});
const URL='http://localhost:8899/slickchart-provider-demo.html';
let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++;};
async function run(name, vp, init, touch=false){
  const c=await b.newContext({viewport:vp,hasTouch:touch});
  if(init) await c.addInitScript(init);
  const p=await c.newPage(); await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(3500);
  const r=await p.evaluate(()=>({w:document.querySelector('.shell').getBoundingClientRect().width, vw:innerWidth,
    full:document.documentElement.classList.contains('sc-app-full'), banner:!!document.getElementById('getapp-banner')}));
  // a sheet opens across the whole window too
  await c.close(); return r;
}
let r=await run('browser',{width:1180,height:820});
ok(r.w<=392 && !r.full, `desktop browser keeps the phone frame (shell ${r.w}px)`);
r=await run('electron',{width:1180,height:820},()=>{window.slickchartDesktop={isDesktop:true,platform:'darwin',retry(){}};});
ok(Math.abs(r.w-r.vw)<2 && r.full, `desktop app fills the window (shell ${r.w}/${r.vw})`);
ok(!r.banner, 'desktop app shows no "download the app" banner');
r=await run('ipad-on-mac',{width:1366,height:900},()=>{window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios'};});
ok(Math.abs(r.w-r.vw)<2, `store app with a mouse (iPad app on a Mac) fills the window (shell ${r.w}/${r.vw})`);
r=await run('ipad',{width:1032,height:1376},null,true);
ok(Math.abs(r.w-r.vw)<2, `iPad-size touch screen fills the screen (shell ${r.w}/${r.vw})`);
r=await run('phone',{width:390,height:844},()=>{window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios'};},true);
ok(Math.abs(r.w-r.vw)<2, `phone app unchanged (shell ${r.w}/${r.vw})`);
await b.close(); console.log(fail?`${fail} FAILED`:'ALL PASS'); process.exit(fail?1:0);
