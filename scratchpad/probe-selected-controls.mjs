// The five controls fixed on 2026-10-13 are only wrong when SELECTED, and the sweep's nav()
// pass only ever sees them unselected - which is why it reported 0 while they were still
// accent-on-accent. This drives each one into its selected state, at the brand that breaks
// them worst (near black on the dark theme), and measures the boundary WCAG 1.4.11 asks for.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;
const BRAND='#141414';
const FILE=process.argv[2]||'slickchart.html';   // pass a pre-fix copy to see it fail

const MATH=`
window.__m={};
__m.parse=c=>{c=String(c||'').trim();if(!c||c==='transparent')return null;
  let m=c.match(/^rgba?\\(([^)]+)\\)$/);
  if(m){const n=m[1].split(',').map(x=>parseFloat(x));return {r:n[0],g:n[1],b:n[2],a:n[3]==null?1:n[3]};}
  m=c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if(m){let h=m[1];if(h.length===3)h=h.split('').map(x=>x+x).join('');
    return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16),a:1};}
  return null;};
__m.over=(f,b)=>({r:f.r*f.a+b.r*(1-f.a),g:f.g*f.a+b.g*(1-f.a),b:f.b*f.a+b.b*(1-f.a),a:1});
__m.L=c=>{const f=x=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);};
  return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);};
__m.cr=(a,b)=>{const l1=__m.L(a),l2=__m.L(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);};
// The backdrop an element actually sits on: walk up compositing translucent layers.
__m.bg=el=>{let acc=null;const st=[];
  for(let n=el.parentElement;n&&n!==document.documentElement;n=n.parentElement){
    const c=__m.parse(getComputedStyle(n).backgroundColor);
    if(c&&c.a>0){st.push(c);if(c.a>=1)break;}
  }
  const base=__m.parse(getComputedStyle(document.body).backgroundColor)||{r:255,g:255,b:255,a:1};
  st.push({r:base.r,g:base.g,b:base.b,a:1});
  acc={r:255,g:255,b:255,a:1};
  for(let i=st.length-1;i>=0;i--)acc=__m.over(st[i],acc);
  return acc;};
// A control is distinguishable if EITHER its own border or its fill reaches 3:1 with the backdrop.
__m.control=el=>{
  const cs=getComputedStyle(el);const bgc=__m.bg(el);
  const fill=__m.parse(cs.backgroundColor);
  const bw=['Top','Right','Bottom','Left'].map(s=>parseFloat(cs['border'+s+'Width'])||0);
  const hasBorder=bw.every(w=>w>0);
  let best=0,why='';
  if(fill&&fill.a>0){const r=__m.cr(__m.over(fill,bgc),bgc);if(r>best){best=r;why='fill '+cs.backgroundColor;}}
  if(hasBorder){const b=__m.parse(cs.borderTopColor);
    if(b&&b.a>0){const r=__m.cr(__m.over(b,fill&&fill.a>0?__m.over(fill,bgc):bgc),bgc);
      if(r>best){best=r;why='border '+cs.borderTopColor;}}}
  return {ratio:+best.toFixed(2),why,bg:'rgb('+[bgc.r,bgc.g,bgc.b].map(Math.round)+')'};
};
`;

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await b.newPage({viewport:{width:390,height:844}});
await page.emulateMedia({colorScheme:'dark'});
await page.addInitScript(brand=>{try{
  localStorage.setItem('sc_theme','dark');
  localStorage.setItem('sc_onboarded','1');
  localStorage.setItem('sc_brand_colors',JSON.stringify({primary:brand,secondary:'#1E7FB0'}));
}catch(e){}},BRAND);
await page.route('**/api/**', r=>{
  if(r.request().method()!=='GET')return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
  return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{},"clients":[],"events":[]}'});
});
await page.goto('http://localhost:8899/'+FILE,{waitUntil:'load'});
await page.waitForTimeout(2600);
await page.addScriptTag({content:MATH});

