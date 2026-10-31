// Face chart, the whole flow a provider will try (Ashley, 2026-10-31: "find any bugs before people start
// trying it"). Phone and computer sizes, every mark type, save/reopen, edit/delete, closing without
// Save, separate visits, format switch, client-facing text, summary-first, odd text, a second device,
// and the full backup. Screenshots land in scratchpad/fc-shots/.
import { launch, page, mk } from './sweep2-ui-lib.mjs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const T = mk();
const SHOTS = new URL('./fc-shots/', import.meta.url).pathname;
const server = { sc_clients: JSON.stringify({ c1: { name: 'Jennie Milla', treatment: 'Facial' }, c2: { name: 'Ava Stone', treatment: 'Peel' } }), sc_professions: JSON.stringify(['esty']) };
const { b, ctx } = await launch();
const boot = async (c, srv) => { const r = await page(c, srv); await r.p.goto('http://localhost:8899/slickchart.html'); await r.p.waitForTimeout(6000); return r; };
const tapFace = async (p, fx, fy) => { await p.locator('#fc-svg').scrollIntoViewIfNeeded(); const bx = await p.locator('#fc-svg').boundingBox(); await p.mouse.click(bx.x + bx.width * fx, bx.y + bx.height * fy); };
const openChart = async p => { await p.locator('#fc-field button').click(); await p.waitForSelector('#fc-svg'); };
const types = ['acne','pigment','redness','dry','congest','lines','scar','milia','treat','avoid','other'];
const spots = [[.5,.2],[.3,.55],[.7,.55],[.25,.27],[.75,.27],[.38,.4],[.62,.4],[.5,.5],[.5,.7],[.5,.8],[.5,.93]];

// ── 1. Phone and computer: every type, overlay fits, Save reachable ──
for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['small phone', { width: 320, height: 568 }], ['computer', { width: 1280, height: 800 }]]) {
  const c2 = await b.newContext({ viewport: vp, timezoneId: 'America/Los_Angeles' });
  const { p, errs } = await boot(c2, JSON.parse(JSON.stringify(server)));
  await p.evaluate(() => { activeNoteTemplate = 'soap'; nav('write-note', 'c1'); });
  await openChart(p);
  for (let i = 0; i < types.length; i++) { await p.evaluate(t => _fcSetType(t), types[i]); await tapFace(p, spots[i][0], spots[i][1]); }
  const got = await p.evaluate(() => _fcDraft.marks.map(m => m.type + ':' + m.area));
  T.check(`${label}: all 11 mark types placed`, got.length === 11 && types.every((t, i) => got[i].startsWith(t + ':')), got.join(', '));
  const ov = await p.evaluate(() => { const o = document.querySelector('#face-chart-ov > div').getBoundingClientRect(); return { w: o.width, l: o.left, r: o.right, vw: innerWidth, sw: document.documentElement.scrollWidth }; });
  T.check(`${label}: chart window fits the screen width`, ov.l >= 0 && ov.r <= ov.vw + 0.5, JSON.stringify(ov));
  await p.screenshot({ path: SHOTS + `editor-${label.replace(' ', '-')}.png` });
  await p.locator('text=Save chart').scrollIntoViewIfNeeded(); await p.locator('text=Save chart').click();
  const line = await p.evaluate(() => document.getElementById('wn-sec-s1').value);
  T.check(`${label}: Save chart reachable and writes all 11 to the note`, (line.match(/; /g) || []).length === 10, line);
  T.check(`${label}: no page errors`, !errs.length, errs.join(' | '));
  await c2.close();
}

