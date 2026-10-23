// Bug check of the 2026-10-22 features through every route (Ashley: "thoroughly bug check all these new
// features in every route you can think of").
//   (cd slickchart-vercel && python3 -m http.server 8899) & node scratchpad/test-1022-edge-routes.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899; const ENGINE = process.env.ENGINE || 'chromium';
const results = []; const check = (n, p, d) => results.push({ n, pass: !!p, d: d || '' });
const launchOpts = ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' };
const b = await pw[ENGINE].launch(launchOpts);
const now = new Date();
const iso = (y, m, d, h) => new Date(y, m, d, h || 10, 0, 0).toISOString();
const clients = { c_bon: { name: 'Bonnie Vale', _token: 'TOKB' }, c_amy: { name: 'Amy Pond' } };
for (let i = 0; i < 120; i++) clients['c' + i] = { name: 'Client ' + String(i).padStart(3, '0') };
async function boot(opts) {
  opts = opts || {};
  const kv = Object.assign({ sc_hide_sample: '1', sc_onboarded: '1', sc_clients: JSON.stringify(clients) }, opts.kv || {});
  const st = { from: [], live: 0, histFail: !!opts.histFail, kv, extra: [] };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: opts.tz || 'America/Los_Angeles' });
  const p = await ctx.newPage(); st.errs = []; p.on('pageerror', e => st.errs.push(e.message));
  await p.addInitScript((tok) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); if (tok) localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); }, opts.noCloud ? '' : '1');
  await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...kv } }) });
    if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(kv, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    if (u.includes('/api/square/appointments')) { const f = new URL(u).searchParams.get('from');
      if (f) { st.from.push(f); if (st.histFail) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' });
        const [y, mo] = f.split('-').map(Number);
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: [
          { id: 'H' + f, startAt: iso(y, mo - 1, 12), customerName: 'Bonnie Vale', durationMinutes: 60, serviceName: 'Facial 60 min', status: 'ACCEPTED' },
          { id: 'H2' + f, startAt: iso(y, mo - 1, 1, 0), customerName: 'Nobody Known', durationMinutes: 30, serviceName: '', status: 'ACCEPTED' },
          { id: 'LIVE1', startAt: new Date(now.getTime() + 864e5).toISOString(), customerName: 'Amy Pond', durationMinutes: 60, serviceName: 'Peel', status: 'ACCEPTED' }].concat(st.extra) }) }); }
      st.live++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: [{ id: 'LIVE1', startAt: new Date(now.getTime() + 864e5).toISOString(), customerName: 'Amy Pond', durationMinutes: 60, serviceName: 'Peel', status: 'ACCEPTED' }] }) }); }
    if (u.includes('/api/square/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"customers":[],"retail":[],"services":[],"invoices":[]}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForFunction(() => typeof Cloud !== 'undefined' && (Cloud._pulledOnce || !Cloud.token), null, { timeout: 30000 });
  await p.waitForTimeout(900);
  return { p, ctx, st };
}

// ── CALENDAR ──
{
  const { p, ctx, st } = await boot();
  await p.evaluate(() => _loadSquareAppts(true)); await p.waitForTimeout(400);
  await p.evaluate(() => nav('calendar')); await p.waitForTimeout(800);
  const cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  check('cal: this month loads its earlier days once', now.getDate() <= 2 ? st.from.length === 0 : (st.from.filter(f => f.startsWith(cur)).length === 1), JSON.stringify(st.from));
  const n0 = st.from.length;
  await p.evaluate(() => { _calGo(1); _calGo(1); }); await p.waitForTimeout(500);
  check('cal: future months ask nothing extra', st.from.length === n0, JSON.stringify(st.from));
  await p.evaluate(() => { _calToday(); _calGo(-1); }); await p.waitForTimeout(800);
  await p.evaluate(() => { _calGo(-1); }); await p.waitForTimeout(800);
  await p.evaluate(() => { _calGo(1); }); await p.waitForTimeout(500);
  const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1); const pk = pm.getFullYear() + '-' + String(pm.getMonth() + 1).padStart(2, '0');
  check('cal: each past month is read once, even going back and forth', st.from.filter(f => f.startsWith(pk)).length === 1 && st.from.length === n0 + 2, JSON.stringify(st.from));
  await p.evaluate((k) => _calPick(k + '-12'), pk);
  const D = await p.evaluate(() => S.innerText);
  check('cal: past visit shows "Facial 60 min · Square" without "60 min" twice', /Bonnie Vale/.test(D) && /Facial 60 min/.test(D) && !/60 min · 60 min/.test(D), D.slice(0, 400).replace(/\n/g, ' | '));
  const all = await p.evaluate(() => _allApptsUnified().filter(a => a.id === 'LIVE1').length);
  check('cal: an appointment in both lists shows once', all === 1, 'LIVE1 x' + all);
  await p.evaluate(() => { const r = [...S.querySelectorAll('[onclick]')].find(x => /Bonnie Vale/.test(x.innerText) && /nav\('client'/.test(x.getAttribute('onclick'))); if (r) r.click(); });
  check('cal: tapping a past visit opens that client', await p.evaluate(() => _navCur.screen === 'client' && _navCur.data === 'c_bon'), await p.evaluate(() => JSON.stringify(_navCur)));
  await p.evaluate(() => navBack());
  check('cal: Back returns to the same month and day', await p.evaluate(() => _navCur.screen === 'calendar' && /Bonnie Vale/.test(S.innerText)), '');
  await p.evaluate((k) => _calPick(k + '-01'), pk);
  check('cal: a visit for someone not on the list still shows, without breaking the tap', /Nobody Known/.test(await p.evaluate(() => S.innerText)), '');
  check('cal: home, check-ins and next-visit only see upcoming bookings', await p.evaluate(() => squareAppts.length === 1 && _realApptsMerged().every(a => a.id !== 'H' || true) && !_realApptsMerged().some(a => String(a.id || '').startsWith('H'))), '');
  check('cal: no page errors', !st.errs.length, st.errs.join(' / '));
  await ctx.close();
}
{
  const { p, ctx, st } = await boot({ histFail: true });
  await p.evaluate(() => _loadSquareAppts(true)); await p.waitForTimeout(300);
  await p.evaluate(() => { nav('calendar'); _calGo(-1); }); await p.waitForTimeout(2500);
  const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1); const pk = pm.getFullYear() + '-' + String(pm.getMonth() + 1).padStart(2, '0');
  check('cal: a failed read says so', /Could not load past visits/.test(await p.evaluate(() => S.innerText)), '');
  check('cal: a failed read does not retry in a loop', st.from.filter(f => f.startsWith(pk)).length === 1, JSON.stringify(st.from));
  st.histFail = false; await p.evaluate((k) => { _sqHist[k].at = Date.now() - 61000; renderCalendar(); }, pk); await p.waitForTimeout(800);
  check('cal: it recovers on its own after a minute', !/Could not load past visits/.test(await p.evaluate(() => S.innerText)) && st.from.filter(f => f.startsWith(pk)).length === 2, JSON.stringify(st.from));
  await ctx.close();
}
{
  const { p, ctx, st } = await boot({ noCloud: true });
  await p.evaluate(() => { nav('calendar'); _calGo(-1); _calGo(-1); }); await p.waitForTimeout(600);
  check('cal: without Square nothing is asked and nothing breaks', st.from.length === 0 && !st.errs.length, JSON.stringify(st.from) + st.errs.join('/'));
  await ctx.close();
}
{ // Far-east and far-west time zones: a visit at 00:30 on the 1st and 23:30 on the last day, in HER time.
  for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    const { p, ctx, st } = await boot({ tz });
    const T = await p.evaluate(() => { const n = new Date(); const y = n.getFullYear(), m = n.getMonth() - 1; const dim = new Date(y, m + 1, 0).getDate();
      return { first: new Date(y, m, 1, 0, 30).toISOString(), last: new Date(y, m, dim, 23, 30).toISOString(), k: new Date(y, m, 1).getFullYear() + '-' + String(new Date(y, m, 1).getMonth() + 1).padStart(2, '0'), dim }; });
    st.extra = [{ id: 'TZ1', startAt: T.first, customerName: 'First Day', durationMinutes: 30, status: 'ACCEPTED' }, { id: 'TZ2', startAt: T.last, customerName: 'Last Day', durationMinutes: 30, status: 'ACCEPTED' }];
    await p.evaluate(() => _loadSquareAppts(true)); await p.waitForTimeout(300);
    await p.evaluate(() => { nav('calendar'); _calGo(-1); }); await p.waitForTimeout(900);
    const f = st.from.find(x => x.startsWith(T.k));
    // The server's window for that request (same arithmetic as api/square/appointments.js).
    const days = +(f ? 0 : 0);
    const req = await p.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('from=')).pop() || '');
    const q = new URL(req).searchParams; const start = new Date(q.get('from') + 'T00:00:00Z').getTime() - 14 * 3600e3; const end = start + Math.min(+q.get('days'), 45) * 864e5;
    const inWin = t => { const x = new Date(t).getTime(); return x >= start && x < end; };
    check('cal ' + tz + ': the server window covers the first and last minute of her month', inWin(T.first) && inWin(T.last), JSON.stringify({ req, ...T }));
    const a = await p.evaluate((k) => { _calPick(k + '-01'); return S.innerText; }, T.k);
    const z = await p.evaluate(([k, d]) => { _calPick(k + '-' + String(d).padStart(2, '0')); return S.innerText; }, [T.k, T.dim]);
    check('cal ' + tz + ': first-of-month and last-of-month visits land on the right days', /First Day/.test(a) && /Last Day/.test(z), '');
    await ctx.close();
  }
}

