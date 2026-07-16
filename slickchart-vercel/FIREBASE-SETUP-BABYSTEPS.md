# Firebase setup for push notifications — baby steps (no coding)

This sets up the "mail service" that actually delivers your app's notifications. It's clicking through
websites — no code. Budget ~30 minutes. Do it **after** you've run `cap:add:ios` and `cap:add:android`
once (so the `ios/` and `android/` folders exist for the files to go into).

You'll need: your Apple Developer account, your Google account, and your Mac.

---

## PART A — Create the Firebase project (5 min)

1. Go to **https://console.firebase.google.com** and sign in with your Google account.
2. Click **Create a project** (or "Add project").
3. Project name: type **SlickChart**. Click **Continue**.
4. "Google Analytics for this project" — you can toggle this **OFF** (you don't need it). Click
   **Create project**. Wait for it to finish, click **Continue**.

You're now on the SlickChart project dashboard.

---

## PART B — Add the Android app (5 min)

1. On the dashboard, click the **Android** icon (the little green robot) — "Add app".
2. **Android package name:** type exactly **`com.slickchart.app`** (must match — copy/paste it).
3. App nickname: **SlickChart Android** (optional). Leave the SHA-1 blank for now. Click
   **Register app**.
4. Click **Download google-services.json**. It saves to your Downloads.
5. Move that file into your project at: **`android/app/google-services.json`**
   (In Finder: your SlickChart folder → `android` → `app` → drop the file there.)
6. Back on the Firebase page click **Next**, **Next**, then **Continue to console** (skip the code
   snippets it shows — Capacitor already handles that part).

---

## PART C — Add the iOS app (5 min)

1. On the dashboard, click **Add app** → the **Apple** icon.
2. **Apple bundle ID:** type exactly **`com.slickchart.app`** (must match). Click **Register app**.
3. Click **Download GoogleService-Info.plist**. It saves to your Downloads.
4. Add it to your iOS app **in Xcode** (so it's bundled correctly):
   - Open the project: in Terminal, `npm run cap:ios` (opens Xcode).
   - In Xcode's left sidebar, find the **App** folder (under `App` → `App`).
   - Drag **GoogleService-Info.plist** from Finder into that **App** folder in Xcode.
   - In the popup, **check "Copy items if needed"** and make sure **"App" target is checked**. Click
     Finish.
5. Back on Firebase, click **Next** → **Continue to console**.

---

## PART D — iOS push key from Apple (10 min) — needed for iPhone push

Apple requires a special key so Firebase can send to iPhones.

1. Go to **https://developer.apple.com/account** → **Certificates, Identifiers & Profiles** → **Keys**.
2. Click the **＋** (add a key). Name it **SlickChart Push**. Check **Apple Push Notifications service
   (APNs)**. Click **Continue**, then **Register**.
3. Click **Download** — you get a file ending in **`.p8`**. **Save it somewhere safe — Apple only lets
   you download it ONCE.** Also note two things on that page:
   - the **Key ID** (a 10-character code)
   - your **Team ID** (top-right of the Apple developer site, also 10 characters)
4. Go back to **Firebase → ⚙️ (Project settings) → Cloud Messaging** tab.
5. Under **Apple app configuration → APNs Authentication Key**, click **Upload**. Upload the `.p8`
   file, and paste in the **Key ID** and **Team ID** from step 3. Click **Upload**.

---

## PART E — The server key so SlickChart can send (5 min)

1. In Firebase → **⚙️ Project settings → Service accounts** tab.
2. Click **Generate new private key** → **Generate key**. A **.json** file downloads. This is a secret —
   don't share it or put it in the app.
3. Open that .json file in **TextEdit** (right-click → Open With → TextEdit). Select **all** the text
   (Cmd+A) and **copy** it (Cmd+C).
4. Go to **Vercel → your `slick-chart` project → Settings → Environment Variables → Add New**:
   - **Key:** `FIREBASE_SERVICE_ACCOUNT`
   - **Value:** paste the entire JSON you copied
   - Environments: Production + Preview. Click **Save**.
5. Redeploy (Deployments → ⋯ → Redeploy) so it takes effect.

---

## PART F — Tell me you're done

Message me "**Firebase is set up**". I'll then wire the server so notifications actually fire (new
booking, new message, check-in received). The app already stores the device tokens — this is the last
mile, and I can only build it once `FIREBASE_SERVICE_ACCOUNT` exists.

## Quick checklist
- [ ] Firebase project **SlickChart** created
- [ ] Android app added, `google-services.json` in `android/app/`
- [ ] iOS app added, `GoogleService-Info.plist` dragged into Xcode's App target
- [ ] APNs `.p8` key uploaded to Firebase (with Key ID + Team ID)
- [ ] `FIREBASE_SERVICE_ACCOUNT` set in Vercel + redeployed
- [ ] Ran `npm run cap:sync` after adding the config files
