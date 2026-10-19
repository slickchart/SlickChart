# Android audit checklist for SlickChart (Chrome, Samsung Internet, Capacitor WebView, TWA, installed PWA)

Researched 2026-10-19. Read-only research, no repo files changed.

## What SlickChart actually ships on Android (read from the repo, shapes every item below)

- **Capacitor 8** (`@capacitor/android ^8.4.2`, `@capacitor/app`, `camera`, `push-notifications`, `status-bar`),
  `capacitor.config.json` has `server.url: https://slickchart.app/slickchart`, so the WebView origin is the live
  site, not `https://localhost`. **minSdk 24 (Android 7.0), targetSdk 36** (edge-to-edge is forced).
  Manifest permissions: INTERNET, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS. **No CAMERA declared.**
- **TWA** (`android-twa/twa-manifest.json`, Bubblewrap, `app.slickchart.twa`, `enableNotifications: true`,
  `fallbackType: customtabs`, `orientation: portrait`).
- Plus installed PWA / plain tab in Chrome and Samsung Internet.
- Viewport meta in both apps: `width=device-width, initial-scale=1, viewport-fit=cover`, with **no `interactive-widget`**.
- Quick pre-scan of `slickchart.html` (counts of matching lines, not proof): `popstate`/`pushState` **0**,
  `wasDiscarded`/`pageshow` **0**, `text-size-adjust` **0**, `interactive-widget` **0**, `100vh` 4, `dvh` 1,
  `visualViewport` 7, `window.open` 11, `.download` 9, `Notification` 28, `SpeechRecognition` 2,
  `MediaRecorder` 4, `getUserMedia` 4, `capture=` 2, `type=date/time` 29, `navigator.storage.persist` 1.
  No post-2021 syntax found (`??=`, `.at(`, `structuredClone`, `replaceAll`, `toSorted`, `findLast`, static blocks: all 0).

**Source confidence:** the Chrome blog, web.dev, MDN, caniuse, Samsung developer blog/forum, Capacitor docs and
the Capacitor GitHub source links were checked during this research. Specific bug-tracker or issue numbers marked
"(unverified id)" are from memory: search the tracker by topic rather than trusting the number.

Capacitor Android source verified from GitHub `ionic-team/capacitor@main` (`BridgeWebChromeClient.java`, `Bridge.java`):
- File chooser: **implemented** (`onShowFileChooser`, multi-select, `capture` launches camera intent).
- `onPermissionRequest`: **implemented**, maps VIDEO_CAPTURE to CAMERA and AUDIO_CAPTURE to RECORD_AUDIO plus
  MODIFY_AUDIO_SETTINGS, runtime prompt, grant only if all granted.
- alert/confirm/prompt: implemented.
- Navigation to another host or scheme (`mailto:`, `tel:`, `sms:`, other domains): `launchIntent` sends it to
  `Intent.ACTION_VIEW`, so it opens externally. `data:`/`blob:` stay in the WebView.
- **No `DownloadListener`, no `onCreateWindow`.** Downloads and `window.open` need checking (items 12, 13).

## Recommended version floor

- **Chrome / Android System WebView 109 or newer as the supported floor; the code must still PARSE on 92+**
  (fail soft with a "please update Android System WebView / Chrome" screen below 109).
- Why: Chrome 119 was the last for Android 7.x. Chrome 138 was the last for Android 8/9 (Chrome 139+, Aug 2025,
  needs Android 10). WebView follows the same Play-updated track, so a fully updated Android 7 device is frozen at
  about 119 and Android 8/9 at about 138. Devices that never updated WebView from Play (common on cheap, no-Play or
  carrier-locked phones, Android Go, and enterprise-managed devices) can sit at the factory WebView: 52 on
  Android 7.0, 58-64 on 8.x, 66-70 on 9.
  Android below 10 is now roughly the low single digits to about 10% of active Android phones (Google's
  distribution dashboard). For a beauty professional's phone in late 2026 that is a small tail, but it exists.
- minSdk 24 in the Capacitor app lets Android 7 install it. Either raise minSdk to 26 or 29, or keep 24 and
  add a WebView version gate (item 40).
- Sources: https://www.androidauthority.com/chrome-dropping-support-android-8-9-3571442 ,
  https://heise.de/-10457380 , https://developer.android.com/about/dashboards

---

## Checklist (ordered by risk of data loss, then broken screens)

Each item gives: **(a)** the problem and who it affects, **(b)** the source, **(c)** a grep or test,
**(d)** the fix.

### P0: data loss / unrecoverable state

**1. Back button / back gesture exits the app or leaves the screen mid-edit**
- (a) Installed PWA and TWA: back with no history entry closes the app. Capacitor 8 with `@capacitor/app` and no
  `backButton` listener: back calls `webView.goBack()` if there is history, otherwise **finishes the activity**.
  An open modal, sheet or note editor that never pushed a history entry is dismissed by leaving the whole app.
  Android 14+ predictive back makes the gesture easy to trigger by accident from the screen edge.
  Unsaved drafts are lost unless they autosave.
- (b) https://capacitorjs.com/docs/apis/app#addlistenerbackbutton-
  https://developer.chrome.com/docs/android/trusted-web-activity/ (TWA back behavior is the browser history)
  https://web.dev/learn/pwa/app-design (history entries for in-app views)
- (c) `grep -nE "popstate|pushState|replaceState|backButton" slickchart.html slickchart-client.html` (pre-scan:
  0 popstate, 0 pushState). Test: on Android, open a client note, type, then press back. Expected: the sheet
  closes and the app stays open with the text kept.
- (d) Push a history entry (`history.pushState({sheet:id},'')`) when any modal, sheet or editor opens and close it
  on `popstate`. In Capacitor, add `App.addListener('backButton', ({canGoBack}) => closeTopSheet() ||
  (canGoBack ? history.back() : confirmExit()))`. Flush the draft to storage on `popstate`, `pagehide` and
  `visibilitychange:hidden`, never only on a Save tap.

**2. Low-RAM tab or app kill: the page reloads on return and in-memory state is gone**
- (a) Chrome Android discards background tabs under memory pressure. Android kills the WebView or TWA process when
  the user switches to the camera, Square or messages, and the 2-4GB devices do this aggressively. On return the
  page cold-boots: unsaved form state, scroll and open modal are gone. `document.wasDiscarded` is true only for
  Chrome tab discards (Chrome 68+), not for a Capacitor process death.
