// Lisa Joy (2026-11-13): "Is there a way to manually create completed treatment records for previous
// dates so each visit appears separately in the client's history?" Journey -> Add a past visit opens a
// blank note with a date; each saved date is its own visit; a note still being written is never lost.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { mk } from './sweep2-ui-lib.mjs';
const T = mk(); const W = process.env.ENGINE === 'webkit';
const b = await (W ? pw.webkit : pw.chromium).launch(W ? {} : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' });
const server = { sc_clients: JSON.stringify({ c1: { name: 'Mia Lopez', treatment: 'Facial' } }), sc_session_summaries: '{}', sc_hide_sample: '1' };
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss().catch(() => {}));
await p.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); } catch (e) {} });
await p.route('**/api/**', r => { const u = r.request().url(), m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: server }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(7000);
await p.evaluate(() => { activeNoteTemplate = 'soap'; nav('client', 'c1'); _setClientTab('c1', 'journey'); });
await p.waitForTimeout(300);
const btn = p.locator('.ctab[data-tab="journey"] button', { hasText: 'Add a past visit' });
T.check('Journey has an Add a past visit button', await btn.count() === 1);
async function addVisit(date, text) {
  await p.locator('button', { hasText: 'Add a past visit' }).first().click(); await p.waitForTimeout(300);
  const shown = await p.evaluate(() => ({ y: (d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))(new Date(Date.now() - 864e5)), title: document.getElementById('tt').textContent, date: document.getElementById('wn-date').value, s1: document.getElementById('wn-sec-s1').value }));
  await p.evaluate(([d, t]) => { document.getElementById('wn-date').value = d; document.getElementById('wn-sec-s1').value = t; _saveWriteNote('c1'); }, [date, text]);
  await p.waitForTimeout(300); return shown;
}
const iso = n => { const d = new Date(Date.now() - n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const s1 = await addVisit('2026-06-01', 'June facial, used Vitamin C serum');
T.check('opens a blank Write Note dated yesterday', s1.title === 'Write Note' && s1.date === s1.y && s1.s1 === '', JSON.stringify(s1));
await p.evaluate(() => { nav('client', 'c1'); _setClientTab('c1', 'journey'); }); await p.waitForTimeout(200);
const s2 = await addVisit('2026-08-15', 'August peel');
T.check('the second past visit opens blank too, not the first one', s2.s1 === '' && s2.date === s2.y, JSON.stringify(s2));
const h = await p.evaluate(() => (sessionSummaries.c1 || []).map(s => [s._draftDate, s.note]));
T.check('each past date is its own visit, newest first', h.length === 2 && h[0][0] === '2026-08-15' && h[1][0] === '2026-06-01' && /June/.test(h[1][1]) && /August/.test(h[0][1]), JSON.stringify(h));
await p.evaluate(() => nav('summary-history', 'c1')); await p.waitForTimeout(200);
T.check('Session summaries lists both and has the button', await p.locator('.summary-card').count() === 2 && await p.locator('button', { hasText: 'Add a past visit' }).count() === 1);
await p.evaluate(() => nav('write-note', 'c1')); await p.waitForTimeout(200);
const today = await p.evaluate(() => ({ date: document.getElementById('wn-date').value, s1: document.getElementById('wn-sec-s1').value, iso: _isoToday() }));
T.check("afterwards, today's note opens blank on today", today.date === today.iso && today.s1 === '', JSON.stringify(today));
// unsaved note in progress is kept
await p.evaluate(() => { document.getElementById('wn-sec-s1').value = 'TODAY unsaved'; _snapshotWriteNoteNow('c1'); nav('client', 'c1'); _setClientTab('c1', 'journey'); });
await p.waitForTimeout(200);
await p.locator('button', { hasText: 'Add a past visit' }).first().click(); await p.waitForTimeout(300);
const kept = await p.evaluate(() => ({ s1: document.getElementById('wn-sec-s1').value, n: sessionSummaries.c1.length }));
T.check('a note still being written is not thrown away', kept.s1 === 'TODAY unsaved' && kept.n === 2, JSON.stringify(kept));
T.check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
