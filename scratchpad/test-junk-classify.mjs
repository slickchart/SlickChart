// WHICH CLIENT ROWS A CLEAR-OUT IS ALLOWED TO TAKE — api/admin/client-recover.js classifyJunk.
//
// Ashley, 2026-10-13: "i saw it has all the junk data clients on the server still. we can get rid
// of all of those." Her account carries thousands of client rows for a one-person practice, and
// her app recreates any of them its roster has not got, every 15 seconds, so they are not inert.
//
// This is the only HARD delete of a provider's client rows anywhere in the app. The expensive
// mistakes are all one shape — a field nobody thought of, so a row that held real work read as
// empty and went. Each case below is a field that would have been missed:
//
//   - aftercare, routine, pendingGuides, pendingCourses, vcInvite, routineReview, loyalty and a
//     check-in request are NOT in describe(), the function the recovery screen displays. A purge
//     written against describe() calls a row holding a homecare list "empty".
//   - the blob is stamped with the studio name, address, phone, website, provider name, booking
//     config and availability on EVERY row, so a blank skeleton is still hundreds of bytes and
//     size can never be the test.
//   - the app seeds a new client with skin '—', allergies 'None noted', treatment 'New client', so
//     an untouched row scores five filled chart fields unless placeholders are excluded.
//   - a submission can sit in client_events while the blob is empty, because nothing ingested it.
//   - an unreadable blob is not an empty one.
//   - a failed roster read must not make every live row look like a stranger.
//   - and §0.1: another provider's row must be unreachable from here.
//
// lib/db.js imports @neondatabase/serverless, which is not installed here (CLAUDE.md §3), so the
// module is loaded with its imports swapped for stubs. The logic under test is the real file's text.
//
//   node scratchpad/test-junk-classify.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../slickchart-vercel/api/admin/client-recover.js', import.meta.url).pathname;
const OUT = join(process.env.TMPDIR || '/tmp', 'sc-junk-undertest.mjs');

let src = readFileSync(SRC, 'utf8');
// Drop the real imports; nothing under test here touches them.
src = src.replace(/^import\s[\s\S]*?from\s+'[^']+';\s*$/gm, '');
src = 'const sql=()=>{throw new Error("classifyJunk must take its q, never reach for sql()");};\n'
    + 'const verifyToken=()=>null,isSessionValid=async()=>true,dbEnabled=()=>true;\n'
    + 'const ensureTable=async()=>{},ensureProvidersTable=async()=>{},ensureFilesTable=async()=>{},ensureClientTables=async()=>{};\n'
    + 'const listHistory=async()=>[],restoreVersion=async()=>({ok:false}),ensureHistoryTable=async()=>{},itemCount=()=>0;\n'
    + src;
writeFileSync(OUT, src);
const { classifyJunk, clientContent } = await import(OUT);

// ── the smallest SQL stub that answers exactly the five statements classifyJunk runs ────────────
const norm = s => String(s).replace(/\s+/g, ' ').trim();
function makeQ(db) {
  return function q(strings, ...values) {
    const text = norm(strings.join('\u0000'));
    const arg = values[0];
    if (/FROM clients WHERE provider_id/.test(text)) {
      return Promise.resolve(db.clients.filter(r => String(r.provider_id) === String(arg))
        .map(r => Object.assign({}, r))
        .sort((a, b) => String(a.name || '').toLowerCase().localeCompare(String(b.name || '').toLowerCase())));
    }
    if (/jsonb_typeof\(v::jsonb\) AS kind FROM kv/.test(text)) {
      const v = db.kv[String(arg) + '|sc_clients'];
      if (v === undefined) return Promise.resolve([]);
      if (v === null) return Promise.resolve([{ kind: 'null' }]);
      return Promise.resolve([{ kind: Array.isArray(v) ? 'array' : (typeof v === 'object' ? 'object' : 'string') }]);
    }
    if (/jsonb_object_keys\(v::jsonb\) AS id FROM kv/.test(text)) {
      const key = /sc_deleted_clients/.test(text) ? 'sc_deleted_clients' : 'sc_clients';
      const v = db.kv[String(arg) + '|' + key];
      if (!v || typeof v !== 'object' || Array.isArray(v)) return Promise.resolve([]);
      return Promise.resolve(Object.keys(v).map(id => ({ id })));
    }
    if (/jsonb_array_elements/.test(text)) {
      const v = db.kv[String(arg) + '|sc_clients'];
      if (!Array.isArray(v)) return Promise.resolve([]);
      return Promise.resolve(v.map(e => ({ id: e && e.id })));
    }
    if (/FROM client_events WHERE provider_id/.test(text)) {
      const per = {};
      db.events.filter(e => String(e.provider_id) === String(arg))
        .forEach(e => { per[e.client_id] = (per[e.client_id] || 0) + 1; });
      return Promise.resolve(Object.keys(per).map(id => ({ client_id: id, n: per[id] })));
    }
    throw new Error('stub has no answer for: ' + text.slice(0, 90));
  };
}

