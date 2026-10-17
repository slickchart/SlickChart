// ASHLEY, 2026-10-16: wrote provider notes, made the client summary "client friendly", then edited the
// provider notes. The client summary kept the old wording. It must follow her notes, unless she has
// re-worded the client note herself, in which case it must NOT overwrite her words (one-tap update).
//   node scratchpad/test-summary-follows-notes.mjs [file.html]   (served from slickchart-vercel on :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE=process.argv[2]||'slickchart.html';
const res=[];const check=(n,p,d)=>{res.push(p);console.log((p?'  ok   ':'  FAIL ')+n+(d?'  :: '+d:''));};
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844}});
await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:r.request().url().includes('cloud-status')?'{"enabled":true}':'{"ok":true,"data":{},"clients":[],"events":[]}'}));
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8899/'+FILE);
await p.evaluate(()=>{localStorage.setItem('sc_token','eyJ1IjoicDEifQ.sig');localStorage.setItem('sc_onboarded','1');localStorage.setItem('sc_ai','1');});
await p.reload();await p.waitForTimeout(3500);
// The AI echoes the notes it was given, so the note shows which notes it was written from.
await p.evaluate(()=>{window._aiCalls=0;window._aiComplete=async function(msgs){window._aiCalls++;const t=msgs[0].content;const m=t.match(/(?:Session notes:|notes:)\n([\s\S]*)$/i);return 'FRIENDLY<'+(m?m[1]:t.slice(-120)).replace(/\s+/g,' ').trim()+'>';};
  CL['cA']={id:'cA',name:'Amy Test',treatment:'Facial',_token:'tk'};});
const typeNotes=async txt=>{
  await p.evaluate(()=>nav('write-note','cA'));await p.waitForTimeout(400);
  await p.evaluate(t=>{const ta=document.querySelector('textarea[id^="wn-sec-"]');ta.value=t;ta.dispatchEvent(new Event('input',{bubbles:true}));_saveWriteNote('cA');},txt);
  await p.waitForTimeout(700);
};
const note=()=>p.evaluate(()=>{const el=document.getElementById('summary-note');return el?el.innerText:'(none)';});
await typeNotes('Used glycolic 20 percent on cheeks');
await p.evaluate(()=>nav('session-summary','cA'));await p.waitForTimeout(500);
await p.evaluate(()=>aiClientFriendly('cA',document.getElementById('ai-friendly-btn')));await p.waitForTimeout(600);
const n1=await note();
check('step 1: "Make client-friendly" writes the client note',/^FRIENDLY</.test(n1),n1);
// She goes back and fixes her provider notes
await typeNotes('Used lactic 10 percent on cheeks');
await p.evaluate(()=>nav('session-summary','cA'));await p.waitForTimeout(1200);
const n2=await note();
check('step 2: after editing provider notes the client note follows them',/lactic 10/.test(n2)&&!/glycolic/.test(n2),n2);
const pers=await p.evaluate(()=>(_lsGet('sc_summary_drafts')||'').includes('lactic 10'));
check('and the updated client note is saved',pers);
// Re-opening without changing notes does not call the AI again
const calls=await p.evaluate(()=>window._aiCalls);
await p.evaluate(()=>nav('session-summary','cA'));await p.waitForTimeout(800);
check('opening the summary again with no note changes does not rewrite it',await p.evaluate(()=>window._aiCalls)===calls);
// She re-words the client note herself, then changes her notes: her words are kept, she gets a button
await p.evaluate(()=>{editSummaryNote('cA');const ta=document.getElementById('note-edit-ta');ta.value='My own words for Amy';ta.dispatchEvent(new Event('input'));summaryNoteDraft['cA']=ta.value;persistSummaryDrafts();renderSessionSummary('cA');});
await typeNotes('Used mandelic 15 percent on cheeks');
await p.evaluate(()=>nav('session-summary','cA'));await p.waitForTimeout(1000);
const n3=await note();const banner=await p.evaluate(()=>document.body.innerText.includes('Update from my notes'));
check('step 3: her own re-wording is NOT overwritten',n3==='My own words for Amy',n3);
check('and she sees "Update from my notes"',banner);
await p.evaluate(()=>{window.confirmModal=function(o,go){go();};_updateNoteFromNotes('cA');});await p.waitForTimeout(1000);
const n4=await note();
check('tapping it rewrites the note from her current notes',/mandelic 15/.test(n4),n4);
const banner2=await p.evaluate(()=>document.body.innerText.includes('Update from my notes'));
check('and the button goes away',!banner2);
// Relaunch: the link between note and notes survives, so a later edit still follows
await p.reload();await p.waitForTimeout(3500);
await p.evaluate(()=>{window._aiComplete=async function(msgs){const t=msgs[0].content;const m=t.match(/Session notes:\n([\s\S]*)$/);return 'FRIENDLY<'+(m?m[1]:'').replace(/\s+/g,' ').trim()+'>';};CL['cA']=CL['cA']||{id:'cA',name:'Amy Test',treatment:'Facial',_token:'tk'};});
await typeNotes('Used azelaic 10 percent on cheeks');
await p.evaluate(()=>nav('session-summary','cA'));await p.waitForTimeout(1200);
const n5=await note();
check('after a relaunch, a notes edit still updates the client note',/azelaic/.test(n5),n5);
// Sync: the merge carries the link both ways and keeps the newer copy
const m=await p.evaluate(()=>{
  const srv=JSON.stringify({note:{x:'old'},obs:{},_ts:{note:{x:1},obs:{}}});           // an older build's copy: no src
  const loc=JSON.stringify({note:{x:'new'},obs:{},src:{x:{n:'5:1',t:'new'}},_ts:{note:{x:2},obs:{},src:{x:2}}});
  const r=_mergeSummaryDrafts(srv,loc);const o=JSON.parse(r.str);return {note:o.note.x,src:o.src&&o.src.x&&o.src.x.t,changed:r.changed};
});
check('sync keeps the link when the account copy came from an older build',m.note==='new'&&m.src==='new'&&m.changed,JSON.stringify(m));
check('no page errors',errs.length===0,errs.join(' | '));
await b.close();
const f=res.filter(x=>!x).length;console.log('\n'+(res.length-f)+' passed, '+f+' failed');process.exit(f?1:0);
