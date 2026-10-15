// SWEEP 2 / Google Calendar: two overlapping pushes create the same appointment twice in Google.
//
//   node scratchpad/sweep2-square-gcal-race.mjs
//
// syncApptsToAccount() reads event_map once, then walks EVERY appointment with one Google call each
// (PATCH for known, POST for new), then writes the map back. A push takes N round trips, so a
// second push (she adds another appointment a few seconds later; the phone and the laptop each push)
// starts from the same old map, POSTs the same new appointment again, and whichever finishes last
// overwrites the map. The other Google event is in nobody's map: never patched, never deleted.
import fs from 'fs'; import os from 'os'; import path from 'path';
const V = '/home/user/SlickChart/slickchart-vercel';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sw2gr-'));
fs.mkdirSync(path.join(root, 'lib'));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
fs.copyFileSync(path.join(V, 'lib', 'google-cal.js'), path.join(root, 'lib', 'google-cal.js'));
fs.writeFileSync(path.join(root, 'lib', 'db.js'), `
export const ROW = { id:'p1:g', provider_id:'p1', label:'her', access_token:'GTOK', refresh_token:'GR', expires_at: Date.now()+3600e3, calendar_ids:'primary', event_map:'{}', private_titles:false, created_at:1 };
export function dbEnabled(){ return true; }
export function sql(){ return (s, ...v) => { const t = s.join('?');
  if (/SELECT[\\s\\S]*FROM google_accounts WHERE provider_id/.test(t)) return Promise.resolve([{ ...ROW }]);
  if (/UPDATE google_accounts SET event_map=/.test(t)) { ROW.event_map = v[0]; }
  return Promise.resolve([]); }; }
`);
const events = {}; let n = 0;
globalThis.fetch = async (url, opts = {}) => {
  await new Promise(r => setTimeout(r, 150));                 // one Google round trip
  const m = (opts.method || 'GET').toUpperCase(); const u = String(url);
  const R = (o, st = 200) => ({ ok: st < 400, status: st, json: async () => o, text: async () => JSON.stringify(o) });
  if (m === 'POST' && /\/events$/.test(u)) { const id = 'ev' + (++n); events[id] = JSON.parse(opts.body); return R({ id }); }
  if (m === 'PATCH') { const id = decodeURIComponent(u.split('/').pop()); if (!events[id]) return R({}, 404); events[id] = JSON.parse(opts.body); return R({ id }); }
  if (m === 'DELETE') { const id = decodeURIComponent(u.split('/').pop()); delete events[id]; return R({}); }
  return R({});
};
const G = await import(path.join(root, 'lib', 'google-cal.js'));
const db = await import(path.join(root, 'lib', 'db.js'));
// Her existing 20 appointments are already in Google.
const old = []; for (let i = 0; i < 20; i++) old.push({ id: 'ma_' + i, dateISO: '2026-11-' + String(1 + (i % 28)).padStart(2, '0'), startMins: 600, durMins: 60, title: 'Old ' + i });
await G.syncApptsToGoogle('p1', old);
const base = Object.keys(events).length;
// She adds X, then 1s later adds Y. Two pushes, overlapping.
const X = { id: 'ma_X', dateISO: '2026-11-20', startMins: 660, durMins: 60, title: 'X' };
const Y = { id: 'ma_Y', dateISO: '2026-11-21', startMins: 660, durMins: 60, title: 'Y' };
const p1 = G.syncApptsToGoogle('p1', [...old, X]);
await new Promise(r => setTimeout(r, 1000));
const p2 = G.syncApptsToGoogle('p1', [...old, X, Y]);
await Promise.all([p1, p2]);
const titles = Object.values(events).map(e => e.summary);
const xCount = titles.filter(t => t === 'X').length;
const map = JSON.parse(db.ROW.event_map);
const orphans = Object.keys(events).filter(id => !Object.values(map).includes(id));
const ok = xCount === 1 && orphans.length === 0;
console.log((ok ? 'SOUND        ' : 'CONFIRMED-BUG') + `  appointment X is in Google once and every Google event is tracked  — X events=${xCount}, Google events=${Object.keys(events).length} (expected ${base + 2}), untracked (never patched/deleted)=${JSON.stringify(orphans)}`);
fs.rmSync(root, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
