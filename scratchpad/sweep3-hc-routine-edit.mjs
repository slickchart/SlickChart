// sweep3: Build a Routine -> "Sent to clients" -> Edit -> drop a product -> Send. confirmSendRoutine
// only ADDS the draft's products to clientRecs[cid]; products that were in the previously sent
// routine and were taken out stay on the client's plan, so the client keeps seeing them.
import { makeServer, launch, device, flush, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const C = { c1: { id: 'c1', name: 'Amber Test', email: 'a@x.com', _ts: 1, _token: 't_c1' } };
const AL = [{ id: 'p1', name: 'Gentle Cleanser', brand: 'B', icon: '🧴', active: true }, { id: 'p2', name: 'Retinol 0.5', brand: 'B', icon: '🧴', active: true }, { id: 'p3', name: 'SPF 50', brand: 'B', icon: '🧴', active: true }];
const srv = makeServer({ sc_clients: JSON.stringify(C), sc_affiliate_links: JSON.stringify(AL) }, { c1: C.c1 });
const b = await launch();
const ph = await device(b, srv, 'phone');
await ph.evaluate(async () => { routineDraft = { name: 'Night', items: ['p1', 'p2', 'p3'], note: '' }; await confirmSendRoutine('c1'); });
await sleep(1500); await flush(ph);
const sent1 = (srv.rows.c1.data.products || []).map(p => p.name);
check('first send: client gets 3 products', sent1.length === 3, sent1);
// edit the sent routine: take Retinol out, send again
await ph.evaluate(async () => { editSentRoutine('c1'); routineDraft.items = routineDraft.items.filter(x => x !== 'p2'); await confirmSendRoutine('c1'); });
await sleep(1500); await flush(ph);
const sent2 = (srv.rows.c1.data.products || []).map(p => p.name);
const routineRec = await ph.evaluate(() => currentSentRoutines().c1.items);
check('after editing the routine to drop Retinol, the client no longer gets Retinol', sent2.indexOf('Retinol 0.5') < 0, { clientProducts: sent2, routineNowHas: routineRec });
await b.close();
process.exit(report() ? 1 : 0);
