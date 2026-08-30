// GET /api/health
// A quick way to confirm your environment variables are set, without exposing
// any secret values. Returns only booleans. No access key required.
import { squareConfig } from '../lib/square.js';

export default function handler(req, res) {
  const cfg = squareConfig();
  res.status(200).json({
    ok: true,
    environment: cfg.env,                 // "sandbox" or "production"
    locationPinned: Boolean(cfg.locationId),
    versionPinned: Boolean(cfg.version)
  });
}
