# Plan: one new App Store + Play Store build (2026-10-20)

Goal: ONE build per store that carries every native change waiting from the 2026-10-19 iPhone and
Android sweeps. The web app (all the JS fixes) is already live through the normal 2am train and needs
no build; this is only what the store shells themselves must carry.

## Already in the repo, waiting for a build
| | iPhone app | Android app |
|---|---|---|
| Speech-to-text permission text (`NSSpeechRecognitionUsageDescription`) | ✅ | n/a |
| Camera permission for the "line up with last photo" camera | already had it | ✅ `CAMERA` |
| No Google backup of the app's stored data (`allowBackup=false`) | n/a | ✅ |
| "Can't open SlickChart right now" screen instead of a browser error (`server.errorPath`) | ✅ | ✅ |
| Minimum Android browser version (`minWebViewVersion: 88`) | n/a | ✅ |

## Morning — Claude does (cloud session, no action from Ashley)
1. **Saving files inside the apps** (exports, client files, photos, documents, PDFs, printing).
   Add `@capacitor/filesystem` + `@capacitor/share`; the web code saves the file and opens the phone's
   share sheet (Save to Files / Drive, Print, AirDrop, email). Old app builds keep today's honest
   "use the browser" message, so nothing breaks before people update.
2. **Square and Google "Connect" coming back into the app.** Open the sign-in with
   `@capacitor/browser` and return to the app through the existing app link; the screen already
   re-checks on return.
3. **Android keyboard + crash safety.** `windowSoftInputMode="adjustResize"` so the keyboard pushes the
   screen up on Android 15+, and a `MainActivity` handler that reloads the page if Android kills the
   app's browser for memory instead of crashing the whole app.
4. **Version numbers.** iPhone 1.0.2 (4) → 1.0.3 (5); Android 1.0.4 (5) → 1.0.5 (6).
5. **Store text.** "What's new" for both stores (APP-STORE-WHATS-NEW.md) and the Apple review note.
6. Test everything that can be tested here in Chrome and Safari's engine; the build steps below are the
   only part that needs Ashley's Mac.

## Afternoon — Ashley (about 1 hour, on the Mac)
1. Terminal, in `slickchart-vercel`: `git pull`, `npm install`, `npx cap sync`.
2. **iPhone:** `npx cap open ios` → Xcode → **Product → Archive → Distribute App → App Store Connect**.
   Then in App Store Connect: new version 1.0.3, paste "What's new", **Submit for Review**.
3. **Android:** `npx cap open android` → Android Studio → **Build → Generate Signed App Bundle** →
   upload the `.aab` in Play Console (Production → Create new release), paste "What's new", **Send for
   review**.

Review time: Google usually hours to a day; Apple usually 1–2 days.

## After approval — 5-minute phone check (each phone)
1. Swipe back from a client's notes: it steps back a screen, does not close the app.
2. Settings → export your data: the share sheet opens and the file saves.
3. Room → "line up with last photo": the camera opens (Android was refused before).
4. Turn on airplane mode and open the app: the "Can't open SlickChart right now" screen shows.
5. Connect Square (or Google Calendar): it comes back into the app as connected.
6. Android: type in a note near the bottom of the screen; the keyboard does not cover it.
