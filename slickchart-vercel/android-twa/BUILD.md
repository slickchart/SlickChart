# Publishing SlickChart as ONE Android app (TWA)

The app is packaged as a **Trusted Web Activity (TWA)** — a thin Android wrapper around the live web
app. There is **one** app: it opens the unified front door (`/slickchart`), which routes each person to
the provider or client experience automatically. Nothing here changes the web app; it only wraps it.

Config lives in [`twa-manifest.json`](./twa-manifest.json). Digital Asset Links are served by
`/api/assetlinks.js` and configured with **environment variables in Vercel** (no code edits).

---

## 0. Decide the domain first (important)

`twa-manifest.json` is set to `host: slickchart.app`. A TWA verifies ownership of an **exact origin**, so
the app must point at the same domain your assetlinks are served from.

- **Recommended:** register **slickchart.app** (or your chosen domain) and add it to the Vercel project
  (Vercel → Settings → Domains). Then everything below "just works" with the current config.
- **Ship without a custom domain:** you can point the app at `slick-chart.vercel.app` instead — change
  `host`, `iconUrl`, `maskableIconUrl`, and `webManifestUrl` in `twa-manifest.json` to that domain. It
  works, but a custom domain is strongly recommended for a real store listing (branding + reliability).

Everything below assumes the domain in `twa-manifest.json`.

## 1. One-time tools

- Node 18+ and a JDK (17 recommended).
- Bubblewrap CLI: `npm i -g @bubblewrap/cli`

## 2. Build the Android app bundle

From this `android/` folder:

```bash
# First time: initialize from the live web manifest (or reuse twa-manifest.json below)
bubblewrap init --manifest https://slickchart.app/manifest.webmanifest
# It will read most fields; keep packageId = app.slickchart.twa to match assetlinks.

# Build the release bundle + APK. Bubblewrap creates the signing key on first run
# (or reuses ./android-keystore.jks, alias "slickchart" per twa-manifest.json).
bubblewrap build
```

Outputs an **`app-release-bundle.aab`** (for Play) and an APK (for local testing).
**Back up `android-keystore.jks` and its passwords** — losing the key means you can never update the app.

## 3. Wire up Digital Asset Links (removes the URL bar)

Get the **SHA-256 fingerprint** of your signing key:

```bash
keytool -list -v -keystore android-keystore.jks -alias slickchart
# copy the "SHA256:" line (colon-separated hex)
```

Then in **Vercel → Settings → Environment Variables** (Production), set **either**:

- `ANDROID_PACKAGE_NAME = app.slickchart.twa`
  `ANDROID_CERT_FINGERPRINTS = <the SHA256 fingerprint>` (comma-separate if you also add Play App Signing's)

**or** paste the whole file Bubblewrap/PWABuilder generated:

- `ASSETLINKS_JSON = <the exact JSON array>`

Redeploy. Verify it's live: open `https://slickchart.app/.well-known/assetlinks.json` — it should show your
package + fingerprint.

> Tip: after you upload to Play, **Play App Signing** re-signs the app with its own key. Add **that**
> fingerprint too (Play Console → Test and release → App integrity → App signing) or the URL bar will show
> on installs from the Play Store.

## 4. Publish on Google Play

1. Create a **Google Play Developer** account ($25 one-time).
2. **Create app** → fill name (SlickChart), default language, category (Business or Medical).
3. **Upload** `app-release-bundle.aab` to a release (Internal testing first is easiest).
4. Complete the required listing: short/full description, screenshots, icon, privacy policy URL.
5. Roll out to Internal testing, install on your Pixel, confirm the **URL bar is hidden** (that means
   assetlinks verified). Then promote to Production when ready.

## Files involved
- `android/twa-manifest.json` — the TWA/Bubblewrap config (one app → `/slickchart`).
- `manifest.webmanifest` — the app's web manifest (installable identity, start_url `/slickchart`).
- `manifest-client.webmanifest` — browser add-to-home-screen for clients (branded SlickChart, opens
  straight to `/client`). Not used by the Play build.
- `api/assetlinks.js` — serves `/.well-known/assetlinks.json` from env vars (see step 3).
