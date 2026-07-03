// Database access via Neon's serverless driver (works in Vercel functions).
// The connection string comes from the env var the Vercel↔Neon integration sets.
import { neon } from '@neondatabase/serverless';

function connectionString() {
  return process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_PRISMA_URL
    || '';
}

export function dbEnabled() {
  return Boolean(connectionString());
}

export function sql() {
  const cs = connectionString();
  if (!cs) {
    const err = new Error('No database is configured. Add a Postgres (Neon) database in Vercel.');
    err.status = 500;
    throw err;
  }
  return neon(cs);
}

// A single, simple key→value table per owner. Values are stored as text exactly
// as the app saved them (the app already JSON-encodes its own data).
let _ready = false;
export async function ensureTable() {
  if (_ready) return;
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS kv (
    owner text NOT NULL,
    k text NOT NULL,
    v text,
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (owner, k)
  )`;
  _ready = true;
}

// Provider accounts for multi-tenant login. Each provider's app data lives in the
// kv table keyed by owner = provider id, so accounts are isolated automatically.
let _provReady = false;
export async function ensureProvidersTable() {
  if (_provReady) return;
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS providers (
    id text PRIMARY KEY,
    email text UNIQUE NOT NULL,
    name text,
    pass_hash text NOT NULL,
    verified boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
  )`;
  await q`ALTER TABLE providers ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false`;
  // One-time tokens for email verification and password resets.
  await q`CREATE TABLE IF NOT EXISTS auth_tokens (
    token text PRIMARY KEY,
    provider_id text NOT NULL,
    kind text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now()
  )`;
  // Failed-login log for rate limiting.
  await q`CREATE TABLE IF NOT EXISTS login_attempts (
    id bigserial PRIMARY KEY,
    email text NOT NULL,
    ts timestamptz DEFAULT now()
  )`;
  // Interest log for "request live sync" on booking apps we don't yet integrate.
  await q`CREATE TABLE IF NOT EXISTS sync_requests (
    id bigserial PRIMARY KEY,
    app text NOT NULL,
    provider_id text,
    ts timestamptz DEFAULT now()
  )`;
  // Beta feedback from providers.
  await q`CREATE TABLE IF NOT EXISTS feedback (
    id bigserial PRIMARY KEY,
    provider_id text,
    email text,
    rating int,
    message text,
    ts timestamptz DEFAULT now()
  )`;
  // "What's new" announcements shown in-app to all providers.
  await q`CREATE TABLE IF NOT EXISTS announcements (
    id bigserial PRIMARY KEY,
    title text NOT NULL,
    body text,
    ts timestamptz DEFAULT now()
  )`;
  await q`ALTER TABLE providers ADD COLUMN IF NOT EXISTS marketing_opt_in boolean DEFAULT false`;
  // Per-provider Square OAuth connections (tokens stored encrypted).
  await q`CREATE TABLE IF NOT EXISTS square_connections (
    provider_id text PRIMARY KEY,
    access_token text,
    refresh_token text,
    expires_at timestamptz,
    merchant_id text,
    location_id text,
    updated_at timestamptz DEFAULT now()
  )`;
  await q`ALTER TABLE square_connections ADD COLUMN IF NOT EXISTS connected_at timestamptz DEFAULT now()`;
  await q`ALTER TABLE square_connections ADD COLUMN IF NOT EXISTS last_used_at timestamptz`;
  _provReady = true;
}