// What _assembleClientData puts on EVERY blob, however empty the client is.
const CHROME = { studio: 'Botanical', studioAddress: '1 High St', studioPhone: '555', website: 'https://x',
  providerName: 'Ashley', booking: { canRequest: true },
  availability: { mon: ['9:00', '10:00', '11:00'], tue: ['9:00'] },
  checkinCfg: { on: true, hours: 48 } };
const SKEL = Object.assign({}, CHROME, { _uAt: 0, animals: [], summaries: [], aftercare: [], products: [],
  routine: null, forms: [], pendingForms: [], pendingGuides: [], pendingCourses: [], progressPhotos: [],
  suggestedBooking: null, vcInvite: null, routineReview: null, checkinReqAt: 0, loyalty: null,
  profile: { skin: '—', concerns: '—', allergies: 'None noted', fitz: '—',
    treatment: 'New client', lastVisit: '', nextVisit: '', email: '', phone: '' } });
const blob = extra => JSON.stringify(Object.assign({}, SKEL, extra || {}));

let row = 0;
function client(o) {
  return Object.assign({ id: 'c' + (++row), provider_id: 'P', name: 'C' + row, token: 't' + row,
    deleted_at: null, opened_at: null, invited_at: null, data: blob() }, o);
}

const results = [];
const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });

// ── 1. every per-client field holds a row back, including the ones describe() cannot see ───────
{
  const CASES = [
    ['a session summary', { summaries: [{ date: '2026-10-01', text: 'peel' }] }],
    ['a homecare list', { aftercare: ['Cleanser am', 'SPF'] }],
    ['a product plan', { products: [{ name: 'Vitamin C' }] }],
    ['a routine', { routine: { items: [{ name: 'serum' }] } }],
    ['a signed form', { forms: [{ formId: 'f1' }] }],
    ['a pending form', { pendingForms: [{ formId: 'f1' }] }],
    ['a pending guide', { pendingGuides: [{ guideId: 'g1' }] }],
    ['a pending course', { pendingCourses: [{ id: 'k1' }] }],
    ['a progress photo', { progressPhotos: [{ pid: 'p1' }] }],
    ['an animal', { animals: [{ id: 'h1', name: 'Bear' }] }],
    ['a consult invite', { vcInvite: { sentAt: 1 } }],
    ['a routine review', { routineReview: { date: '2026-10-01' } }],
    ['a suggested booking', { suggestedBooking: { date: '2026-10-20', time: '10:00' } }],
    ['a check-in request', { checkinReqAt: 1760000000000 }],
    ['loyalty points', { loyalty: { points: 40 } }],
    ['a typed chart field', { profile: Object.assign({}, SKEL.profile, { concerns: 'rosacea, sensitive' }) }]
  ];
  for (const [label, extra] of CASES) {
    row = 0;
    const db = { clients: [client({ id: 'keep', name: 'Holds something', data: blob(extra) })], kv: { 'P|sc_clients': {} }, events: [] };
    const { junk } = await classifyJunk(makeQ(db), 'P');
    const taken = junk.removed.concat(junk.deleted, junk.stranger).map(r => r.id);
    check('held back by ' + label, taken.indexOf('keep') < 0 && junk.kept.length === 1,
      'taken=' + JSON.stringify(taken) + ' kept=' + JSON.stringify(junk.kept.map(k => k.why)));
  }
}

