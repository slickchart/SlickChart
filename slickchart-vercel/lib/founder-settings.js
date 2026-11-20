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
  // 1 = on. 2026-11-18, two new providers in a row "couldn't make an account" and Ashley only heard
  // from them: "make sure it doesnt happen again". Separate from the one above on purpose: this one
  // fires only when someone who paid is actively being turned away (lib/signup-rescue.js).
  signup_problem_alert_on: { def: 1, min: 0, max: 1, label: 'Tell me right away when someone who paid is turned away at sign-up' },
  // Membership billing on the server (lib/perks-billing.js, 2026-11-20). Ashley chose "report-only
  // first": while this is 0 the hourly job only lists who it WOULD charge and charges nobody. She
  // turns it on from Loyalty & memberships after reading that list.
  membership_autobill_live: { def: 0, min: 0, max: 1, label: 'Charge memberships automatically from the server (off = report only)' },
  membership_autobill_start_hour: { def: 9, min: 0, max: 23, label: 'Earliest hour of the day to charge a membership (provider\u2019s own time)' },
  membership_autobill_end_hour: { def: 20, min: 1, max: 24, label: 'Stop charging memberships at this hour (provider\u2019s own time)' },
  membership_autobill_retry_hours: { def: 24, min: 1, max: 168, label: 'Hours to wait before trying a declined membership card again' },
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
  // The charging window always holds at least one hour.
  if (out.membership_autobill_end_hour <= out.membership_autobill_start_hour) out.membership_autobill_end_hour = Math.min(24, out.membership_autobill_start_hour + 1);
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