- (b) https://developer.chrome.com/docs/web-platform/page-lifecycle-api
  https://developer.chrome.com/blog/page-lifecycle-api (freeze/resume, wasDiscarded)
- (c) `grep -nE "wasDiscarded|visibilitychange|pagehide|freeze" slickchart.html`. Test: Android emulator
  (2GB profile), type into a note, open the camera app, then run `adb shell am kill com.slickchart.app` (or
  Developer options > "Don't keep activities"), and return. The draft must still be there.
- (d) Persist drafts synchronously to localStorage on every input (debounced to about 300ms) and on
  `visibilitychange` to hidden. **Do not rely on `beforeunload` or `unload`**: they do not fire on mobile kills.
  IndexedDB writes started in `visibilitychange` may not finish before a kill, so keep the small draft in
  localStorage. Restore the last screen and draft at boot.

**3. Camera / file picker round trip kills the page (photo capture loses the session)**
- (a) Picking a photo with `<input type=file capture>` launches the camera app. On a low-RAM phone Android often
  kills the browser or WebView process while the camera is open (a well-known WebView and Chrome problem). On return
  the page reloads, the `change` event never fires, and the photo plus any half-filled form are lost.
- (b) https://issues.chromium.org/issues/40497779 (file chooser result lost after activity recreation, WebView) (unverified id)
  https://stackoverflow.com/questions/30078157/webview-file-chooser-activity-recreated (unverified id)
- (c) `grep -nE 'capture=|type="file"|type=file' slickchart.html`. Test with "Don't keep activities" ON: capture a
  photo for a client. Expected: the photo arrives, or the app restores the screen and says "photo not received,
  try again".
- (d) Before opening the picker, save the pending context (client id, form step) to localStorage. On boot, restore
  it and offer a retry. In Capacitor, prefer `@capacitor/camera` (already installed): it survives activity
  recreation through `App` `appRestoredResult`. Handle that event.

**4. Pull-to-refresh reloads the page mid-edit**
- (a) Chrome Android, Samsung Internet and installed PWAs: overscrolling down at the top of the page reloads it.
  This is not active in standalone PWAs in Chrome, but is in browser tabs, Samsung Internet and some TWA builds.
  Unsaved text in a scrolled-to-top editor is lost.
- (b) https://developer.chrome.com/blog/overscroll-behavior
  https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior
- (c) `grep -n "overscroll-behavior" slickchart.html` (pre-scan: 1 hit; check it is on `html,body` and not on one
  panel). Test: in Chrome on Android, at the top of a note, drag down hard.
- (d) `html,body{overscroll-behavior-y:contain}` (or `none`), plus draft persistence from item 2.

**5. Storage eviction and quota on full or low-storage phones**
- (a) Chrome origins are "best-effort" unless persisted, and are evicted LRU when the device is low on disk.
  Cheap phones with 32-64GB that are full of photos hit this. Chrome grants `navigator.storage.persist()`
  silently based on engagement or install. For an installed PWA, TWA or bookmarked site it is usually granted,
  but in a plain tab it is often denied without a prompt. Capacitor WebView storage is app data: it is not evicted
  by the browser, but it is wiped by "Clear storage" or uninstall. QuotaExceededError on IndexedDB `put` with big
  photos.
- (b) https://web.dev/articles/storage-for-the-web
  https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
  https://developer.chrome.com/blog/persistent-storage (not always granted)
- (c) `grep -nE "storage\.persist|storage\.estimate|QuotaExceeded" slickchart.html`. Test: in DevTools,
  Application > Storage > "Simulate custom storage quota" set to 10MB, then save photos. Expected: a clear error
  and no silent loss, with a server copy existing.
- (d) Call `navigator.storage.persist()` after login and log the result in the device report. Catch
  `QuotaExceededError` and `UnknownError` on every IDB transaction (`tx.onerror` and `tx.onabort`), and surface
  them. Never treat local IDB as the only copy (the photo server backup already exists, so check its retry path on
  quota failure).

**6. IndexedDB transaction aborts and "UnknownError" on Android WebView**
- (a) Large single `put` (multi-MB blobs or strings) aborts on low-memory devices. Old WebViews (below about 74)
  had blob-in-IDB bugs. Samsung Internet in Secret mode has a tiny or no persistent IDB. An open IDB connection
  can be closed by the browser (`onclose`, Chrome 54+) when storage is cleared or the origin is evicted.
- (b) https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/close_event
  https://bugs.chromium.org/p/chromium/issues/detail?id=1059845 (example IDB quota/abort behaviour reports) (unverified id)
- (c) `grep -nE "indexedDB\.open|onabort|onclose|onversionchange" slickchart.html`. Test: write a 20MB value in a
  2GB-RAM emulator. Then run Settings > Apps > Clear storage while the app is backgrounded, and resume.
- (d) Handle `db.onclose` (reopen) and `onversionchange` (close), and treat `tx.onabort` as a failed save that is
  retried and reported. Store photos as Blobs under a few MB and chunk larger data.

**7. Samsung Internet "Secret mode" / Chrome Incognito: storage disappears on close**
- (a) Samsung Internet Secret mode and Chrome Incognito give a temporary storage partition. Anything only on the
  device is lost when the tab closes.
- (b) https://developer.chrome.com/docs/privacy-security/storage-partitioning
  https://developer.samsung.com/internet/blog/en/
- (c) Test: log in in Secret mode, make a note offline, close the tab.
- (d) Detect a small quota with `navigator.storage.estimate()` (quota under about 120MB is the incognito
  signature) and warn "you are in a private tab, work is only saved when online".

**8. TWA, Chrome tab and Capacitor are three separate storage silos**
- (a) TWA shares Chrome's storage for `slickchart.app`. The installed PWA shares Chrome's storage too. The Capacitor
  WebView has its own separate cookie, localStorage and IDB jar even with the same origin. Samsung Internet is a
  fourth jar. A provider who switches between them has divergent local copies (cloud sync must reconcile, see
  CLAUDE.md §0.6). Uninstalling the TWA does not clear Chrome's data; uninstalling the Capacitor app does.
  "Clear cache" in Chrome settings can wipe site data.
