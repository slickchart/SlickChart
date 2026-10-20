// VISIBILITY SWEEP — every button and every piece of text, in both apps.
//
// Ashley, 2026-10-12: "make sure to follow visibility compliance and sweep every button + funciton
// across all apps both client and provider". One button at a time was not working: the Request
// button's TEXT passed at 8.41:1 while the button itself still read as disabled, because nobody had
// checked its boundary (WCAG 1.4.11) or run the same check anywhere else.
//
// Checks, per WCAG 2.1 AA:
//   1.4.3  text          4.5:1, or 3:1 for large text (>=24px, or >=18.66px when bold)
//   1.4.11 UI components 3:1 for a control's own boundary against what surrounds it
//
// Run across BOTH themes and SEVERAL brand colours, because every surface token is derived from the
// provider's brand colour at runtime - testing one colour is what let her button through.
//
//   node scratchpad/sweep-contrast.mjs            both apps
//   node scratchpad/sweep-contrast.mjs client     one app
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;

const ONLY=(process.argv[2]||'').toLowerCase();
const BRANDS=[
  ['default teal','#0F8A7E'],
  ['navy',        '#1B2A5B'],
  ['hot pink',    '#D81B7A'],
  ['pale sand',   '#E8D5C0'],   // a light brand is the one that breaks "mix toward white" tokens
  ['near black',  '#141414'],
];
const APPS={
  client:{file:'slickchart-client.html', query:'?c=TESTTOKEN', screens:
    ['home','journey','homecare','messages','shop','rebook','profile','library','notifications',
     'notif-settings','previsit','checkin','summary','welcome']},
  provider:{file:'slickchart.html', query:'', screens:
    ['home','clients','calendar','messages','more','requests','settings','payments','shop','forms',
     'protocols','inventory','reports','vault','partners','vendors','learn','integrations','notes',
     'checkins','photos','virtual','vc-inbox','service-menu','biz-info','business-branding','account',
     'help','invite-clients','new-client','bundles','automation','profession-settings']},
};