// ── BACK ──
{
  const { p, ctx, st } = await boot();
  const tryBack = async (screen, data, to, toData) => {
    await p.evaluate(([s, d]) => nav(s, d), [screen, data]);
    await p.evaluate(() => { S.scrollTop = 900; window.scrollTo(0, 900); });
    const y0 = await p.evaluate(() => Math.max(S.scrollTop, window.scrollY));
    await p.evaluate(([s, d]) => nav(s, d), [to, toData]);
    await p.evaluate(() => navBack()); await p.waitForTimeout(150);
    const y1 = await p.evaluate(() => Math.max(S.scrollTop, window.scrollY));
    return { y0, y1, on: await p.evaluate(() => _navCur.screen) };
  };
  const F = await tryBack('forms', null, 'form-builder', await p.evaluate(() => _profFormDefs()[5].id));
  check('back: Forms list keeps its place after editing a form', F.on === 'forms' && (F.y0 < 50 || Math.abs(F.y1 - F.y0) < 40), JSON.stringify(F));
  const C = await tryBack('clients', null, 'client', 'c60');
  check('back: Clients keeps its place after opening a client', C.on === 'clients' && C.y0 > 300 && Math.abs(C.y1 - C.y0) < 40, JSON.stringify(C));
  const K = await tryBack('client', 'c_bon', 'client-forms', 'c_bon');
  check('back: a client file keeps its place', K.on === 'client' && (K.y0 < 50 || Math.abs(K.y1 - K.y0) < 40), JSON.stringify(K));
  // The bottom bar is a fresh start, not Back.
  await p.evaluate(() => { nav('clients'); S.scrollTop = 800; window.scrollTo(0, 800); nav('client', 'c60'); nav('clients'); });
  check('back: tapping Clients in the bottom bar starts at the top', await p.evaluate(() => Math.max(S.scrollTop, window.scrollY)) < 5, '');
  // Hardware back / gesture uses the same path.
  await p.evaluate(() => { nav('clients'); S.scrollTop = 700; window.scrollTo(0, 700); nav('client', 'c50'); _scBack(); });
  await p.waitForTimeout(150);
  check('back: the phone back gesture keeps the place too', Math.abs(await p.evaluate(() => Math.max(S.scrollTop, window.scrollY)) - 700) < 40, '');
  // A client deleted while you were in their file: Back still lands safely.
  await p.evaluate(() => { nav('clients'); nav('client', 'c70'); delete CL.c70; navBack(); });
  check('back: after the client was removed, Back lands on Clients without errors', await p.evaluate(() => _navCur.screen === 'clients') && !st.errs.length, st.errs.join('/'));
  await ctx.close();
}

