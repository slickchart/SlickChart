# Ship SlickChart to Google Play (Android)

The Android app is a **TWA** (Trusted Web Activity) — a thin native wrapper that runs the
existing PWA full-screen with no browser bar. Nothing about the app is rewritten; the store
app *is* the live site at `https://slickchart.app/slickchart`. Every deploy you push updates
the Android app instantly (no re-submission), because the wrapper just loads the live site.

The web side is already TWA-ready:
- ✅ Web manifest (`/manifest.webmanifest`) — name, icons, `start_url` `/slickchart`, `scope` `/`, standalone
- ✅ Service worker (`/sw.js`), HTTPS, installable
- ✅ Icons: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
- ✅ Digital Asset Links endpoint (`/.well-known/assetlinks.json`) — reads env vars, no code edits

You do the build + Play submission on **your own machine/account** (the app-signing key and the
$25 Play account must belong to you). Two paths below — **PWABuilder is the fastest for today.**

---

## Package identity (use these exact values)

| Field | Value |
|---|---|
| Package / App ID | `app.slickchart.twa` |
| App name | `SlickChart` |
| Launcher name | `SlickChart` |
| Host / domain | `slickchart.app` |
| Start URL | `/slickchart` |
| Web manifest URL | `https://slickchart.app/manifest.webmanifest` |

> The Package ID is **permanent** — it can never change once published. `app.slickchart.twa`
> is what the assetlinks endpoint already defaults to, so it works with zero extra config.

---

## Path A — PWABuilder (recommended, no local tooling) — ~20 min

1. Go to **https://www.pwabuilder.com** and enter `https://slickchart.app/slickchart`. Let it analyze (it should pass — manifest, SW, HTTPS, icons).
2. Click **Package for stores → Android → Google Play**.
3. In the options, set: **Package ID** `app.slickchart.twa`, **App name** `SlickChart`, **Launcher name** `SlickChart`, **Start URL** `/slickchart`. Leave "Signing key" on **Create new**.
4. Click **Download**. You get a zip containing:
   - `app-release-signed.aab` ← this is what you upload to Play
   - `signing.keystore` (+ a `signing-key-info.txt` with the passwords) ← **BACK THIS UP SOMEWHERE SAFE. If you lose it you can never update the app.**
   - `assetlinks.json`
5. **Wire up Digital Asset Links** (removes the URL bar so it looks native):
   - Open the zip's `assetlinks.json`, copy the `sha256_cert_fingerprints` value (a long colon-separated hex string).
   - In **Vercel → your project → Settings → Environment Variables**, add:
     - `ANDROID_PACKAGE_NAME` = `app.slickchart.twa`
     - `ANDROID_CERT_FINGERPRINTS` = *(paste the SHA-256 fingerprint)*
   - **Redeploy** the project.
   - Verify: open `https://slickchart.app/.well-known/assetlinks.json` — your fingerprint should be in it.
6. Continue to **Path C — Google Play submission** below.

---

## Path B — Bubblewrap (CLI alternative)

Needs **Node 18+**, **JDK 17**, and the **Android SDK**. Bubblewrap installs the SDK for you on first run.

```bash
npm i -g @bubblewrap/cli

# Use the config already in this repo (android/twa-manifest.json):
cd android
bubblewrap init --manifest https://slickchart.app/manifest.webmanifest
#   ↳ accept the defaults; when asked, use Package app.slickchart.twa, name SlickChart.
#   ↳ it will create a signing key — SAVE the .jks file + passwords somewhere safe.

bubblewrap build
#   ↳ produces app-release-signed.aab  (upload this)  and app-release-signed.apk (for test installs)

# Print the fingerprint to paste into Vercel env (ANDROID_CERT_FINGERPRINTS):
bubblewrap fingerprint
```

Then do the same **env-var + redeploy** step as Path A step 5, and continue to Path C.

---

## Path C — Google Play submission (both paths)

1. **Play Console** — sign up at https://play.google.com/console (**$25 one-time**).
2. **Create app** → name `SlickChart`, type App, Free/Paid = **Free** (you charge for the subscription in-app via your Stripe link, which is allowed for this kind of service).
3. **Upload** the `.aab` under **Testing → Internal testing** first (fastest way to install on your own phone), then promote to Production when ready.
4. **⚠️ The #1 gotcha — Play App Signing:** Play re-signs your app with *its own* key. After your first upload, go to **Play Console → Test and release → App integrity → App signing** and copy the **"App signing key certificate" SHA-256**. Add it to `ANDROID_CERT_FINGERPRINTS` in Vercel **in addition to** your upload-key fingerprint (comma-separated), then redeploy. If you skip this, the app shows the URL bar in production even though it worked in testing.
   ```
   ANDROID_CERT_FINGERPRINTS = AA:BB:...(upload key), CC:DD:...(Play signing key)
   ```
5. **Store listing** — prepare (assets a designer or I can help generate):
   - App icon 512×512 (have it: `icon-512.png`)
   - Feature graphic 1024×500
   - Phone screenshots ×2–8 (starter set generated in `android/store-assets/`)
   - Short description (≤80 chars) + full description (≤4000)
   - **Privacy policy URL** (required)
   - Content rating questionnaire + Data safety form
6. **Submit for review.** Internal testing is near-instant; Production review is typically 1–3 days for a first submission.

---

## After launch

- Any change you deploy to `main` updates the Android app automatically — no re-upload — because the TWA loads the live site.
- Only re-upload a new `.aab` when you change something native (app name/icon, target SDK bumps Google requires ~yearly, or new TWA features).
- **iOS** is a separate build (the standing note: hide the in-app subscribe link there for App Store rules). Not needed for Android.
