# Store assets — icons, splash & screenshots

## App icon + splash (generate automatically)
Capacitor can generate every icon/splash size from two source images.

1. Create a folder `resources/` in the project root and put in it:
   - `resources/icon.png` — **1024 × 1024** px, no transparency, no rounded corners (the OS rounds it).
   - `resources/splash.png` — **2732 × 2732** px, your logo centered on a solid background
     (`#0d0d0d` to match the app), lots of padding so nothing important is near the edges.
2. Install and generate (after `cap:add:ios` / `cap:add:android`):
   ```bash
   npm install --save-dev @capacitor/assets
   npx capacitor-assets generate --iconBackgroundColor '#C8A882' --splashBackgroundColor '#0d0d0d'
   ```
   This writes all the iOS and Android icon/splash sizes into the native projects. Re-run it if you
   change the source art.

> You already have `icon-512.png` / `icon-maskable-512.png` — resave one at **1024×1024** as
> `resources/icon.png`. If you want, send me your logo and I'll tell you exact crop/padding.

## App Store (App Store Connect) — required
- **App icon:** 1024 × 1024 (uploaded in App Store Connect, no alpha).
- **iPhone screenshots:** at least one set; the required size is **6.9"/6.7" — 1290 × 2796** (portrait).
  Provide 3–10. (A 6.5" — 1242 × 2688 — set is also accepted/expected by some tooling.)
- **iPad screenshots:** only if you enable iPad support (2048 × 2732). Simplest: **iPhone-only** at first.
- No "feature graphic" needed on Apple.

## Google Play (Play Console) — required
- **App icon:** 512 × 512 (32-bit PNG with alpha).
- **Feature graphic:** **1024 × 500** (shown at the top of your Play listing — a banner with your logo +
  tagline).
- **Phone screenshots:** 2–8, PNG/JPG, each side 320–3840 px, portrait ~**1080 × 1920**.
- (Tablet screenshots optional unless you target tablets.)

## Suggested 5 screenshots (same shots work for both stores)
1. **Home / dashboard** — the polished overview.
2. **Client chart** — a client record with photos + history.
3. **Before/after compare** — the slider/side-by-side.
4. **Digital intake form** — client signing on their phone.
5. **Client app** — the private client view (summary + homecare + next appointment).

Tip: add a short caption bar to each screenshot (e.g. "Every client's history in one place"). Tools like
the free **AppMockUp** or **Screenshots.pro** frame them nicely. You have raw starters in
`android/store-assets/`.

## Capture tips
- Use a real device or the simulator with **sample/demo data** (not a real client's info).
- Portrait orientation, status bar clean (full battery, no notifications).
- Same 5 scenes in the same order across both stores for consistency.