// ── PREVIEW: every form, every profession, from every picker ──
{
  const { p, ctx, st } = await boot({ kv: {} });
  const R = await p.evaluate(() => {
    const keep = selectedProfessions.slice();
    selectedProfessions.length = 0; Object.keys(_FORM_DEFS_BY_PROF).forEach(k => { if (!/coll$/.test(k)) selectedProfessions.push(k); });
    const ids = _profFormDefs().map(f => f.id); const bad = [];
    ids.forEach(id => { try { _formPreviewSheet(id); const o = document.getElementById('form-preview-sheet'); if (!o || !o.querySelector('.scf-q') && (formTmpls[id] && (formTmpls[id].qs || []).length)) bad.push(id); if (o) o.remove(); } catch (e) { bad.push(id + ':' + e.message); } });
    selectedProfessions.length = 0; keep.forEach(x => selectedProfessions.push(x));
    return { n: ids.length, bad };
  });
  check('preview: every form of every profession and collection opens (' + R.n + ')', R.n > 100 && !R.bad.length, JSON.stringify(R.bad.slice(0, 5)));
  await p.evaluate(() => _formPreviewSheet('no-such-form'));
  check('preview: an unknown form does nothing, no error', await p.evaluate(() => !document.getElementById('form-preview-sheet')) && !st.errs.length, st.errs.join('/'));
  // From the bundle editor: the Preview button must not tick/untick the form.
  await p.evaluate(() => { bundles.push({ id: 'b1', name: 'Test', formIds: [], resourceIds: [] }); saveBundles(); nav('edit-bundle', 'b1'); });
  await p.evaluate(() => { const bt = [...S.querySelectorAll('label button')].find(x => /Preview/.test(x.innerText)); bt.click(); });
  check('preview: from the bundle editor it opens and does not tick the form', await p.evaluate(() => !!document.getElementById('form-preview-sheet') && bundles.find(x => x.id === 'b1').formIds.length === 0), await p.evaluate(() => JSON.stringify(bundles.find(x => x.id === 'b1').formIds)));
  await p.evaluate(() => document.getElementById('form-preview-sheet').remove());
  // Over the send sheet, the phone back gesture closes the preview first, then the sheet.
  await p.evaluate(() => { nav('client', 'c_bon'); openClientFormSender('c_bon'); [...document.querySelectorAll('#sendform-sheet button')].find(b => /Preview/.test(b.innerText)).click(); _scBack(); });
  check('preview: back gesture closes the preview and leaves the send sheet', await p.evaluate(() => !document.getElementById('form-preview-sheet') && !!document.getElementById('sendform-sheet')), '');
  check('preview: no page errors', !st.errs.length, st.errs.join(' / '));
  await ctx.close();
}

