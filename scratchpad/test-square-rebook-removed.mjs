// A client she REMOVED from her list (one of the big clean-ups) who books again online must come back,
// and get the first-visit prompt. Ashley, 2026-11-05: "I have a previous client who is in my square book
// online. she is not on my slickchart client list and it is not prompting to send the first visit package".
// Also: a booking made BEFORE the removal stays removed, a merged-away customer is never re-added, a
// regular from her Square history with no intake/invite gets the prompt, a client charted IN SlickChart
// does not, and the put-back survives a relaunch.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const ENGINE = process.env.ENGINE || 'chromium';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const DAY = 86400000, now = Date.now();
const delAt = now - 20 * DAY;
const iso = t => new Date(t).toISOString();
const acct = {
  real1: { name: 'Ashley Watson' },
  sq_sqcharted: { name: 'Charted Regular', squareId: 'SQCHARTED', source: 'square', sessions: 3, lastVisit: 'Oct 1, 2026' },
  sq_sqregular: { name: 'Square Regular', squareId: 'SQREGULAR', source: 'square' },
  sq_sqsurvivo: { name: 'Merge Survivor', squareId: 'SQSURVIVOR' },
};
const deleted = { sq_sqcomeback: delAt, sq_sqoldbook: delAt, sq_squndated: true };
const merged = { sq_sqmergedx: 1 };
const appts = [
  { id: 'a1', customerName: 'Come Back', customerId: 'SQCOMEBACK', customerEmail: 'comeback@example.test', startAt: iso(now + 3 * DAY), createdAt: iso(now - 1 * DAY), status: 'ACCEPTED' },
  { id: 'a2', customerName: 'Old Booking', customerId: 'SQOLDBOOK', startAt: iso(now + 4 * DAY), createdAt: iso(delAt - 5 * DAY), status: 'ACCEPTED' },
  { id: 'a3', customerName: 'Undated Delete', customerId: 'SQUNDATED', startAt: iso(now + 4 * DAY), createdAt: iso(now - DAY), status: 'ACCEPTED' },
  { id: 'a4', customerName: 'Merged Away', customerId: 'SQMERGEDX', startAt: iso(now + 5 * DAY), createdAt: iso(now - DAY), status: 'ACCEPTED' },
  { id: 'a5', customerName: 'Square Regular', customerId: 'SQREGULAR', startAt: iso(now + 2 * DAY), createdAt: iso(now - DAY), status: 'ACCEPTED' },
  { id: 'a6', customerName: 'Charted Regular', customerId: 'SQCHARTED', startAt: iso(now + 2 * DAY), createdAt: iso(now - DAY), status: 'ACCEPTED' },
];
const store = { sc_clients: JSON.stringify(acct), sc_hide_sample: '1', sc_deleted_clients: JSON.stringify(deleted), sc_merged_ids: JSON.stringify(merged) };
const pushed = {};
const b = await pw[ENGINE].launch(ENGINE === 'chromium' ? { executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
// her Square history: Square Regular has been in before (a past visit)
await p.addInitScript(() => { const iv = setInterval(() => { if (typeof _sqHistAppts === 'function' && !window.__hh) { window.__hh = 1; window._sqHistAppts = function () { return [{ at: new Date(Date.now() - 40 * 86400000), client: 'Square Regular', sqcid: 'SQREGULAR' }]; }; clearInterval(iv); } }, 5); });
const toasts = []; await p.exposeFunction('__toast', t => toasts.push(t));
await p.addInitScript(() => { const iv = setInterval(() => { if (typeof proToast === 'function' && !window.__tw) { window.__tw = 1; const o = proToast; window.proToast = function (m) { try { window.__toast(String(m)); } catch (e) {} return o.apply(this, arguments); }; clearInterval(iv); } }, 5); });
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: store }) });
  if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); const items = j.items || {}; if (Array.isArray(items)) items.forEach(it => { pushed[it.key] = it.value; store[it.key] = it.value; }); else Object.keys(items).forEach(k => { pushed[k] = items[k]; store[k] = items[k]; }); if (j.data && typeof j.data === 'object') Object.assign(store, j.data), Object.assign(pushed, j.data); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  if (u.includes('/api/square/appointments')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: appts }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(12000);
const st = await p.evaluate(() => {
  const by = n => Object.keys(CL).filter(k => CL[k] && CL[k].name === n);
  const fv = _fvpCandidates().map(e => e[1].name);
  return { comeback: by('Come Back'), old: by('Old Booking').length, undated: by('Undated Delete').length, merged: by('Merged Away').length,
    regular: by('Square Regular').length, fv, undel: _unDeletedClientIds() };
});
await p.evaluate(() => { try { nav('home'); } catch (e) {} }); await p.waitForTimeout(1500);
st.home = await p.evaluate(() => { try { return _attnTilesHTML().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); } catch (e) { return 'ERR ' + e.message; } });
st.homeScreen = await p.evaluate(() => document.body.innerText.slice(0, 1500));
check('removed client who booked again is back in the list, once', st.comeback.length === 1, JSON.stringify(st.comeback));
check('...under her own Square id', st.comeback[0] === 'sq_sqcomeback', st.comeback[0]);
check('...and the put-back is recorded', !!st.undel.sq_sqcomeback, JSON.stringify(st.undel));
check('a booking made BEFORE the removal stays removed', st.old === 0);
check('an undated delete record is left alone', st.undated === 0);
check('a customer merged into another chart is not re-added', st.merged === 0);
check('first-visit prompt offered for the client who came back', st.fv.includes('Come Back'), JSON.stringify(st.fv));
check('first-visit prompt offered for a Square regular never set up in SlickChart', st.fv.includes('Square Regular'), JSON.stringify(st.fv));
check('no prompt for a client charted in SlickChart', !st.fv.includes('Charted Regular'), JSON.stringify(st.fv));
check('Home shows the come-back nudge', /First visit for Come|Set up Come/.test(st.home), st.home.slice(0, 300));
check('...on the screen she sees', /First visit for Come|Set up Come/.test(st.homeScreen) && /Set up Square in SlickChart/.test(st.homeScreen), st.homeScreen.slice(0, 600));
check('Home words the regular as a set-up, not a first visit', /Set up Square in SlickChart/.test(st.home) && !/First visit for Square/.test(st.home), '');
check('the announcement names her', toasts.some(t => /Come booked online/.test(t)), toasts.join(' | '));
check('put-back reached the account', /sq_sqcomeback/.test(pushed.sc_undeleted_clients || '') , String(pushed.sc_undeleted_clients || '').slice(0, 200));
// relaunch: she must still be there, and not be announced again
await p.evaluate(() => { try { _flushSyncQueue && _flushSyncQueue(); } catch (e) {} });
await p.waitForTimeout(1500);
toasts.length = 0;
await p.reload(); await p.waitForTimeout(12000);
const st2 = await p.evaluate(() => ({ comeback: Object.keys(CL).filter(k => CL[k] && CL[k].name === 'Come Back').length, old: Object.values(CL).filter(c => c.name === 'Old Booking').length }));
check('after relaunch she is still in the list, once', st2.comeback === 1, JSON.stringify(st2));
check('after relaunch the old booking is still removed', st2.old === 0);
check('after relaunch no repeat announcement', !toasts.some(t => /booked online|bookings added/.test(t)), toasts.join(' | '));
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 220) : '')); }
console.log(`\n[${ENGINE}] ${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
