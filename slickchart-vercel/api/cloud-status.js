// GET /api/cloud-status
// Tells the app whether cloud sync is fully configured, so it can show the login
// gate only when there's actually a database + login set up. No secrets exposed.
import { dbEnabled } from '../lib/db.js';

export default function handler(req, res) {
  const enabled = dbEnabled()
    && Boolean(process.env.APP_PASSWORD)
    && Boolean(process.env.SESSION_SECRET);
  res.status(200).json({ enabled });
}
