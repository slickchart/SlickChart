import {boot} from './merge-boot.mjs';
const {b,p}=await boot();
const r=await p.evaluate(()=>{
  const N=6300, pids=[...Array(N)].map((_,i)=>'ph_'+i);
  localStorage.setItem('sc_photo_backed',JSON.stringify(pids.slice(0,6000)));
  const perLaunch=[];
  for(let launch=0;launch<4;launch++){
    _photoBackedUp=null; const done=_loadPhotoBackedUp();
    const jobs=pids.filter(x=>!done.has(x));        // same test as _backupPhotosToServer
    jobs.forEach(x=>_markPhotoBackedUp(x));          // each upload ok
    perLaunch.push(jobs.length);
  }
  // cap vs merge: sc_flag_dismissed (cap 500 at write) unioned with another device
  const a=[...Array(500)].map((_,i)=>'a'+i), bb=[...Array(500)].map((_,i)=>'b'+i);
  const merged=JSON.parse(_mergeTombstone('sc_flag_dismissed',JSON.stringify(a),JSON.stringify(bb))).length;
  // seen_events: local has a NEW id, server is at the cap -> changed:false
  const sv=[...Array(5000)].map((_,i)=>'e'+i); const lv=sv.slice(1).concat(['NEW']);
  const m=_mergeSeenEvents(JSON.stringify(sv),JSON.stringify(lv));
  return {photoReuploadsPerLaunch:perLaunch,flagDismissedAfterUnion:merged,seenCap:{changed:m.changed,hasNew:JSON.parse(m.str).includes('NEW'),len:JSON.parse(m.str).length}};
});
console.log(JSON.stringify(r));
await b.close();
