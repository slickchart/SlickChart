import { matchSquareService } from './match.mjs';
import { fromMins } from './frommins.mjs';

const SVC=[{variationId:'V1',name:'Signature Facial — 60 min',durationMinutes:60},
           {variationId:'V2',name:'Dermaplane',durationMinutes:45},
           {variationId:'V3',name:'Chemical Peel',durationMinutes:30}];
console.log('SERVICE NAME MATCHING');
const cases=[['Signature Facial','V1'],['Signature Facial — 60 min','V1'],['Dermaplane','V2'],
             ['dermaplane','V2'],['Chemical Peel','V3'],['Lash Lift',null],['',null]];
let bad=0;
for(const [q,want] of cases){
  const got=matchSquareService(SVC,q);
  const id=got?got.variationId:null;
  const ok=id===want;
  if(!ok)bad++;
  console.log('  '+JSON.stringify(q).padEnd(28), '->', String(id).padEnd(6), ok?'ok':('*** expected '+want+' ***'));
}

console.log('\nTIME LABELS: Square instants rendered in her timezone must match fromMins() exactly');
const tz='America/Los_Angeles';
const fmt=new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:tz});
// Her stated Tue/Thu/Sat facial starts: 10, 12, 2, 4 LOCAL. 2026-11-03 is AFTER the Nov 1 change,
// so Pacific is UTC-8 (PST): 10am local = 18:00Z. Getting this wrong in the test is the same DST
// trap that broke the Square day window on 2026-10-11, so the PDT side is asserted too.
const local=[['2026-11-03T18:00:00Z',600],['2026-11-03T20:00:00Z',720],['2026-11-03T22:00:00Z',840],['2026-11-04T00:00:00Z',960]];
const got=[];
for(const [iso,mins] of local){
  const a=fmt.format(new Date(iso)).replace(/ /g,' ');
  const b=fromMins(mins);
  got.push(a);
  const ok=a===b;
  if(!ok)bad++;
  console.log('  '+iso, '->', a.padEnd(9), '| fromMins:', b.padEnd(9), ok?'identical':'*** MISMATCH ***');
}
console.log('\n  rendered day:', got.join(', '));
console.log('  her stated rule: 10:00 AM, 12:00 PM, 2:00 PM, 4:00 PM');
console.log('  match:', got.join(', ')==='10:00 AM, 12:00 PM, 2:00 PM, 4:00 PM' ? 'YES' : '*** NO ***');
if(got.join(', ')!=='10:00 AM, 12:00 PM, 2:00 PM, 4:00 PM')bad++;
// PDT side: 2026-10-13 is before the change, UTC-7, so 10am local = 17:00Z.
console.log('\nSAME CHECK ON A PDT DATE (UTC-7)');
const pdt=[['2026-10-13T17:00:00Z',600],['2026-10-13T19:00:00Z',720],['2026-10-13T21:00:00Z',840],['2026-10-13T23:00:00Z',960]];
const got2=[];
for(const [iso,mins] of pdt){
  const a=fmt.format(new Date(iso)).replace(/\u202f/g,' ');
  const b=fromMins(mins);
  got2.push(a);
  if(a!==b)bad++;
  console.log('  '+iso,'->',a.padEnd(9),'| fromMins:',b.padEnd(9), a===b?'identical':'*** MISMATCH ***');
}
console.log('  rendered day:', got2.join(', '));
if(got2.join(', ')!=='10:00 AM, 12:00 PM, 2:00 PM, 4:00 PM')bad++;

console.log('\n'+(bad?('FAILURES: '+bad):'all assertions passed'));
