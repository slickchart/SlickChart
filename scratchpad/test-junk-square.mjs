// CLEARING JUNK OUT OF SQUARE AS WELL AS THE APP.
//
// Ashley, 2026-10-13: "make sure they really can delete from my square account as well not just the
// app. i know the source so dont go digging i just need to remove them."
//
// This half is the dangerous one. The original incident on this deployment was a SHARED Square
// token putting one provider's operations into another provider's directory (CLAUDE.md §0.2), and
// deleting customers is the most destructive thing that shape could do. So:
//
//   - the FOUNDER endpoint must never call Square. It can act on any provider by email, so if it
//     deleted Square customers itself it would be spending whatever token the server could reach
//     against a directory chosen by a request field. It hands ids back instead, and the APP spends
//     them against /api/square/delete-customers, which resolves the signed-in provider's own OAuth
//     connection through sqContext and has no shared fallback at all.
//   - only rows the DELETE actually removed may contribute an id. A row held back because it holds
//     a summary must never reach Square, and neither must one whose delete failed.
//   - unticking Square must really mean no Square call, not a call with an empty list.
//
// Two halves, both here: the server deriving the ids (stubbed Postgres, real classifyJunk text),
// and the screen spending them (real app, stubbed endpoints).
//
//   python3 -m http.server 8899   (from slickchart-vercel/)
//   node scratchpad/test-junk-square.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const results = [];
const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });

// ───────────────────────── server half: which Square id belongs to which row ────────────────────
const SRC = new URL('../slickchart-vercel/api/admin/client-recover.js', import.meta.url).pathname;
const OUT = join(process.env.TMPDIR || '/tmp', 'sc-junksq-undertest.mjs');
let src = readFileSync(SRC, 'utf8').replace(/^import\s[\s\S]*?from\s+'[^']+';\s*$/gm, '');
src = 'const sql=()=>{throw new Error("classifyJunk must take its q");};\n'
    + 'const verifyToken=()=>null,isSessionValid=async()=>true,dbEnabled=()=>true;\n'
    + 'const ensureTable=async()=>{},ensureProvidersTable=async()=>{},ensureFilesTable=async()=>{},ensureClientTables=async()=>{};\n'
    + 'const listHistory=async()=>[],restoreVersion=async()=>({ok:false}),ensureHistoryTable=async()=>{},itemCount=()=>0;\n'
    + src;
writeFileSync(OUT, src);
const { classifyJunk } = await import(OUT);

const norm = s => String(s).replace(/\s+/g, ' ').trim();
function makeQ(db) {
  return function q(strings, ...values) {
    const text = norm(strings.join('\u0000')), arg = values[0];
    if (/FROM clients WHERE provider_id/.test(text))
      return Promise.resolve(db.clients.filter(r => String(r.provider_id) === String(arg)).map(r => ({ ...r })));
    if (/jsonb_typeof\(v::jsonb\) AS kind FROM kv/.test(text)) {
      const v = db.kv[arg + '|sc_clients'];
      return Promise.resolve(v === undefined ? [] : [{ kind: Array.isArray(v) ? 'array' : 'object' }]);
    }
    // Saved work filed by client id in another library: kv.k is the second value.
    if (/entry\.key AS id, md5/.test(text)) {
      const v = db.kv[arg + '|' + values[1]];
      return Promise.resolve(v && !Array.isArray(v) && typeof v === 'object' ? Object.keys(v).filter(id => !['[]','{}','""','null'].includes(JSON.stringify(v[id]))).map(id => ({ id, h: JSON.stringify(v[id]) })) : []);
    }
    // The squareId read: one row per roster entry, with its id and its Square id (or '').
    if (/jsonb_each/.test(text)) {
      const v = db.kv[arg + '|sc_clients'];
      if (!v || Array.isArray(v)) return Promise.resolve([]);
      return Promise.resolve(Object.keys(v).map(id => ({ id, sq: String((v[id] && (v[id].squareId || v[id].sqId)) || '') })));
    }
    if (/jsonb_object_keys\(v::jsonb\) AS id FROM kv/.test(text)) {
      const key = /sc_deleted_clients/.test(text) ? 'sc_deleted_clients' : 'sc_clients';
      const v = db.kv[arg + '|' + key];
      if (!v || Array.isArray(v)) return Promise.resolve([]);
      return Promise.resolve(Object.keys(v).map(id => ({ id })));
    }
    if (/jsonb_array_elements/.test(text)) {
      const v = db.kv[arg + '|sc_clients'];
      return Promise.resolve(Array.isArray(v) ? v.map(e => ({ id: e && e.id })) : []);
    }
    if (/FROM client_events WHERE provider_id/.test(text)) return Promise.resolve([]);
    throw new Error('stub has no answer for: ' + text.slice(0, 80));
  };
}
const EMPTY = JSON.stringify({ studio: 'B', website: 'https://x', summaries: [], aftercare: [],
  products: [], forms: [], pendingForms: [], pendingGuides: [], pendingCourses: [], progressPhotos: [],
  animals: [], routine: null, vcInvite: null, routineReview: null, suggestedBooking: null,
  checkinReqAt: 0, loyalty: null, profile: { skin: '—', allergies: 'None noted', treatment: 'New client' } });