- (b) https://developer.chrome.com/docs/android/trusted-web-activity/faq
  https://developer.android.com/develop/ui/views/layout/webapps/webview
- (c) Test: log in on the Capacitor app and in Chrome on the same phone and confirm the device report lists 2 devices,
  with merges working.
- (d) No code change; make sure the device report shows which container is in use (`navigator.userAgent` contains
  `; wv)` for WebView; `document.referrer` starts with `android-app://` on TWA launch; `display-mode: standalone`
  for PWA).

**9. Capacitor origin / scheme change wipes all WebView storage**
- (a) Changing `server.url`, `server.hostname`, `androidScheme`, or moving from remote `server.url` to bundled
  assets changes the WebView origin. All localStorage and IDB written under the old origin become invisible
  (this is the classic Capacitor 5 to 6 http to https migration data loss).
- (b) https://ionic.io/blog/capacitor-6-has-arrived (androidScheme default changed to https)
  https://forum.ionicframework.com/t/ionic-storage-data-gets-deleted-after-capacitor-migration-and-upgrades/234989
- (c) `git log -p -- slickchart-vercel/capacitor.config.json`, and diff `server.url`, `hostname` and `androidScheme`
  in every release.
- (d) Freeze `server.url` (`https://slickchart.app/slickchart`) permanently. Any change needs a migration that
  pulls everything from the server first. Add a CI check that fails if those fields change.

**10. `beforeunload` / `unload` do not fire on Android, and bfcache restores stale state**
- (a) Mobile Chrome does not reliably fire `unload` or `beforeunload` (tab switches, kills). `unload` handlers also
  block the back/forward cache. When a page IS restored from bfcache (`pageshow` with `persisted`), timers, sockets
  and auth may be stale and a sync loop may not resume.
- (b) https://web.dev/articles/bfcache
  https://developer.chrome.com/docs/web-platform/deprecating-unload
- (c) `grep -nE "beforeunload|'unload'|\"unload\"|pageshow|persisted" slickchart.html` (pre-scan: beforeunload 2,
  pageshow 0). Test: DevTools > Application > Back/forward cache > "Test back/forward cache".
- (d) Save on `visibilitychange` to hidden and `pagehide`. Add `pageshow` with `e.persisted` to re-check the
  session, pull from the cloud and restart timers.

### P1: broken screens and features

**11. On-screen keyboard covers inputs, or bottom bars jump above the keyboard**
- (a) Chrome 108+ (Android) changed the default to `resizes-visual`: the keyboard shrinks only the visual viewport,
  so `100vh`, `dvh` and `position:fixed;bottom:0` no longer move. Inputs near the bottom can be hidden.
  Samsung Internet follows Chromium but its version lags. In Capacitor with targetSdk 35+ (SlickChart targets 36)
  edge-to-edge is forced and `adjustResize` no longer shrinks the WebView, so on Android 15+ the keyboard can
  cover the focused field entirely. Users report a grey strip after the keyboard hides in Capacitor 8.
- (b) https://developer.chrome.com/blog/viewport-resize-behavior
  https://forum.ionicframework.com/t/android-edge-to-edge-and-keyboard-for-capacitor-8/250231
  https://margelo.com/blog/deep-dive-in-keyboard-handling
- (c) `grep -nE "interactive-widget|visualViewport|100vh|dvh|position: *fixed" slickchart.html`. Test on an
  Android 15 or 16 emulator in the Capacitor app: focus the last field of a long form, the chat composer and the
  signature screen.
- (d) Add `interactive-widget=resizes-content` to the viewport meta (Chrome 108+, ignored elsewhere) if bottom
  bars should rise with the keyboard. For Capacitor on Android 15+, either install `@capacitor/keyboard` with
  `resizeOnFullScreen: true`, or use `visualViewport` resize events to pad the bottom by
  `innerHeight - visualViewport.height`, and call `el.scrollIntoView({block:'center'})` on focus.

**12. Downloads do nothing in the Capacitor WebView (`a[download]`, blob URLs, CSV/PDF export)**
- (a) Android WebView ignores downloads unless the app sets a `DownloadListener`. Capacitor does not set one
  (verified in `Bridge.java`). `blob:` and `data:` URLs cannot be handed to the system downloader at all. Result:
  "Export" / "Download PDF" / backup buttons silently do nothing in the Android app. Chrome and TWA work.
- (b) https://developer.android.com/reference/android/webkit/DownloadListener
  https://github.com/ionic-team/capacitor/issues/5478 (downloads in Capacitor Android) (unverified id)
- (c) `grep -nE "\.download *=|download=|createObjectURL|toDataURL\(" slickchart.html` (pre-scan: 9 `.download`).
  Test every export button in the Android app.
- (d) In the Capacitor app, detect native (`Capacitor.isNativePlatform()`) and write the file with
  `@capacitor/filesystem` then share it with `@capacitor/share` (neither is installed yet; `navigator.share` is
  not available in WebView, see item 21). Or, server-side, return a real HTTPS URL with
  `Content-Disposition: attachment` and open it externally with `Browser.open`.

**13. `window.open` / `target=_blank` in WebView and TWA**
- (a) Capacitor has no `onCreateWindow` and multi-window support is off, so `window.open(url)` becomes a navigation
  in the same WebView. A same-host URL **replaces the app page** (losing in-memory state, and back may not return).
  A different host opens an external app. `window.open()` returning a handle you write into (`w.document.write` for
  print previews) gets `null` or an unusable window. In TWA, `_blank` opens a Custom Tab over the app, which is
  fine, but `window.opener` messaging (OAuth popups) does not work.
- (b) https://developer.android.com/reference/android/webkit/WebSettings#setSupportMultipleWindows(boolean)
  https://capacitorjs.com/docs/apis/browser
- (c) `grep -nE "window\.open|target=._blank|\.opener" slickchart.html` (pre-scan: 11 `window.open`).
  Test each one in the Capacitor app.
- (d) In native, route to `@capacitor/browser` (`Browser.open`) for external links. Never open the app's own host
  with `window.open`. Replace print-preview popups with an in-page overlay plus `window.print()` (also see item 22).

