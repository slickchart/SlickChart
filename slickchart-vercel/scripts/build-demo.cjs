#!/usr/bin/env node
/* Regenerate the public clickable demos from the real apps.
 *
 *   slickchart.html         ->  slickchart-provider-demo.html
 *   slickchart-client.html  ->  slickchart-client-demo.html
 *
 * The demos are the real apps verbatim (so they always reflect the current UX)
 * plus a small "demo isolation" wrapper injected at the <head>/<body> boundary:
 *   - a #sc-demo-banner style
 *   - an in-memory localStorage shim + window.__SC_DEMO__=true, so the public
 *     demo never reads or wipes a logged-in provider's real data on this origin,
 *     and the app boots straight into its built-in sample data (Maya/Sophie/Priya)
 *   - a "Reset demo" banner
 *
 * Run after editing either app:  node scripts/build-demo.cjs
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..');

const BANNER_CSS = `#sc-demo-banner{position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(90deg,#2a231b,#1a1208);border-bottom:1px solid #3c3227;color:#f3ecdf;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12.5px;display:flex;align-items:center;justify-content:center;gap:12px;padding:9px 14px;flex-wrap:wrap;text-align:center;}#sc-demo-banner b{color:#C8A882;}#sc-demo-banner button{background:none;border:1px solid #6b5d45;color:#C8A882;border-radius:20px;padding:4px 12px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;}#sc-demo-banner button:hover{border-color:#C8A882;}html,body{height:100%;margin:0;}.shell{height:100vh !important;max-height:100vh !important;min-height:0 !important;}`;

const ISOLATION = `<script>
/* DEMO ISOLATION: this public demo shares its origin with the real app, so without this it would
   read (and "Reset" would wipe) a logged-in provider's REAL data from localStorage. Replace storage
   with an in-memory store and flag demo mode so the app skips login/Cloud and shows sample data. */
(function(){try{
  window.__SC_DEMO__=true;
  var mem=Object.create(null);
  var shim={
    getItem:function(k){k=String(k);return (k in mem)?mem[k]:null;},
    setItem:function(k,v){mem[String(k)]=String(v);},
    removeItem:function(k){delete mem[String(k)];},
    clear:function(){mem=Object.create(null);},
    key:function(i){return Object.keys(mem)[i]||null;}
  };
  try{Object.defineProperty(shim,"length",{get:function(){return Object.keys(mem).length;}});}catch(e){}
  try{Object.defineProperty(window,"localStorage",{configurable:true,get:function(){return shim;}});}catch(e){}
}catch(e){}})();
</script>`;

const RESET = `<script>
function scResetDemo(){try{Object.keys(localStorage).filter(function(k){return k.indexOf("sc_")===0;}).forEach(function(k){localStorage.removeItem(k);});}catch(e){}location.reload();}
</script>`;

function bannerDiv(text) {
  return `<div id="sc-demo-banner">
  <span>${text}</span>
  <button onclick="scResetDemo()">Reset demo</button>
</div>`;
}

const ANCHOR = '</style>\n</head>\n<body>';

function build(srcFile, outFile, bannerText) {
  const srcPath = path.join(dir, srcFile);
  const outPath = path.join(dir, outFile);
  let html = fs.readFileSync(srcPath, 'utf8');

  if (html.indexOf('__SC_DEMO__') === -1) {
    // ok: client app has no gate of its own; isolation flag comes from the wrapper.
  }
  if (html.indexOf(ANCHOR) === -1) {
    throw new Error(`${srcFile}: could not find the </style></head><body> anchor; demo not regenerated.`);
  }
  if (html.indexOf('sc-demo-banner') !== -1) {
    throw new Error(`${srcFile}: already contains demo wrapper markers; refusing to double-inject.`);
  }

  const replacement =
    BANNER_CSS + '\n' + ANCHOR + '\n' +
    ISOLATION + '\n' +
    bannerDiv(bannerText) + '\n' +
    RESET + '\n';

  html = html.replace(ANCHOR, replacement);
  fs.writeFileSync(outPath, html);

  // sanity: the wrapper must be present exactly once
  const checks = ['sc-demo-banner', 'window.__SC_DEMO__=true', 'scResetDemo'];
  for (const c of checks) {
    if (html.indexOf(c) === -1) throw new Error(`${outFile}: post-build check failed, missing ${c}`);
  }
  console.log(`built ${outFile}  (${html.length.toLocaleString()} bytes)`);
}

build(
  'slickchart.html',
  'slickchart-provider-demo.html',
  '🧪 <b>Live demo</b> — provider view, 3 sample clients already loaded (Maya, Sophie, Priya). Click around freely.'
);
build(
  'slickchart-client.html',
  'slickchart-client-demo.html',
  '🧪 <b>Live demo</b> — viewing as client Maya Rodriguez, connected to Glowing Skin Studio.'
);
console.log('done.');
