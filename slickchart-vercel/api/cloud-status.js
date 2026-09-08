// GET /api/cloud-status
// Tells the app whether cloud sync is fully configured, so it can show the login
// gate only when there's actually a database + login set up. No secrets exposed.
import { dbEnabled } from '../lib/db.js';

export default function handler(req, res) {
  // What this actually gates: whether the app shows its sign-in front door at all. When it answers
  // false, the app opens a local-only workspace that has NO sign-in and NO sign-out anywhere — so
  // getting this wrong strands every provider and every new visitor on a blank placeholder account.
  //
  // It used to also require APP_PASSWORD, which is ONLY the legacy single-password owner login
  // (api/login.js). Multi-tenant providers sign in with their own email and password, which needs a
  // database and SESSION_SECRET and nothing else. So an unset or removed APP_PASSWORD — a perfectly
  // reasonable thing to clear out, since nothing else uses it — silently turned off sign-in for
  // everyone. Gate on what login genuinely needs.
  const enabled = dbEnabled() && Boolean(process.env.SESSION_SECRET);
  res.status(200).json({ enabled });
}