**14. OAuth (Square / Google) inside Capacitor**
- (a) Navigation to `connect.squareup.com` or `accounts.google.com` leaves the WebView (Bridge sends other hosts to
  `ACTION_VIEW`), so the user finishes OAuth in Chrome and lands on `slickchart.app` **in Chrome, not back in the
  app**. Google blocks OAuth inside embedded WebViews anyway (`disallowed_useragent`).
- (b) https://developers.googleblog.com/2016/08/modernizing-oauth-interactions-in-native-apps.html
  https://developers.google.com/identity/protocols/oauth2/policies#browsers
- (c) Test Square Connect and Google Calendar connect from the Android app.
- (d) Open OAuth with `@capacitor/browser`. Make the callback page deep link back (App Links / custom scheme)
  or tell the user "Connected, return to the app" and have the app re-check status on `App` `resume`.

**15. Samsung Internet forced dark mode inverts colors**
- (a) Samsung Internet (around 15-20% of browsing on Samsung phones; Samsung is about a third of Android in the US)
  applies its own algorithmic dark theme when the phone is in dark mode. From 13.2 it respects `color-scheme`
  and `prefers-color-scheme`, but staff confirm sites cannot fully opt out. Version 24 made forced dark the default,
  and 25's "Adaptive Force Dark" only skips pages that declare the meta tag. Logos, photos with white backgrounds,
  brand colours, signature pads and Luxe forms get inverted or muddied. Android WebView also has algorithmic darkening
  (`setAlgorithmicDarkeningAllowed`, targetSdk 33+), off by default unless the app enables it.
- (b) https://developer.samsung.com/internet/blog/en/2020/12/15/dark-mode-in-samsung-internet
  https://forum.developer.samsung.com/t/websites-dark-mode-gets-overridden-by-samsung-internets-dark-mode/22937
  https://developer.android.com/develop/ui/views/layout/webapps/dark-theme
- (c) `grep -nE '<meta name="color-scheme"|color-scheme:' slickchart.html slickchart-client.html`. Test: Samsung
  emulator or device, system dark mode ON, open the client form, the signature canvas and the photo viewer.
- (d) Add `<meta name="color-scheme" content="light dark">` (or `"light"` on pages that are only light) in the
  `<head>` of every page, plus `:root{color-scheme:light dark}`. Give canvases an explicit background fill (do not
  rely on transparent pixels being white). Ship a real dark theme via `prefers-color-scheme` so Samsung
  leaves the page alone.

**16. System font size / display size scaling breaks layouts**
- (a) Around 37% of Android users change the system font scale. Chrome Android applies it through text autosizing
  ("font boosting") plus the accessibility text-scaling setting (default follows system), and newer Chrome builds move
  to page zoom. At 130-200% fixed-height buttons clip, one-line labels wrap, and absolutely positioned headers
  overlap. Font boosting also inflates some paragraph text unpredictably. WebView: `textZoom` follows system font
  scale in Capacitor (`WebSettings.setTextZoom` defaults to the system scale in many configurations).
  Samsung "Display size" changes CSS px width (360 to 320 or 412).
- (b) https://issues.chromium.org/issues/40486848 (crbug 645717, accessibility font scale vs page zoom) (unverified id)
  https://joshtumath.uk/posts/2026-01-27-try-text-scaling-support-in-chrome-canary
  https://developer.mozilla.org/en-US/docs/Web/CSS/text-size-adjust
- (c) `grep -nE "text-size-adjust|height: *[0-9]+px" slickchart.html` (pre-scan: text-size-adjust 0). Test in
  Chrome DevTools at 320px width plus Android emulator at font scale 2.0
  (`adb shell settings put system font_scale 2.0`).
- (d) Add `html{-webkit-text-size-adjust:100%;text-size-adjust:100%}` to stop font boosting while keeping user
  zoom. Use `min-height` not `height` on buttons and rows, allow wrapping, and test at 320px. In Capacitor decide
  deliberately: `webView.getSettings().setTextZoom(100)` disables system scaling (bad for accessibility). Prefer
  supporting it.

**17. Old WebView / old Chrome cannot PARSE the app: blank screen**
- (a) One unsupported syntax token in the 3MB inline script throws a SyntaxError and **nothing** runs. Minimum
  versions: optional chaining `?.` and `??` 80, `??=`/`||=`/`&&=` 85, `#private` fields 74 and methods 84,
  `#x in o` 91, class static blocks 94, top-level `await` (modules only) 89, RegExp lookbehind 62, named groups 64,
  `s` flag 62, `d` flag 90, `v` flag 112, numeric separators 75, import attributes `with` 123,
  `using` declarations 134. APIs (these throw at call time, not parse time): `replaceAll` 85, `Array.at` 92,
  `Object.hasOwn` 93, `structuredClone` 98, `findLast` 97, `Array.prototype.toSorted/with` 110,
  `Object.groupBy` 117, `Promise.withResolvers` 119, Set methods 122. CSS: `dvh` 108, `:has()` 105, `@container`
  105, nesting 112 (120 relaxed), `color-mix` 111, `text-wrap:balance` 114.
- (b) https://caniuse.com/mdn-javascript_operators_optional_chaining
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining#browser_compatibility
  https://caniuse.com/?search=structuredClone
- (c) `npx es-check es2020 extracted-script.js` after pulling the inline `<script>` out (the same extraction as
  `scripts/build-app-split.cjs`), or `npx eslint --no-eslintrc --parser-options=ecmaVersion:2020`. Run it in CI.
  Then grep for the API list above. Test: Android 9 emulator image with its bundled WebView (69) or a downloaded
  old WebView APK.
- (d) Keep the parse target at ES2020 (Chrome 80) at most, feature-detect newer APIs, and add a tiny separate
  `<script>` that runs first and shows "Please update Android System WebView / Chrome" if
  `!('replaceAll' in String.prototype)` or a version parsed from the UA is under the floor.