// ── 2..9 on a phone ──
const srv = JSON.parse(JSON.stringify(server));
const { p, errs } = await boot(ctx, srv);
await p.evaluate(() => { activeNoteTemplate = 'soap'; nav('write-note', 'c1'); });
await p.fill('#wn-sec-s1', 'Client reports dryness.');
await openChart(p);
await tapFace(p, .3, .55); await p.evaluate(() => _fcSetType('treat')); await tapFace(p, .5, .2); await p.evaluate(() => _fcSetType('pigment')); await tapFace(p, .7, .55);
await p.click('text=Save chart');
// reopen: marks back, edit area of #1, delete #2, save
await openChart(p);
T.check('reopen shows the saved marks', await p.evaluate(() => _fcDraft.marks.length === 3));
await p.locator('#fc-list input[aria-label="Area"]').first().fill('Right cheek, near jaw');
await p.locator('button[aria-label="Remove mark 2"]').click();
await p.click('text=Save chart');
let v = await p.evaluate(() => document.getElementById('wn-sec-s1').value);
T.check('edit + delete: renumbered, edited area, typed text kept', v.startsWith('Face chart: 1. Right cheek, near jaw, Breakout; 2. Left cheek, Pigmentation') && v.includes('Client reports dryness.') && !v.includes('Treated area'), v);
// closing without Save keeps the marks (X), and a tap outside too
await openChart(p); await tapFace(p, .5, .5); await p.click('button[aria-label="Close"]');
T.check('closing with the X keeps a new mark', await p.evaluate(() => providerNoteDrafts.c1.faceChart.marks.length === 3));
await openChart(p); await tapFace(p, .5, .7); await p.mouse.click(5, 5);
T.check('a tap outside the chart keeps a new mark', await p.evaluate(() => providerNoteDrafts.c1.faceChart.marks.length === 4 && !document.getElementById('face-chart-ov')));
await openChart(p); const tsBefore = await p.evaluate(() => providerNoteDrafts.c1.faceChart.ts); await p.click('button[aria-label="Close"]');
T.check('opening and closing with no change changes nothing', await p.evaluate(t => providerNoteDrafts.c1.faceChart.ts === t, tsBefore));
// typing after charting keeps chart; date set to 3 days ago = visit 1
const d1 = await p.evaluate(() => { const d = new Date(Date.now() - 3 * 864e5); return d.toISOString().slice(0, 10); });
await p.fill('#wn-date', d1); await p.fill('#wn-sec-s2', 'Dehydrated'); await p.evaluate(() => _snapshotWriteNoteNow('c1'));
await p.evaluate(() => _saveWriteNote('c1'));
T.check('visit 1 saved with its 4 marks', await p.evaluate(d => { const h = sessionSummaries.c1.find(x => x._draftDate === d); return h && h.faceChart && h.faceChart.marks.length === 4; }, d1));
// ── next visit: the finished draft retires, a fresh chart; each visit keeps its own ──
await p.evaluate(() => { providerNoteDrafts.c1.committedAt = Date.now() - 20 * 3600e3; nav('write-note', 'c1'); });
T.check('next visit starts with an empty chart', /Tap to mark areas/.test(await p.locator('#fc-field').innerText()));
await openChart(p);
T.check('next visit offers last visit\'s chart', await p.locator('text=Start from last visit').count() === 1);
await p.evaluate(() => _fcSetType('milia')); await tapFace(p, .4, .42); await p.click('text=Save chart');
await p.fill('#wn-sec-s1', (await p.evaluate(() => document.getElementById('wn-sec-s1').value)) + '\nMilia under eyes.');
await p.evaluate(() => _saveWriteNote('c1'));
const recs = await p.evaluate(() => sessionSummaries.c1.map(h => ({ d: h._draftDate, n: h.faceChart ? h.faceChart.marks.length : 0, t: h.faceChart ? h.faceChart.marks.map(m => m.type).join(',') : '' })));
T.check('two visits, each with its own chart', recs.length === 2 && recs.some(r => r.d === d1 && r.n === 4) && recs.some(r => r.d !== d1 && r.n === 1 && r.t === 'milia'), JSON.stringify(recs));
const i1 = await p.evaluate(d => sessionSummaries.c1.findIndex(h => h._draftDate === d), d1);
await p.evaluate(i => { nav('session-detail', 'c1:' + i); try { switchSessionDetailTab('provider'); } catch (e) {} }, i1);
const h1 = await p.evaluate(() => S.innerHTML);
T.check('visit 1 record shows its own chart, not the new one', h1.includes('Right cheek, near jaw') && !h1.includes('Milia'));
await p.screenshot({ path: SHOTS + 'record-visit1.png' });
// ── switching note format keeps one chart line ──
await p.evaluate(() => { activeNoteTemplate = 'dap'; nav('write-note', 'c1'); });
T.check('format switch: chart still there', /1 mark/.test(await p.locator('#fc-field').innerText()));
await openChart(p); await tapFace(p, .5, .2); await p.click('text=Save chart');
const firstDap = await p.evaluate(() => { const t = noteTemplates[activeNoteTemplate]; return document.getElementById('wn-sec-' + t.sections[0].id).value; });
T.check('format switch: one Face chart line, in the new first field', firstDap.split('Face chart:').length === 2, firstDap);
await p.evaluate(() => { activeNoteTemplate = 'soap'; });
// ── client-facing text never carries the chart line ──
const friendly = await p.evaluate(() => _clientFriendlyFromNotes('c1', CL.c1));
T.check('plain client note (no AI) leaves out the chart line', friendly && !/Face chart|Milia,/.test(friendly) && /Milia under eyes/.test(friendly), friendly);
await p.evaluate(() => nav('session-summary', 'c1'));
T.check('summary screen preview leaves out the chart line', !(await p.evaluate(() => S.innerText)).includes('Face chart:'));
await p.evaluate(() => { summaryNoteDraft.c1 = 'Lovely visit today.'; _storeSummary('c1'); });
const after = await p.evaluate(() => { const h = sessionSummaries.c1[0]; return { fc: !!(h.faceChart && h.faceChart.marks.length), client: JSON.stringify(CL.c1.summaries || []) }; });
T.check('sending the summary keeps the record\'s chart', after.fc, JSON.stringify(after));
T.check('the client\'s copy has no chart in it', !/Face chart|faceChart/.test(after.client), after.client.slice(0, 300));
// ── summary sent before "Just save" still records the chart ──
await p.evaluate(() => { nav('write-note', 'c2'); });
await openChart(p); await tapFace(p, .5, .2); await p.click('text=Save chart');
await p.evaluate(() => { summaryNoteDraft.c2 = 'Thanks!'; _storeSummary('c2'); });
T.check('summary-first: the record still gets the chart', await p.evaluate(() => !!(sessionSummaries.c2 && sessionSummaries.c2[0].faceChart && sessionSummaries.c2[0].faceChart.marks.length === 1)));
// ── odd text is shown as text ──
await p.evaluate(() => { delete providerNoteDrafts.c2; nav('write-note', 'c2'); });
await openChart(p); await tapFace(p, .3, .55);
await p.locator('#fc-list input[aria-label="Area"]').first().fill('<img src=x onerror=window.__x=1>');
await p.locator('#fc-list input[aria-label="Note"]').first().fill(`Client's "red" spot & <b>`);
await p.click('text=Save chart'); await openChart(p);
const kept = await p.evaluate(() => [document.querySelector('#fc-list input[aria-label="Note"]').value, document.querySelector('#fc-list input[aria-label="Area"]').value]);
T.check('apostrophes, quotes and < > round-trip in the editor', kept[0] === `Client's "red" spot & <b>` && kept[1] === '<img src=x onerror=window.__x=1>', JSON.stringify(kept));
await p.click('button[aria-label="Close"]');
await p.evaluate(() => { _saveWriteNote('c2'); nav('session-detail', 'c2:0'); try { switchSessionDetailTab('provider'); } catch (e) {} });
await p.waitForTimeout(300);
T.check('odd text never runs as code', await p.evaluate(() => !window.__x && S.innerHTML.includes('&lt;img src=x')));
// ── dark theme record ──
await p.evaluate(i => { try { document.documentElement.setAttribute('data-theme', 'dark'); document.body.classList.add('dark'); } catch (e) {} nav('session-detail', 'c1:' + i); try { switchSessionDetailTab('provider'); } catch (e) {} }, i1);
await p.screenshot({ path: SHOTS + 'record-dark.png' });
// ── full backup carries the charts ──
const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => _exportAllData())]);
const bk = SHOTS + 'backup.json'; await dl.saveAs(bk);
const data = JSON.parse(fs.readFileSync(bk, 'utf8')).data;
T.check('full backup includes each visit\'s chart', JSON.stringify(data.sc_session_summaries || '').includes('faceChart') && JSON.stringify(data.sc_session_summaries).includes('Right cheek, near jaw'));
fs.unlinkSync(bk);
T.check('no page errors (main run)', !errs.length, errs.join(' | '));

// ── a second device: same account, reads the chart ──
await p.evaluate(() => { nav('write-note', 'c1'); });
await p.waitForTimeout(2500);   // let the uploads land in the mock account
const ctxB = await b.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'America/Los_Angeles' });
const B = await boot(ctxB, JSON.parse(JSON.stringify(srv)));
const onB = await B.p.evaluate(() => ({ draft: !!(providerNoteDrafts.c1 && providerNoteDrafts.c1.faceChart), recs: (sessionSummaries.c1 || []).filter(h => h.faceChart).length }));
T.check('second device: both visits\' charts arrive', onB.recs === 2, JSON.stringify(onB));
T.check('second device: today\'s in-progress chart arrives', onB.draft, JSON.stringify(onB));
await B.p.evaluate(() => { activeNoteTemplate = 'soap'; nav('write-note', 'c1'); });
T.check('second device: editor shows the chart', /Edit face chart/.test(await B.p.locator('#fc-field').innerText()));
T.check('second device: no page errors', !B.errs.length, B.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
