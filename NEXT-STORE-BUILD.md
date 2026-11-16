# Waiting for the next App Store + Play Store build

Ashley's call (2026-11-13): native-only work waits here until there is enough of it to be worth a new
store build. When anything else needs a new build, do everything on this list in the same build.
Every session: check this list whenever a change turns out to need a store build.

## Wanted

### Open the phone apps without waiting on the network (offline-first shell)
- **Why:** today both apps load `https://slickchart.app/slickchart` live (`capacitor.config.json`
  `server.url`), so every open waits for the server's answer before anything draws: about 0.4 s
  median and 0.9 s p90, and several seconds on weak signal. The browser version already opens from
  its saved copy (`sw.js`), but the apps can't do that yet. On iOS, WKWebView runs no service worker
  without App-Bound Domains, and Android's Capacitor WebView may fetch the page natively.
- **Shape:** the app keeps its own saved copy of the shell and code and draws from it at once, then
  checks for a newer build in the background. Old installed versions keep working unchanged.
  Options to research first (§1f): App-Bound Domains plus a service worker on iOS, and
  `ServiceWorkerController` on Android, or a bundled `webDir` shell that loads the cached
  `assets/app-<hash>.js`. Make sure OAuth (in-app browser), Stripe, deep links and push still work.
- **Ashley's part:** build and upload both apps from her Mac (about 30-45 min, same as the October
  build), then 1-3 days of store review.
- **Also still waiting (from SESSION-HANDOFF):** check the earlier native items noted there as
  "needs the next Play build" / "needs the next App Store build" and fold them into the same build.

### Tap to Pay on the phone (Square Mobile Payments SDK 2.7.0) — ready, switched OFF until Apple's second yes
- **2026-11-16 decision: ANDROID FIRST.** Ashley does not have an iPhone (her words: "i dont have an
  iphone"), so Apple's review videos cannot be recorded yet; a simulator cannot do Tap to Pay. She chose
  "Do Android Tap to Pay first". iPhone resumes when she can borrow an iPhone XS or newer for an hour
  (dev build steps: `tap-to-pay.cjs enable --ios`, automatic Development signing, xcodebuild + devicectl).
- **Android uses Square SDK 2.6.1, not 2.7.0** (`ANDROID_SDK_VERSION` in tap-to-pay.cjs): 2.7.0 pulls
  Jetpack Compose 1.12.1, which needs compileSdk 37 + AGP 9.1 and fails this project's build. With 2.6.1,
  `enable --android` + `cap sync android` + `gradlew assembleDebug` AND `assembleRelease` both compile
  (checked 2026-11-16 with a real Android SDK in the cloud session).
- **iOS fix 2026-11-16:** SDK 2.7.0 renamed `authorize(accessToken:` to `authorize(withAccessToken:`;
  the staged Swift plugin is fixed (commit 674f05b).
- **Ashley's choice (2026-11-16):** in-app Tap to Pay, not opening the Square app. Apple granted the
  Tap to Pay entitlement on 2026-11-16, but **for Development only**. An App Store or TestFlight archive
  with it fails until Apple approves distribution; she was given a reply to Apple's confirmation email
  asking for that. So the iPad build (1.0.5 (8)) goes out WITHOUT it.
- **The code:** `native-staging/tap-to-pay/` (iOS Swift plugin + bridge view controller, Android Java
  plugin + Application class). `node scripts/native/tap-to-pay.cjs check` shows what is applied;
  `... enable` applies all 21 steps (idempotent): Square SPM package (exact 2.7.0) + Square's setup
  Run Script as the last phase, `ENABLE_USER_SCRIPT_SANDBOXING = NO`, **iOS minimum 17.1** (Square's
  floor; older iPhones keep the version they have, which still works because the code is live),
  Bluetooth + Location wording in Info.plist, the `proximity-reader.payment.acceptance` entitlement,
  SceneDelegate -> `SlickChartBridgeViewController`, AppDelegate starts Square at launch; Android
  maven repo + dependency, **minSdk 28**, `SlickChartApplication`, plugin registered in MainActivity,
  microphone kept optional (`tools:replace`).
- **The app side is already live-code** (build 2026-11-16k): the "Tap to Pay on this phone" button
  appears only when the native plugin exists, so nothing changes until a store build carries it.
  Test: `scratchpad/test-tap-to-pay.mjs` (mocked plugin, 21 checks).
- **Steps when Apple approves distribution:**
  1. Developer portal > Identifiers > com.slickchart.app > tick **Tap to Pay on iPhone**, save, then
     regenerate the "SlickChart App Store" profile and download it in Xcode.
  2. `node scripts/native/tap-to-pay.cjs enable`, then `npx cap sync`, build both apps.
  3. Square Developer Dashboard > the app > Mobile Payments SDK: submit the Android release signing
     certificate (SHA-256) or Android production payments are refused.
  4. Play Console data safety: approximate + precise location and phone state are used for payments.
  5. Test one real $1 payment on an iPhone XS or newer and an Android 9+ phone with NFC, then refund it.
- **Square scope:** `PAYMENTS_WRITE_IN_PERSON` was added to the OAuth scopes (build 2026-11-16k).
  Providers connected before then get "Reconnect Square once to turn on Tap to Pay" from
  `/api/square/mobile-auth`, which checks the token's scopes with Square first.

## Already in the repo for the next iPhone build (2026-11-16)

### iPad (and Macs with Apple chips) — Ashley asked for this build on 2026-11-16
- `TARGETED_DEVICE_FAMILY = "1,2"` in `ios/App/App.xcodeproj/project.pbxproj`, version **1.0.5 (8)**.
  Info.plist already allowed every iPad orientation (needed for iPad multitasking) and the app
  already fills an iPad's screen (`pointer:coarse` rule, 2026-10-21) — and now `.sc-app-full`
  fills the window in any store app, so the iPad app running on a Mac is not a phone card either.
- Platform checks use `Capacitor.getPlatform()`, which says `ios` on an iPad (iPad WebKit reports
  "Macintosh" in its user agent, so never add a `/iPhone|iPad/` check for the native app).
- App Store Connect then needs **13-inch iPad screenshots (2064 x 2752)** — made in
  `/mnt/project-files/store-screenshots/ipad-13/` — and Mac availability is a tick in
  Pricing and Availability ("Make this app available on Mac"), no separate build.
- Android tablets need **no new build**: the same Play app already installs and fills tablets. Play
  only wants 7-inch and 10-inch tablet screenshots on the listing (`store-screenshots/android-*`).
