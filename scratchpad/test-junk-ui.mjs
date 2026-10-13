// WHAT SHE SEES AND SENDS before thousands of client rows are deleted — the junk section of the
// recovery screen in slickchart.html, plus the paste.
//
// The point of this one is that the DELETE IS IRREVERSIBLE FROM HER DEVICE, so the screen has to be
// right before the button is right:
//   - every class says how many and WHY, and the names are on screen
//   - the `stranger` class (rows her list has never heard of) is OFF by default; the two classes
//     backed by her own delete are on
//   - rows held back are listed WITH the reason, which is the evidence a row holds something
//   - unticking a class actually removes it from the request, and an untouched screen sends no class
//   - the paste carries all of it, because the paste is what gets read
//
// It also covers the Earlier copies line in the paste, which read j.history as an object when
// listHistory returns an array — so it said "none kept for this account yet" on every account,
// however many copies were sitting there. That is the one line in the report asserting an ABSENCE.
//
//   python3 -m http.server 8899   (from slickchart-vercel/)
//   node scratchpad/test-junk-ui.mjs [file.html]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';

const results = [];
const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });

const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e && e.message || e)));

await page.addInitScript(() => { try {
  localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1');
} catch (e) {} });

// The catch-all FIRST: in Playwright the LAST matching route wins, so a broad **/api/** registered
// after the specific ones silently swallows them.
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json',
  body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.route('**/api/cloud-status*', r => r.fulfill({ status: 200, contentType: 'application/json',
  body: '{"enabled":true}' }));

// Capture what the purge button actually POSTs.
let posted = null;
await page.route('**/api/admin/client-recover', r => {
  const req = r.request();
  if (req.method() === 'POST') {
    try { posted = JSON.parse(req.postData() || '{}'); } catch (e) { posted = { parseError: true }; }
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, purged: 1200, eventsGone: 3, keptCopies: 1200,
        classes: posted.purgeClasses, note: 'A full copy is under Earlier copies.' }) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});

await page.goto('http://localhost:8899/' + FILE, { waitUntil: 'load' });
await page.waitForTimeout(2600);

// A state shaped exactly like the endpoint's reply, with one of everything.
const STATE = {
  ok: true,
  provider: { email: 'botanicalaestheticsbyashley@gmail.com', name: 'Botanical' },
  clients: [
    { id: 'live1', name: 'Real Client', deleted: false, bytes: 900, has: { summaries: 1, profileFilled: 3, animals: [] } },
    { id: 'gone1', name: 'Removed One', deleted: true, bytes: 400, has: { summaries: 0, profileFilled: 0, animals: [] } }
  ],
  counts: { rosterIds: 1 },
  ghosts: [{ id: 'gh1', name: 'Ghost One' }],
  nestedUnder: {},
  libraries: { sc_session_summaries: { onServer: true, clients: 6, entries: 6, bytes: 11264 } },
  typed: { roster: [{ id: 'live1', name: 'Real Client', notes: 120, conditions: 30, chart: 40, summaries: 1, forms: 0 }], noteDrafts: [] },
  // listHistory returns an ARRAY of rows, each carrying its own `k`.
  history: [
    { id: 91, k: 'sc_clients', bytes: 220000, items: 81, reason: 'daily', saved_at: '2026-10-13T06:00:00.000Z' },
    { id: 90, k: 'sc_clients', bytes: 219000, items: 81, reason: 'shrink', saved_at: '2026-10-12T06:00:00.000Z' },
    { id: 89, k: 'sc_session_summaries', bytes: 11264, items: 6, reason: 'daily', saved_at: '2026-10-13T06:00:00.000Z' }
  ],
  photos: { onServer: 288, bytes: 41524224, indexNames: 2, orphanBytes: new Array(287).fill('x'), missingBytes: ['y'], byClient: {} },
  kv: {},
  deletedRecordIds: new Array(2463).fill('id'),
  verdict: { line: '2534 characters of notes across 81 clients; 288 photos. This is NOT lost.', safe: ['x'] },
  junk: {
    removed: [{ id: 'r1', name: 'Removed Junk A', holds: [] }, { id: 'r2', name: 'Removed Junk B', holds: [] }],
    deleted: [{ id: 'd1', name: 'Ghost One', holds: [] }, { id: 'd2', name: 'Ghost Two', holds: [] },
              { id: 'd3', name: 'Ghost Three', holds: [] }],
    stranger: [{ id: 's1', name: 'Stranger A', holds: [] }],
    kept: [
      { id: 'k1', name: 'Diana Summary', why: 'it holds 2 summaries', state: 'she deleted it', holds: ['2 summaries'] },
      { id: 'k2', name: 'Homecare Only', why: 'it holds 3 aftercare', state: 'not in her list', holds: ['3 aftercare'] },
      { id: 'k3', name: 'Submitted A Form', why: '1 submission(s) from the client', state: 'not in her list', holds: [] }
    ],
    keptTotal: 3,
    rosterReadable: true
  }
};

