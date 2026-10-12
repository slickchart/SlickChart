// Ashley, 2026-10-12: the service chips ran off the side of the screen and the button on the
// next-appointment card was unreadable. A dropdown with short labels, and AA contrast on that button.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

const SERVICES=[
  'Acne Skin Treatment - Focus on active breakouts and acne scarring',
  'Signature Facial',
  'Dermaplane - 30 min',
  'Back - Chest'
];
const p=await b.newPage({viewport:{width:390,height:844}});
await p.emulateMedia({colorScheme:'dark'});
await p.route('**/api/client-data*', async r=>{
  await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,client:{
    id:'c1',name:'Ashley Watson',email:'a@example.com',
    data:{providerName:'Botanical Aesthetics',providerFirst:'Ashley',treatment:'New client',services:SERVICES,
      availability:{mon:{open:true,start:'09:00',end:'17:00'},tue:{open:true,start:'09:00',end:'17:00'},
                    wed:{open:true,start:'09:00',end:'17:00'},thu:{open:true,start:'09:00',end:'17:00'},
                    fri:{open:true,start:'09:00',end:'17:00'},sat:{open:false},sun:{open:false}}}
  }})});
});
await p.route('**/api/client-availability*', async r=>{
  await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,slots:['10:00 AM'],openDays:['mon','tue','wed','thu','fri']})});
});
await p.goto('http://localhost:8899/slickchart-client.html?c=TESTTOKEN',{waitUntil:'load'});
await p.waitForTimeout(2500);

// --- contrast of the "Request an appointment" button on the always-dark card ---
const con=await p.evaluate(()=>{
  const btn=[...document.querySelectorAll('button')].find(x=>/Request an appointment/.test(x.textContent));
  if(!btn)return {err:'button not found'};
  const span=btn.querySelector('span');
  const cs=getComputedStyle(document.documentElement);
  const hex=n=>cs.getPropertyValue(n).trim();
  const parse=c=>{const m=c.match(/\d+(\.\d+)?/g).map(Number);return {r:m[0],g:m[1],b:m[2],a:m[3]==null?1:m[3]};};
  const fromHex=h=>{h=h.replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16),a:1};};
  const col=v=>v.startsWith('#')?fromHex(v):parse(v);
  const over=(fg,bg)=>({r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a),a:1});
  const L=c=>{const f=x=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);};
  const ratio=(a,c)=>{const l1=L(a),l2=L(c);return ((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05));};
  // The card is a linear-gradient, so getComputedStyle reads it as transparent (CLAUDE.md 2).
  // Compute against BOTH ends and take the worse.
  const t1=col(hex('--accent-tint')), t2=col(hex('--accent-tint2'));
  const btnBg=parse(getComputedStyle(btn).backgroundColor);     // rgba(255,255,255,.12) overlay
  const ink=parse(getComputedStyle(span).color);
  const r1=ratio(ink,over(btnBg,t1)), r2=ratio(ink,over(btnBg,t2));
  return {ink:getComputedStyle(span).color, tint1:hex('--accent-tint'), tint2:hex('--accent-tint2'),
          worst:Math.min(r1,r2).toFixed(2)};
});
console.log('Request an appointment button');
console.log('  text colour :', con.ink);
console.log('  card        :', con.tint1, '->', con.tint2);
console.log('  contrast    :', con.worst, '(AA needs 4.5 for this size)');

// --- the dropdown ---
const dd=await p.evaluate(()=>{
  nav('rebook');
  return new Promise(res=>setTimeout(()=>{
    const sel=document.getElementById('rebook-svc');
    if(!sel)return res({err:'no dropdown'});
    const opts=[...sel.options].map(o=>({label:o.textContent,value:o.value}));
    const chipRow=[...document.querySelectorAll('h2')].find(x=>x.textContent.trim()==='Preferred service');
    const sec=chipRow?chipRow.closest('.sh').nextElementSibling:null;
    const scrolls=sec?(sec.scrollWidth>sec.clientWidth):null;
    res({opts, selected:sel.value, scrolls});
  },700));
});
console.log('\nPreferred service dropdown');
if(dd.err){console.log('  ***',dd.err);}
else{
  dd.opts.forEach(o=>console.log('  shows "'+o.label+'"  ->  sends "'+o.value+'"'));
  console.log('  needs sideways scrolling:', dd.scrolls?'*** YES ***':'no');
}
await p.close(); await b.close();

let bad=0;
if(Number(con.worst)<4.5){console.log('\n*** button contrast below AA');bad++;}
if(dd.err){bad++;}
else{
  const byLabel=Object.fromEntries(dd.opts.map(o=>[o.value,o.label]));
  if(byLabel[SERVICES[0]]!=='Acne Skin Treatment'){console.log('*** long description not shortened:',byLabel[SERVICES[0]]);bad++;}
  if(byLabel[SERVICES[1]]!=='Signature Facial'){console.log('*** plain name changed');bad++;}
  if(byLabel[SERVICES[2]]!=='Dermaplane - 30 min'){console.log('*** a variant was cut:',byLabel[SERVICES[2]]);bad++;}
  if(byLabel[SERVICES[3]]!=='Back - Chest'){console.log('*** a two-part name was cut:',byLabel[SERVICES[3]]);bad++;}
  if(!dd.opts.every(o=>SERVICES.includes(o.value))){console.log('*** an option sends something that is not a real service');bad++;}
  if(dd.scrolls){bad++;}
}
console.log('\n'+(bad?('FAILURES: '+bad):'readable button, dropdown with short labels and full values'));
