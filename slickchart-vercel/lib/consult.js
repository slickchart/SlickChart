// Public "request a consult" feature.
// A provider claims a public slug — slickchart.app/consult/<slug> — that anyone (not just an
// existing client) can open to request a virtual consult. Submissions land as consult_requests
// for that provider to follow up on. The slug lives on the provider row; requests get their own
// table (they're leads, not yet clients, so they don't belong in client_events).
import { sql } from './db.js';
import crypto from 'crypto';

let _ready = false;
export async function ensureConsultSchema() {
  if (_ready) return;
  const q = sql();
  // Slug on the provider row — UNIQUE so two providers can't claim the same public link.
  await q`ALTER TABLE providers ADD COLUMN IF NOT EXISTS consult_slug text`;
  await q`CREATE UNIQUE INDEX IF NOT EXISTS providers_consult_slug_idx ON providers(consult_slug)`;
  await q`CREATE TABLE IF NOT EXISTS consult_requests (
    id text PRIMARY KEY,
    provider_id text NOT NULL,
    name text,
    email text,
    phone text,
    message text,
    status text DEFAULT 'new',
    created_at timestamptz DEFAULT now()
  )`;
  await q`CREATE INDEX IF NOT EXISTS consult_requests_provider_idx ON consult_requests(provider_id, created_at DESC)`;
  _ready = true;
}

// Turn a business/person name into a URL-safe slug.
export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
// 3–40 chars, letters/numbers/hyphens, must start & end alphanumeric.
export function validSlug(s) { return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(String(s || '')); }
// Reserved names a provider can't claim (impersonation / confusion). Slugs are namespaced under
// /consult/ so they can't shadow app routes; this just blocks obvious impersonation handles.
const RESERVED_SLUGS = new Set(['admin','administrator','support','help','helpdesk','official','login','signin','signup','register','api','www','root','staff','team','slickchart','consult','client','clients','account','settings','billing','security','moderator','mod','system','info','contact','sales','billing-support']);
export function reservedSlug(s) { return RESERVED_SLUGS.has(String(s || '').toLowerCase()); }

export async function getProviderBySlug(slug) {
  await ensureConsultSchema();
  const q = sql();
  const rows = await q`SELECT id, name FROM providers WHERE consult_slug = ${String(slug || '').toLowerCase()}`;
  return rows[0] || null;
}

export async function getSlugForProvider(providerId) {
  await ensureConsultSchema();
  const q = sql();
  const rows = await q`SELECT consult_slug FROM providers WHERE id = ${providerId}`;
  return (rows[0] && rows[0].consult_slug) || '';
}

// Claim a slug for a provider. Returns {ok, slug} or {ok:false, error}.
export async function claimSlug(providerId, desired) {
  await ensureConsultSchema();
  const slug = slugify(desired);
  if (!validSlug(slug)) return { ok: false, error: 'Use 3–40 letters, numbers, or hyphens.' };
  if (reservedSlug(slug)) return { ok: false, error: 'That link name is reserved — please choose another.' };
  const q = sql();
  const owner = await q`SELECT id FROM providers WHERE consult_slug = ${slug}`;
  if (owner[0] && owner[0].id !== providerId) return { ok: false, error: 'That link name is taken — try another.' };
  try {
    await q`UPDATE providers SET consult_slug = ${slug} WHERE id = ${providerId}`;
  } catch (e) {
    // Unique-index violation from a concurrent claim of the same slug.
    return { ok: false, error: 'That link name is taken — try another.' };
  }
  return { ok: true, slug };
}

export async function addConsultRequest(providerId, { name, email, phone, message }) {
  await ensureConsultSchema();
  const q = sql();
  const id = 'cr_' + crypto.randomBytes(9).toString('base64url');
  await q`INSERT INTO consult_requests (id, provider_id, name, email, phone, message)
    VALUES (${id}, ${providerId}, ${name || ''}, ${email || ''}, ${phone || ''}, ${message || ''})`;
  return id;
}

export async function listConsultRequests(providerId) {
  await ensureConsultSchema();
  const q = sql();
  return await q`SELECT id, name, email, phone, message, status, created_at
    FROM consult_requests WHERE provider_id = ${providerId} ORDER BY created_at DESC LIMIT 200`;
}