await page.evaluate(st => { _recoverState = st; _recoverPick = {}; nav('client-recover'); renderClientRecover(); }, STATE);
await page.waitForTimeout(400);

check('the page did not throw rendering it', errs.length === 0, errs.join(' | '));

const seen = await page.evaluate(() => {
  const scr = document.getElementById('S');
  const txt = ((scr && scr.textContent) || '').replace(/\s+/g, ' ');
  const box = k => document.getElementById('pg-' + k);
  return {
    txt,
    hasHeading: /Junk client rows/.test(txt),
    removedBox: !!box('removed'), removedChecked: !!(box('removed') && box('removed').checked),
    deletedBox: !!box('deleted'), deletedChecked: !!(box('deleted') && box('deleted').checked),
    strangerBox: !!box('stranger'), strangerChecked: !!(box('stranger') && box('stranger').checked),
    goBtn: !!document.getElementById('pg-go'),
    paste: _recoverText()
  };
});

check('the junk section is on screen', seen.hasHeading, seen.txt.slice(0, 120));
check('all three classes have a tick box', seen.removedBox && seen.deletedBox && seen.strangerBox,
  JSON.stringify([seen.removedBox, seen.deletedBox, seen.strangerBox]));
check('the counts are shown per class', /2 already removed/.test(seen.txt) && /3 deleted on their device/.test(seen.txt)
  && /1 never in their list/.test(seen.txt), seen.txt.slice(0, 200));
check('the names are shown, not just counts',
  /Removed Junk A/.test(seen.txt) && /Ghost Three/.test(seen.txt) && /Stranger A/.test(seen.txt), '');
check('her own deletes are ticked by default', seen.removedChecked && seen.deletedChecked, '');
check('`never in their list` is OFF by default', seen.strangerChecked === false, '');
check('it says plainly that this is a real delete', /real delete/i.test(seen.txt), '');
check('it says a copy is kept first', /copy of every record goes under Earlier copies/i.test(seen.txt), '');
check('rows held back are listed WITH the reason',
  /3 kept back/.test(seen.txt) && /Diana Summary — it holds 2 summaries/.test(seen.txt)
  && /Submitted A Form — 1 submission/.test(seen.txt), '');
check('the resurrect loop is explained, since that is why it matters',
  /every 15 seconds/.test(seen.txt) && /delete record/.test(seen.txt), '');
check('there is a way to put them back', /Put the cleared clients back/.test(seen.txt), '');

// ── THE PASTE ──────────────────────────────────────────────────────────────────────────────────
const p = seen.paste;
check('the paste carries the junk counts', /JUNK CLIENT ROWS/.test(p)
  && /already removed \(tombstoned\): 2/.test(p) && /row still live: 3/.test(p), p.slice(0, 200));
check('the paste names the refresh loop on the deleted class', /deleted again every refresh/.test(p), '');
check('the paste carries the held-back reasons', /Diana Summary \[she deleted it\] — it holds 2 summaries/.test(p), '');
check('the paste still carries the verdict first', p.indexOf('>>>') > -1, '');

// Earlier copies: an ARRAY of rows must be grouped and reported, not read as an object.
check('the paste lists Earlier copies instead of claiming none', /EARLIER COPIES KEPT AUTOMATICALLY/.test(p)
  && !/EARLIER COPIES: none kept/.test(p), p.slice(p.indexOf('EARLIER'), p.indexOf('EARLIER') + 200));
check('Earlier copies groups by library with a count',
  /sc_clients: 2 copies/.test(p) && /sc_session_summaries: 1 copy/.test(p),
  p.slice(p.indexOf('EARLIER'), p.indexOf('EARLIER') + 240));
check('Earlier copies carries the newest timestamp and why it was kept',
  /2026-10-13T06:00:00\.000Z/.test(p) && /daily/.test(p), '');

