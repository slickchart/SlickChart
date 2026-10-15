// sweep2: a course put back from "Earlier copies" (restoreCourseVersion) — or a re-saved message
// template after "reset to original" (_libUnforget) — lifts its delete record by DELETING the id from
// a grow-only _TOMB_OBJ key. Any second device that still holds the id unions it straight back, pushes
// it, and the next pull on the restoring device filters the restored course out again.
import { makeServer, launch, device, flush, resync, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const now = Date.now();
const course = (id, t) => ({ id, title: t, status: 'Published', price: 'Free', lessons: [{ id: 'l1', title: 'L1', body: 'hours of work' }], _ts: now - 5000 });
const srv = makeServer({ sc_courses: JSON.stringify([course('c_keep', 'Keep me'), course('c_acne', 'Acne Bootcamp')]), sc_courses_custom: '1' });
const FIX_JS = `(function(){
  // _mergeTombstone: every numeric delete stamp keeps the NEWER value on both sides (today only the client records do).
  const oTomb=_mergeTombstone;window._mergeTombstone=function(k,s,l){const r=oTomb(k,s,l);if(r==null||_TOMB_ARR[k])return r;try{const o=JSON.parse(r),sv=JSON.parse(s||'{}')||{};Object.keys(sv).forEach(function(i){if(typeof sv[i]==='number'&&typeof o[i]==='number'&&sv[i]>o[i])o[i]=sv[i];});return JSON.stringify(o);}catch(e){return r;}};
  window._tombStamps=function(keys){const out={};[].concat(keys||[]).forEach(function(tk){[(Cloud&&Cloud._incoming)?Cloud._incoming[tk]:null,_lsGet(tk)].forEach(function(raw){
    try{const v=JSON.parse(raw||'null');if(Array.isArray(v))v.forEach(function(x){if(x!=null)out[String(x)]=Math.max(out[String(x)]||0,1);});
      else if(v&&typeof v==='object')Object.keys(v).forEach(function(x){const t=Number(v[x])||1;out[x]=Math.max(out[x]||0,t);});}catch(e){}});});return out;};
  // A delete hides a row unless the row was saved AFTER it (re-added, restored, re-saved).
  window._tombHides=function(t,itemTs){t=Number(t)||0;const i=Number(itemTs)||0;if(!t)return false;if(t<=1||!i)return true;return t>=i;};
  window._mergeAuthoredById=function(serverStr,localStr,hiddenKey,opts){
    let srv,loc;try{srv=JSON.parse(serverStr||'[]');}catch(e){return null;}try{loc=JSON.parse(localStr||'[]');}catch(e){loc=[];}
    if(!Array.isArray(srv))return null;if(!Array.isArray(loc))loc=[];
    const keyOf=(opts&&opts.keyFn)||function(c){return (c&&c.id)?String(c.id):'';};const keepUnkeyed=!!(opts&&opts.keepUnkeyed);
    const hidden=_tombStamps(hiddenKey);const out=[],idx={};
    const take=function(c,fromLocal){if(!c)return;const cid=keyOf(c);if(!cid){if(keepUnkeyed)out.push(c);return;}
      if(_tombHides(hidden[cid],c._ts))return;
      if(!(cid in idx)){idx[cid]=out.length;out.push(c);return;}
      const cur=out[idx[cid]];const a=Number(cur&&cur._ts)||0,b=Number(c&&c._ts)||0;
      const pubCur=String((cur&&cur.status)||'')==='Published',pubNew=String((c&&c.status)||'')==='Published';
      if(b>a)out[idx[cid]]=c;else if(b===a&&pubNew&&!pubCur)out[idx[cid]]=c;else if(b===a&&pubCur&&!pubNew){}else if(!a&&!b&&!fromLocal)out[idx[cid]]=c;};
    srv.forEach(c=>take(c,false));loc.forEach(c=>take(c,true));
    const str=JSON.stringify(out);
    const srvFiltered=JSON.stringify(srv.filter(function(c){if(!c)return false;const k=keyOf(c);if(!k)return keepUnkeyed;return !_tombHides(hidden[k],c._ts);}));
    return {str:str,changed:str!==srvFiltered};};
})();`;
// FIX=1 also: deleteCourse writes Date.now() (not 1); a restore keeps a DATED record just older than the restored course instead of deleting the id.
const FIX = +(process.env.FIX || 0);
const P = FIX ? FIX_JS : null;
const b = await launch();
const A = await device(b, srv, 'A', null, P);
const B = await device(b, srv, 'B', null, P);
// A deletes the course (the deleteCourse body, minus its confirm sheet)
await A.evaluate((FIX) => { const i = courses.findIndex(x => x.id === 'c_acne'); courses.splice(i, 1); _loadHiddenCourses(); hiddenCourses['c_acne'] = FIX ? Date.now() : 1; _saveHiddenCourses(); persistCourses(); }, FIX);
await flush(A);
await resync(B);   // B learns of the delete (normal: phone foregrounds)
await resync(B);   // a second pull: key order (library before its delete record) is a separate bug, see sweep2-lib-tomb-order
check('B: course deleted', !(await B.evaluate(() => courses.some(x => x.id === 'c_acne'))), await B.evaluate(() => [courses.map(x => x.id), localStorage.getItem('sc_hidden_courses')]));
// A restores it from Earlier copies (the restoreCourseVersion body after its fetch)
await A.evaluate((FIX) => { const rec = { id: 'c_acne', title: 'Acne Bootcamp', status: 'Published', price: 'Free', lessons: [{ id: 'l1', title: 'L1', body: 'hours of work' }], _ts: Date.now() };
  _loadHiddenCourses(); if (hiddenCourses[rec.id]) { if (FIX) hiddenCourses[rec.id] = rec._ts - 1; else delete hiddenCourses[rec.id]; _saveHiddenCourses(); } courses.push(rec); _markCoursesCustom(); persistCourses(); }, FIX);
await flush(A);
check('account: course is back after restore', /c_acne/.test(srv.kv.sc_courses || ''), (srv.kv.sc_courses || '').slice(0, 120));
if (!FIX) check('account: delete record lifted', !/c_acne/.test(srv.kv.sc_hidden_courses || ''), srv.kv.sc_hidden_courses);
await resync(B);   // B foregrounds again
check('B sees the restored course', await B.evaluate(() => courses.some(x => x.id === 'c_acne')), await B.evaluate(() => localStorage.getItem('sc_hidden_courses')));
check('account: restored course still on the account after B\'s pull', /c_acne/.test(srv.kv.sc_courses || ''), srv.kv.sc_hidden_courses);
await resync(A); await resync(A);
check('A still has the restored course after its next pull', await A.evaluate(() => courses.some(x => x.id === 'c_acne')), await A.evaluate(() => courses.map(x => x.id)));
console.log('server courses:', JSON.parse(srv.kv.sc_courses).map(x => x.id));
await b.close();
process.exit(report() ? 1 : 0);
