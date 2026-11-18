// Settings that belong to SlickChart itself (not to any one provider), changed only by Ashley from
// Admin tools. One small table, one row per setting. Every setting has a default here, so a missing
// row, a missing table or a bad value never changes behaviour: the default is used.
//
// CLAUDE.md §1f: a number in a behaviour is hers to see and change, never fixed in code.
import { sql } from './db.js';

// key -> { def, min, max, label }. Values are whole numbers.
export const FOUNDER_SETTINGS = {
  orphan_email_hours: { def: 3, min: 1, max: 168, label: 'Hours after paying before the "finish your account" email goes out' },
  orphan_alert_hours: { def: 48, min: 2, max: 720, label: 'Hours after paying before you are told they still have no account' },
  // 0 = off. Ashley 2026-11-11: "i dont need those notifications but i do want you to still email the
  // providers the reminder email to get set up". Off stops only the push + email to her; the
  // provider's own "finish your account" email always goes.
  orphan_alert_on: { def: 0, min: 0, max: 1, label: 'Tell me when someone still has no account' },
};

let _ready = false;
export async function ensureFounderSettingsTable(q) {
  if (_ready) return;
  await (q || sql())`CREATE TABLE IF NOT EXISTS founder_settings (
    k text PRIMARY KEY,
    v text NOT NULL,
    updated_at timestamptz DEFAULT now()
  )`;
  _ready = true;
}

export function cleanSetting(k, v) {
  const d = FOUNDER_SETTINGS[k];
  if (!d) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(d.max, Math.max(d.min, n));
}

// All settings with defaults filled in. Never throws.
export async function getFounderSettings(q) {
  const out = {};
  for (const k of Object.keys(FOUNDER_SETTINGS)) out[k] = FOUNDER_SETTINGS[k].def;
  try {
    q = q || sql();
    await ensureFounderSettingsTable(q);
    const rows = await q`SELECT k, v FROM founder_settings`;
    for (const r of rows) { const c = cleanSetting(r.k, r.v); if (c != null) out[r.k] = c; }
  } catch (e) {}
  // The alert can never come before the email it follows.
  if (out.orphan_alert_hours <= out.orphan_email_hours) out.orphan_alert_hours = out.orphan_email_hours + 1;
  return out;
}

export async function setFounderSetting(q, k, v) {
  const c = cleanSetting(k, v);
  if (c == null) return null;
  await ensureFounderSettingsTable(q);
  await q`INSERT INTO founder_settings (k, v, updated_at) VALUES (${k}, ${String(c)}, now())
    ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
  return c;
}
