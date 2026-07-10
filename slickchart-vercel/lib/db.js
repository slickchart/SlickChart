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

// Fetch one KV value for an owner — used to look up shared, provider-level
// data (like branding) without needing it duplicated inside every client's
// own data blob, which doesn't scale as a client list grows.
export async function getKVValue(owner, key) {
  await ensureTable();
  const q = sql();
  const rows = await q`SELECT v FROM kv WHERE owner = ${owner} AND k = ${key}`;
  return rows[0] ? rows[0].v : null;
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
  await q`ALTER TABLE providers ADD COLUMN IF NOT EXISTS totp_secret text`;
  await q`ALTER TABLE providers ADD COLUMN IF NOT EXISTS totp_enabled boolean DEFAULT false`;
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
  await q`ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS ip text`;
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
  // Real Stripe payment status per email — this is the source of truth for
  // whether someone is allowed to have an account, and for the in-app billing
  // screen. Populated only by the Stripe webhook, never by the app itself.
  await q`CREATE TABLE IF NOT EXISTS subscriptions (
    email text PRIMARY KEY,
    stripe_customer_id text,
    stripe_subscription_id text,
    status text NOT NULL DEFAULT 'inactive',
    plan_amount int,
    current_period_end timestamptz,
    updated_at timestamptz DEFAULT now()
  )`;
  // Real login sessions — one row per device/browser that's logged in, so the
  // Security screen can show genuine activity and "Revoke" can actually work.
  await q`CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY,
    provider_id text NOT NULL,
    device text,
    location text,
    ip text,
    created_at timestamptz DEFAULT now(),
    last_seen_at timestamptz DEFAULT now(),
    revoked boolean DEFAULT false
  )`;
  _provReady = true;
}

// Beta telemetry: one row per app-side event (a treatment note saved, or the
// pulse survey shown). Aggregate-only — no client names or note content are
// ever stored here, just which provider did what kind of action and when.
let _betaReady = false;
export async function ensureBetaTable() {
  if (_betaReady) return;
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS beta_events (
    id bigserial PRIMARY KEY,
    provider_id text NOT NULL,
    type text NOT NULL,
    is_new boolean,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await q`CREATE INDEX IF NOT EXISTS beta_events_provider_time ON beta_events (provider_id, created_at)`;
  await q`CREATE INDEX IF NOT EXISTS beta_events_type_time ON beta_events (type, created_at)`;
  // Pulse survey answers ride on the existing feedback table; add the two
  // columns it needs (safe to run repeatedly — IF NOT EXISTS).
  await q`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS kind text`;
  await q`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS time_saved text`;
  _betaReady = true;
}

// Shared check: does this email have an active (paid, or free-coupon) subscription?
// A 100%-off Stripe coupon still produces a real completed checkout, so this
// naturally covers both paying customers and coded free testers the same way.
export async function getSubscription(email) {
  await ensureProvidersTable();
  const q = sql();
  const rows = await q`SELECT * FROM subscriptions WHERE email=${String(email || '').trim().toLowerCase()}`;
  return rows[0] || null;
}
export async function hasActiveSubscription(email) {
  const s = await getSubscription(email);
  return !!(s && (s.status === 'active' || s.status === 'trialing'));
}
