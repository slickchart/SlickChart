// sweep3: an in-place edit of a routine line reaches the client only from the input's onblur
// (_pushRoutine). If the screen is replaced while the input still has focus (she taps the bottom nav
// / back), does the edit still reach POST /api/clients?
import { makeServer, launch, device, flush, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const C = { c1: { id: 'c1', name: 'Amber Test', email: 'a@x.com', _ts: 1, _token: 't_c1' } };
const HC = { c1: ['Cleanse', 'SPF 50'] };
const srv = makeServer({ sc_clients: JSON.stringify(C), sc_client_homecare: JSON.stringify(HC) }, { c1: C.c1 });
const b = await launch();
const ph = await device(b, srv, 'phone');
await ph.evaluate(() => { nav('client', 'c1'); }); await sleep(500);
await ph.evaluate(() => { const b = Array.from(document.querySelectorAll('button,div')).find(x => x.textContent.trim() === 'Homecare' && x.offsetParent); if (b) b.click(); });
await sleep(400);
const inp = ph.locator('input[aria-label="Routine step 1"]');
await inp.click(); await inp.press('End'); await inp.type(' twice');
await sleep(300); await sleep(3000);  // wait > any debounce
const mid = srv.rows.c1 && srv.rows.c1.data && srv.rows.c1.data.aftercare;
// Tap the bottom-nav "Clients" tab with a real click
await ph.locator('text=Home').last().click().catch(() => {});
await sleep(3500); await flush(ph);
const after = srv.rows.c1 && srv.rows.c1.data && srv.rows.c1.data.aftercare;
check('edit reached the client blob after tapping away', JSON.stringify(after || []).indexOf('Cleanse twice') >= 0, { mid, after });
// Now the programmatic path: edit then nav() while input is focused (screen replaced, no blur)
await ph.evaluate(() => { nav('client', 'c1'); }); await sleep(400);
await ph.evaluate(() => { const b = Array.from(document.querySelectorAll('button,div')).find(x => x.textContent.trim() === 'Homecare' && x.offsetParent); if (b) b.click(); });
await sleep(300);
const inp2 = ph.locator('input[aria-label="Routine step 2"]');
await inp2.click(); await inp2.press('End'); await inp2.type(' daily');
await ph.evaluate(() => { const a = document.activeElement; window._blurSeen = false; a && a.addEventListener('blur', () => { window._blurSeen = true; }); nav('home'); });
await sleep(3500); await flush(ph);
const after2 = srv.rows.c1 && srv.rows.c1.data && srv.rows.c1.data.aftercare;
const bl = await ph.evaluate(() => window._blurSeen);
check('edit reached the client when the screen was replaced under the focused input (blur fired: ' + bl + ')', JSON.stringify(after2 || []).indexOf('SPF 50 daily') >= 0, after2);
await b.close();
process.exit(report() ? 1 : 0);
