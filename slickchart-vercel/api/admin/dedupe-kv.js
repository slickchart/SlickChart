// GET  /api/admin/dedupe-kv           Authorization: Monitor <key>  — report only: every account value that
//                                     holds exact repeat rows, with sizes before and after (masked emails).
// POST /api/admin/dedupe-kv?apply=1   — removes those exact repeats, saving each earlier copy to kv_history
//                                     first (reason 'dedupe'). See lib/kv-dedupe.js for why and what it can touch.
import { dbEnabled, sql } from '../../lib/db.js';
import { monitorKeyOk } from '../feedback.js';
import { maskEmail } from '../../lib/app-launch-log.js';
import { dedupeAccounts } from '../../lib/kv-dedupe.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!dbEnabled()) { res.status(503).json({ error: 'database not configured' }); return; }
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const q = sql();
  let ok = false; try { ok = await monitorKeyOk(req, q, owner); } catch (e) { ok = false; }
  if (!ok) { res.status(403).json({ error: 'This key is switched off. Copy a new one from Feedback Inbox.' }); return; }
  const apply = req.method === 'POST' && String((req.query && req.query.apply) || '') === '1';
  try {
    const emails = {};
    try { (await q`SELECT id, email FROM providers`).forEach(r => { emails[r.id] = maskEmail(r.email); }); } catch (e) {}
    const r = await dedupeAccounts(q, { apply });
    const mb = n => (Number(n) / 1e6).toFixed(2) + ' MB';
    const lines = r.found.map(f => (emails[f.owner] || ('account …' + String(f.owner).slice(-4))) + ': ' + f.k
      + (f.error ? ' could not be read (' + f.error + ')' : ' ' + mb(f.before) + ' -> ' + mb(f.after) + ', ' + f.itemsBefore + ' -> ' + f.itemsAfter + ' rows' + (apply ? (f.applied ? ', done' : ', skipped (changed while running)') : '')));
    const saved = r.found.reduce((s, f) => s + ((f.before || 0) - (f.after || 0)), 0);
    res.status(200).json({ applied: apply, scanned: r.scanned, accounts: new Set(r.found.map(f => f.owner)).size, values: r.found.length, savedBytes: saved, saved: mb(saved), lines });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e).slice(0, 200) });
  }
}
