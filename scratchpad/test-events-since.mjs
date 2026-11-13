// The forms/check-ins list sends only what is new (build 2026-11-13d): a phone names the last answer
// it finished filing (?since=), and events older than that arrive without their photos. Nothing may
// be filed without its photos, another account's note may never be used, and a build that does not
// send since gets exactly what it always did. Part 1 node (the endpoint), part 2 the app.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'since-')); fs.mkdirSync(path.join(dir, 'lib')); fs.mkdirSync(path.join(dir, 'api'));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.copyFileSync(path.join(SRC, 'api/clients.js'), path.join(dir, 'api/clients.js'));
fs.writeFileSync(path.join(dir, 'lib/auth.js'), 'export function verifyToken(t){return t==="A"?{u:"prov_a",sid:"s"}:null;} export async function isSessionValid(){return true;}');
fs.writeFileSync(path.join(dir, 'lib/db.js'), 'export function dbEnabled(){return true;} export function sql(){return async()=>[];}');
const now = Date.now();
const photo = 'data:image/jpeg;base64,' + 'A'.repeat(50000);
const EV = [
  { id: 'new_ci', kind: 'checkin', client_id: 'c1', created_at: now - 60000, payload: { photos: [photo], notes: 'today' } },
  { id: 'old_msg', kind: 'message', client_id: 'c1', created_at: now - 86400000 * 4, payload: { text: 'hi' } },
  { id: 'old_ci', kind: 'checkin', client_id: 'c1', created_at: now - 86400000 * 5, payload: { photos: [photo, photo], notes: 'old' } },
];
fs.writeFileSync(path.join(dir, 'lib/clients.js'), 'export async function ensureClientTables(){} export async function upsertClient(){} export async function listClients(p){return p==="prov_a"?[{id:"c1",name:"Amber"}]:[];} export async function listEvents(p){return p==="prov_a"?' + JSON.stringify(EV) + ':[];} export async function listEventClients(){return [];} export async function markClientDeleted(){} export async function mergeClientRows(){}');
process.env.SESSION_SECRET = 'x';
const mod = await import(pathToFileURL(path.join(dir, 'api/clients.js')));
let bad = 0; const ck = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) bad++; };
async function call(q, hdr) {
  const res = { h: {}, code: 0, body: '', setHeader(k, v) { this.h[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = JSON.stringify(o); }, send(b) { this.body = b; }, end() {} };
  await mod.default({ method: 'GET', query: q, headers: Object.assign({ authorization: 'Bearer A' }, hdr || {}) }, res);
  return res;
}
const plain = await call({});
const pj = JSON.parse(plain.body);
ck(pj.events.every(e => !e.slim) && pj.events[2].payload.photos.length === 2, 'no since: every event whole, exactly as before');
const since = now - 86400000 * 2;
const a = await call({ since: String(since) }), aj = JSON.parse(a.body);
const g = id => aj.events.find(e => e.id === id);
ck(!g('new_ci').slim && g('new_ci').payload.photos.length === 1, 'an event after since goes whole');
ck(g('old_ci').slim && g('old_ci').payload.photos.length === 0 && g('old_ci').payload.photosCount === 2 && g('old_ci').payload.notes === 'old', 'an older one comes without its photos, counted, notes kept');
ck(!g('old_msg').slim && g('old_msg').payload.text === 'hi', 'an older one with nothing heavy is sent as it is, not marked slim');
ck(a.body.length < plain.body.length / 2, 'the answer is much smaller (' + plain.body.length + ' -> ' + a.body.length + ')');
ck(aj.asOf > 0 && aj.asOf <= Date.now(), 'the answer carries the server time to name next time');
const b2 = await call({ since: String(since + 1000) });
ck(b2.h.etag === a.h.etag, 'the fingerprint holds steady from poll to poll (304 keeps working)');
const c304 = await call({ since: String(since) }, { 'if-none-match': a.h.etag });
ck(c304.code === 304, 'a matching fingerprint gets 304');
for (const v of ['abc', '-5', String(now + 86400000 * 5)]) { const r = JSON.parse((await call({ since: v })).body); ck(r.events.every(e => !e.slim), 'a bad since (' + v.slice(0, 6) + ') is ignored'); }
const other = await call({ since: '1' }, { authorization: 'Bearer B' });
ck(other.code === 401, 'since never stands in for sign-in');

// Part 2: the app.
const pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default;
const ENG = process.env.ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const br = await ENG.launch(process.env.ENGINE === 'webkit' ? {} : { executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.addInitScript(() => { if (!sessionStorage.getItem('once')) { sessionStorage.setItem('once', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } });
const P = 'data:image/jpeg;base64,/9j/' + 'A'.repeat(3000);
const FULL = { ev_old: { id: 'ev_old', kind: 'checkin', client_id: 'c_j', created_at: now - 86400000 * 9, payload: { photos: [P], notes: 'whole', dateLabel: 'Nov 1' } } };
let asked = [], fullAsked = [], serve = 'first';
await page.route('**/api/store*', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().method() === 'GET' ? '{"data":{}}' : '{"ok":true}' }));
await page.route('**/api/clients*', r => {
  const u = new URL(r.request().url()); const f = u.searchParams.get('full');
  if (r.request().method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  if (f) { fullAsked.push(f); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, events: f.split(',').map(i => FULL[i]).filter(Boolean) }) }); }
  asked.push(u.search);
  const events = serve === 'first' ? [] : [{ ...FULL.ev_old, slim: true, payload: { photos: [], photosCount: 1, notes: 'whole', dateLabel: 'Nov 1' } }];
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, clients: [], events, eventClients: [], asOf: 1700000000000 }) });
});
await page.route('**/api/cloud-status*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }));
await page.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await page.waitForTimeout(4000);
ck(asked.length && asked[0] === '', 'the first ask on a phone with no note names nothing');
const s1 = await page.evaluate(() => ({ note: JSON.parse(localStorage.getItem('scl_ev_asof') || 'null'), me: _tokenOwner() }));
ck(s1.note && s1.note.t === 1700000000000 && s1.note.o === s1.me, 'after a filed answer the phone notes it, under its own account');
serve = 'second'; asked = [];
const r2 = await page.evaluate(async () => {
  Object.keys(CL).forEach(k => delete CL[k]);
  CL.c_j = { name: 'Josie Statzer', email: 'j@x', skin: '—', concerns: '—', allergies: 'None noted', fitz: '—', lastVisit: '—', nextVisit: 'Not scheduled', treatment: 'New client', sessions: 0, seriesTotal: 0, touchUpDate: '—', conditions: '', notes: '', _token: 't' };
  localStorage.setItem('sc_seen_events', '[]'); syncClientEvents._last = null;
  await syncClientEvents();
  const ci = (checkins || []).find(x => x.id === 'ev_old');
  return { ciPhotos: ci ? ((ci.photos || []).length || (ci.photoPids || []).length) : -1, filed: (capturedPhotos.c_j || []).filter(p => p && p.pid === 'ph_ev_ev_old_0' && /^data:image/.test(p.url)).length, seen: JSON.parse(localStorage.getItem('sc_seen_events') || '[]') };
});
ck(asked[0] === '?since=1700000000000', 'the next ask names it (' + asked[0] + ')');
ck(fullAsked.includes('ev_old') && r2.ciPhotos === 1 && r2.filed === 1 && r2.seen.includes('ev_old'), 'an older event it had not seen is fetched whole and filed WITH its photo');
asked = [];
await page.evaluate(async () => { localStorage.setItem('scl_ev_asof', JSON.stringify({ o: 'someone-else', t: 1700000000000 })); syncClientEvents._last = null; await syncClientEvents(); });
ck(asked[0] === '', "another account's note is never used");
// The opening read started in the page head names it too.
await page.evaluate(() => localStorage.setItem('scl_ev_asof', JSON.stringify({ o: _tokenOwner(), t: 1700000000000 })));
asked = []; serve = 'first';
await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3000);
ck(asked[0] === '?since=1700000000000' && asked.length >= 1, 'the early read at launch asks the same (' + asked.slice(0, 2).join(',') + ')');
await page.evaluate(() => Cloud.logout());
ck(await page.evaluate(() => localStorage.getItem('scl_ev_asof') === null), 'signing out forgets the note');
await br.close();
console.log(bad ? '\nFAILURES: ' + bad : '\nall pass'); process.exit(bad ? 1 : 0);