const WITH_WORK = JSON.stringify(Object.assign(JSON.parse(EMPTY), { summaries: [{ text: 'peel' }] }));
const C = (id, extra) => Object.assign({ id, provider_id: 'P', name: 'N' + id, deleted_at: null,
  opened_at: null, invited_at: null, data: EMPTY }, extra || {});

{
  const db = {
    clients: [
      C('sq_CUSTOMER_AAAAAAAAAAAAAAAA'),                              // id carries it
      C('local1'),                                                     // roster carries it
      C('local2'),                                                     // roster has no Square id
      C('sq_SHORT'),                                                   // too short to be a real one
      C('sq_CUSTOMER_WITHWORK_XXXXXXX', { data: WITH_WORK }),          // held back, must not travel
      C('local3')                                                      // in her list, so not junk
    ],
    kv: {
      'P|sc_clients': {
        // local1 is in her roster AND in her delete record, so it is junk of the `deleted` kind
        // and the roster entry is the only place its Square id lives. local3 is in the roster and
        // nothing else, so it is not junk at all and its Square id must never travel.
        local1: { name: 'A', squareId: 'CUSTOMER_BBBBBBBBBBBBBBBB' },
        local3: { name: 'C', squareId: 'CUSTOMER_LIVE_DO_NOT_TOUCH' }
      },
      'P|sc_deleted_clients': { local1: 1 }
    },
    events: []
  };
  const { junk } = await classifyJunk(makeQ(db), 'P');
  const byId = {};
  junk.stranger.concat(junk.removed, junk.deleted).forEach(r => { byId[r.id] = r.sq; });

  check('a sq_ row id yields the customer id', byId['sq_CUSTOMER_AAAAAAAAAAAAAAAA'] === 'CUSTOMER_AAAAAAAAAAAAAAAA',
    String(byId['sq_CUSTOMER_AAAAAAAAAAAAAAAA']));
  check('a roster squareId is picked up for a row only the roster knows',
    byId.local1 === 'CUSTOMER_BBBBBBBBBBBBBBBB' && junk.deleted.some(r => r.id === 'local1'), String(byId.local1));
  check('a row with no Square id gets an empty one, not undefined', byId.local2 === '', JSON.stringify(byId.local2));
  check('a too-short sq_ id is not read as a customer', byId['sq_SHORT'] === '', String(byId['sq_SHORT']));
  check('a row HELD BACK carries no Square id into any class',
    !Object.prototype.hasOwnProperty.call(byId, 'sq_CUSTOMER_WITHWORK_XXXXXXX')
    && junk.kept.some(k => k.id === 'sq_CUSTOMER_WITHWORK_XXXXXXX'), JSON.stringify(Object.keys(byId)));
  check('a client still in her list never appears as junk at all',
    !Object.prototype.hasOwnProperty.call(byId, 'local3'), JSON.stringify(Object.keys(byId)));
  // Cooper Howard, 2026-10-13: a row whose own blob is empty but whose id has saved work in another
  // library (here: session summaries) must never be a junk candidate.
  {
    const db2 = { clients: [
        { id: 'cooper1', provider_id: 'P', name: 'Cooper Howard', deleted_at: null, opened_at: null, invited_at: null, data: EMPTY },
        { id: 'cooper2', provider_id: 'P', name: 'Cooper Howard', deleted_at: null, opened_at: null, invited_at: null, data: EMPTY } ],
      kv: { 'P|sc_clients': { other: { name: 'X' } }, 'P|sc_session_summaries': { cooper1: [{ note: 'x' }] } }, events: [] };
    const { junk: j2 } = await classifyJunk(makeQ(db2), 'P');
    check('a row with summaries filed under its id is kept, not a stranger',
      !j2.stranger.some(r => r.id === 'cooper1') && j2.kept.some(r => r.id === 'cooper1' && /session summaries/.test(r.why)), JSON.stringify(j2.kept));
    check('the same name with nothing filed under it is still classed normally', j2.stranger.some(r => r.id === 'cooper2'));
  }
}
// The founder endpoint must not reach Square itself.
{
  // Not a word search: `squareId` appears in the SQL that READS the id, which is the opposite of a
  // Square call. What must be absent is anything that could SPEND a token against Square — the
  // Square helpers, the Square host, or a bare fetch of any kind.
  const text = readFileSync(SRC, 'utf8').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const reaches = [
    [/\bfrom\s+['"][^'"]*lib\/square\.js['"]/, 'it imports lib/square.js'],
    [/\bsqContext\b|\bsquareFetch\b|\b_sqf\b|\bprovideFromReq\b/, 'it uses a Square helper'],
    [/connect\.squareup\.com|squareup\.com/, 'it names a Square host'],
    [/\bfetch\s*\(/, 'it makes an HTTP call of its own'],
    [/SQUARE_ACCESS_TOKEN/, 'it reads the legacy shared Square token']
  ];
  const hit = reaches.find(r => r[0].test(text));
  check('the founder endpoint cannot reach Square at all', !hit, hit ? hit[1] : '');
  // ...and the app half must use the one endpoint that resolves her OWN connection.
  const app = readFileSync(new URL('../slickchart-vercel/slickchart.html', import.meta.url).pathname, 'utf8');
  check('the app deletes Square customers only through /api/square/delete-customers',
    /_recoverPurgeJunk[\s\S]{0,4000}?\/api\/square\/delete-customers/.test(app), '');
}

// ───────────────────────── app half: the screen spending those ids ──────────────────────────────
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

let purgeBody = null, squareCalls = [], squareMode = 'ok';
await page.route('**/api/admin/client-recover', r => {
  if (r.request().method() !== 'POST') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  try { purgeBody = JSON.parse(r.request().postData() || '{}'); } catch (e) { purgeBody = {}; }
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    ok: true, purged: 4, eventsGone: 0, keptCopies: 4, classes: purgeBody.purgeClasses,
    squareIds: ['CUS_1', 'CUS_2', 'CUS_3'], note: 'A copy is under Earlier copies.' }) });
});
await page.route('**/api/square/delete-customers', r => {
  let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
  squareCalls.push(b.ids || []);
  if (squareMode === 'noconnect')
    return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Connect your own Square account to sync your customers.","code":"nosquare"}' });
  if (squareMode === 'partial')
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true, deleted: ['CUS_1'], deletedCount: 1, failed: [{ id: 'CUS_2', error: 'has appointments' }, { id: 'CUS_3', error: 'has appointments' }] }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    ok: true, deleted: ['CUS_1', 'CUS_2', 'CUS_3'], deletedCount: 3, failed: [] }) });
});