// ── WELCOME PACKAGES: every way in ──
{
  const { p, ctx, st } = await boot();
  await p.evaluate(() => { window.inviteClientToApp = () => {}; window._pushClientNow = async () => ({ ok: true });
    const f = _profFormDefs().map(x => x.id);
    bundles.push({ id: 'b_tan', name: 'Spray tan <b>welcome</b>', formIds: [f[0]], resourceIds: [], newClient: true, checkinHide: ['warmth'] });
    bundles.push({ id: 'b_fac', name: 'Facial', formIds: [f[1]], resourceIds: [] }); saveBundles(); });
  const ways = {
    'Messages > share sheet': () => { _chatShareSheet('c60'); const el = [...document.querySelectorAll('[onclick]')].find(x => /sendFirstVisitPackage\('c60'\)/.test(x.getAttribute('onclick'))); if (!el) return 'none'; el.click(); return 'ok'; },
    'Home first-visit nudge': () => { const h = _firstVisitNudgeHTML('c61', new Date(Date.now() + 864e5)); const d = document.createElement('div'); d.innerHTML = h; document.body.appendChild(d); const el = [...d.querySelectorAll('[onclick]')].find(x => /sendFirstVisitPackage/.test(x.getAttribute('onclick'))); if (!el) { d.remove(); return 'none'; } el.click(); d.remove(); return 'ok'; },
    'Forms > First-visit package > pick client': () => { sendFirstVisitPackagePicker(); const bt = [...document.querySelectorAll('#send-fvp-sheet button')].find(x => /Bonnie/.test(x.innerText)); bt.click(); return 'ok'; },
    'Send to sheet > Start here': () => { openClientFormSender('c_bon'); const bt = [...document.querySelectorAll('#sendform-sheet button')].find(x => /sendFirstVisitPackage/.test(x.getAttribute('onclick') || '')); bt.click(); return 'ok'; },
  };
  for (const [w, fn] of Object.entries(ways)) {
    const r = await p.evaluate(fn); await p.waitForTimeout(200);
    const C = await p.evaluate(() => { const s = document.getElementById('fvp-choose-sheet'); const o = { open: !!s, html: s ? s.innerHTML : '' }; if (s) s.remove(); return o; });
    check('welcome: ' + w + ' opens the package chooser', r === 'ok' && C.open, r);
    if (w === 'Messages > share sheet') check('welcome: bundle names are shown as text, never as HTML', C.html.includes('&lt;b&gt;welcome') && !C.html.includes('<b>welcome'), '');
  }
  // New client flow: invite + intake ticked -> chooser.
  await p.evaluate(() => { _ncNextChecks.invite = true; _ncNextChecks.intake = true; _ncNextContinue('c_amy'); });
  check('welcome: the new-client "Send first-visit package" button opens the chooser', await p.evaluate(() => { const s = document.getElementById('fvp-choose-sheet'); const ok = !!s; if (s) s.remove(); return ok; }), '');
  // No standard intake: chooser preselects the first package, Send never sends an empty package.
  await p.evaluate(() => { window.__keep = _ncIntakeFormId; window._ncIntakeFormId = () => null; bundles.forEach(b => delete b.newClient); saveBundles(); sendFirstVisitPackage('c_amy'); });
  const NI = await p.evaluate(() => ({ sel: _fvpSel, std: /Standard intake/.test(document.getElementById('fvp-choose-sheet').innerText) }));
  check('welcome: with no standard intake the first package is picked and "Standard" is not offered', NI.sel === 'b_tan' && !NI.std, JSON.stringify(NI));
  await p.evaluate(() => { document.querySelector('#fvp-choose-sheet .btnp').click(); }); await p.waitForTimeout(400);
  check('welcome: ...and it sends that package', await p.evaluate(() => (CL.c_amy.pendingForms || []).length > 0 && JSON.stringify(CL.c_amy.checkinHide) === '["warmth"]'), await p.evaluate(() => JSON.stringify(CL.c_amy.pendingForms)));
  await p.evaluate(() => { window._ncIntakeFormId = window.__keep; });
  // Every OTHER client's check-in is untouched, and the shared config object is never changed.
  const G = await p.evaluate(() => { const before = JSON.stringify(checkinCfg); const d = _assembleClientData('c_amy'); const d2 = _assembleClientData('c_bon'); return { same: JSON.stringify(checkinCfg) === before, amy: d.checkinCfg.blankets.length, bon: d2.checkinCfg.blankets.length }; });
  check('welcome: the trim applies to that client only and never edits your check-in settings', G.same && G.amy === 0 && G.bon > 0, JSON.stringify(G));
  check('welcome: no page errors', !st.errs.length, st.errs.join(' / '));
  await ctx.close();
}