// ── 2. a blank skeleton IS a candidate, despite being hundreds of bytes of provider chrome ─────
{
  row = 0;
  const skel = client({ id: 'skel', name: 'New client' });
  const db = { clients: [skel], kv: { 'P|sc_clients': {} }, events: [] };
  const { junk } = await classifyJunk(makeQ(db), 'P');
  check('a blank skeleton is a stranger', junk.stranger.length === 1 && junk.stranger[0].id === 'skel',
    JSON.stringify(junk.kept.map(k => k.why)));
  check('placeholders do not read as a filled chart', (skel.data.length > 300) && junk.kept.length === 0,
    'blob is ' + skel.data.length + ' bytes, kept ' + junk.kept.length);
}

// ── 3. a submission, an opened link, an animal link and an unreadable blob all hold a row ──────
{
  row = 0;
  const db = {
    clients: [
      client({ id: 'ev', name: 'Submitted a form' }),
      client({ id: 'opened', name: 'Opened their link', opened_at: 1760000000000 }),
      client({ id: 'owner', name: 'Owner', data: blob({ animals: [{ id: 'horse', name: 'Bear' }] }) }),
      client({ id: 'horse', name: 'Bear' }),
      client({ id: 'bad', name: 'Unreadable', data: '{not json' })
    ],
    kv: { 'P|sc_clients': {} }, events: [{ provider_id: 'P', client_id: 'ev' }]
  };
  const { junk } = await classifyJunk(makeQ(db), 'P');
  const taken = junk.removed.concat(junk.deleted, junk.stranger).map(r => r.id);
  const why = id => (junk.kept.find(k => k.id === id) || {}).why || '';
  check('a submission holds the row', taken.indexOf('ev') < 0 && /submission/.test(why('ev')), why('ev'));
  check('an opened link holds the row', taken.indexOf('opened') < 0 && /opened their own link/.test(why('opened')), why('opened'));
  check('another client’s animal is never taken', taken.indexOf('horse') < 0 && /animal under another client/.test(why('horse')), why('horse'));
  check('an unreadable blob is not an empty one', taken.indexOf('bad') < 0 && /could not be read/.test(why('bad')), why('bad'));
}

// ── 4. the three classes, and the two things that keep a live row out of `stranger` ─────────────
{
  row = 0;
  const db = {
    clients: [
      client({ id: 'gone', name: 'Already removed', deleted_at: 1759000000000 }),
      client({ id: 'shedeleted', name: 'She deleted this' }),
      client({ id: 'inroster', name: 'In her list' }),
      client({ id: 'invited', name: 'Invited, never opened', invited_at: 1760000000000 }),
      client({ id: 'nobody', name: 'Nobody knows this one' })
    ],
    kv: { 'P|sc_clients': { inroster: { name: 'In her list' } },
          'P|sc_deleted_clients': { shedeleted: 1 } },
    events: []
  };
  const { junk } = await classifyJunk(makeQ(db), 'P');
  const ids = k => junk[k].map(r => r.id).sort();
  check('tombstoned lands in `removed`', JSON.stringify(ids('removed')) === '["gone"]', JSON.stringify(ids('removed')));
  check('her own delete record lands in `deleted`', JSON.stringify(ids('deleted')) === '["shedeleted"]', JSON.stringify(ids('deleted')));
  check('only the unknown row is a `stranger`', JSON.stringify(ids('stranger')) === '["nobody"]', JSON.stringify(ids('stranger')));
  check('a row in her list is never offered', ids('stranger').indexOf('inroster') < 0 && junk.kept.every(k => k.id !== 'inroster'), '');
  check('an invited row is never offered', ids('stranger').indexOf('invited') < 0, JSON.stringify(ids('stranger')));
}