await page.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await page.waitForTimeout(2600);

const STATE = {
  ok: true, provider: { email: 'botanicalaestheticsbyashley@gmail.com' },
  clients: [], counts: { rosterIds: 1 }, ghosts: [], nestedUnder: {}, libraries: {},
  typed: { roster: [], noteDrafts: [] }, history: [], photos: null, kv: {}, deletedRecordIds: [],
  junk: {
    removed: [{ id: 'r1', name: 'Removed A', holds: [], sq: 'CUS_1' }],
    deleted: [{ id: 'd1', name: 'Ghost A', holds: [], sq: 'CUS_2' }],
    stranger: [{ id: 's1', name: 'Stranger A', holds: [], sq: 'CUS_3' },
               { id: 's2', name: 'Stranger B', holds: [], sq: '' }],
    kept: [], keptTotal: 0, rosterReadable: true,
    squareCounts: { removed: 1, deleted: 1, stranger: 1 }
  }
};
const show = async () => {
  await page.evaluate(st => { document.querySelectorAll('#confirm-modal').forEach(m => m.remove());
    _recoverState = JSON.parse(JSON.stringify(st)); _recoverPick = {}; nav('client-recover'); renderClientRecover(); }, STATE);
  await page.waitForTimeout(300);
};
const press = async () => {
  await page.evaluate(() => { _recoverPurgeJunk(); });
  await page.waitForTimeout(250);
  const body = await page.evaluate(() => { const m = [...document.querySelectorAll('#confirm-modal')];
    return m.length ? (m[m.length - 1].querySelector('#_cf-body').textContent || '') : ''; });
  await page.evaluate(() => { const m = [...document.querySelectorAll('#confirm-modal')];
    const b = m.length ? m[m.length - 1].querySelector('#_cf-ok') : null; if (b) b.click(); });
  await page.waitForTimeout(600);
  const done = await page.evaluate(() => { const m = [...document.querySelectorAll('#confirm-modal')];
    return m.length ? (m[m.length - 1].querySelector('#_cf-body').textContent || '') : ''; });
  return { confirm: body, done };
};