**18. Microphone / `getUserMedia` / `MediaRecorder` in Capacitor WebView**
- (a) Needs RECORD_AUDIO in the manifest (present) **and** a runtime grant. Capacitor's `onPermissionRequest` handles
  it. Capture is camera-only: VIDEO_CAPTURE maps to CAMERA, which is **not declared in the manifest**, so the
  runtime request for CAMERA fails immediately and `getUserMedia({video:true})` is denied. getUserMedia requires a
  secure context (fine with `https://slickchart.app`). MediaRecorder in WebView records `audio/webm;codecs=opus`
  only; `audio/mp4` is unsupported before Chrome 126ish. A permanently denied permission gives `NotAllowedError`
  with no prompt.
- (b) https://developer.android.com/reference/android/webkit/WebChromeClient#onPermissionRequest(android.webkit.PermissionRequest)
  https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java
  https://forum.ionicframework.com/t/use-getusermedia-in-capacitor/218807
- (c) `grep -nE "getUserMedia|MediaRecorder|isTypeSupported" slickchart.html` and
  `grep -n CAMERA slickchart-vercel/android/app/src/main/AndroidManifest.xml`. Test: in the Android app, deny the
  mic once, then "Don't ask again", and check the message shown.
- (d) Always pick the MIME type with `MediaRecorder.isTypeSupported()` in order (webm/opus, mp4, ogg). Show
  "Allow microphone in Settings > Apps > SlickChart > Permissions" on `NotAllowedError`. If any video
  `getUserMedia` exists, declare `CAMERA`.

**19. Web Speech API (dictation) does not exist in Android WebView**
- (a) `webkitSpeechRecognition` is available in Chrome Android (sends audio to Google), **disabled in Android
  WebView** by design (so in the Capacitor app), and absent or unreliable in Samsung Internet. In TWA it works
  (it is Chrome). It needs network; offline it fires `error: network`.
- (b) https://issues.chromium.org/41172064 (WebView: speech API not supported, hidden)
  https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition#browser_compatibility
- (c) `grep -nE "SpeechRecognition" slickchart.html` (2 hits). Test: dictation button in the Capacitor app.
- (d) Hide the mic button when `!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)`. In native
  use a plugin (`@capacitor-community/speech-recognition`), or point users to the keyboard's own mic (Gboard
  voice typing works everywhere).

**20. Notifications / Web Push differ per container**
- (a) Android WebView has **no** Notification API and **no** Push API (`Notification` undefined or permission
  always "denied"). Capacitor must use `@capacitor/push-notifications` (FCM). TWA delegates notifications to Chrome
  (with `enableNotifications: true`, Android 13+ needs the POST_NOTIFICATIONS runtime grant delegated through the
  TWA). Chrome Android: `new Notification()` throws "Illegal constructor", only
  `registration.showNotification()` works. Samsung Internet supports push with its own permission UI.
- (b) https://developer.chrome.com/docs/android/trusted-web-activity/receive-notifications (TWA notification
  delegation)
  https://developer.android.com/develop/ui/views/notifications/notification-permission
  https://stackoverflow.com/questions/29774836/failed-to-construct-notification-illegal-constructor (unverified id)
- (c) `grep -nE "new Notification\(|Notification\.requestPermission|showNotification|PushManager" slickchart.html`
  (28 `Notification` hits). Test: enable reminders in Capacitor, TWA and Chrome tab.
- (d) Never call `new Notification()` on Android. Guard with `'Notification' in window` and
  `'PushManager' in window`. Branch to the native plugin in Capacitor.

**21. Web Share API: missing in WebView, files limited in Chrome**
- (a) `navigator.share` exists in Chrome Android 61+ and TWA. **Not in Android WebView.** File sharing needs
  `navigator.canShare({files})` (Chrome 76+, limited MIME list: images, pdf, text, audio, video). It must be called
  from a user gesture; after an `await` that takes too long, the gesture expires and it throws `NotAllowedError`.
- (b) https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share#browser_compatibility
  https://web.dev/articles/web-share
- (c) `grep -nE "navigator\.share|canShare" slickchart.html` (2 hits). Test in Capacitor.
- (d) Feature-detect; fall back to `@capacitor/share` in native and to copy-link in the browser. Build the file before
  the tap.

**22. `window.print()` is a no-op in Android WebView**
- (a) Chrome Android prints. In Android WebView `window.print()` does nothing unless the host app implements
  `PrintManager`; Capacitor does not. Printable consent PDFs / intake forms would silently not print.
- (b) https://developer.android.com/training/printing/html-docs
  https://github.com/ionic-team/capacitor/issues/3046 (unverified id)
- (c) `grep -nE "window\.print|\.print\(\)" slickchart.html slickchart-client.html`. Test in the Android app.
- (d) In native, generate a PDF server-side and open it with `Browser.open`, or use a print plugin.

**23. Very large camera photos: decode, canvas and memory limits**
- (a) 50-200MP sensors give 12-30MB JPEGs. Decoding one into a canvas needs width*height*4 bytes (200MP is about
  800MB), so a low-end phone kills the tab or `drawImage` silently draws nothing. Chrome caps canvas area around
  268M pixels and max side 32,767 px, but memory runs out much earlier on 2-4GB phones. `toBlob` returns `null`
  when the canvas is too big. HEIC from some Samsung phones is not decodable by Chrome before about 2025.
- (b) https://developer.mozilla.org/en-US/docs/Web/HTML/Element/canvas#maximum_canvas_size
  https://web.dev/articles/browser-level-image-lazy-loading (memory note)
  https://developer.mozilla.org/en-US/docs/Web/API/createImageBitmap (resizeWidth/resizeHeight options)
- (c) `grep -nE "createImageBitmap|drawImage|toBlob|toDataURL|new Image\(" slickchart.html`. Test: feed a
  12000x9000 JPEG (and a HEIC) to the photo input on a 2GB emulator.
- (d) Downscale while decoding: `createImageBitmap(file, {resizeWidth: 2048, resizeQuality: 'medium'})`
  (Chrome 54+, options 79+). Check for `null` from `toBlob`. Accept `image/*` but reject or convert HEIC with a
  clear message. Process photos one at a time, and `bitmap.close()` after each.

**24. Image EXIF orientation**
- (a) Since Chrome 81 `<img>` and `drawImage` of an `<img>` honour EXIF orientation (`image-orientation:
  from-image` default). `createImageBitmap` honours it only with `imageOrientation: 'from-image'` (default changed
  in Chrome 104 and the spec renamed values). Code that rotates manually from EXIF now double-rotates on new
  WebViews and old code that does not rotate is sideways on WebView below 81.