// ── 5. a deleted row that HOLDS something is still held back ────────────────────────────────────
{
  row = 0;
  const db = {
    clients: [client({ id: 'd1', name: 'Deleted but has a summary', data: blob({ summaries: [{ text: 'peel' }] }) })],
    kv: { 'P|sc_clients': {}, 'P|sc_deleted_clients': { d1: 1 } }, events: []
  };
  const { junk } = await classifyJunk(makeQ(db), 'P');
  check('a deleted row holding work is kept, not purged',
    junk.deleted.length === 0 && junk.kept.length === 1 && junk.kept[0].state === 'she deleted it',
    JSON.stringify(junk.kept));
}
// ...and so is a tombstoned one.
{
  row = 0;
  const db = {
    clients: [client({ id: 'r1', name: 'Removed but has photos', deleted_at: 1, data: blob({ progressPhotos: [{ pid: 'p' }] }) })],
    kv: { 'P|sc_clients': {} }, events: []
  };
  const { junk } = await classifyJunk(makeQ(db), 'P');
  check('a tombstoned row holding photos is kept, not purged',
    junk.removed.length === 0 && junk.kept.length === 1, JSON.stringify(junk.kept));
}

// ── 6. a roster that could not be read withholds the whole `stranger` class ─────────────────────
{
  row = 0;
  const db = { clients: [client({ id: 'a' }), client({ id: 'b' })], kv: {}, events: [] };   // no sc_clients row at all
  const { junk, rosterReadable } = await classifyJunk(makeQ(db), 'P');
  check('an unreadable roster is reported as such', rosterReadable === false, String(rosterReadable));
  check('an unreadable roster offers no strangers', junk.stranger.length === 0, JSON.stringify(junk.stranger));
  check('those rows are listed with the reason instead',
    junk.kept.length === 2 && junk.kept.every(k => /account list could not be read/.test(k.why)),
    JSON.stringify(junk.kept.map(k => k.why)));
}

// ── 7. an array-shaped roster is read too (both shapes exist in the wild) ───────────────────────
{
  row = 0;
  const db = { clients: [client({ id: 'inlist' }), client({ id: 'out' })],
    kv: { 'P|sc_clients': [{ id: 'inlist', name: 'x' }] }, events: [] };
  const { junk, rosterReadable } = await classifyJunk(makeQ(db), 'P');
  check('an array roster is readable', rosterReadable === true, String(rosterReadable));
  check('an array roster still protects its own', JSON.stringify(junk.stranger.map(r => r.id)) === '["out"]',
    JSON.stringify(junk.stranger.map(r => r.id)));
}

// ── 8. §0.1 — another provider's rows are unreachable ──────────────────────────────────────────
{
  row = 0;
  const db = {
    clients: [client({ id: 'mine' }), client({ id: 'theirs', provider_id: 'OTHER', name: 'Another provider’s client' })],
    kv: { 'P|sc_clients': {}, 'OTHER|sc_clients': {} }, events: []
  };
  const { junk } = await classifyJunk(makeQ(db), 'P');
  const all = junk.removed.concat(junk.deleted, junk.stranger, junk.kept).map(r => r.id);
  check('another account’s row is not even looked at', all.indexOf('theirs') < 0, JSON.stringify(all));
}

// ── 9. clientContent on its own: a null blob is empty, a scalar is not readable ─────────────────
check('a null blob holds nothing', (clientContent(null).holds || []).length === 0, '');
check('an empty object holds nothing', (clientContent('{}').holds || []).length === 0, '');
check('a scalar blob is unreadable, not empty', clientContent('"hello"').unreadable === true, '');
check('an array blob is unreadable, not empty', clientContent('[1,2]').unreadable === true, '');
check('provider chrome alone holds nothing', (clientContent(JSON.stringify(CHROME)).holds || []).length === 0,
  JSON.stringify(clientContent(JSON.stringify(CHROME)).holds));

let bad = 0;
for (const r of results) {
  if (!r.pass) bad++;
  console.log('  ' + (r.pass ? 'PASS' : 'FAIL') + '  ' + r.name.padEnd(52) + (r.pass ? '' : ('  <- ' + r.detail)));
}
console.log(bad ? '\n' + bad + ' of ' + results.length + ' FAILED'
  : '\nnothing holding a summary, homecare list, plan, routine, form, guide, course, photo,\n'
  + 'animal, consult, review, booking, check-in, loyalty point, typed chart field, submission\n'
  + 'or an unreadable blob can be taken by a clear-out, and no other account is reachable');
process.exit(bad ? 1 : 0);
