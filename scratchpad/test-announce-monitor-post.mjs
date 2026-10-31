// Claude posts a What's new update with her feedback-brief key (Ashley, 2026-10-31: "yes please build
// that"). Runs api/announcements.js + api/feedback.js against an in-memory database.
// Proves: the key posts (marked claude, pushed, emailed to her); a provider, a forged key, a switched-off
// key and a key sent as Bearer cannot; at most 3 a day by key while the owner is not limited; a failed
// post reads as failed; GET still works for providers.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'annmon-'));
fs.mkdirSync(path.join(dir, 'api')); fs.mkdirSync(path.join(dir, 'lib'));
for (const f of ['api/announcements.js', 'api/feedback.js', 'lib/auth.js']) fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(dir, 'lib/db.js'), `
export const S = globalThis.__S = { ann: [], providers: [{ id: 'own', email: 'owner@x.com' }, { id: 'p2', email: 'pro@x.com' }], mon: null, failInsert: false };
export function dbEnabled() { return true; }
export async function ensureProvidersTable() {}
export function sql() { return async (strs, ...v) => {
  const t = strs.join('?').replace(/\\s+/g, ' ');
  if (/CREATE TABLE|ALTER TABLE/.test(t)) return [];
  if (/SELECT email FROM providers/.test(t)) return S.providers.filter(p => p.id === v[0]);
  if (/SELECT nonce/.test(t)) return S.mon && S.mon.owner === v[0] ? [{ nonce: S.mon.nonce }] : [];
  if (/UPDATE feedback_monitor/.test(t)) return [];
  if (/INSERT INTO feedback_monitor/.test(t)) { S.mon = { owner: v[0], nonce: v[1] }; return []; }
  if (/DELETE FROM feedback_monitor/.test(t)) { S.mon = null; return []; }
  if (/SELECT id FROM announcements WHERE title/.test(t)) return S.ann.filter(a => a.title === v[0] && a.body === v[1] && a.ts > Date.now() - 600000);
  if (/SELECT count\\(\\*\\)/.test(t)) return [{ n: S.ann.filter(a => a.source === 'claude' && a.ts > Date.now() - 86400000).length }];
  if (/INSERT INTO announcements/.test(t)) { if (S.failInsert) throw new Error('db down'); S.ann.push({ id: S.ann.length + 1, title: v[0], body: v[1], source: v[2], ts: Date.now() }); return []; }
  if (/FROM announcements ORDER BY/.test(t)) return S.ann.slice().reverse().map(a => ({ ...a, ts: a.ts / 1000 }));
  throw new Error('unhandled SQL: ' + t);
}; }`);
fs.writeFileSync(path.join(dir, 'lib/email.js'), 'export async function sendEmail(m){ (globalThis.__mail ||= []).push(m); }');
fs.writeFileSync(path.join(dir, 'lib/announce-push.js'), 'export async function pushAnnouncementToProviders(t){ (globalThis.__push ||= []).push(t); return { sent: 3, devices: 3 }; }');
fs.writeFileSync(path.join(dir, 'lib/fcm.js'), 'export async function pushFoundersReport(){return{}} export function founderPushConfigured(){return false}');
fs.writeFileSync(path.join(dir, 'lib/notify-log.js'), 'export async function recordNotify(){}');
process.env.SESSION_SECRET = 'test-secret'; process.env.OWNER_EMAIL = 'owner@x.com';
const { default: ann } = await import(pathToFileURL(path.join(dir, 'api/announcements.js')));
const { default: fb } = await import(pathToFileURL(path.join(dir, 'api/feedback.js')));
const { signToken } = await import(pathToFileURL(path.join(dir, 'lib/auth.js')));
const S = globalThis.__S;
const mk = h => async (method, { auth, body } = {}) => { let code = 0, out; const res = { status(c) { code = c; return this; }, json(j) { out = j; } }; await h({ method, headers: auth ? { authorization: auth } : {}, body, query: {} }, res); return { code, j: out }; };
const A = mk(ann), F = mk(fb);
const ownerTok = 'Bearer ' + signToken({ u: 'own', e: 'owner@x.com' }, 'test-secret');
const proTok = 'Bearer ' + signToken({ u: 'p2', e: 'pro@x.com' }, 'test-secret');
let fail = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || d === undefined ? '' : '  — ' + JSON.stringify(d))); if (!c) fail++; };
const key = (await F('POST', { auth: ownerTok, body: { action: 'monitor-key' } })).j.key;
const M = 'Monitor ' + key;
const r1 = await A('POST', { auth: M, body: { title: 'New: face charts', body: 'Hi everyone!' } });
ok(r1.code === 200 && r1.j.ok && S.ann.length === 1 && S.ann[0].source === 'claude', 'the key posts, marked as Claude', r1);
ok((globalThis.__push || []).length === 1, 'it is pushed to providers');
ok((globalThis.__mail || []).length === 1 && /face charts/.test(globalThis.__mail[0].subject) && /Hi everyone/.test(globalThis.__mail[0].text), 'Ashley is emailed the post', globalThis.__mail);
ok((await A('POST', { auth: M, body: { title: 'New: face charts', body: 'Hi everyone!' } })).j.duplicate === true && S.ann.length === 1, 'a repeat is not posted twice');
ok((await A('POST', { auth: proTok, body: { title: 'x', body: 'y' } })).code === 403, 'a provider cannot post');
ok((await A('POST', { auth: 'Bearer ' + key, body: { title: 'x', body: 'y' } })).code === 403, 'the key sent as a session cannot post');
const forged = 'Monitor ' + signToken({ k: 'fbmon', e: 'owner@x.com', n: 'guess' }, 'test-secret');
ok((await A('POST', { auth: forged, body: { title: 'x', body: 'y' } })).code === 403, 'a forged key cannot post');
await A('POST', { auth: M, body: { title: 'two', body: '' } }); await A('POST', { auth: M, body: { title: 'three', body: '' } });
const r4 = await A('POST', { auth: M, body: { title: 'four', body: '' } });
ok(r4.code === 429 && S.ann.length === 3, 'no more than 3 a day by key', r4);
ok((await A('POST', { auth: ownerTok, body: { title: 'owner post', body: '', notify: false } })).code === 200 && S.ann[3].source === 'owner', 'her own posts are not limited and are marked hers');
ok((globalThis.__mail || []).length === 3, 'her own post does not email her');
const g = await A('GET', { auth: proTok });
ok(g.code === 200 && g.j.items.length === 4 && g.j.canPost === false, 'providers still read the board and cannot post');
ok((await A('GET', { auth: M })).j.items.length === 4, 'the key can read the board (to avoid repeats)');
S.failInsert = true;
const rf = await A('POST', { auth: ownerTok, body: { title: 'fails', body: '', notify: false } });
ok(rf.code === 500, 'a failed post reads as failed', rf);
S.failInsert = false;
await F('POST', { auth: ownerTok, body: { action: 'monitor-off' } });
ok((await A('POST', { auth: M, body: { title: 'after off', body: '' } })).code === 403, 'Switch off stops the key posting');
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
