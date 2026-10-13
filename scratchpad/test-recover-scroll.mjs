// THE RECOVERY SCREEN AT ASHLEY'S REAL SCALE — it has to stay navigable.
//
// Ashley, 2026-10-13, looking at her own account on the preview: "the scrolls are WAY too long for
// each section. make them stay scrollable in a box so it doesnt take forever to get through."
//
// Her numbers, from her own recovery paste: 3798 showing, 1083 removed, 3040 live clients her app
// has never heard of, ~1000 deleted again on every refresh, 775 in her app's list. Every one of
// those rendered inline, so reaching the next heading meant scrolling past thousands of names.
//
// So this does not check styles, it checks the thing she complained about: how far apart the
// HEADINGS are, and how tall the page is, with all of that loaded. A box with a max-height that
// some later rule overrides would pass a style assertion and fail her.
//
//   python3 -m http.server 8899   (from slickchart-vercel/)
//   node scratchpad/test-recover-scroll.mjs [file.html]
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
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json',
  body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.route('**/api/cloud-status*', r => r.fulfill({ status: 200, contentType: 'application/json',
  body: '{"enabled":true}' }));
await page.goto('http://localhost:8899/' + FILE, { waitUntil: 'load' });
await page.waitForTimeout(2600);

// Her account, to the row.
const COUNTS = { showing: 3798, removed: 1083, missing: 3040, ghosts: 1000, roster: 775,
                 history: 40, photos: 120, junkDeleted: 900, junkRemoved: 1000, junkStranger: 2900, kept: 300 };