const rows=await page.evaluate(()=>{
  const out=[];
  const look=(name,root,pick)=>{
    const el=pick(root);
    if(!el){out.push({name,ratio:null});return;}
    out.push({name,...__m.control(el)});
  };
  const host=document.createElement('div');
  host.style.cssText='background:var(--p-bg);padding:12px;';
  document.body.appendChild(host);

  // 1. room protocol step, CHECKED
  try{
    protocols.length=0;                      // const binding - mutate in place
    protocols.push({id:'p1',name:'Signature Facial',steps:[{t:'Double cleanse'},{t:'Steam'}]});
    roomProtocol=0;roomProtocolOff=false;roomStepsDone={'0-0':1};
    host.innerHTML=_roomProtocolHTML();
    look('room protocol step (checked)',host,r=>[...r.querySelectorAll('button')].find(b=>/^Uncheck/.test(b.getAttribute('aria-label')||'')));
  }catch(e){out.push({name:'room protocol step (checked)',err:String(e)});}

  // 2. upload angle picker, first angle selected
  try{
    CL['probe1']={id:'probe1',name:'Probe Client'};
    openPhotoUpload('probe1');
    const btns=[...document.querySelectorAll('button')].filter(b=>/_uploadAngle=/.test(b.getAttribute('onclick')||''));
    out.push(btns[0]?{name:'upload angle (selected)',...__m.control(btns[0])}:{name:'upload angle (selected)',ratio:null});
    document.querySelectorAll('.sheet,.sheet-wrap,[id*=sheet]').forEach(n=>{try{n.remove();}catch(e){}});
  }catch(e){out.push({name:'upload angle (selected)',err:String(e)});}

  // 3. booking mode radio dot, selected
  try{
    bookCfg.on=true;              // the mode cards only render once the link is on
    bookCfg.mode='request';
    renderBookingLink();
    const sel=[...document.querySelectorAll('button')].find(b=>/_bookSet\('mode','request'/.test(b.getAttribute('onclick')||''));
    const dot=sel&&[...sel.querySelectorAll('div')].find(d=>getComputedStyle(d).borderRadius==='50%');
    out.push(dot?{name:'booking mode dot (selected)',...__m.control(dot)}:{name:'booking mode dot (selected)',ratio:null});
  }catch(e){out.push({name:'booking mode dot (selected)',err:String(e)});}

  // 4. routine builder item, selected
  try{
    affiliateLinks.length=0;
    affiliateLinks.push({id:'a1',name:'Vitamin C serum',brand:'Probe',icon:'🧴'});
    routineDraft={name:'AM',items:['a1'],note:''};   // top-level let, not a window prop
    renderRoutineBuilder();
    const btn=[...document.querySelectorAll('button[onclick*="toggleRoutineItem"]')][0];
    const dot=btn&&[...btn.querySelectorAll('div')].find(d=>getComputedStyle(d).borderRadius==='50%');
    out.push(dot?{name:'routine item dot (selected)',...__m.control(dot)}:{name:'routine item dot (selected)',ratio:null});
  }catch(e){out.push({name:'routine item dot (selected)',err:String(e)});}

  // 5. automation repeat preset, selected
  try{
    renderAutoForm({id:'x',name:'Probe',repeat:'weekly',when:'after',days:1,channel:'sms',body:'hi'},0);
    const btn=[...document.querySelectorAll('button')].find(b=>/_autoRepPreset\(this,'weekly'/.test(b.getAttribute('onclick')||''));
    out.push(btn?{name:'repeat preset (selected)',...__m.control(btn)}:{name:'repeat preset (selected)',ratio:null});
    // and after a real click, which re-applies the pair from JS
    if(btn){btn.click();out.push({name:'repeat preset (after click)',...__m.control(btn)});}
  }catch(e){out.push({name:'repeat preset (selected)',err:String(e)});}

  // 6. report period chip, selected (the one the sweep did catch)
  try{_reportKey='this-month';renderReports();
    const chip=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='This month');
    out.push(chip?{name:'report period chip (selected)',...__m.control(chip)}:{name:'report period chip (selected)',ratio:null});
  }catch(e){out.push({name:'report period chip (selected)',err:String(e)});}
  return out;
});

let bad=0;
console.log('brand '+BRAND+', dark theme - WCAG 1.4.11 needs 3:1\n');
for(const r of rows){
  if(r.err){console.log('  ?? '+r.name+'  could not render: '+r.err);bad++;continue;}
  if(r.ratio==null){console.log('  ?? '+r.name+'  not found');bad++;continue;}
  const ok=r.ratio>=3;
  if(!ok)bad++;
  console.log('  '+(ok?'PASS':'FAIL')+'  '+r.ratio.toFixed(2)+':1  '+r.name.padEnd(30)+'  '+r.why+' on '+r.bg);
}
console.log('\n'+(bad?bad+' not proven':'all selected states meet 1.4.11'));
await b.close();
process.exit(bad?1:0);
