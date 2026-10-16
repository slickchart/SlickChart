// sweep3: tattoo aftercare. (1) "Start healing check-ins" on a client whose chart has no link token
// yet (just added / first sync not back / offline) marks the drip ON locally and shows "auto-send",
// but only POSTs /api/aftercare-drip when c._token exists, ignores a failed POST, and nothing re-sends
// it once the token arrives — clients.heal_started_at is never set, so cron-reminders sends nothing.
// (2) The healing-stage picker writes clientHealingStage in memory only; a pull before the next nav
// sweep (the app's own _resumePull on focus / 5-min timer) reloads sc_healing_stage over it.
import { makeServer, launch, device, flush, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const C = { c1: { id: 'c1', name: 'Tia Tattoo', email: 't@x.com', treatment: 'Tattoo', _ts: 1 } };
const srv = makeServer({ sc_clients: JSON.stringify(C), sc_professions: JSON.stringify(['tattoo']), sc_healing_stage: JSON.stringify({ c1: 0 }) });
const b = await launch();
const ph = await device(b, srv, 'phone');
const drips = [];
await ph.route('**/api/aftercare-drip', r => { drips.push(r.request().postData()); r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
// make sure the chart has no token yet
await ph.evaluate(() => { delete CL.c1._token; });
await ph.evaluate(() => { _startAftercareDrip('c1'); });
await sleep(500);
const st = await ph.evaluate(() => ({ active: _aftercareDripActive(CL.c1) }));
check('UI now says healing check-ins are on', st.active, st);
check('…but no /api/aftercare-drip was sent', drips.length > 0, drips);
// the token arrives (first sync answers) — does anything send the drip now?
await ph.evaluate(async () => { CL.c1._token = 't_c1'; try { await _syncSpecificClientsToServer(['c1'], {}); } catch (e) {} try { saveClients(); } catch (e) {} });
await sleep(1500); await flush(ph);
check('drip reaches the server once the chart has its token', drips.length > 0, drips);

// (2) healing stage picker, then the app's own resume pull
const sel = await ph.evaluate(() => typeof clientHealingStage !== 'undefined' ? clientHealingStage.c1 : 'n/a');
await ph.evaluate(() => { nav('client', 'c1'); }); await sleep(400); await flush(ph);
await ph.evaluate(() => { clientHealingStage['c1'] = 2; });   // exactly what the stage button's onclick does
await ph.evaluate(async () => { Cloud._lastPullAt = Date.now() - 60000; if (document.activeElement) document.activeElement.blur(); await _resumePull(); });
await flush(ph);
const after = await ph.evaluate(() => clientHealingStage.c1);
check('healing stage she picked survives _resumePull (was ' + sel + ', picked 2)', after === 2, { after, kv: srv.kv.sc_healing_stage });
await b.close();
process.exit(report() ? 1 : 0);