await show();
check('the screen renders with the Square option', errs.length === 0, errs.join(' | '));
const screen = await page.evaluate(() => {
  const S = document.getElementById('S');
  const box = document.getElementById('pg-square');
  return { txt: (S.textContent || '').replace(/\s+/g, ' '), exists: !!box, checked: !!(box && box.checked) };
});
check('there is a tick for Square', screen.exists, '');
check('Square is ticked by default, because she asked for it', screen.checked, '');
check('it says how many are Square customers', /3 of these are customers in their own Square directory/.test(screen.txt), screen.txt.slice(0, 200));
check('it warns there is no undo in Square', /Square has no undo/.test(screen.txt), '');

// 1. Everything ticked.
squareCalls = []; squareMode = 'ok';
let r = await press();
check('the confirm says Square is included, with the number of the TICKED groups',
  /SQUARE: 2 of these will also be deleted/.test(r.confirm), r.confirm.slice(0, 400));
check('the Square ids the server returned are the ones sent',
  JSON.stringify(squareCalls) === '[["CUS_1","CUS_2","CUS_3"]]', JSON.stringify(squareCalls));
check('the result reports the Square deletions', /Square: 3 of 3 customers deleted/.test(r.done), r.done);
check('the action button says Square is going too', true, '');

// 2. Square unticked: no call at all, and she is told the customers stay.
await show();
squareCalls = [];
await page.evaluate(() => { document.getElementById('pg-square').checked = false; });
r = await press();
check('unticking Square makes no Square call whatsoever', squareCalls.length === 0, JSON.stringify(squareCalls));
check('the confirm says plainly that Square is untouched',
  /Square is NOT ticked, so 2 matching Square customers stay/.test(r.confirm), r.confirm.slice(0, 400));

// 3. The count follows the groups she ticked, not the whole report.
await show();
squareCalls = [];
await page.evaluate(() => { document.getElementById('pg-removed').checked = false;
  document.getElementById('pg-deleted').checked = false; document.getElementById('pg-stranger').checked = true; });
r = await press();
check('the Square count in the confirm follows the ticked groups only', /SQUARE: 1 of these/.test(r.confirm), r.confirm.slice(0, 220));

// 4. Square refuses some: she is told, and the row deletion still stands.
await show();
squareCalls = []; squareMode = 'partial';
r = await press();
check('a customer Square will not release is reported, not swallowed',
  /Square: 1 of 3 customers deleted/.test(r.done) && /2 could not be deleted/.test(r.done)
  && /has appointments/.test(r.done), r.done);
check('the rows are still reported as deleted when Square partly fails', /4 client rows deleted/.test(r.done), r.done);

// 5. No Square connected on this login: a clear reason, and the rows still went.
await show();
squareCalls = []; squareMode = 'noconnect';
r = await press();
check('a login with no Square of its own says so', /could not be deleted/.test(r.done)
  && /Connect your own Square account|not connected/i.test(r.done), r.done);
check('it stops after the first 401 rather than hammering Square', squareCalls.length === 1, JSON.stringify(squareCalls.length));

// 6. Nothing in Square at all: no call, and the screen says so up front.
await page.evaluate(st => { document.querySelectorAll('#confirm-modal').forEach(m => m.remove());
  const s2 = JSON.parse(JSON.stringify(st));
  s2.junk.squareCounts = { removed: 0, deleted: 0, stranger: 0 };
  s2.junk.removed[0].sq = ''; s2.junk.deleted[0].sq = ''; s2.junk.stranger[0].sq = '';
  _recoverState = s2; _recoverPick = {}; renderClientRecover(); }, STATE);
await page.waitForTimeout(300);
const none = await page.evaluate(() => ({
  txt: ((document.getElementById('S') || {}).textContent || '').replace(/\s+/g, ' '),
  box: !!document.getElementById('pg-square') }));
check('an account with nothing in Square gets no tick and a plain line',
  !none.box && /None of these are Square customers/.test(none.txt), none.txt.slice(0, 160));

await browser.close();

let bad = 0;
for (const r2 of results) { if (!r2.pass) bad++;
  console.log('  ' + (r2.pass ? 'PASS' : 'FAIL') + '  ' + r2.name.padEnd(58) + (r2.pass ? '' : ('  <- ' + r2.detail))); }
console.log(bad ? '\n' + bad + ' of ' + results.length + ' FAILED'
  : '\nSquare ids come only from rows that were really deleted, the founder endpoint never\n'
  + 'touches Square itself, unticking it means no call at all, and a customer Square keeps\n'
  + 'is reported rather than swallowed');
process.exit(bad ? 1 : 0);
