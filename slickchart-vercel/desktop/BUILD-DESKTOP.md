# Building the SlickChart Mac desktop app

The desktop app is a thin Electron shell around the **live** web app
(`https://slickchart.app/slickchart`) — the same "remote" model as the iOS/Android
apps. That means once it's installed, every web deploy reaches it automatically:
**you build and sign this once, and you basically never have to rebuild it** unless
you change something in `main.js`/`preload.js` or the icon.

A distributable Mac app must be **built and code-signed on a Mac** (signing +
notarization only work on macOS), so this runs on *your* Mac. Plan on ~20 minutes
the first time.

---

## What you need first (one-time setup)

1. **Node.js** — install the LTS version from <https://nodejs.org> (just click through the installer).
2. **Xcode Command Line Tools** — open Terminal and run:
   ```bash
   xcode-select --install
   ```
   (A dialog pops up; click Install. If it says "already installed," you're good.)
3. **Your Apple Developer account** (you already have this from the iOS launch). You need three things from it:
   - a **"Developer ID Application"** certificate installed on your Mac (this is what signs an app for download *outside* the App Store — different from the App Store cert),
   - an **app-specific password**, and
   - your **Team ID**.

### Getting the Developer ID certificate
Easiest path: open **Xcode → Settings → Accounts →** select your team **→ Manage
Certificates → the "+" button → "Developer ID Application."** It installs into your
Keychain automatically. (You can also create it at
<https://developer.apple.com/account/resources/certificates>.)

### Getting the app-specific password
Go to <https://appleid.apple.com> → **Sign-In & Security → App-Specific Passwords →
"+"**, name it `SlickChart notarize`, and copy the `xxxx-xxxx-xxxx-xxxx` value.

### Getting your Team ID
It's the 10-character code on your <https://developer.apple.com/account> membership
page (e.g. `A1B2C3D4E5`).

---

## Build it

1. Get the code onto your Mac (clone the repo, or download it), then in Terminal:
   ```bash
   cd path/to/slickchart-vercel/desktop
   npm install
   ```
2. Paste in your notarization credentials (replace the three values):
   ```bash
   export APPLE_ID="slickchart2026@gmail.com"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="774LQ68Z3X"
   ```
3. Build, sign, and notarize in one go:
   ```bash
   npm run build:mac
   ```
   electron-builder automatically signs with your Developer ID and sends the app to
   Apple for notarization when those three `APPLE_*` variables are set. The
   notarization step adds a few minutes (it's Apple's servers, not your Mac).

When it finishes, your installer is here:
```
desktop/dist/SlickChart-0.1.0.dmg
```
It's signed + notarized, so it opens cleanly with no "unidentified developer" warning.

---

## Test it
Double-click the `.dmg`, drag **SlickChart** into **Applications**, and launch it from
Launchpad. It should open your live provider app in its own window, with camera (client
photos) and mic (voice notes) working. If the Mac is offline it shows a friendly Retry
page instead.

---

## Share it with providers
The `.dmg` is a single file people download and open. Host it somewhere that handles
larger binaries well — **GitHub Releases** is the simplest (create a release, drag the
`.dmg` in, copy the download URL). Then tell me the URL and I'll wire a **"Download for
Mac"** button into slickchart.app right next to the App Store button.

---

---

## Second channel: the Mac App Store

This is a **separate build and a separate submission** — same idea as your iOS launch.
The config is already wired up (`npm run build:mas`); it just needs App-Store-specific
certificates and a provisioning profile, and it goes through Apple review.

### What's different from the direct `.dmg`
- **Sandboxed** — already handled (`build/entitlements.mas.plist`).
- **Two certificates** (create in Xcode → Settings → Accounts → Manage Certificates → "+",
  or at <https://developer.apple.com/account/resources/certificates>):
  - **Apple Distribution**
  - **Mac Installer Distribution**
- **Provisioning profile** — at <https://developer.apple.com/account/resources/profiles>,
  create a **"Mac App Store"** profile for App ID `com.slickchart.app`, download it, and save it as:
  ```
  desktop/build/embedded.provisionprofile
  ```
  (electron-builder picks it up automatically.)
- **Register the app** in App Store Connect first — add the **macOS** platform to your existing
  SlickChart record (or create a new macOS app record).

### Build + upload
```bash
npm run build:mas
```
Produces `desktop/dist/mas/SlickChart-0.1.0.pkg`. Upload it to App Store Connect with the free
**Transporter** app (from the Mac App Store), then submit for review — exactly like iOS.

Heads-up: Mac App Store review occasionally flags thin web-wrapper apps (guideline 4.2). Your
iOS app is the same model and passed, so you're in good shape — but if a reviewer pushes back,
send me the message and we'll respond together.

---

## Notes
- **No signing credentials?** `npm run build:mac` still produces a `.dmg`, but it will
  be unsigned and macOS will warn users it "can't be opened." Always build with the
  `APPLE_*` variables set for anything you hand out.
- **Version number:** bump `"version"` in `package.json` (e.g. `0.1.0` → `1.0.0`) before
  a public build if you want the nicer number; it shows in the DMG title and About box.
- **Windows build** (`npm run build:win`) is already configured too, for later — that one
  must be built on a Windows machine.