- (b) https://developer.mozilla.org/en-US/docs/Web/CSS/image-orientation
  https://chromestatus.com/feature/6313474512650240 (unverified id)
- (c) `grep -nE "orientation|exif|EXIF|imageOrientation" slickchart.html`. Test: a portrait phone photo with
  orientation=6 through the upload, the thumbnail and the server copy.
- (d) Do not rotate manually. Pass `{imageOrientation:'from-image'}` to `createImageBitmap`. Verify on the server
  copy too.

**25. File input `accept` and `capture` quirks**
- (a) `capture` forces the camera with no gallery option (Chrome and Capacitor); without it, Android shows a chooser.
  `accept=".pdf"` is mapped to MIME by Capacitor, but some pickers ignore unknown extensions. Android 13+ photo picker
  returns content URIs with `file.name` like `1000012345.jpg` and sometimes `type` empty. Multiple selection is not
  offered with `capture`. Large selections (30+ photos) can OOM on low-end devices.
- (b) https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/capture
  https://developer.android.com/training/data-storage/shared/photopicker
- (c) `grep -nE 'accept=|capture=|multiple' slickchart.html`. Test: pick 20 gallery photos at once in Capacitor.
- (d) Do not depend on `file.type` or `file.name`; sniff magic bytes. Process sequentially. Offer both "Take photo"
  (`capture`) and "Choose photos" (no `capture`, `multiple`).

**26. Date / time inputs render differently and are hard to clear**
- (a) Android Chrome and WebView show the native Material date picker; there is no "clear" in older versions, and
  the value is `""` if partially typed. `type=time` uses the 12/24h from the phone locale, not the page. Samsung
  Internet uses Samsung's own picker. `datetime-local` value has no timezone. `min`/`max` and `step` are
  inconsistent. Unstyled inputs are empty-looking boxes on Android (no placeholder support for date).
- (b) https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/date
  https://caniuse.com/input-datetime
- (c) `grep -nE 'type="(date|time|datetime-local)"' slickchart.html` (29 hits). Test appointment create/edit and the
  client DOB field on Samsung Internet and a Pixel.
- (d) Always provide a visible label (the placeholder never shows). Add a clear button. Treat `""` as "not set".
  Store dates as `YYYY-MM-DD` and times as local wall time plus the provider's timezone.

**27. `<select>` and long option lists**
- (a) Android renders `<select>` as a native dialog; `<optgroup>` is flattened in some Samsung versions, styling of
  `<option>` is ignored, and `size>1` list boxes look broken. A select with hundreds of clients is slow to open on
  low-end phones.
- (b) https://developer.mozilla.org/en-US/docs/Web/HTML/Element/select#styling_with_css
- (c) `grep -cE "<select" slickchart.html`. Test the client picker with 500 clients.
- (d) Use a searchable list for large sets; do not rely on option styling.

**28. Parse/compile cost of a 3MB inline script on slow CPUs**
- (a) Low-end Android (Cortex-A53, Helio G35) parses and compiles 3MB of JS in 2-6s on a cold start. Inline scripts
  are not code-cached on repeat visits (V8 code caching only covers external scripts). Long main-thread tasks also
  delay input and make the first taps "not work".
- (b) https://v8.dev/blog/code-caching-for-devs
  https://web.dev/articles/optimize-long-tasks
  https://v8.dev/blog/cost-of-javascript-2019
- (c) Already addressed on Vercel by `scripts/build-app-split.cjs` (external `assets/app-<hash>.js`). Check the
  Capacitor app loads the split page (it uses `server.url`, so yes). Test: Chrome DevTools CPU 6x slowdown, plus
  `scratchpad/perf-boot.mjs`.
- (d) Keep the split. Consider `defer` and deferring non-Home code. Confirm the WebView keeps HTTP cache between launches
  (it does unless the app clears it).

**29. Memory pressure from big in-memory libraries and DOM**
- (a) A 2GB phone gives a tab about 200-400MB. Large JSON (client list, message store), thousands of DOM nodes and
  decoded thumbnails push it over, so the renderer is killed ("Aw, Snap" in Chrome; blank white WebView in
  Capacitor, where `onRenderProcessGone` is not handled, so the app shows white until restarted).
- (b) https://developer.android.com/reference/android/webkit/WebViewClient#onRenderProcessGone(android.webkit.WebView,%20android.webkit.RenderProcessGoneDetail)
  https://web.dev/articles/monitor-total-page-memory-usage
- (c) `scratchpad/scaleaudit.mjs` DOM node counts. Test: 2GB AVD with the busy-practice seed.
- (d) Virtualize long lists, use `loading=lazy` and `decoding=async` on images, and revoke object URLs. In native,
  override `onRenderProcessGone` to reload the WebView instead of a white screen.

**30. Sticky `:hover` states and double-tap zoom**
- (a) On touch, `:hover` styles stick after a tap until the next tap elsewhere (Chrome, Samsung). A 300ms click
  delay is gone with `width=device-width` (Chrome 32+), but double-tap-to-zoom still triggers on elements that are
  not `touch-action: manipulation` in some Samsung versions.
- (b) https://developer.chrome.com/blog/300ms-tap-delay-gone-away
  https://developer.mozilla.org/en-US/docs/Web/CSS/@media/hover
- (c) `grep -nE ":hover" slickchart.html | wc -l` and `grep -n "touch-action" slickchart.html`.
- (d) Wrap hover styles in `@media (hover:hover)`. Put `touch-action: manipulation` on buttons and tappable rows.

**31. `touch-action` / scroll on signature pads and drawing canvases**
- (a) Without `touch-action:none` on a signature or body-map canvas, Android scrolls the page or triggers
  pull-to-refresh / back gesture while signing. Edge swipes start the system back gesture (item 1).
- (b) https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action
  https://developer.android.com/develop/ui/views/touch-and-input/gestures/gesturenav
- (c) `grep -nE "<canvas|touch-action" slickchart.html slickchart-client.html`. Test signing quickly near the screen
  edge on Android with gesture navigation.
- (d) `touch-action:none` on canvases, use Pointer Events with `setPointerCapture`, and keep the signature area
  away from screen edges (margin of 24px or more).

