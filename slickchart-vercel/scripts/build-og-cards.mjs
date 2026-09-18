// node scripts/build-og-cards.mjs — regenerates the share pictures for /build and /free.
//
// These used to point at the SlickChart client-engagement graphic, so sharing either page previewed
// as a different product entirely. Rendered here rather than drawn by hand so the copy and the
// Marine Opal palette stay in step with the pages themselves — change the text below and re-run.
// Fonts are deliberately system ones (Charter / Liberation Sans stand in for Newsreader / Figtree):
// this renders in a sandbox with no network, and a missing webfont would silently ruin the layout.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import {page} from './lib/og-card.js';
const {chromium}=pw;
const out='/home/user/SlickChart/slickchart-vercel/assets/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1200,height:630},deviceScaleFactor:2});
const jobs=[
 {file:'og-build.jpg', eyebrow:'Build Your Own App',
  head1:'Build the thing in your head.', head2:'Own it completely.',
  sub:'The Master Build Roadmap, 35 tested prompts, and the full walkthrough.',
  chip:'$97 · one time'},
 {file:'og-free.jpg', eyebrow:'Your free app demo',
  head1:'Turn your idea into an app you can', head2:'open and tap.',
  sub:'A clickable demo of your own app, on your phone, in about seventy minutes.',
  chip:'Free · no card needed'},
];
for(const j of jobs){
  await p.setContent(page(j),{waitUntil:'load'});
  await p.waitForTimeout(350);
  await p.screenshot({path:out+j.file,type:'jpeg',quality:90});
  console.log('wrote assets/'+j.file);
}
await b.close();