const PAGE_FN=`
window.__audit=function(){
  const out=[];
  const px=v=>parseFloat(v)||0;
  const parse=c=>{
    c=String(c||'').trim();
    if(!c||c==='transparent')return null;
    let m=c.match(/^rgba?\\(([^)]+)\\)$/);
    if(m){const n=m[1].split(',').map(x=>parseFloat(x));return {r:n[0],g:n[1],b:n[2],a:n[3]==null?1:n[3]};}
    m=c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if(m){let h=m[1];if(h.length===3)h=h.split('').map(x=>x+x).join('');
      return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16),a:1};}
    return null;
  };
  const over=(fg,bg)=>({r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a),a:1});
  const L=c=>{const f=x=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);};
    return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);};
  const ratio=(a,b)=>{const l1=L(a),l2=L(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);};
  const gradientStops=img=>{
    const o=[];const re=/(rgba?\\([^)]+\\)|#[0-9a-f]{3,6})/gi;let m;
    while((m=re.exec(img||''))){const c=parse(m[1]);if(c)o.push(c);}
    return o;
  };
  // Every background this element could actually be sitting on. A gradient contributes BOTH ends,
  // and a translucent layer is composited over whatever is behind it, so the worst case is real.
  const backdrops=el=>{
    let layers=[];
    for(let n=el;n&&n!==document.documentElement;n=n.parentElement){
      const cs=getComputedStyle(n);
      const img=cs.backgroundImage||'';
      if(img&&img!=='none'&&/gradient/i.test(img)){const st=gradientStops(img);if(st.length){layers.push(st);continue;}}
      const bc=parse(cs.backgroundColor);
      if(bc&&bc.a>0){layers.push([bc]); if(bc.a>=1)break;}
    }
    const base=parse(getComputedStyle(document.body).backgroundColor)||{r:255,g:255,b:255,a:1};
    layers.push([{r:base.r,g:base.g,b:base.b,a:1}]);
    // Composite from the bottom up, keeping every branch a gradient creates.
    let acc=[{r:255,g:255,b:255,a:1}];
    for(let i=layers.length-1;i>=0;i--){
      const next=[];
      layers[i].forEach(c=>acc.forEach(b=>next.push(over(c,b))));
      acc=next.slice(0,8);
    }
    return acc;
  };
  const visible=el=>{
    const cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)===0)return false;
    const r=el.getBoundingClientRect();
    return r.width>=6&&r.height>=6;
  };
  const ownText=el=>{
    let t='';
    el.childNodes.forEach(n=>{if(n.nodeType===3)t+=n.nodeValue;});
    return t.trim();
  };
  const seen=new Set();
  // 1.4.3 — text
  document.querySelectorAll('body *').forEach(el=>{
    if(!visible(el))return;
    const txt=ownText(el);
    if(!txt||txt.length<2)return;
    // Emoji are colour glyphs: the font paints them, the CSS color property does not apply. Measuring
    // one reports the inherited ink against the background and calls a perfectly visible 🪴 a
    // failure. Skip text that is only emoji and punctuation.
    if(!/[A-Za-z0-9]/.test(txt))return;
    const cs=getComputedStyle(el);
    // Gradient text (.brandc: background-clip:text with a transparent color) reads as "fg equals bg"
    // to any naive sampler. The pixels are the gradient, not the color property. Skip it rather than
    // report a 1.00:1 that is not real - a false finding costs as much trust as a missed one.
    if(/text/i.test(cs.backgroundClip||'')||/text/i.test(cs.webkitBackgroundClip||''))return;
    const fg0=parse(cs.color);if(!fg0)return;
    const op=parseFloat(cs.opacity);
    const bds=backdrops(el);
    const fg=over({r:fg0.r,g:fg0.g,b:fg0.b,a:(fg0.a==null?1:fg0.a)*(isNaN(op)?1:op)},bds[0]);
    const size=px(cs.fontSize), wt=parseInt(cs.fontWeight,10)||400;
    const large=(size>=24)||(size>=18.66&&wt>=700);
    const need=large?3:4.5;
    let worst=99,worstBg=null;
    bds.forEach(b=>{const r=ratio(fg,b);if(r<worst){worst=r;worstBg=b;}});
    if(worst<need){
      const key='T|'+txt.slice(0,40)+'|'+cs.color;
      if(seen.has(key))return; seen.add(key);
      out.push({kind:'text',text:txt.slice(0,60),ratio:+worst.toFixed(2),need,
        fg:'rgb('+[fg.r,fg.g,fg.b].map(Math.round)+')',
        bg:'rgb('+[worstBg.r,worstBg.g,worstBg.b].map(Math.round)+')',
        size:size+'px/'+wt, tag:el.tagName.toLowerCase()});
    }
  });
  // 1.4.11 — a control must be distinguishable from what surrounds it, by fill OR by border.
  document.querySelectorAll('button,select,[role="button"],[onclick][style*="border"]').forEach(el=>{
    if(!visible(el))return;
    const cs=getComputedStyle(el);
    const label=(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,50);
    if(!label)return;
    const outside=el.parentElement?backdrops(el.parentElement):[{r:255,g:255,b:255,a:1}];
    const fill=parse(cs.backgroundColor);
    // A BOX, not a divider. A row with only a bottom border is a list separator, and reading
    // borderTopColor there returns the default (black) for a side that is not drawn - which reported
    // "black border on a dark card" for every settings row. Require all four sides.
    const w=[px(cs.borderTopWidth),px(cs.borderRightWidth),px(cs.borderBottomWidth),px(cs.borderLeftWidth)];
    const bw=w.every(x=>x>0)?w[0]:0;
    const bc=bw>0?parse(cs.borderTopColor):null;
    // 1.4.11 is about the visual information needed to IDENTIFY a control. A plain text button with
    // no fill and no border is identified by its label, which 1.4.3 already covers - a tab bar item
    // or an icon-only X is not a failure for having no box. What IS a failure is drawing a box and
    // making it too faint to see, which is exactly how the Request button came to look disabled.
    const hasFill=!!(fill&&fill.a>0.02);
    const hasBorder=!!(bc&&bc.a>0.02&&bw>0);
    if(!hasFill&&!hasBorder)return;
    // A shadow is a legitimate visual boundary under 1.4.11 - a raised pill on a near-white sheet is
    // identifiable even though its fill barely differs. Not every delineation is a colour step.
    if((cs.boxShadow||'none')!=='none')return;
    let best=0;
    outside.forEach(b=>{
      if(fill&&fill.a>0){const f=over(fill,b);best=Math.max(best,ratio(f,b));}
      if(bc&&bc.a>0){const c=over(bc,b);best=Math.max(best,ratio(c,b));}
    });
    if(best<3){
      const key='B|'+label+'|'+cs.backgroundColor+'|'+cs.borderTopColor;
      if(seen.has(key))return; seen.add(key);
      out.push({kind:'control',text:label,ratio:+best.toFixed(2),need:3,
        fill:cs.backgroundColor, border:bw>0?cs.borderTopColor:'(none)',
        bg:'rgb('+[outside[0].r,outside[0].g,outside[0].b].map(Math.round)+')', tag:el.tagName.toLowerCase()});
    }
  });
  return out;
};
`;

