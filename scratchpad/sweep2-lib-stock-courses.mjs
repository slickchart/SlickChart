// sweep2: a NEW device signing in to an account whose courses are customised (sc_courses_custom=1,
// her own two courses, stock ones never on the account) uploads the profession's stock courses into
// the account. They are new ids, so the union keeps them on every device from then on.
import { makeServer, launch, device, flush, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const now = Date.now();
const course = (id, t) => ({ id, title: t, status: 'Published', price: 'Free', lessons: [{ id: 'l1', title: 'L1', body: 'x' }], _ts: now - 5000 });
const srv = makeServer({ sc_courses: JSON.stringify([course('c_mine1', 'Mine 1'), course('c_mine2', 'Mine 2')]), sc_courses_custom: '1',
  sc_professions: process.env.PROF ? process.env.PROF : undefined });
if (!process.env.PROF) delete srv.kv.sc_professions;
const b = await launch();
const A = await device(b, srv, 'A');
console.log('in-memory courses:', await A.evaluate(() => courses.map(x => x.id)), 'stored:', await A.evaluate(() => JSON.parse(_lsGet('sc_courses')||'[]').map(x => x.id)));
await A.evaluate(() => { courses[0].title = 'Mine 1 edited'; courses[0]._ts = Date.now(); persistCourses(); });
await flush(A);
const ids = JSON.parse(srv.kv.sc_courses).map(x => x.id);
check('account courses: no stock courses after the new device edits one of hers', ids.join() === 'c_mine1,c_mine2', ids);
const firstPut = srv.puts.find(p => p.keys.includes('sc_courses'));
console.log('first sc_courses upload:', firstPut && firstPut.dev, firstPut && JSON.parse(firstPut.items.sc_courses).map(x => x.id));
console.log('device local before pull? sc_courses keys in boot queue:', await A.evaluate(() => Object.keys(Cloud._bootQueued || {}).join(',')));
await b.close();
process.exit(report() ? 1 : 0);