**32. Edge-to-edge and safe-area insets (Capacitor 8, targetSdk 36, Android 15+)**
- (a) With targetSdk 35+ the app draws behind the status and navigation bars. Before Chromium 140 the WebView did
  not report `env(safe-area-inset-*)` on Android, so headers sit under the status bar and bottom bars under the
  gesture pill. Capacitor 8 SystemBars `insetsHandling: native` pads the WebView on old WebViews and exposes
  `--safe-area-inset-*` vars.
- (b) https://capacitorjs.com/docs/apis/system-bars
  https://capawesome.io/blog/capacitor-edge-to-edge-and-safe-areas-guide/
  https://developer.android.com/develop/ui/views/layout/edge-to-edge
- (c) `grep -nE "safe-area-inset" slickchart.html`. Test Android 15 and 16 emulators with 3-button and gesture
  navigation, WebView 130 and 140+.
- (d) Use `padding-top: max(env(safe-area-inset-top), var(--safe-area-inset-top, 0px))`. Set SystemBars config
  explicitly in `capacitor.config.json`.

**33. `100vh` is wrong on Android; `dvh` needs Chrome 108**
- (a) `100vh` equals the largest viewport (URL bar hidden), so full-height screens overflow under the Chrome
  toolbar in a tab. `dvh/svh/lvh` exist from Chrome 108 and Samsung Internet 21. Old WebViews ignore the
  declaration entirely.
- (b) https://web.dev/blog/viewport-units
  https://caniuse.com/viewport-unit-variants
- (c) `grep -nE "100vh|dvh|svh" slickchart.html` (4 vh, 1 dvh).
- (d) `height:100vh; height:100dvh;` (fallback first), or set `--vh` from `innerHeight`.

**34. Clipboard**
- (a) `navigator.clipboard.writeText` needs a secure context and user activation; in Android WebView it works for
  write from Chrome 66ish but `readText` triggers a permission that WebView rejects (no prompt UI). Capacitor does
  not grant `clipboard-read`. Samsung Internet shows its own paste prompt.
- (b) https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
  https://web.dev/articles/async-clipboard
- (c) `grep -nE "clipboard\.(readText|read)\b" slickchart.html`. Test copy and paste buttons in Capacitor.
- (d) Use writeText only, inside the tap handler before any `await`. Catch the rejection and fall back to a selected
  textarea + `document.execCommand('copy')`. Do not build features on clipboard read.

**35. mailto:, sms:, tel:, intent links**
- (a) Capacitor sends them to `ACTION_VIEW` (fine) but swallows `ActivityNotFoundException` (no email app: nothing
  happens). `sms:` body syntax is `sms:+1555?body=` on Android (iOS uses `&body=`). In a Chrome tab, links opened
  from `window.location` inside a timer lose the user gesture and are blocked. TWA: works.
- (b) https://developer.chrome.com/docs/android/intents
  https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/Bridge.java
- (c) `grep -nE "mailto:|sms:|tel:|intent://" slickchart.html`.
- (d) Use `?body=` for Android SMS. Trigger from a direct tap. Offer "copy" as a fallback.

