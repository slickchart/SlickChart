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
   it to the iOS project in Xcode (drag into the app target). **Note:** that file on its own does
   nothing without the Firebase SDK, which this project does not include — iOS push goes straight to
   Apple instead. See "iPhone push goes straight to Apple" below.

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

## iPhone push goes straight to Apple, not through Firebase

**Read this before debugging an iPhone that never gets a notification.**

The iOS app has no Firebase SDK in it. `AppDelegate.swift` is the stock Capacitor template, nothing
in `Package.swift` pulls Firebase in, and the `GoogleService-Info.plist` sitting in the project is
never read. So `@capacitor/push-notifications` hands back a **raw APNs device token**, not an FCM
one, and FCM cannot deliver to it.

Rather than rebuild and resubmit the app, the server talks to Apple directly (`lib/apns.js`). The
tokens already in `native_push_tokens` are exactly what Apple wants. `lib/fcm.js` picks the transport
per token from its shape: an FCM token always contains a colon, an APNs token is plain hex. **Nothing
on anyone's phone has to change.**

### The four environment variables

| Variable | What it is |
|---|---|
| `APNS_KEY_P8` | The `.p8` auth key file's contents. Paste the whole thing including the BEGIN/END lines, or base64 it. **The same key already uploaded to Firebase works** — one key serves both. |
| `APNS_KEY_ID` | The 10-character Key ID Apple shows next to that key. |
| `APNS_TEAM_ID` | The 10-character Team ID, top right of the Apple Developer account page. |
| `APNS_BUNDLE_ID` | Optional. Defaults to `com.slickchart.app`. |
| `APNS_ENV` | Optional. Set to `sandbox` only for builds run from Xcode. Leave unset for App Store and TestFlight. |

Lost the `.p8`? Apple only lets you download a key once, but you can create a **new** APNs key at any
time (Certificates, IDs & Profiles → Keys) and it does not invalidate the old one or break Firebase.

Until these are set, iPhone push is a clean no-op: the device row is kept, the founder test tool says
the key is missing, and Android is unaffected. Nothing else breaks.

### Sandbox vs production — the classic afternoon-loser

A build installed from the App Store or TestFlight is **production**. A build run from Xcode onto
your own phone is **sandbox**. The same device token is not valid on both. A sandbox token sent to
the production host comes back `BadDeviceToken`, which reads exactly like a dead token. If push works
for you in Xcode and not for real users (or the reverse), this is why.

### How to tell what happened

Errors are surfaced, not swallowed. `Settings → Admin tools → Test my push notifications` reports the
platform, the token shape and Apple's own reason string per device. `BadDeviceToken` is the
environment mismatch above; `InvalidProviderToken` means the key, Key ID or Team ID is wrong.
`Unregistered` and `BadDeviceToken` prune the row; **a credentials error never does**, so a wrong env
var can't cost anyone their registration.

## Notes
- The store native app is the **provider app** (`/slickchart`). Providers get native push (bookings,
  messages, check-ins). Clients keep using web push through their magic link in the browser (already
  working) — unless you also publish a client native app, in which case client native push works too
  (the client app registers the same way).
- After adding `google-services.json` / `GoogleService-Info.plist`, run `npm run cap:sync` so the
  native projects pick them up.
