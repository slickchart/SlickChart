import pw from '/opt/node22/lib/node_modules/playwright/index.js';import fs from 'fs';
const {chromium}=pw;const D=process.argv[2];
const items=[
 ['virtual','VIRTUAL ESTHETICS','Virtual esthetics.','Earn outside the treatment room.','ph-picks.png'],
 ['consult','PHOTO + PRODUCT CONSULTS','Virtual consults','that end in a sale.','ph-consult.png'],
 ['courses','COURSE + GUIDE BUILDER','Teach it once.','Send it forever.','ph-courses.png'],
 ['shop','SHOPPABLE HOMECARE','Every pick,','one tap from bought.','ph-shop.png'],
];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const tpl=fs.readFileSync(D+'/tpl.html','utf8');
for(const [n,pill,h1,h2,img] of items){
 fs.writeFileSync(D+'/'+n+'.html',tpl.replace('__PILL__',pill).replace('__H1__',h1).replace('__H2__',h2).replace('__IMG__',img));
 const p=await b.newPage({viewport:{width:1200,height:900},deviceScaleFactor:1.5});
 await p.goto('file://'+D+'/'+n+'.html');await p.waitForTimeout(2500);await p.evaluate(()=>document.fonts.ready);
 await p.screenshot({path:D+'/gbp-'+n+'.jpg',type:'jpeg',quality:92});await p.close();}
await b.close();