const built = await page.evaluate(C => {
  const FIRST = ['Ashley','Janice','Sheri','Dez','Heather','Diana','Riquelle','Amber','Sue','Marcy',
    'Tonya','Brandi','Kelsey','Noor','Priya','Elena','Gina','Rae','Lupe','Whitney','Camila','Ingrid',
    'Opal','Yvette','Zara','Quinn','Harriet','Baxter','Cleo','Mina'];
  const LAST = ['Delgadillo','Albers','Allen','Schrader','Hinkle','Watson','Nguyen','Okafor','Brooks',
    'Vance','Mahoney','Ruiz','Kowalski','Fitzgerald','Abara','Jessup','Trent','Lindqvist','Oyelaran',
    'Dunbar','Pham','Castellanos','Wu','Beauchamp','Ngata','Forsythe','Idris','Marchetti','Lu','Obi'];
  // Deterministic, varied, and with the odd near-duplicate — which is what _recoverRisk is for.
  const name = (p, i) => FIRST[(i * 7 + p.length) % FIRST.length] + ' '
    + LAST[(i * 13 + p.length * 3) % LAST.length] + (i % 11 === 0 ? '' : ' ' + i);
  const mk = (p, n, extra) => Array.from({ length: n }, (_, i) => Object.assign({
    id: p + i, name: name(p, i), deleted: false, bytes: 700,
    has: { summaries: 0, forms: 0, pendingForms: 0, progressPhotos: 0, products: 0, profileFilled: 0, animals: [] }
  }, extra || {}));
  const clients = mk('Showing', C.showing).concat(mk('Removed', C.removed, { deleted: true }));
  const photosByClient = {};
  for (let i = 0; i < C.photos; i++) photosByClient['ph' + i] = { name: name('Photo', i), onServer: 2, indexed: 3 };
  _recoverState = {
    ok: true, provider: { email: 'botanicalaestheticsbyashley@gmail.com', name: 'Botanical' },
    clients,
    counts: { rosterIds: C.roster },
    ghosts: mk('Ghost', C.ghosts).map(c => ({ id: c.id, name: c.name })),
    nestedUnder: {},
    libraries: { sc_session_summaries: { onServer: true, clients: 6, entries: 6, bytes: 11264 },
                 sc_client_homecare: { onServer: true, clients: 1488, entries: 5, bytes: 31744 } },
    typed: { roster: [{ id: 'Showing0', name: name('Showing', 0), notes: 120, conditions: 30, chart: 40, summaries: 1, forms: 0 }], noteDrafts: [] },
    history: Array.from({ length: C.history }, (_, i) => ({ id: 1000 + i, k: 'sc_client_homecare',
      bytes: 31744, items: 1410, reason: i % 2 ? 'shrink' : 'daily', saved_at: '2026-10-12T23:11:00.000Z' })),
    photos: { onServer: 288, bytes: 41524224, indexNames: 2, orphanBytes: new Array(287).fill('x'),
              missingBytes: ['y'], byClient: photosByClient },
    kv: {}, deletedRecordIds: new Array(2463).fill('id'),
    rosterHas: Array.from({ length: C.roster }, (_, i) => ({ id: 'r' + i, name: name('Roster', i), deleted: false })),
    missingFromRoster: Array.from({ length: C.missing }, (_, i) => ({ id: 'm' + i, name: name('Missing', i) })),
    verdict: { line: '2534 characters of notes across 81 clients; 288 photos.', safe: ['x'] },
    junk: {
      removed: mk('JunkRemoved', C.junkRemoved).map(c => ({ id: c.id, name: c.name, holds: [] })),
      deleted: mk('JunkDeleted', C.junkDeleted).map(c => ({ id: c.id, name: c.name, holds: [] })),
      stranger: mk('JunkStranger', C.junkStranger).map(c => ({ id: c.id, name: c.name, holds: [] })),
      kept: Array.from({ length: C.kept }, (_, i) => ({ id: 'k' + i, name: name('Kept', i),
        why: 'it holds 2 summaries', state: 'she deleted it', holds: ['2 summaries'] })),
      keptTotal: C.kept, rosterReadable: true
    }
  };
  _recoverPick = {}; nav('client-recover');
  const _t = performance.now(); renderClientRecover(); const renderMs = Math.round(performance.now() - _t);
  const S = document.getElementById('S');
  const heads = [...S.querySelectorAll('.sh h2')].map(h => ({ text: (h.textContent || '').trim(),
    top: h.getBoundingClientRect().top + window.scrollY }));
  // Every scrollable box the screen built, with how much it is hiding.
  const boxes = [...S.querySelectorAll('div')].filter(d => {
    const st = getComputedStyle(d);
    return /auto|scroll/.test(st.overflowY) && d.scrollHeight > d.clientHeight + 4;
  }).map(d => ({ h: Math.round(d.getBoundingClientRect().height), inner: d.scrollHeight }));
  return {
    renderMs,
    pageHeight: Math.round(S.getBoundingClientRect().height),
    nodes: S.querySelectorAll('div').length,
    heads, boxes,
    text: (S.textContent || '').replace(/\s+/g, ' ')
  };
}, COUNTS);

check('the screen renders without throwing', errs.length === 0, errs.join(' | '));

// ── the complaint itself: distance between headings, and total page length ─────────────────────
const gaps = [];
for (let i = 1; i < built.heads.length; i++) {
  gaps.push({ from: built.heads[i - 1].text, to: built.heads[i].text, px: Math.round(built.heads[i].top - built.heads[i - 1].top) });
}
const worst = gaps.slice().sort((a, b) => b.px - a.px)[0] || { px: 0, from: '-', to: '-' };
const screens = n => (n / 844).toFixed(1) + ' phone screens';

check('no two headings are more than 4 phone screens apart', worst.px < 844 * 4,
  'worst gap ' + worst.px + 'px (' + screens(worst.px) + ') between "' + worst.from + '" and "' + worst.to + '"');
check('the whole screen is under 12 phone screens tall', built.pageHeight < 844 * 12,
  built.pageHeight + 'px = ' + screens(built.pageHeight));
check('it does not build a node per row (13k rows, far fewer nodes)', built.nodes < 4000,
  built.nodes + ' divs for ' + (COUNTS.showing + COUNTS.removed + COUNTS.missing + COUNTS.ghosts + COUNTS.roster) + '+ rows');
