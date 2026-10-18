// Renders the landing-page tour reel slides (1080x1920) from the captured app screens.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const R=process.argv[2], SH=R+'/shots', OUT=R+'/slides';fs.mkdirSync(OUT,{recursive:true});
const logo='data:image/png;base64,'+fs.readFileSync('/home/user/SlickChart/slickchart-vercel/assets/slickchart-logo.png').toString('base64');
const img=f=>'data:image/png;base64,'+fs.readFileSync(SH+'/'+f+'.png').toString('base64');
const S=[
 {t:'title',h:'Run your whole business from your phone.',s:'For estheticians, lash &amp; brow artists, hair stylists and wellness pros.'},
 {f:'p1-home',h:'Your whole day, one screen',s:'Schedule, alerts, and who needs you, in one place.'},
 {f:'p2-clients',h:'Every client, organized',s:'Search anyone in a tap. See who needs you first.'},
 {f:'p3-client',h:'The full chart, one tap in',s:'Notes, photos, history, no more digging.'},
 {f:'p5-form',h:'Forms that look like you',s:'Luxe intake and consent forms with your logo.'},
 {f:'p9-library',h:'Ready-made forms &amp; aftercare',s:'Esthetics, lash, brow and hair, written by a licensed pro.'},
 {f:'p6-messages',h:'Messages that send themselves',s:'Birthdays and check-ins on autopilot.'},
 {f:'p7-calendar',h:'A calendar that has your back',s:'Booking requests and your day, side by side.'},
 {t:'mid',k:'And your clients?',h:'They get their own app.',s:'Beautiful, branded, and always with them.'},
 {f:'c1-home',h:'Their own branded app',s:'A home screen that feels like yours.'},
 {f:'c5-checkin',h:'Check-ins before every visit',s:'Know what changed before they arrive.'},
 {f:'c6-summary',h:'Summaries they keep',s:'Your notes, homecare and products, in their pocket.'},
 {f:'c2-journey',h:'They watch the progress',s:'Sessions, photos, and results, all tracked.'},
 {f:'c3-homecare',h:'Homecare that sticks',s:'Their routine, checked off day by day.'},
 {f:'c4-messages',h:'Always in touch',s:'Clients message you right from their app.'},
 {t:'outro'},
];
const css=`*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden}
body{background:radial-gradient(120% 60% at 50% 30%,#0f2a29 0%,#081716 55%,#050f10 100%);color:#fff;font-family:'DM Sans',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center}
.wm{font-weight:700;font-size:48px;letter-spacing:.5px;margin-top:6px}.c{background:linear-gradient(135deg,#1e8fce 0%,#19b8bf 34%,#2bc19a 66%,#7fe3a2 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.top{margin-top:38px;display:flex;flex-direction:column;align-items:center}.top img{width:58px}
h1{font-family:'DM Serif Display',Georgia,serif;font-weight:400;font-size:84px;line-height:1.06;text-align:center;margin:22px 60px 0;letter-spacing:-.5px}
.bar{width:92px;height:4px;border-radius:2px;background:#2bc7ac;margin:18px auto 0}
.sub{font-size:34px;color:#a9b8b5;text-align:center;margin:16px 80px 0;line-height:1.35}
.ph{margin-top:30px;width:596px;border-radius:66px;border:3px solid #1f5a52;background:#0a1719;padding:14px;box-shadow:0 60px 140px -40px rgba(0,0,0,.7),0 0 70px -30px #2bc7ac}
.ph div{border-radius:52px;overflow:hidden}.ph img{width:100%;display:block}
.center{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center}
.big img{width:250px}.big .wm{font-size:96px}.k{font-size:30px;letter-spacing:.32em;text-transform:uppercase;color:#2bc7ac;font-weight:600}
.tag{font-family:'DM Serif Display',Georgia,serif;font-size:46px;color:#c9d6d3;margin-top:30px}`;
const head=`<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet"><style>${css}</style>`;
const brand=`<div class="top"><img src="${logo}"><div class="wm">Slick<span class="c">Chart</span></div></div>`;
function html(x){
 if(x.t==='title')return `${head}<div class="center"><div class="big" style="display:flex;flex-direction:column;align-items:center"><img src="${logo}"></div><h1 style="font-size:104px">${x.h}</h1><div class="bar"></div><div class="sub">${x.s}</div></div>`;
 if(x.t==='mid')return `${head}<div class="center"><div class="k">${x.k}</div><h1 style="margin-top:28px;font-size:110px">${x.h}</h1><div class="bar"></div><div class="sub">${x.s}</div></div>`;
 if(x.t==='outro')return `${head}<div class="center big"><img src="${logo}"><div class="wm" style="margin-top:24px">Slick<span class="c">Chart</span></div><div class="tag">Protect and grow your business.</div><div class="sub" style="margin-top:34px;color:#2bc7ac;font-weight:600">slickchart.app</div></div>`;
 return `${head}${brand}<h1>${x.h}</h1><div class="bar"></div><div class="sub">${x.s}</div><div class="ph"><div><img src="${img(x.f)}"></div></div>`;
}
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1080,height:1920}});
for(let i=0;i<S.length;i++){await p.setContent(html(S[i]),{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(200);
  await p.screenshot({path:OUT+'/s'+String(i).padStart(2,'0')+'.png'});}
fs.writeFileSync(OUT+'/list.json',JSON.stringify(S.map(x=>x.t||'screen')));
await b.close();console.log('slides',S.length);
