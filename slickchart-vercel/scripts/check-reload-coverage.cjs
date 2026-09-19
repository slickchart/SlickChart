#!/usr/bin/env node
// Every loader that reads a synced sc_* key MUST be re-run after a cloud pull.
//
// If it is not, a change made on another device is written into this device's storage and then
// never read into the app: the data is right there on the disk and the screen shows stale defaults.
// That is what made a course disappear once, and it is the shape of the bug where a form made on
// her phone would not show on her computer. A sweep on 2026-09-19 found twenty-six loaders in
// exactly that state. This check makes sure a new one can never quietly join them.
//
// If this fails: add `S('<plain-english label>',function(){ <loader>(); });` to _reloadAll().
// If the loader genuinely must not re-run after a pull, add it to ALLOWED below WITH A REASON.
const fs=require('fs'),path=require('path');
const f=path.join(__dirname,'..','slickchart.html');
const s=fs.readFileSync(f,'utf8');

const ALLOWED={
  // Deliberately excluded from sync — it is the backup that lives OUTSIDE IndexedDB (CLAUDE.md §3).
  loadCapturedPhotos:'sc_captured_photos is excluded from sync on purpose',
  // Reads the token/session, not provider data; re-running it mid-session would be wrong.
  _loadFounderLastTs:'founder signup stamp, not provider data',
};

const start=s.indexOf('function _reloadAll()');
if(start<0){console.error('check-reload-coverage: could not find _reloadAll()');process.exit(2);}
const end=s.indexOf('\n}', s.indexOf("S('branding'",start));
const body=s.slice(start,end);
const called=new Set([...body.matchAll(/\b(_?[a-zA-Z]*[lL]oad[A-Za-z_]*)\s*\(/g)].map(m=>m[1]));
const defined=new Set([...s.matchAll(/function\s+(_?[lL]oad[A-Za-z_]*)\s*\(/g)].map(m=>m[1]));

const missing=[];
for(const fn of [...defined].sort()){
  if(called.has(fn)||ALLOWED[fn])continue;
  const m=new RegExp('function\\s+'+fn+'\\s*\\([^)]*\\)\\s*\\{').exec(s);
  if(!m)continue;
  // Only the body of THIS function, so an adjacent function's keys are not miscounted.
  let i=m.index+m[0].length,depth=1;
  while(i<s.length&&depth>0){const c=s[i];if(c==='{')depth++;else if(c==='}')depth--;i++;}
  const seg=s.slice(m.index+m[0].length,i);
  const keys=[...new Set([...seg.matchAll(/['"](sc_[a-z0-9_]+)['"]/g)].map(x=>x[1]))];
  if(keys.length)missing.push(fn+'  ('+keys.slice(0,3).join(', ')+')');
}
if(missing.length){
  console.error('check-reload-coverage: these loaders read synced data but are NOT re-run after a cloud pull.');
  console.error('A change made on another device would land on the disk and never reach the screen.\n');
  missing.forEach(x=>console.error('  '+x));
  console.error("\nAdd each to _reloadAll() as S('<label>',function(){ <loader>(); }); or list it in ALLOWED with a reason.");
  process.exit(1);
}
console.log('reload-coverage: clean ('+defined.size+' loaders, '+Object.keys(ALLOWED).length+' deliberately excluded)');