// ...and genuinely empty history must still say so.
const emptyPaste = await page.evaluate(() => { const keep = _recoverState.history; _recoverState.history = [];
  const t = _recoverText(); _recoverState.history = keep; return t; });
check('an account with no copies still says none kept', /EARLIER COPIES: none kept for this account yet/.test(emptyPaste), '');

// ── WHAT THE BUTTON SENDS ──────────────────────────────────────────────────────────────────────
// Untouched screen: her own two deletes, never the strangers.
await page.evaluate(() => { _recoverPurgeJunk(); });
await page.waitForTimeout(250);
await page.evaluate(() => { const m = [...document.querySelectorAll('#confirm-modal')];
  const b = m.length ? m[m.length - 1].querySelector('#_cf-ok') : null; if (b) b.click(); });
await page.waitForTimeout(400);
check('the untouched screen sends only the two classes she deleted',
  posted && JSON.stringify(posted.purgeClasses) === '["removed","deleted"]', JSON.stringify(posted));
check('the request carries confirm:true and her email',
  posted && posted.confirm === true && posted.email === 'botanicalaestheticsbyashley@gmail.com', JSON.stringify(posted));
check('the request sends CLASSES, never an id list',
  posted && !posted.purgeIds && !posted.ids, JSON.stringify(posted));

// Re-render, untick `removed`, tick `stranger`.
posted = null;
await page.evaluate(st => { document.querySelectorAll('#confirm-modal').forEach(m => m.remove());
  _recoverState = st; _recoverPick = {}; renderClientRecover(); }, STATE);
await page.waitForTimeout(300);
await page.evaluate(() => {
  document.getElementById('pg-removed').checked = false;
  document.getElementById('pg-stranger').checked = true;
  _recoverPurgeJunk();
});
await page.waitForTimeout(250);
await page.evaluate(() => { const m = [...document.querySelectorAll('#confirm-modal')];
  const b = m.length ? m[m.length - 1].querySelector('#_cf-ok') : null; if (b) b.click(); });
await page.waitForTimeout(400);
check('unticking a class removes it from the request',
  posted && JSON.stringify(posted.purgeClasses) === '["deleted","stranger"]', JSON.stringify(posted));

// Nothing ticked at all must send nothing.
posted = null;
await page.evaluate(st => { document.querySelectorAll('#confirm-modal').forEach(m => m.remove());
  _recoverState = st; _recoverPick = {}; renderClientRecover(); }, STATE);
await page.waitForTimeout(300);
await page.evaluate(() => {
  ['removed', 'deleted', 'stranger'].forEach(k => { document.getElementById('pg-' + k).checked = false; });
  _recoverPurgeJunk();
});
await page.waitForTimeout(500);
check('nothing ticked sends nothing at all', posted === null, JSON.stringify(posted));

// A reply with no `junk` at all — an older server — must not break the screen.
posted = null;
const errsBefore = errs.length;
await page.evaluate(st => { document.querySelectorAll('#confirm-modal').forEach(m => m.remove());
  const s = JSON.parse(JSON.stringify(st)); delete s.junk;
  _recoverState = s; _recoverPick = {}; renderClientRecover(); return _recoverText(); }, STATE);
await page.waitForTimeout(300);
const older = await page.evaluate(() => { const scr = document.getElementById('S');
  return { txt: ((scr && scr.textContent) || '').replace(/\s+/g, ' '), paste: _recoverText() }; });
check('an older server reply still renders the screen', errs.length === errsBefore && /Recover clients|Their work is on the server/.test(older.txt), errs.slice(errsBefore).join(' | '));
check('an older server reply shows no junk section', !/Junk client rows/.test(older.txt), '');
check('an older server reply still produces a paste', older.paste.length > 200 && !/JUNK CLIENT ROWS/.test(older.paste), String(older.paste.length));

await browser.close();

let bad = 0;
for (const r of results) {
  if (!r.pass) bad++;
  console.log('  ' + (r.pass ? 'PASS' : 'FAIL') + '  ' + r.name.padEnd(56) + (r.pass ? '' : ('  <- ' + r.detail)));
}
console.log(bad ? '\n' + bad + ' of ' + results.length + ' FAILED'
  : '\nevery class is named and counted with its reason on screen and in the paste, the rows\n'
  + 'her list has never heard of are off by default, held-back rows carry their evidence,\n'
  + 'the request sends classes and not ids, and Earlier copies no longer claims none');
process.exit(bad ? 1 : 0);
