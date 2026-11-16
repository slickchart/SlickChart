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
