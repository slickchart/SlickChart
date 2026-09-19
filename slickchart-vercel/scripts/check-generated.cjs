#!/usr/bin/env node
// Everything generated from a source file must be committed alongside it.
//
// CI does exactly this, inline, and it caught a real slip: slickchart.html was edited AFTER the demo
// build had run, so the commit carried a demo page 17 lines behind the app. Nothing a provider uses
// broke — the demos are the public sample, not the live app — but the build went red and sent an
// alarming email on a day full of real fixes. Running this before committing makes that impossible.
//
// Usage: node scripts/check-generated.cjs      (from slickchart-vercel/)
const {execFileSync}=require('child_process');
const path=require('path');
const here=__dirname, root=path.join(here,'..','..');
const steps=['build-demo.cjs','build-client-page.cjs','build-switch.cjs','build-blog.cjs'];
for(const s of steps){
  try{execFileSync(process.execPath,[path.join(here,s)],{cwd:path.join(here,'..'),stdio:'ignore'});}
  catch(e){console.error('check-generated: '+s+' failed to run');process.exit(2);}
}
// Tracked changes only, exactly as CI's `git diff --quiet` does. A new untracked file is the
// author adding something, not a generated file drifting.
let out='';
try{out=execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'});}catch(e){
  console.error('check-generated: could not read git diff');process.exit(2);}
const dirty=out.split('\n').filter(Boolean);
if(dirty.length){
  console.error('check-generated: generated files are STALE. Rebuilding changed these:\n');
  dirty.forEach(l=>console.error('  '+l));
  console.error('\nThey are rebuilt now — commit them with your change.');
  process.exit(1);
}
console.log('generated: in sync ('+steps.length+' build scripts, nothing changed)');