check('it renders fast enough to be usable', built.renderMs < 1500, built.renderMs + 'ms');

// ── the function that made it slow, and whether it still gives the same answers ────────────────
// _recoverEdits decides which removed rows arrive TICKED, so a faster version that disagrees with
// the old one would quietly change what a restore puts back. Checked against a plain full-table
// Levenshtein over every pair in a varied set, with the old length guard's 9-for-anything-bigger.
const edits = await page.evaluate(() => {
  function reference(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const m = a.length, n = b.length, d = [];
    for (let i = 0; i <= m; i++) d[i] = [i];
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  const pool = ['', 'a', 'ab', 'abc', 'rainer', 'reiner', 'rainier', 'raine', 'ranier', 'bear',
    'bea', 'beard', 'beart', 'sue', 'su', 'suse', 'ingatara perry', 'ingatara pery',
    'ingatara perryy', 'amber', 'ambre', 'amberr', 'xyz', 'mnop', 'o', 'oo', 'ooo', 'oooo',
    '\u00e9lan', 'elan', 'anna', 'anne', 'annna', 'n', 'nn'];
  const bad = [];
  for (const a of pool) for (const b of pool) {
    const want = reference(a, b), got = _recoverEdits(a, b);
    // Only distances up to 2 are used; everything above is reported as 9 by both.
    const wantN = want <= 2 ? want : 9, gotN = got <= 2 ? got : 9;
    if (wantN !== gotN) bad.push(a + '|' + b + ' want ' + wantN + ' got ' + gotN);
  }
  // A long pair that is genuinely close must still come back exact, not pruned away.
  const longA = 'botanical aesthetics by ashley', longB = 'botanical aesthetcs by ashley';
  if (_recoverEdits(longA, longB) !== 1) bad.push('long near pair read as ' + _recoverEdits(longA, longB));
  if (_recoverEdits(longA, longA) !== 0) bad.push('identical long pair not 0');
  return { bad, pairs: pool.length * pool.length };
});
check('the faster edit distance agrees with a full table on every pair',
  edits.bad.length === 0, edits.bad.slice(0, 5).join(' ; ') + ' (of ' + edits.pairs + ' pairs)');

// The near-duplicate lookup must find the same match the old full scan did, bucketing and all.
const near = await page.evaluate(() => {
  const live = {};
  ['rainer', 'bear', 'sue', 'ingatara perry', 'amber', 'anna'].forEach(n => { live[n] = 1; });
  const slow = nm => Object.keys(live).find(x => x !== nm && _recoverEdits(x, nm) <= 2) || '';
  const bad = [];
  ['reiner', 'beard', 'su', 'ingatara pery', 'ambre', 'anne', 'zzzzzz', 'rainer', 'q'].forEach(nm => {
    const a = slow(nm), b = _recoverNear(nm, live);
    if (a !== b) bad.push(nm + ': full scan "' + a + '" vs bucketed "' + b + '"');
  });
  // A second object must rebuild the index rather than answering from the first one's cache.
  const other = { zebra: 1 };
  if (_recoverNear('rainer', other) !== '') bad.push('stale index answered for a new roster');
  if (_recoverNear('zebr', other) !== 'zebra') bad.push('new roster not indexed');
  return bad;
});
check('the bucketed near-duplicate scan finds what the full scan found', near.length === 0, near.join(' ; '));

// ── the worst case for this, measured on purpose ───────────────────────────────────────────────
// Names that all share a long prefix are where edit distance can prune least. Her roster is not
// this, but a provider who numbers her clients ("Client 001"...) would be, so it must stay usable.
const pathological = await page.evaluate(C => {
  const mk = (p, n, extra) => Array.from({ length: n }, (_, i) => Object.assign({
    id: p + i, name: p + ' Client ' + String(i).padStart(5, '0'), deleted: false, bytes: 700,
    has: { summaries: 1, forms: 0, progressPhotos: 0, products: 0, profileFilled: 0, animals: [] }
  }, extra || {}));
  _recoverState = Object.assign({}, _recoverState,
    { clients: mk('Showing', C.showing).concat(mk('Removed', C.removed, { deleted: true })) });
  _recoverPick = {};
  const t = performance.now(); renderClientRecover(); return Math.round(performance.now() - t);
}, COUNTS);
check('even names that all share a prefix draw in a few seconds', pathological < 6000, pathological + 'ms');

// ── every long list actually sits in a box that scrolls ────────────────────────────────────────
check('the long lists are in scroll boxes', built.boxes.length >= 6, built.boxes.length + ' scrolling boxes found');
check('no scroll box is taller than one phone screen', built.boxes.every(b => b.h <= 844),
  JSON.stringify(built.boxes.filter(b => b.h > 844)));

// ── and nothing is silently dropped: the cap says so, and points at Copy ───────────────────────
check('an over-cap list says how many it is showing', /Showing the first 300 of 3798/.test(built.text), '');
check('the cap line points at Copy for the rest', /Copy this as text has every one/.test(built.text), built.text.slice(built.text.indexOf('Showing the first'), built.text.indexOf('Showing the first') + 90));
check('the counts above the lists are still the REAL totals',
  /3798 showing/.test(built.text) && /1083 removed/.test(built.text), '');
check('the big red refresh-loop count is still the real one', /1000 clients are being deleted again/.test(built.text), '');
check('the junk classes still report their real counts',
  /1000 already removed/.test(built.text) && /900 deleted on their device/.test(built.text)
  && /2900 never in their list/.test(built.text), '');

// ── a short list must NOT get a cap line ───────────────────────────────────────────────────────
const small = await page.evaluate(() => {
  const st = JSON.parse(JSON.stringify(_recoverState));
  st.clients = st.clients.slice(0, 4); st.ghosts = st.ghosts.slice(0, 2);
  st.missingFromRoster = st.missingFromRoster.slice(0, 3); st.rosterHas = st.rosterHas.slice(0, 3);
  st.junk.removed = st.junk.removed.slice(0, 2); st.junk.deleted = st.junk.deleted.slice(0, 2);
  st.junk.stranger = st.junk.stranger.slice(0, 2); st.junk.kept = st.junk.kept.slice(0, 2); st.junk.keptTotal = 2;
  st.history = st.history.slice(0, 2); st.photos.byClient = { a: { name: 'A', onServer: 1, indexed: 1 } };
  _recoverState = st; _recoverPick = {}; renderClientRecover();
  const S = document.getElementById('S');
  return { text: (S.textContent || '').replace(/\s+/g, ' '), h: Math.round(S.getBoundingClientRect().height) };
});
check('a small account gets no "showing the first" line', !/Showing the first/.test(small.text), '');
check('a small account is still a short screen', small.h < 844 * 4, small.h + 'px');

await browser.close();

console.log('\n  heading gaps, largest first:');
gaps.sort((a, b) => b.px - a.px).slice(0, 6)
  .forEach(g => console.log('    ' + String(g.px).padStart(5) + 'px  ' + g.from + '  ->  ' + g.to));
console.log('\n  whole screen ' + built.pageHeight + 'px (' + screens(built.pageHeight) + '), '
  + built.nodes + ' divs, ' + built.boxes.length + ' scroll boxes, rendered in ' + built.renderMs + 'ms'
  + '\n  worst case (every name sharing a prefix): ' + pathological + 'ms\n');

let bad = 0;
for (const r of results) {
  if (!r.pass) bad++;
  console.log('  ' + (r.pass ? 'PASS' : 'FAIL') + '  ' + r.name.padEnd(56) + (r.pass ? '' : ('  <- ' + r.detail)));
}
console.log(bad ? '\n' + bad + ' of ' + results.length + ' FAILED'
  : '\nat her real scale every section is reachable, every long list scrolls inside its own\n'
  + 'box, the totals shown are still the true ones, and a small account gains no clutter');
process.exit(bad ? 1 : 0);
