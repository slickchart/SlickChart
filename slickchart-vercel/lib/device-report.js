// Device reports (2026-10-17). Each signed-in device sends a small health report about ITSELF when the
// app opens: build, kind of app, whether its own storage works, and COUNTS of what it holds (summaries,
// clients, homecare, logo yes/no). No names, no notes, no client data. One row per provider per
// device, overwritten each time, read only by the founder recovery screen. Ashley asked for this so a
// provider who is already helping is never asked to run a diagnostic by hand.
import { sql } from './db.js';

let _ready = false;
export async function ensureDeviceReportsTable() {
  if (_ready) return;
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS device_reports (
    provider_id text NOT NULL,
    device_key text NOT NULL,
    report jsonb NOT NULL,
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (provider_id, device_key)
  )`;
  _ready = true;
}

// Only these fields, only these shapes. Anything else is dropped, so a report can never carry text.
const NUM = ['summaryClients', 'summaryEntries', 'summariesOpen', 'homecareClients', 'clientsSaved', 'clientsOpen', 'storageKB', 'unsent', 'memOnly'];
const BOOL = ['logo', 'idbWorks', 'standalone', 'native'];
// clientsGone: the last few clients this device took off her list and why, as ids (never names).
const STR = { build: 24, kind: 24, platform: 24, offloaded: 300, reloadFails: 300, email: 120, clientsGone: 1200 };
export function cleanReport(r) {
  const out = {};
  if (!r || typeof r !== 'object') return out;
  for (const k of NUM) { const n = Number(r[k]); if (Number.isFinite(n) && n >= 0 && n < 1e9) out[k] = Math.round(n); }
  for (const k of BOOL) if (typeof r[k] === 'boolean') out[k] = r[k];
  for (const k of Object.keys(STR)) if (typeof r[k] === 'string') out[k] = r[k].slice(0, STR[k]);
  return out;
}

export async function saveDeviceReport(providerId, deviceKey, report) {
  await ensureDeviceReportsTable();
  const q = sql();
  const r = JSON.stringify(cleanReport(report));
  await q`INSERT INTO device_reports (provider_id, device_key, report, updated_at)
          VALUES (${providerId}, ${deviceKey}, ${r}::jsonb, now())
          ON CONFLICT (provider_id, device_key) DO UPDATE SET report = EXCLUDED.report, updated_at = now()`;
}

export async function listDeviceReports(providerId) {
  await ensureDeviceReportsTable();
  const q = sql();
  return await q`SELECT device_key, report, updated_at FROM device_reports
                 WHERE provider_id = ${providerId} ORDER BY updated_at DESC LIMIT 12`;
}
