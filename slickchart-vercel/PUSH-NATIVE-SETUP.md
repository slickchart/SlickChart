# Native push notifications (iOS + Android) — setup

## What's already built into the app (done for you)
- ✅ `@capacitor/push-notifications` installed.
- ✅ Both apps register with the OS on launch (native build only): ask permission → get the device
  token → `POST /api/native-push` (provider uses the session token, client uses their link token).
- ✅ Tapping a notification opens the app and routes to the screen in its `data.screen`.
- ✅ Tokens are stored server-side in the `native_push_tokens` table.
- ✅ All of this is **no-op on the web/PWA**, so web push is unchanged there.

## What still needs YOU (native push can't deliver without this)
Native push goes through **Firebase Cloud Messaging (FCM)** — for Android directly, and for iOS via an
**APNs key** you upload to Firebase. There is no way around creating this project; it's the same for
any native app.

### 1. Create a Firebase project (free)
1. https://console.firebase.google.com → **Add project** → name it (e.g. "SlickChart").
2. **Add an Android app**: package name `com.slickchart.app`. Download **`google-services.json`** and
   drop it into `android/app/` in your Capacitor project (after `npx cap add android`).
3. **Add an iOS app**: bundle id `com.slickchart.app`. Download **`GoogleService-Info.plist`** and add
   it to the iOS project in Xcode (drag into the app target).

### 2. iOS APNs key (Apple)
1. Apple Developer → Certificates, IDs & Profiles → **Keys** → **+** → enable **Apple Push
   Notifications service (APNs)** → download the `.p8` key (you get it once — save it).
2. Firebase → Project settings → **Cloud Messaging** → **Apple app config** → upload that `.p8` key
   (with its Key ID and your Team ID).
3. In Xcode, enable the **Push Notifications** and **Background Modes → Remote notifications**
   capabilities on the app target.

### 3. Server credential (so the backend can send)
1. Firebase → Project settings → **Service accounts** → **Generate new private key** → downloads a
   JSON file.
2. In **Vercel → Environment Variables**, add `FIREBASE_SERVICE_ACCOUNT` = the full JSON contents
   (paste it as one value).

### 4. Tell me you've done 1–3
Once `FIREBASE_SERVICE_ACCOUNT` is set and the config files are in the native projects, ping me and
I'll wire the **server-side sender**: send FCM to the `native_push_tokens` for a provider/client at the
moments that matter (new booking request, new message, check-in received, appointment reminder). That
part reads the tokens this app already stores — it's the last mile once the credentials exist.

## Notes
- The store native app is the **provider app** (`/slickchart`). Providers get native push (bookings,
  messages, check-ins). Clients keep using web push through their magic link in the browser (already
  working) — unless you also publish a client native app, in which case client native push works too
  (the client app registers the same way).
- After adding `google-services.json` / `GoogleService-Info.plist`, run `npm run cap:sync` so the
  native projects pick them up.