**36. Autofill and keyboard type**
- (a) Chrome and Samsung autofill fill wrong fields when `name` and `autocomplete` are missing (client name fields
  get the provider's own name and address). `autocomplete="off"` is ignored for address/credit card heuristics.
  Missing `inputmode`/`type=tel` gives a full keyboard for numbers. One-time codes need
  `autocomplete="one-time-code"` (Chrome also supports WebOTP).
- (b) https://developer.chrome.com/docs/identity/webotp
  https://web.dev/learn/forms/autofill
- (c) `grep -cE 'autocomplete=' slickchart.html` vs `grep -cE '<input' slickchart.html`.
- (d) On fields about a client (not the user), use `autocomplete="off"` plus distinct `name`s
  (`client-first-name`), or `autocomplete="section-client given-name"`. Add `inputmode="numeric"`,
  `type=tel`/`email`. Use `autocomplete="one-time-code"` for client-code logins.

**37. `beforeinstallprompt` and install state**
- (a) Fires only in Chrome (and Samsung Internet with its own install menu), never in WebView or TWA. If the app
  shows an "Install" banner based on it, it never appears in Samsung if the logic expects Chrome. Already-installed
  TWA users may see an install nag in Chrome tabs.
- (b) https://web.dev/articles/customize-install
  https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event
- (c) `grep -n "beforeinstallprompt\|getInstalledRelatedApps\|display-mode" slickchart.html`.
- (d) Hide install UI when `matchMedia('(display-mode: standalone)').matches`, in WebView (`; wv)` in the UA) or on
  TWA. Use `navigator.getInstalledRelatedApps()` (Chrome 80+) to suppress it when the Play app exists.

**38. Service worker quirks on Android**
- (a) SW works in Chrome, TWA, Samsung and WebView (Android 7+ via `ServiceWorkerController`). A stale SW serving
  an old app shell is the main risk: users keep old code (relevant to CLAUDE.md §1a shape compatibility). Samsung
  Internet keeps SWs and caches for long periods. In WebView, the SW intercepts `/api/**` only if the page code
  routes it. With a remote `server.url` in Capacitor, the SW of `slickchart.app` is active inside the WebView too.
- (b) https://web.dev/articles/service-worker-lifecycle
  https://developer.android.com/reference/android/webkit/ServiceWorkerController
- (c) `grep -nE "skipWaiting|clients\.claim|registration\.update" sw.js slickchart.html`. Test: deploy two
  builds and open the Capacitor app offline then online.
- (d) Keep the build check. Version-stamp every asset. Never cache `/api/**` responses for writes.

**39. Cookies and third-party contexts**
- (a) WebView: third-party cookies are off by default (`setAcceptThirdPartyCookies`), and Chrome is phasing out or
  restricting them. Embedded Square / Google iframes that rely on their cookies break inside the Capacitor app.
  First-party session cookies are fine. SameSite=Lax by default (Chrome 80+).
- (b) https://developer.android.com/reference/android/webkit/CookieManager#setAcceptThirdPartyCookies(android.webkit.WebView,%20boolean)
  https://developers.google.com/privacy-sandbox/cookies
- (c) `grep -nE "<iframe" slickchart.html`.
- (d) Keep auth as bearer tokens in storage (as now) rather than cookies; open third-party flows externally.

**40. Old Android WebView not updated (Android 7-9, Android Go, no Play)**
- (a) A device with WebView below about 80 fails at parse time if any ES2020+ syntax slipped in (item 17). WebView
  updates come through Play; on devices without Play or with auto-update off, the factory version sticks.
  Android Go phones ship "WebView for Go" with tighter memory. Capacitor 8 itself requires WebView 60+ and warns.
- (b) https://capacitorjs.com/docs/android#android-support (minimum WebView)
  https://www.androidauthority.com/chrome-dropping-support-android-8-9-3571442
- (c) In native boot, `Bridge.getWebViewMajorVersion` exists. In JS, parse `Chrome/(\d+)` from `navigator.userAgent`
  and include it in the device report (`_sendDeviceReport`).
- (d) Before the main script, run a small ES5 check. If below the floor, show "Update Android System WebView" with a
  Play Store link (`market://details?id=com.google.android.webview`). Log the version in the device report so
  real numbers decide the floor.

**41. TWA verification failure turns the app into a browser tab with a URL bar**
- (a) If `/.well-known/assetlinks.json` does not list the Play signing key fingerprint (Play App Signing uses a
  different key from the upload key), the TWA opens in Custom Tab mode with a URL bar. Users see "slickchart.app"
  and a browser chrome instead of the app. `twa-manifest.json` here has `fingerprints: []`.
- (b) https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs#digital-asset-links
  https://developers.google.com/digital-asset-links/tools/generator
- (c) `curl https://slickchart.app/.well-known/assetlinks.json` and compare to Play Console > App integrity > App
  signing key SHA-256.
- (d) Put both upload and Play signing SHA-256 fingerprints in `assetlinks.json` for `app.slickchart.twa`.

**42. TWA has no native bridge and opens only the verified origin**
- (a) In a TWA, `Capacitor` is undefined. Pages on other origins (Square, Google) open in a Custom Tab over the app,
  which is fine. `orientation: portrait` locks tablets to portrait. TWA requires Chrome (or another TWA-capable
  browser) installed; with `fallbackType: customtabs`, Samsung-only phones may open in Samsung Internet Custom Tab
  with different behaviour (forced dark, item 15).
- (b) https://developer.chrome.com/docs/android/trusted-web-activity/overview
  https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli
- (c) `grep -nE "Capacitor\." slickchart.html` and make sure every use is guarded by `window.Capacitor?.`
  (careful: guard with ES5-safe syntax if the floor is low).
- (d) Guard every native call; test the TWA on a Samsung with Chrome disabled.

**43. Session expires or tokens lost when the WebView clears data on app update**
- (a) Capacitor app updates do not clear WebView data (data lives in `/data/data/<pkg>/app_webview`). But the
  `isNewBinary` path in Capacitor resets the **bundled** web assets path on a new native version; with a remote
  `server.url` that does not matter. Android "Clear cache" from Settings clears HTTP cache only, while "Clear
  storage" wipes localStorage and IDB. Auto Backup (`android:allowBackup`) does not include WebView storage
  reliably, so a phone restore gives an empty app.
- (b) https://developer.android.com/guide/topics/data/autobackup
  https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/Bridge.java
- (c) `grep -n "allowBackup\|fullBackupContent\|dataExtractionRules" slickchart-vercel/android/app/src/main/AndroidManifest.xml`.
- (d) Rely on server sync (already). After a fresh install or restore, make the first boot pull everything before
  writing anything (boot-shrink guard, CLAUDE.md §3).

**44. Timers and sync throttled in the background**
- (a) Chrome Android freezes background tabs after about 5 minutes and throttles timers to once per minute (intensive
  throttling, Chrome 88+). A WebView is paused when the app is backgrounded (`onPause` pauses timers). A sync push
  queued just before backgrounding may not run until return, and if the app is killed before then, the queue is only
  on the device.
- (b) https://developer.chrome.com/blog/timer-throttling-in-chrome-88
  https://developer.chrome.com/docs/web-platform/page-lifecycle-api
- (c) `grep -nE "setInterval|setTimeout\(.*(sync|push|flush)" slickchart.html`. Test: edit, background
  immediately, wait 10 min, kill, reopen on another device.
- (d) Flush the cloud queue on `visibilitychange:hidden` with `fetch(..., {keepalive:true})` (64KB limit) or
  `navigator.sendBeacon` for small payloads. Persist the pending queue so it is retried on next boot.

**45. Network: captive Wi-Fi, Data Saver and offline**
- (a) Chrome "Lite mode" is gone, but Android Data Saver restricts background data for the Capacitor app.
  `navigator.onLine` is true behind a salon's captive Wi-Fi portal. Fetches can hang for minutes on 2G-like
  signals without a timeout.
- (b) https://developer.android.com/develop/connectivity/network-ops/data-saver
  https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static (Chrome 103+)
- (c) `grep -nE "AbortController|AbortSignal\.timeout|onLine" slickchart.html`.
- (d) Put a timeout on every sync fetch (AbortController; `AbortSignal.timeout` only with a fallback below 103), keep
  local data, and show "saved on this phone, will sync" honestly.

---

## Quick test matrix to run once

| Container | Device / emulator | Must test |
|---|---|---|
| Capacitor app | Android 15/16 AVD, 2GB RAM, gesture nav | 1, 2, 3, 11, 12, 13, 14, 18, 19, 22, 32 |
| Capacitor app | Android 9 AVD with factory WebView | 17, 40 |
| TWA | Pixel AVD + Samsung device with Chrome disabled | 1, 20, 41, 42 |
| Chrome tab / PWA | Low-end (Moto E / Galaxy A0x) | 2, 4, 5, 23, 28, 29, 44 |
| Samsung Internet | Galaxy, system dark mode on, font size max | 15, 16, 26, 7 |

Useful commands: `adb shell settings put system font_scale 2.0`; Developer options > "Don't keep activities";
`adb shell am kill <pkg>` while backgrounded; DevTools > Application > Storage quota simulation;
`chrome://inspect` for WebView remote debugging (needs `WebView.setWebContentsDebuggingEnabled(true)` in debug builds).
