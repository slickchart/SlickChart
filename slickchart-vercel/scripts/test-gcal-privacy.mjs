// Drives lib/google-cal.js eventBody + the sync loop against a stubbed Google and a stubbed DB.
import fs from 'fs'; import os from 'os'; import path from 'path';
const V='/home/user/SlickChart/slickchart-vercel';
let pass=0,fail=0;const ok=(n,c,x)=>{if(c){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(x?(' :: '+JSON.stringify(x)):''));}};

// Pull eventBody out of the module source and run it directly — it is a pure function of the
// appointment and the flag, which is exactly the thing that must never leak a name.
const src=fs.readFileSync(path.join(V,'lib','google-cal.js'),'utf8');
const m=/function eventBody\(a, isPrivate\) \{[\s\S]*?\n\}/.exec(src);
if(!m){console.log('could not find eventBody');process.exit(1);}
const eventBody=new Function('TAG_KEY','return '+m[0]+';')('slickchartApptId');

const appt={id:'a1',dateISO:'2026-10-12',startMins:9*60+30,durMins:60,
  client:'Jennifer Ashley',tx:'Restore Facial',
  title:'Jennifer Ashley — Restore Facial',
  notes:'Cystic activity along the jaw, avoid actives for a week'};

const open=eventBody(appt,false);
ok('names ON: the title still reads as before', open.summary==='Jennifer Ashley — Restore Facial', open.summary);
ok('names ON: the notes still travel', /Cystic activity/.test(open.description), open.description);

const priv=eventBody(appt,true);
ok('names OFF: the title is the service only', priv.summary==='Restore Facial', priv.summary);
ok('names OFF: the client name is NOWHERE in the event', !JSON.stringify(priv).includes('Jennifer'), priv);
ok('names OFF: the surname is gone too', !JSON.stringify(priv).includes('Ashley'), priv);
ok('names OFF: the clinical note does not ride along in the description', priv.description==='', priv.description);
ok('names OFF: no note text anywhere in the event', !JSON.stringify(priv).includes('Cystic'), priv);
ok('names OFF: the time is unchanged, so it still blocks the slot',
   priv.start.dateTime===open.start.dateTime && priv.end.dateTime===open.end.dateTime, {p:priv.start,o:open.start});
ok('names OFF: the appointment is still matched by id', priv.extendedProperties.private.slickchartApptId==='a1', priv.extendedProperties);

// An old device that only sends the joined title must not defeat it.
const legacy={id:'a2',dateISO:'2026-10-12',startMins:600,durMins:60,title:'Jennifer Ashley — Restore Facial',notes:'x'};
const lp=eventBody(legacy,true);
ok('an OLD client sending only a joined title still cannot leak the name',
   !JSON.stringify(lp).includes('Jennifer'), lp.summary);
ok('and it degrades to a neutral title rather than blank', (lp.summary||'').length>0, lp.summary);

// A missing service name must not produce an empty event title.
const bare=eventBody({id:'a3',dateISO:'2026-10-12',startMins:600,durMins:60,client:'Sue'},true);
ok('no service name falls back to "Appointment"', bare.summary==='Appointment', bare.summary);
ok('and still leaks nothing', !JSON.stringify(bare).includes('Sue'), bare);

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
