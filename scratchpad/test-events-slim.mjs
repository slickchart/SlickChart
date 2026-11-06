// The provider events list stays under Vercel's 4.5 MB response cap (Josie, 2026-11-06), and the app
// files a slimmed event only after fetching it whole. Part 1 node, part 2 Chromium.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-')); fs.mkdirSync(path.join(dir, 'lib')); fs.mkdirSync(path.join(dir, 'api'));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.copyFileSync(path.join(SRC, 'api/clients.js'), path.join(dir, 'api/clients.js'));
fs.writeFileSync(path.join(dir, 'lib/auth.js'), 'export function verifyToken(){return null;} export async function isSessionValid(){return true;}');
fs.writeFileSync(path.join(dir, 'lib/db.js'), 'export function dbEnabled(){return true;} export function sql(){return async()=>[];}');
fs.writeFileSync(path.join(dir, 'lib/clients.js'), 'export async function ensureClientTables(){} export async function upsertClient(){} export async function listClients(){return [];} export async function listEvents(){return [];} export async function listEventClients(){return [];} export async function markClientDeleted(){} export async function mergeClientRows(){}');
const { slimEvents } = await import(pathToFileURL(path.join(dir, 'api/clients.js')));
let bad = 0; const ck = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) bad++; };
const photo = 'data:image/jpeg;base64,' + 'A'.repeat(400000);
const now = Date.now();
const ev = [];
ev.push({ id: 'e_new_form', kind: 'form', client_id: 'c1', created_at: now - 1000, payload: { formId: 'intake', title: 'Intake', answers: { a: 'yes' }, sigImg: 'data:image/png;base64,' + 'B'.repeat(100000) } });
for (let i = 0; i < 30; i++) ev.push({ id: 'ci' + i, kind: 'checkin', client_id: 'c1', created_at: now - 86400000 * (5 + i), payload: { photos: [photo, photo], notes: 'n' + i } });
ev.push({ id: 'e_old_form', kind: 'form', client_id: 'c2', created_at: now - 86400000 * 60, payload: { formId: 'intake', title: 'Intake', answers: { a: 'no', p: photo } } });
const before = JSON.stringify(ev).length, out = slimEvents(ev), after = JSON.stringify(out).length;
console.log('bytes before', before, 'after', after);
ck(before > 4500000, 'the fixture is over the 4.5 MB cap, like her account');
ck(after < 4000000, 'the list sent is under it');
ck(!out[0].slim && out[0].payload.sigImg, 'the newest form goes whole, signature included');
const old = out.find(e => e.id === 'e_old_form');
const s2 = slimEvents([{ id: 'big', kind: 'form', created_at: now - 86400000 * 90, payload: { answers: { a: 'x'.repeat(10) } } }].concat(ev)).find(e => e.id === 'e_old_form');
ck(s2.slim ? (s2.payload.answers.a === 'no' && s2.payload.answers.p === '') : true, 'an old form, when slimmed, keeps its answers and drops only the photo');
ck(old.payload.answers.a === 'no', 'an old form is never emptied');
const sl = out.find(e => e.slim && e.kind === 'checkin');
ck(sl && sl.payload.photosCount === 2 && sl.payload.photos.length === 0 && sl.payload.notes, 'a slimmed check-in keeps its notes and says how many photos');
ck(out.length === ev.length && out.every((e, i) => e.id === ev[i].id), 'every event is still listed, in order');

// Part 2: the app fetches what it must file whole, holds back what it could not get.
const pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default;
const b = await pw.chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); });
const P = 'data:image/jpeg;base64,/9j/' + 'A'.repeat(3000);
const FULL = { ev_ci: { id: 'ev_ci', kind: 'checkin', client_id: 'c_j', created_at: now - 86400000 * 9, payload: { photos: [P], notes: 'whole', dateLabel: 'Nov 1' } },
  ev_form: { id: 'ev_form', kind: 'form', client_id: 'c_j', created_at: now - 86400000 * 9, payload: { formId: 'intake', title: 'New client intake', answers: { x: 'y' }, signed: true, sigImg: P } } };
const LIST = [{ ...FULL.ev_form, slim: true, payload: { formId: 'intake', title: 'New client intake', answers: { x: 'y' }, signed: true } },
  { ...FULL.ev_ci, slim: true, payload: { photos: [], photosCount: 1, notes: 'whole', dateLabel: 'Nov 1' } },
  { id: 'ev_gone', kind: 'checkin', client_id: 'c_j', created_at: now - 86400000 * 9, slim: true, payload: { photos: [], photosCount: 2 } }];
const fullAsked = [];
await page.route('**/api/store*', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().method() === 'GET' ? '{"data":{}}' : '{"ok":true}' }));
await page.route('**/api/clients*', r => {
  const u = new URL(r.request().url()); const f = u.searchParams.get('full');
  if (f) { fullAsked.push(f); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, events: f.split(',').map(i => FULL[i]).filter(Boolean) }) }); }
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, clients: [], events: LIST, eventClients: [] }) });
});
await page.route('**/api/cloud-status*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }));
await page.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await page.waitForTimeout(4000);
const r = await page.evaluate(async () => {
  Object.keys(CL).forEach(k => delete CL[k]);
  CL.c_j = { name: 'Josie Statzer', email: 'j@x', skin: '—', concerns: '—', allergies: 'None noted', fitz: '—', lastVisit: '—', nextVisit: 'Not scheduled', treatment: 'New client', sessions: 0, seriesTotal: 0, touchUpDate: '—', conditions: '', notes: '', appInvited: true, _token: 't' };
  localStorage.setItem('sc_seen_events', '[]');
  await syncClientEvents();
  const f = (CL.c_j.submittedForms || [])[0] || {};
  const seen = JSON.parse(localStorage.getItem('sc_seen_events') || '[]');
  const ci = (checkins || []).find(x => x.id === 'ev_ci');
  return { formEv: f.evId, hasIntake: _hasIntakeOnFile(CL.c_j), ciPhotos: ci ? (ci.photos || []).length : -1, seen, poll: window._evPoll };
});
console.log(JSON.stringify(r), 'full asked', fullAsked);
ck(r.formEv === 'ev_form' && r.hasIntake, 'a slimmed form is fetched whole and lands on the chart');
ck(r.ciPhotos === 1, 'a slimmed unseen check-in is filed WITH its photo');
ck(!r.seen.includes('ev_gone'), 'an event that could not be fetched whole is not marked seen (it waits)');
ck(r.poll && r.poll.status === 200 && r.poll.fails === 0, 'the poll outcome is recorded for the device report');
await b.close();
console.log(bad ? '\nFAILURES: ' + bad : '\nall pass'); process.exit(bad ? 1 : 0);
