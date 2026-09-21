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
// Compare the tracked diff BEFORE and AFTER building, and report only what the BUILD changed.
// Checking "is the tree dirty" afterwards would flag the author's own edits too — writing a blog
// post and then running this would blame TOPICS.md, which the build never touched.
const diffNames=()=>{
  try{return execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).split('\n').filter(Boolean);}
  catch(e){console.error('check-generated: could not read git diff');process.exit(2);}
};
const before=new Set(diffNames());
for(const s of steps){
  try{execFileSync(process.execPath,[path.join(here,s)],{cwd:path.join(here,'..'),stdio:'ignore'});}
  catch(e){console.error('check-generated: '+s+' failed to run');process.exit(2);}
}
const changed=diffNames().filter(f=>!before.has(f));
if(changed.length){
  console.error('check-generated: generated files were STALE. Building changed:\n');
  changed.forEach(f=>console.error('  '+f));
  console.error('\nThey are rebuilt now — commit them with your change.');
  process.exit(1);
}
console.log('generated: in sync ('+steps.length+' build scripts, nothing the build owns changed)');
