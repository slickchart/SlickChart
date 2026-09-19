// PUBLIC, no auth: which build is live right now. The app compares this against the build it is
// itself running, so a device sitting on a stale cached copy can notice and refresh itself instead
// of silently missing every fix that ships.
//
// Nothing here is account data — it is one version string, the same for everyone.
import { APP_BUILD } from '../lib/app-build.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({ build: APP_BUILD });
}