// ── FORM FOLDERS ──
{
  const { p, ctx, st } = await boot();
  const R = await p.evaluate(() => {
    const ids = _profFormDefs().map(f => f.id);
    formFolders.push({ id: 'ff1', name: '<img src=x onerror="window.__x=1">Facials', parent: '', pos: 1, formIds: [ids[0], 'deleted-form-id'] });
    formFolders.push({ id: 'ff2', name: 'Empty', parent: '', pos: 2, formIds: [] });
    formFolders.push({ id: 'ff3', name: 'Orphan child', parent: 'gone', pos: 1, formIds: [ids[1]] });
    saveFormFolders(); nav('forms');
    const heads = [...S.querySelectorAll('.form-section h2')].map(h => h.innerText);
    return { heads, x: window.__x, id1: ids[1] };
  });
  check('folders: a name is shown as text, never run as code', !R.x && R.heads.some(h => h.toLowerCase().includes('<img')), JSON.stringify(R.heads.slice(0, 2)));
  check('folders: an empty heading is not shown in the list', !R.heads.includes('Empty'), JSON.stringify(R.heads.slice(0, 3)));
  check('folders: a form in a folder whose heading was deleted still shows in its usual place', await p.evaluate((id) => !!S.querySelector('.form-card[data-fid="' + id + '"]'), R.id1), '');
  await p.fill('#forms-search', 'zzzz');
  check('folders: search hides the headings with no match', await p.evaluate(() => [...S.querySelectorAll('.ff-group')].every(x => x.style.display === 'none')), '');
  await p.evaluate(() => nav('form-folders'));
  check('folders: the folders screen draws with a missing form and an orphan', /Facials/.test(await p.evaluate(() => S.innerText)) && !st.errs.length, st.errs.join('/'));
  // Delete a form that is in a folder: it leaves the folder view, nothing breaks.
  await p.evaluate(() => { const id = formFolders[0].formIds[0]; if (typeof hiddenForms !== 'undefined') { hiddenForms[id] = 1; } nav('forms'); });
  check('folders: no page errors', !st.errs.length, st.errs.join(' / '));
  await ctx.close();
}

// ── SOCIAL MEDIA MODE gone everywhere ──
{
  const { p, ctx, st } = await boot({ kv: { sc_shot_mode: '1' } });
  const screens = ['home', 'clients', 'messages', 'payments', 'calendar', 'account', 'more', 'vc-inbox'];
  const bad = [];
  for (const s of screens) { const t = await p.evaluate((s) => { try { nav(s); } catch (e) { return 'ERR ' + e.message; } return S.innerText; }, s); if (/Social media|sample clients only|ERR /i.test(t)) bad.push(s); }
  check('social: no screen mentions it or hides clients, even with the old setting synced in', !bad.length && await p.evaluate(() => { nav('clients'); return document.querySelectorAll('.client-card').length >= 120; }), JSON.stringify(bad));
  await p.waitForTimeout(1500);
  check('social: the old synced setting is cleared on the account too', st.kv.sc_shot_mode === '0', String(st.kv.sc_shot_mode));
  await ctx.close();
}
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS' : 'FAIL') + '  ' + x.n + (x.pass ? '' : '  — ' + x.d)); }
console.log(`\n${ENGINE}: ${results.length - bad}/${results.length} pass`); process.exit(bad ? 1 : 0);
