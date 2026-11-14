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
