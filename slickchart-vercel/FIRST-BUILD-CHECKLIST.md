# SlickChart — first native build & smoke test (Mac)

Identity is **locked**: App name **SlickChart**, bundle/app ID **`com.slickchart.app`** — must be
identical in Xcode, Android Studio, Firebase, App Store Connect, and Play Console, and can never change
after first submission. (The old TWA id `app.slickchart.twa` is a *different* approach — if you go
Capacitor, don't also publish the TWA. Pick one Android path.)

---

## 0. Confirm the config (30 sec)
`capacitor.config.json` → `server.url` should be your live domain (`https://slickchart.app/slickchart`).
This is a **remote** build (SlickChart is static HTML + serverless, not a Next.js static export), so the
app loads the live site and every Vercel deploy updates it — no re-submission for web changes.

## 1. One-time project generation
```bash
git pull && npm install
npm install @capacitor/ios @capacitor/android
npm run cap:add:ios
npm run cap:add:android
```

## 2. iOS permission strings (required — Apple rejects without them)
Open `ios/App/App/Info.plist`, add the `NSCameraUsageDescription` / `NSPhotoLibrary…` keys from
`CAPACITOR-BUILD.md`. Then in Xcode → target → **Signing & Capabilities → + Capability** →
**Push Notifications** and **Background Modes → Remote notifications**.

## 3. Run on the iOS Simulator (fastest first look)
```bash
npm run cap:ios          # opens Xcode
```
In Xcode: top bar → pick **iPhone 15 (simulator)** → press **▶ (Run)**. The app launches and loads
SlickChart. (Camera won't work in the simulator — that's expected; test camera on a real phone.)

## 4. Run on your real iPhone
1. Plug the iPhone into the Mac; on the phone tap **Trust**.
2. Xcode → target → **Signing & Capabilities** → check **Automatically manage signing** → pick your
   **Team** (your Apple ID; free account is fine for on-device testing).
3. Top bar → select **your iPhone** as the destination → press **▶**.
4. First launch on the phone: **Settings → General → VPN & Device Management** → trust your developer
   cert. Reopen the app.
5. **Smoke test:** log in, take a before/after photo (camera prompt should appear), add a client, send a
   message, open a client's magic link in Safari, and — importantly — **Settings → Delete my account**
   and confirm it signs you out and the data is gone (reviewers test this).

## 5. Run on Android
```bash
npm run cap:android      # opens Android Studio
```
Press **▶ (Run)** with an emulator or a plugged-in phone (enable **Developer options → USB debugging**).
Same smoke test.

## 6. After ANY change
- **Web change** (edited the app, deployed to Vercel): nothing to do — relaunch the app, it loads live.
- **Plugin/config/native change**: run `npm run cap:sync` (copies web assets + updates native deps),
  then rebuild in Xcode / Android Studio.

## 7. Only after both smoke tests pass — go to the stores
- **iOS:** Xcode → **Product → Archive → Distribute App → App Store Connect**. Fill in privacy labels
  (you collect: name, email, phone, photos, health-adjacent notes) and confirm **account deletion** in
  App Privacy.
- **Android:** Android Studio → **Build → Generate Signed Bundle (AAB)** → upload to Play Console.
  Complete the **Data safety** form + the **account deletion** URL/flow.

## Store readiness already done in the app
- ✅ In-app **account deletion** that truly deletes server-side (provider + client) — Apple/Google requirement
- ✅ Native **camera** (with iOS usage strings documented) and **push registration**
- ✅ Privacy policy (`/privacy.html`) and Terms (`/terms.html`) live
- ⏳ Native push **delivery** needs Firebase/APNs — see `PUSH-NATIVE-SETUP.md`
