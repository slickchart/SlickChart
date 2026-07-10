# Getting SlickChart into the app stores

This is the practical, non-technical walkthrough for turning the SlickChart PWA into real
Android (Google Play) and iOS (Apple App Store) apps using **PWABuilder** (free, from Microsoft).

You have two installable apps on one domain:

| App | URL to package | Manifest |
| --- | --- | --- |
| Provider (dark) | `https://slickchart.app/slickchart` | `/manifest.webmanifest` |
| Client "My Care" (light) | `https://slickchart.app/client` | `/manifest-client.webmanifest` |

You can ship either or both. Most founders start with the **provider app** (that's the product
you sell) and add the client app later.

---

## Before you start — accounts you need
- **Google Play Developer** — one-time **$25** → https://play.google.com/console/signup
- **Apple Developer** — **$99/year** → https://developer.apple.com/programs/enroll
- Everything below is free.

---

## Step 1 — Package with PWABuilder
1. Go to **https://www.pwabuilder.com**
2. Paste the URL you want to package (e.g. `https://slickchart.app/slickchart`) and click **Start**.
3. It scores the PWA (manifest, service worker, icons). SlickChart already passes these — if it
   flags anything, tell me the exact message and I'll fix it.
4. Click **Package For Stores**.

## Step 2 — Android (Google Play)
1. In PWABuilder, choose **Android → Generate Package**.
2. Pick a **Package ID** and write it down — e.g. `app.slickchart.twa` (client app: use a *different*
   id, e.g. `app.slickchart.client`). This is permanent per app.
3. Download the zip. Inside is:
   - a `.aab` file → this is what you upload to Google Play.
   - an **`assetlinks.json`** and/or a **SHA-256 fingerprint** → you need this for Step 3.
4. In **Play Console**, create the app and upload the `.aab`, fill out the store listing (below).

## Step 3 — Turn OFF the browser address bar (Digital Asset Links)
The app will show a browser URL bar until the site confirms the app is allowed. You do **not** edit
any code — just set an environment variable in Vercel and redeploy:

1. Open the **`assetlinks.json`** PWABuilder gave you (or grab the SHA-256 fingerprint from it, or from
   Play Console → **Setup → App integrity → App signing → SHA-256 certificate fingerprint**).
2. In **Vercel → your project → Settings → Environment Variables**, add **either**:
   - `ASSETLINKS_JSON` = *(paste the entire contents of the assetlinks.json file)* — easiest, and it
     supports multiple apps if you ship both provider and client, **or**
   - `ANDROID_PACKAGE_NAME` = your package id (e.g. `app.slickchart.twa`) **and**
     `ANDROID_CERT_FINGERPRINTS` = the SHA-256 fingerprint (colon-separated hex).
3. **Redeploy** (Vercel → Deployments → ⋯ → Redeploy).
4. Verify it's live by visiting **`https://slickchart.app/.well-known/assetlinks.json`** — it should
   show your package + fingerprint. (This route is already wired up.)

> Shipping **both** apps? Use `ASSETLINKS_JSON` and include one entry per app in the JSON array.

## Step 4 — iOS (Apple App Store)
1. In PWABuilder, choose **iOS → Generate Package**. You'll get an Xcode project.
2. Building/submitting an iOS app requires a **Mac with Xcode** (or a Mac-in-the-cloud service like
   MacStadium/MacinCloud if you don't have one). Open the project, set your Apple Team, and submit
   via Xcode → App Store Connect.
3. **Important — the subscription rule:** in the **iOS** build, do **not** show any "Subscribe" button
   or link that sends people to Stripe/web to pay. Apple requires digital subscriptions to use their
   in-app purchase (30%). The standard fix: providers subscribe on the **website first**, and the iOS
   app is **login-only** (the "reader app" model, like Netflix). Ask me and I can add a build flag that
   hides the subscribe link when the app runs inside the iOS wrapper.

---

## Store listing — what both stores ask for
- **App name, subtitle, description** (write once, reuse)
- **Screenshots** — phone screenshots of the app (take these on your phone; a few key screens)
- **App icon** — already have it (`/icon-512.png`)
- **Privacy Policy URL** → `https://slickchart.app/privacy` ✅ (live)
- **Terms of Service URL** → `https://slickchart.app/terms` ✅ (live)
- **Support/contact** → your email
- **Data safety (Play) / App Privacy (Apple)** — a form where you declare what data you collect
  (name, email, photos, etc.). Answer honestly from the Privacy Policy.
- **Content / age rating** — a short questionnaire.
- **Account deletion** — Apple/Google require this; SlickChart already has it in-app ✅ and the URL to
  cite if asked is the app's Settings → Delete my account.

---

## Quick reference — env vars this repo reads for the store build
| Variable | Where | What it does |
| --- | --- | --- |
| `ASSETLINKS_JSON` | Vercel | Full Digital Asset Links file (paste from PWABuilder). Best for one or many apps. |
| `ANDROID_PACKAGE_NAME` | Vercel | Single-app alternative: your Android package id. |
| `ANDROID_CERT_FINGERPRINTS` | Vercel | Single-app alternative: SHA-256 signing fingerprint(s), comma-separated. |

Nothing here is a code change — set the variable, redeploy, done.
