// sweep2: a course put back from "Earlier copies" (restoreCourseVersion) — or a re-saved message
// template after "reset to original" (_libUnforget) — lifts its delete record by DELETING the id from
// a grow-only _TOMB_OBJ key. Any second device that still holds the id unions it straight back, pushes
// it, and the next pull on the restoring device filters the restored course out again.
import { makeServer, launch, device, flush, resync, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const now = Date.now();
const course = (id, t) => ({ id, title: t, status: 'Published', price: 'Free', lessons: [{ id: 'l1', title: 'L1', body: 'hours of work' }], _ts: now - 5000 });
const srv = makeServer({ sc_courses: JSON.stringify([course('c_keep', 'Keep me'), course('c_acne', 'Acne Bootcamp')]), sc_courses_custom: '1' });
const b = await launch();
const A = await device(b, srv, 'A');
const B = await device(b, srv, 'B');
// A deletes the course (the deleteCourse body, minus its confirm sheet)
await A.evaluate(() => { const i = courses.findIndex(x => x.id === 'c_acne'); courses.splice(i, 1); _loadHiddenCourses(); hiddenCourses['c_acne'] = 1; _saveHiddenCourses(); persistCourses(); });
await flush(A);
await resync(B);   // B learns of the delete (normal: phone foregrounds)
await resync(B);   // a second pull: key order (library before its delete record) is a separate bug, see sweep2-lib-tomb-order
check('B: course deleted', !(await B.evaluate(() => courses.some(x => x.id === 'c_acne'))), await B.evaluate(() => [courses.map(x => x.id), localStorage.getItem('sc_hidden_courses')]));
// A restores it from Earlier copies (the restoreCourseVersion body after its fetch)
await A.evaluate(() => { const rec = { id: 'c_acne', title: 'Acne Bootcamp', status: 'Published', price: 'Free', lessons: [{ id: 'l1', title: 'L1', body: 'hours of work' }], _ts: Date.now() };
  _loadHiddenCourses(); if (hiddenCourses[rec.id]) { delete hiddenCourses[rec.id]; _saveHiddenCourses(); } courses.push(rec); _markCoursesCustom(); persistCourses(); });
await flush(A);
check('account: course is back after restore', /c_acne/.test(srv.kv.sc_courses || ''), (srv.kv.sc_courses || '').slice(0, 120));
check('account: delete record lifted', !/c_acne/.test(srv.kv.sc_hidden_courses || ''), srv.kv.sc_hidden_courses);
await resync(B);   // B foregrounds again
check('B sees the restored course', await B.evaluate(() => courses.some(x => x.id === 'c_acne')), await B.evaluate(() => localStorage.getItem('sc_hidden_courses')));
check('account delete record still lifted after B\'s pull', !/c_acne/.test(srv.kv.sc_hidden_courses || ''), srv.kv.sc_hidden_courses);
await resync(A); await resync(A);
check('A still has the restored course after its next pull', await A.evaluate(() => courses.some(x => x.id === 'c_acne')), await A.evaluate(() => courses.map(x => x.id)));
console.log('server courses:', JSON.parse(srv.kv.sc_courses).map(x => x.id));
await b.close();
process.exit(report() ? 1 : 0);
