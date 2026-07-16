# Ship SlickChart as a native app with Capacitor (iOS + Android)

Capacitor wraps the **live** SlickChart PWA in a native shell. The store app *is* the site at
`https://slickchart.app/slickchart` — every web deploy you push updates the app instantly, no
re-submission. (Same auto-update model as the Android TWA in `ANDROID-BUILD.md`.)

**What's already set up in this repo (done for you):**
- ✅ `@capacitor/core` + `@capacitor/cli` + plugins (`camera`, `push-notifications`, `app`,
  `status-bar`) in `package.json`
- ✅ `capacitor.config.json` — appId `com.slickchart.app`, name `SlickChart`, points at the live app
- ✅ `native-shell/` — a tiny offline-fallback page (Capacitor requires a local `webDir`)
- ✅ npm scripts: `cap:add:ios`, `cap:add:android`, `cap:sync`, `cap:ios`, `cap:android`
- ✅ **Native camera** — "Take photo" (before/after, check-in, consult) uses the OS camera in the
  native build, falling back to the web picker on the PWA. Nothing to configure.
- ✅ **Native push** — the app registers with the OS and stores the device token. **To actually
  deliver** push you must set up Firebase/APNs — see `PUSH-NATIVE-SETUP.md`.
- ✅ **Native permissions** — the plugins request camera + notification permission automatically. iOS
  also needs usage-description strings in `Info.plist` (you add these after `cap add ios` — snippet in
  the "iOS permission strings" section below).

**What you do on YOUR machine** (can't be done in the cloud session): generate the native projects,
build, and submit. iOS **requires a Mac + Xcode**. You also need an **Apple Developer account**
($99/yr) and a **Google Play account** ($25 once).

---

## First, confirm the URL

Open `capacitor.config.json` and check `server.url`. It defaults to `https://slickchart.app/slickchart`
(your provider app — the same start URL as the TWA). If your canonical domain is different (e.g.
`https://slick-chart.vercel.app/slickchart`), change it here before building.

> The native app loads THIS url. The client app (per-client magic links) is not a store app — clients
> keep using their link in the browser / "Add to Home Screen."

---

## One-time setup on your Mac

```bash
git clone <this repo>            # or pull, if you already have it
cd slickchart-vercel
npm install                      # installs Capacitor from package.json
```

### iOS (Mac + Xcode only)
```bash
npm install @capacitor/ios
npm run cap:add:ios              # creates the ios/ project
npm run cap:ios                  # syncs + opens Xcode
```
In Xcode: set your **Team** (Signing & Capabilities), pick a device/simulator, press ▶ to run.
To ship: **Product → Archive → Distribute App → App Store Connect**.

### Android (Mac, Windows, or Linux + Android Studio)
```bash
npm install @capacitor/android
npm run cap:add:android          # creates the android/ project
npm run cap:android              # syncs + opens Android Studio
```
Build a signed **AAB** (Build → Generate Signed Bundle) and upload it to Google Play.

> Note: this repo already documents an **Android TWA** path (`ANDROID-BUILD.md`, package
> `app.slickchart.twa`) via PWABuilder. Pick ONE Android approach — don't publish both. The TWA is
> faster if you don't need native Android plugins.

---

## Whenever you change `capacitor.config.json` or add plugins
```bash
npm run cap:sync
```
You do NOT need to rebuild for normal web changes — those go live the moment you deploy to Vercel,
and the app picks them up on next launch (it loads the live URL).

---

## Apple App Store review — important
An app that only loads a website can be rejected under **Guideline 4.2 (minimum functionality)**.
To pass, lean on the app-like traits SlickChart already has (installable PWA, offline shell, push) and
consider adding at least one native capability so it's clearly more than a bookmark. Good first ones:

```bash
npm install @capacitor/push-notifications   # native push (APNs) instead of web push on iOS
npm install @capacitor/camera               # native camera for before/after photos
npm install @capacitor/share @capacitor/app @capacitor/status-bar
```
Wire these behind a `window.Capacitor` check in the app so the web build is unaffected. (Ask and I can
add that bridge code.)

---

## iOS permission strings (add after `npx cap add ios`)
Open `ios/App/App/Info.plist` in Xcode (or a text editor) and add these keys — iOS rejects the app if
the camera/photo permissions are used without them:

```xml
<key>NSCameraUsageDescription</key>
<string>SlickChart uses the camera to capture before/after and check-in photos.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>SlickChart lets you attach photos from your library to a client's record.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>SlickChart can save photos you capture back to your library.</string>
```
For push: in Xcode → the app target → **Signing & Capabilities → + Capability** → add **Push
Notifications** and **Background Modes** (check *Remote notifications*).

Android needs no manifest edits for the camera plugin (Capacitor adds them), and push works once
`google-services.json` is in `android/app/` (see `PUSH-NATIVE-SETUP.md`).

## The genuinely easier alternative (no Xcode/Android Studio)
**PWABuilder** (https://www.pwabuilder.com) packages your PWA for **both** iOS and Android from the
URL alone — its iOS package is a Capacitor wrapper under the hood, so you get the same result with far
less local tooling. If the native-plugin control of raw Capacitor isn't needed yet, PWABuilder is the
fastest way onto both stores. `ANDROID-BUILD.md` already covers its Android path.
