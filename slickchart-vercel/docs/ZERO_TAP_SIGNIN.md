# Zero-Tap Sign-In (Android Restore Credentials) — build spec

**Why this exists:** From **April 2027**, Google Play requires that any app with user sign-in
automatically signs the user back in when they move to a new Android phone (device-to-device
transfer or cloud restore) — "Zero-Tap Sign-In," implemented with the **Android Restore
Credentials API**. SlickChart has provider login, so this applies to us.

**Plain-English status:** Not urgent, not broken. We have until April 2027. But it is **not a
config flip** — SlickChart's login runs inside a WebView as a web form, and Restore Credentials is
a *native* Android API. Bridging them takes a small native Capacitor plugin. This doc is the recipe
for whoever builds the next Android release (Ashley + a developer, or a future session).

---

## The one-paragraph mental model

When a provider logs in, we hand Android a tiny sealed "restore credential" — think of it as a
one-time-use token that only SlickChart can read. Android backs it up with the user's account
(same pipe as their photos and settings). On a new phone, before the app even shows a login screen,
we ask Android "got a restore credential for us?" — if yes, we exchange it with our server for a
fresh session and the provider is already in. No password, no tap.

It runs on **WebAuthn/passkey** plumbing under the hood, but we don't implement WebAuthn ourselves —
the Credential Manager library does. Available on **Android 9+**.

---

## What has to be built

### 1. A native Capacitor plugin (the missing bridge)

Our Android app is a Capacitor shell (`com.slickchart.app`) that loads `slickchart.app/slickchart`.
The web layer can't call native Credential Manager directly, so add a small plugin exposing two
methods to JS:

- `saveRestoreCredential({ handle })` — call right after a successful login.
- `getRestoreCredential()` — call once at app startup, before showing the login screen.

Android dependency (native side):

```gradle
// android/app/build.gradle
implementation "androidx.credentials:credentials:1.5.0"      // or latest stable
implementation "androidx.credentials:credentials-play-services-auth:1.5.0"
```

Native implementation sketch (Kotlin, inside the plugin):

```kotlin
// SAVE — after login. `handle` is an opaque server-issued restore handle (see server section).
val req = CreateRestoreCredentialRequest(
    // requestJson is a WebAuthn-style registration JSON; user.id carries our `handle`.
    requestJson = buildRegistrationJson(handle)
)
CredentialManager.create(context).createCredential(activity, req)

// RESTORE — at startup, on the new device.
val opt = GetRestoreCredentialOption(requestJson = buildRequestJson())
val result = CredentialManager.create(context)
    .getCredential(context, GetCredentialRequest(listOf(opt)))
// result contains the restore credential; extract the `handle` we stored and hand it to JS.
```

> Use the current Google sample for the exact `requestJson` shapes — they are WebAuthn
> registration/assertion JSON, not free-form. Don't hand-roll the crypto; the library does it.

### 2. Server endpoints (small, and they fit our existing token model)

SlickChart already issues signed session tokens (`signToken` / `createSession` in
`lib/auth.js`). Restore Credentials slots in cleanly:

- **`POST /api/restore/issue`** (authenticated) → returns a fresh opaque `handle` (random,
  single-use, stored in a `restore_handles` table with `provider_id`, `created_at`, `used_at`,
  `expires_at`). The web app passes this `handle` to `saveRestoreCredential()` after login.
- **`POST /api/restore/redeem`** `{ handle }` (unauthenticated) → looks up the handle, and **only
  if** it's unused + unexpired, mints a normal session (`createSession` + `signToken`) for that
  `provider_id`, marks the handle used, and returns the token. The new-device app stores that token
  exactly like a normal login.

**Data-isolation rules (non-negotiable, per CLAUDE.md §0):**
- The `handle` is the *only* thing that authorizes `redeem` — never trust a `provider_id`/email from
  the request body. Derive identity solely from the stored handle row.
- Handles are **single-use** (`used_at` set on redeem) and **short-lived** (e.g. 90 days, matching a
  reasonable re-provisioning window), so a leaked/stale handle can't be replayed.
- Scope everything by the authenticated provider on issue, and by the handle row on redeem. No
  shared/global fallback.
- Rotate: issue a fresh handle on each successful login so an old device's handle can be invalidated.

### 3. Web glue (in `slickchart.html`)

- After a successful login, if running in the native app, call
  `Capacitor.Plugins.SlickRestore.saveRestoreCredential({ handle })` with the handle from
  `/api/restore/issue`. Wrap in try/catch — web/older devices simply skip it.
- At app boot, before the login screen, if native and no valid local session:
  `getRestoreCredential()` → if a handle comes back, `POST /api/restore/redeem` → on success store the
  token and go straight to the workspace.

---

## The shortcut that may already half-cover us

`AndroidManifest.xml` has `android:allowBackup="true"`, so Android Auto Backup *may* already carry the
WebView's saved session (our token in localStorage/IndexedDB) to a new device, restoring sign-in for
some users. It is **not** the official API path and **not** guaranteed (WebView data backup is
inconsistent), so it does **not** satisfy the requirement on its own — but it means we're not starting
from zero and there's low risk of a hard regression while the real plugin is built.

## Alternative compliance path (probably moot now)

Google says apps that integrated **Block Store** *on or before September 30, 2026* are considered
compliant. It's now past that window for us, so **Restore Credentials is the path** — noted only so
nobody spends time chasing Block Store.

---

## Definition of done

1. Fresh install on a *new* device, after restoring from the old one, lands in the provider workspace
   with **zero taps** — no password screen.
2. A tampered/replayed/expired handle is rejected by `/api/restore/redeem` and falls back to the
   normal login screen (verify it can't sign in as another provider).
3. Web/desktop and pre-Android-9 devices are unaffected (all native calls are try/catch no-ops there).

**Deadline: April 2027.** Plenty of runway — schedule it with the next native Android build, not as an
emergency.
