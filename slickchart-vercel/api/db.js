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
    created_at timestamptz DEFAULT now()
  )`;
  _provReady = true;
}