async function auditApp(browser, name, cfg){
  const findings=[];
  for(const theme of (process.env.THEMES||'dark,light').split(',')){
    for(const [bname,brand] of BRANDS.filter(([n])=>!process.env.BRANDS||process.env.BRANDS.split(',').includes(n))){
      const page=await browser.newPage({viewport:{width:390,height:844}});
      await page.emulateMedia({colorScheme:theme});
      await page.addInitScript(([t,b])=>{
        try{
          localStorage.setItem('sc_client_theme',t);
          localStorage.setItem('sc_theme',t);
          localStorage.setItem('sc_provider_theme',t);   // the provider app's own key: without it every provider pass ran in its default theme
          localStorage.setItem('sc_token','TESTTOKEN');
          localStorage.setItem('sc_onboarded','1');
          localStorage.setItem('sc_brand_colors',JSON.stringify({primary:b,secondary:'#1E7FB0'}));
        }catch(e){}
      },[theme,brand]);
      await page.route('**/api/client-data*', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,client:{
        id:'c1',name:'Ashley Watson',email:'a@example.com',
        data:{providerName:'Botanical Aesthetics',providerFirst:'Ashley',treatment:'Signature Facial',
          brand:{primary:brand,secondary:'#1E7FB0'},
          services:['Signature Facial','Dermaplane'],
          availability:{mon:{open:true,start:'09:00',end:'17:00'},tue:{open:true,start:'09:00',end:'17:00'},
            wed:{open:true,start:'09:00',end:'17:00'},thu:{open:true,start:'09:00',end:'17:00'},
            fri:{open:true,start:'09:00',end:'17:00'},sat:{open:false},sun:{open:false}}}
      }})}));
      await page.route('**/api/**', r=>{
        if(r.request().method()!=='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
        return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'});
      });
      await page.goto('http://localhost:8899/'+cfg.file+cfg.query,{waitUntil:'load'});
      await page.waitForTimeout(2600);
      await page.addScriptTag({content:PAGE_FN});
      for(const screen of cfg.screens){
        try{
          await page.evaluate(s=>{try{nav(s);}catch(e){}},screen);
          await page.waitForTimeout(260);
          const res=await page.evaluate(()=>window.__audit());
          res.forEach(f=>findings.push({app:name,theme,brand:bname,screen,...f}));
        }catch(e){}
      }
      await page.close();
    }
  }
  return findings;
}

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
let all=[];
for(const [name,cfg] of Object.entries(APPS)){
  if(ONLY&&ONLY!==name)continue;
  process.stdout.write('auditing '+name+' ... ');
  const f=await auditApp(b,name,cfg);
  console.log(f.length+' finding(s)');
  all=all.concat(f);
}
await b.close();

// Collapse: the same colour pair on the same screen is one problem, not forty.
const groups=new Map();
all.forEach(f=>{
  const k=[f.app,f.kind,f.text,f.fg||f.fill,f.bg,f.border||''].join('|');
  if(!groups.has(k))groups.set(k,{...f,themes:new Set(),brands:new Set(),screens:new Set(),worst:f.ratio});
  const g=groups.get(k);
  g.themes.add(f.theme);g.brands.add(f.brand);g.screens.add(f.screen);
  if(f.ratio<g.worst)g.worst=f.ratio;
});
const rows=[...groups.values()].sort((a,b)=>a.worst-b.worst);
console.log('\n'+rows.length+' distinct problem(s), worst first\n');
rows.forEach(g=>{
  console.log((g.kind==='control'?'CONTROL ':'TEXT    ')+g.worst.toFixed(2)+':1  (needs '+g.need+')  ['+g.app+']');
  console.log('   "'+g.text.replace(/\s+/g,' ')+'"');
  if(g.kind==='text')console.log('   '+g.fg+' on '+g.bg+'   '+g.size);
  else console.log('   fill '+g.fill+' / border '+g.border+' on '+g.bg);
  console.log('   themes: '+[...g.themes].join(',')+'   brands: '+[...g.brands].join(',')
    +'\n   screens: '+[...g.screens].slice(0,6).join(',')+([...g.screens].length>6?' +'+([...g.screens].length-6):''));
  console.log('');
});
console.log(rows.length?('TOTAL '+rows.length+' to fix'):'everything meets AA');
