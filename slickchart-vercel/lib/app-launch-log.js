// The phone app's own launch log (2026-10-22). A new provider said the iPhone app "keeps kicking her
// out" while Safari worked, and nothing anywhere could say what her phone did: the device report only
// arrives once she is signed in, and she never got that far. So the app keeps a short log of its own
// launches on the phone (launched, sign-in screen shown, signed in, Home drawn, went to background,
// a script error, a sign-in refusal) and sends it, signed in or not. A launch that ends with no
// "went to background" before the next one is the app being killed (a crash or the phone's memory).
//
// No client data: event names, short reasons and error messages only, every string cut short. One
// row per phone (its random device key). The account is set ONLY from a verified session, never from
// the body, and an anonymous post never clears it. Read only by the founder via the monitor key
// (api/admin/app-launches.js), with the email masked.
import { sql } from './db.js';

let _ready = false;
export async function ensureAppLaunchTable() {
  if (_ready) return;
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS app_launch_logs (
    device_key text PRIMARY KEY,
    provider_id text,
    email text,
    platform text,
    os text,
    build text,
    events jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz DEFAULT now()
  )`;
  _ready = true;
}

const s = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, n) : '');
export function cleanEvents(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(-40).map(x => ({ t: Math.round(Number(x && x.t) || 0), e: s(x && x.e, 40), d: s(x && x.d, 160) }))
    .filter(x => x.e && x.t > 0);
}

export async function saveAppLaunch(deviceKey, info, who) {
  await ensureAppLaunchTable();
  const q = sql();
  const ev = JSON.stringify(cleanEvents(info.events));
  const pid = who && who.u ? String(who.u) : null;
  const em = who && who.e ? String(who.e).slice(0, 120) : null;
  await q`INSERT INTO app_launch_logs (device_key, provider_id, email, platform, os, build, events, updated_at)
          VALUES (${deviceKey}, ${pid}, ${em}, ${s(info.platform, 24)}, ${s(info.os, 40)}, ${s(info.build, 24)}, ${ev}::jsonb, now())
          ON CONFLICT (device_key) DO UPDATE SET
            provider_id = COALESCE(EXCLUDED.provider_id, app_launch_logs.provider_id),
            email = COALESCE(EXCLUDED.email, app_launch_logs.email),
            platform = EXCLUDED.platform, os = EXCLUDED.os, build = EXCLUDED.build,
            events = EXCLUDED.events, updated_at = now()`;
  // Keep the table small: a phone that has not opened the app in a month is dropped.
  if (Math.random() < 0.05) { try { await q`DELETE FROM app_launch_logs WHERE updated_at < now() - interval '30 days'`; } catch (e) {} }
}

export function maskEmail(e) {
  const m = String(e || '').match(/^([^@]{0,3})[^@]*(@.*)$/);
  return m ? m[1] + '…' + m[2] : '';
}
