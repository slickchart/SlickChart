# SlickChart Desktop — building the downloadable Mac & Windows app

This packages SlickChart as a real downloadable program (a `.dmg` for Mac, a `.exe` installer for
Windows). It's an **Electron** shell that loads the live app (`https://slickchart.app/slickchart`),
so once it's installed, every website update reaches it automatically — you don't rebuild the
desktop app for content changes, only if you change the shell itself.

Everything for this lives in the **`desktop/`** folder and is completely separate from the website.

> Note on layout: for now the app shows the same phone-style layout inside a desktop window. It's a
> real installed app with its own icon and window; widening it to a full desktop layout is a
> separate step we can do later.

---

## Part 0 — one time setup (on your Mac)

You already have Node installed (you used it for the mobile build). In Terminal:

```bash
cd ~/Documents/GitHub/SlickChart/slickchart-vercel/desktop
npm install
```

This downloads Electron + the builder (only inside `desktop/`, ~a couple hundred MB). Takes a few
minutes the first time.

## Part 1 — try it locally (no signing needed)

```bash
npm start
```

A SlickChart window opens running the live app. Log in, click around — this is exactly what users
will get. Close the window to quit. Use this to sanity-check before building an installer.

---

## Part 2 — build the Mac app (.dmg)

### 2a. Test build (unsigned — for you only)
```bash
npm run build:mac
```
The `.dmg` lands in `desktop/dist/`. This UNSIGNED build works on **your** Mac, but if you send it
to someone else, macOS Gatekeeper will warn "unidentified developer." Fine for testing; not for
public download. For public download, sign + notarize (next).

### 2b. Signed + notarized (for public download) — uses your Apple Developer account
1. In **Xcode → Settings → Accounts**, add your Apple ID, then **Manage Certificates → +
   → Developer ID Application**. This creates the certificate that lets you distribute outside the
   App Store. (It installs into your Keychain automatically.)
2. Create an **app-specific password** for notarization at
   [appleid.apple.com](https://appleid.apple.com) → Sign-In & Security → App-Specific Passwords.
3. Find your **Team ID** at [developer.apple.com/account](https://developer.apple.com/account) →
   Membership (a 10-character code).
4. Build with those credentials set (replace the three values):
   ```bash
   export APPLE_ID="you@email.com"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="ABCDE12345"
   npm run build:mac
   ```
   electron-builder will sign, upload to Apple to notarize (a few minutes), and staple the result.
   The `.dmg` in `desktop/dist/` is now safe to put on your website for anyone to download.

---

## Part 3 — build the Windows app (.exe)

The Windows installer must be built **on Windows** (or with a cloud build — see Part 4). On a
Windows PC with Node installed:
```bash
cd desktop
npm install
npm run build:win
```
The `.exe` installer lands in `desktop\dist\`.

**Signing (recommended for Windows):** without a code-signing certificate, Windows SmartScreen
shows "Windows protected your PC" (users can still click **More info → Run anyway**). To remove that
warning you need a Windows code-signing certificate (~$100–400/year from DigiCert, Sectigo, etc.).
Once you have one, electron-builder signs automatically when you set `CSC_LINK` (path to the cert)
and `CSC_KEY_PASSWORD`. This is optional to start — many small apps ship unsigned on Windows at
first.

---

## Part 4 — build both from the cloud (optional, no Windows PC needed)

GitHub Actions can build the Mac `.dmg` and Windows `.exe` for you on every release, so you don't
need a Windows machine. If you want this, tell me and I'll add a workflow file — you'd store your
Apple credentials (and Windows cert, if any) as encrypted GitHub secrets.

---

## Part 5 — get it to your users

- **Simplest:** upload the `.dmg` and `.exe` to your website (or a Dropbox/Google Drive link) with
  "Download for Mac" / "Download for Windows" buttons. Done.
- **Mac App Store / Microsoft Store (optional, later):** more setup (extra review + sandboxing on
  Apple; a $19 Microsoft Partner Center account). Not needed to launch — direct download is fine.
  For the Microsoft Store specifically, since SlickChart is already a web app, the free tool
  **PWABuilder.com** can package it for the Store in a few clicks if you'd rather go that route.

---

## What's in `desktop/`
- `main.js` — the Electron app (window, loads the live site, camera/mic permissions, opens external
  links like Stripe/Amazon in the real browser, offline fallback).
- `preload.js` — a tiny safe bridge (marks the app as "desktop" and powers the offline Retry).
- `offline.html` — the "You're offline" screen.
- `build/icon.png` — the app icon (replace with a 1024×1024 for the crispest result).
- `build/entitlements.mac.plist` — Mac permissions for notarization (camera, mic, network).
- `package.json` — dependencies + the build config (appId `com.slickchart.app`, product "SlickChart").
