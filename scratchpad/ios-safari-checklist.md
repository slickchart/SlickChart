# iOS Safari / WebKit / Home-screen PWA / WKWebView (Capacitor) audit checklist

Researched 2026-10-18 for a vanilla-JS single-file PWA (~3 MB inline script) used mainly on iPhone
(Safari tab, home-screen web app, Capacitor shell). Stores data in localStorage + IndexedDB, syncs with
fetch, sendBeacon on pagehide, photos via `<input type=file capture>` + canvas resize, MediaRecorder voice
notes, service worker, date/time inputs, canvas signatures.

Each item: **(a)** bug/limit + versions, **(b)** source, **(c)** grep / test that reveals it,
**(d)** fix. Ordered by likelihood of DATA LOSS first, then BROKEN SCREEN, then degraded behaviour.

Version facts marked "(verify)" come from memory of MDN/caniuse compat data and were not re-fetched;
confirm them at https://caniuse.com or MDN `browser-compat-data` before acting on a single version number.

---

## 0. What iOS floor to assume in late 2026

- Apple's own App Store numbers (devices transacting 7 June 2026): of iPhones from the last 4 years,
  **86% iOS 26, 11% iOS 18, 3% earlier**; of all iPhones that *can* run iOS 26: 79% / 14% / 7%.
  Sources: https://9to5mac.com/2026/06/10/ios-26-adoption-grows-but-still-lags-slightly-behind-ios-18/ ,
  https://www.macrumors.com/2026/02/17/how-popular-is-ios-26
- Statcounter (web-traffic based) disagreed sharply in Jan 2026 (iOS 18 > 50% of traffic), so do not
  assume iOS 26 features. https://www.gigazine.net/gsc_news/en/20260109-ios-android-os
- Hardware ceilings (from Apple's support lists): iPhone 6s/7/SE1 stop at **iOS 15.8**; iPhone 8/X stop at
  **iOS 16.7.x**; iPhone XS/XR stop at **iOS 18.x**; iPhone 11+ run iOS 26.
- Estimate (my inference, not an Apple figure): **< iOS 16.4 is roughly 1-3% of active iPhones;
  < iOS 17 roughly 3-6%**, concentrated in old iPhone 7/8/X devices that a working beauty provider may
  still use as a "salon station" phone or an iPad mini 4 / iPad 5.
- **Recommendation:** treat **Safari 16.4 as the hard floor for SYNTAX** (anything that fails to parse
  kills the whole 3 MB inline script = blank app), feature-detect everything newer than 16.4 at runtime,
  and make the app *show a message* rather than a blank screen below the floor. Treat iOS 17/18 APIs as
  optional. Do not use iOS 26-only APIs unguarded.
- Also note: on iOS **every browser is WebKit**, so Chrome/Firefox/Edge on iPhone have all of these bugs.

---

## P0 — can lose or silently fail to save data

### 1. One unsupported SYNTAX token blanks the entire single-file app
(a) A parse error anywhere in an inline `<script>` aborts the whole script (not just one function).
Known Safari syntax gates: RegExp lookbehind `(?<=` `(?<!` and named groups-with-lookbehind = **16.4**;
class `static {}` blocks = **16.4**; RegExp `/v` flag = **17.0** (verify); import attributes
`with { type: 'json' }` = **17.2** (verify); `using` declarations and decorators `@dec` = **not shipped**.
(b) https://webkit.org/blog/13966/webkit-features-in-safari-16-4/ ; https://gigazine.net/gsc_news/en/20230328-webkit-safari-16-4
(c) `rg -n '\(\?<[=!]' slickchart.html` ; `rg -n 'static\s*\{' ` ; `rg -nP '/[^/\n]+/[dgimsuy]*v[dgimsuy]*\b'` ;
`rg -n '\busing\s+\w+\s*='` ; `rg -n '^\s*@\w+\s*$'`. Better test: run `npx acorn --ecma2022 --module=false`
over the extracted script, or `npx es-check es2022 assets/app-*.js` after the build split.
Runtime test: load the page in WebKit Playwright and assert no `pageerror` of type SyntaxError.
(d) Rewrite lookbehind with a capture group; keep a tiny separate *first* `<script>` with ES5 syntax that
sets `window.__bootOK=false` and a `setTimeout` that shows "Please update iOS" if the main script never
flips it.

### 2. IndexedDB "Connection to Indexed Database server lost. Refresh the page to try again"
(a) After backgrounding, screen lock, or the WebKit networking process being killed, every IDB call on
the existing connection fails (UnknownError). Reported iOS 12 through 17.6; regression in 17.4/17.5 caused
user data loss; WebKit may also abort in-flight transactions when Safari goes to background.
(b) https://bugs.webkit.org/show_bug.cgi?id=197050 ; https://bugs.webkit.org/show_bug.cgi?id=273827 ;
https://www2.webkit.org/show_bug.cgi?id=277615 ; https://www2.webkit.org/show_bug.cgi?id=235579
(c) `rg -n 'indexedDB\.open' ` and check the opened `db` is cached forever in a module variable with no
`onclose`/`onversionchange`/error-retry path. `rg -n 'Connection to Indexed Database server lost|UnknownError'`
(zero hits = not handled). Test: in WebKit, close the db via `db.close()` mid-session and confirm the next
write reopens and succeeds.
(d) Wrap every IDB op: on `UnknownError`/`InvalidStateError` drop the cached handle, reopen once, retry;
if that fails, keep the value in memory/localStorage and mark "unsaved", then offer reload. Never treat
a failed IDB write as success. Listen to `db.onclose`.

### 3. IndexedDB transaction auto-commits across an `await` of a non-IDB promise
(a) All engines, but Safari commits more eagerly; `await fetch()` / `await blob.arrayBuffer()` inside a
transaction -> `TransactionInactiveError`, partial writes.
(b) https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction
(c) `rg -nU 'transaction\([^)]*\)[\s\S]{0,400}await (fetch|.*arrayBuffer|.*text\(\)|new Promise)'`
(d) Do all async prep first, then open the transaction and issue all requests synchronously.

### 4. Storing a Blob/File in IndexedDB fails ("Error preparing Blob/File data to be stored in object store")
(a) Private browsing (iOS 14.5-17.x) and some fresh-launch states; RESOLVED in a 2024 build but old
devices remain. Photos stored as Blob in IDB fail; data URL strings work.
(b) https://bugs.webkit.org/show_bug.cgi?id=268037 ; https://bugs.webkit.org/show_bug.cgi?id=188438
(c) `rg -n '\.put\([^)]*(blob|Blob|file|File)'` ; check whether a failed put is caught and the photo kept
elsewhere.
(d) On failure fall back to storing an `ArrayBuffer` (or base64) and keep the server upload as primary.

### 5. Safari-tab storage is evicted after 7 days without interaction (ITP)
(a) Since Safari 13.1/iOS 13.4, all script-writable storage (localStorage, IDB, SW caches) for a site is
deleted after 7 days of Safari *use* without a visit. Home-screen web apps have their own day counter
and WebKit said their first-party data should not be deleted. Capacitor/WKWebView not subject to ITP the
same way but see item 8.
(b) https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ ; https://bugs.webkit.org/show_bug.cgi?id=211775
(c) Any code that assumes "if it is in localStorage it is safe" without server confirmation:
`rg -n 'only on this device|stays on this device|device-only'`. Test: a client who opens their magic-link
page once a fortnight in Safari will arrive with empty storage every time.
(d) Server is the source of truth; local storage is a cache. Show unsynced counts. Encourage home-screen
install for providers.

### 6. Safari tab, home-screen web app, and each Capacitor app have SEPARATE storage
(a) A home-screen web app on iOS has its own storage container, cookies and service worker, distinct
from Safari. Since 16.4 the manifest `id` allows multiple installs, each with its own container. Removing
the icon deletes its data. Login in Safari does not log in the PWA.
(b) https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (16.4 manifest id / multiple
installs); https://heise.de/-10749652 (iOS 26: every site added to Home Screen now opens as a web app
by default)
(c) Grep for flows that expect state to pass between them: magic-link emails opened from Mail (open in
Safari, NOT the installed PWA), OAuth redirects, "open in app" buttons:
`rg -n 'window\.location\s*=|location\.href\s*=.*(oauth|connect|login|magic)'`.
(d) Always carry identity in the URL/token, never rely on a cookie/localStorage set in the other
context. Treat "provider says data is missing on her phone" as possibly two containers on ONE phone.
On iOS 26, a provider who "added a bookmark" now has a separate web-app container.

### 7. `pagehide` / `beforeunload` / `unload` often never fire on iOS; sendBeacon/keepalive capped at 64 KiB
(a) Swiping the app away from the switcher, or iOS killing a backgrounded tab, fires nothing. Safari
does not fire `unload` for same-tab navigation; `beforeunload` is not fired on iOS at all. sendBeacon and
`fetch(..., {keepalive:true})` share a **64 KiB in-flight budget**; over it, sendBeacon returns `false`
and keepalive fetch rejects.
(b) https://developer.mozilla.org/docs/Web/API/Navigator/sendBeacon ;
https://blog.huli.tw/2025/01/06/en/navigator-sendbeacon-64kib-and-source-code/ ;
https://web.dev/articles/disallow-synchronous-xhr
(c) `rg -n "addEventListener\(['\"](beforeunload|unload|pagehide)"` ; `rg -n 'sendBeacon\('` and check
(1) the return value is checked, (2) payload size is bounded (`JSON.stringify(...).length`),
(3) the same flush also runs on `visibilitychange` when `document.visibilityState==='hidden'`.
(d) Flush on `visibilitychange:hidden` (primary) and `pagehide` (backup); persist locally FIRST,
beacon second; chunk or send only a "dirty keys" marker if > ~60 KB; if `sendBeacon` returns false,
leave the item queued for next launch.

### 8. WKWebView (Capacitor) storage can be reclaimed by iOS when disk is low
(a) Capacitor docs: iOS will reclaim localStorage and IndexedDB from WebViews when the device runs low on
space. Changing `server.hostname`/scheme in capacitor.config points at a new, empty origin.
(b) https://capacitorjs.com/docs/guides/storage ; https://capacitorjs.com/docs/apis/preferences
(c) `rg -n 'hostname|iosScheme|server' capacitor.config.*` and confirm it has never changed between
releases; grep for auth token kept only in localStorage.
(d) Keep the session token + "last synced" marker in `@capacitor/preferences` (UserDefaults); server as
source of truth.

### 9. localStorage quota ~5 MB, QuotaExceededError; private mode
(a) Safari localStorage is ~5 MB per origin and does not grow; write throws `QuotaExceededError`
(code 22). Private browsing: storage works but is wiped at tab close (old iOS <11 threw on every write).
(b) https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
(c) `rg -n 'localStorage\.setItem\(' | rg -v try` (every unguarded setItem); test by filling storage to
5 MB in WebKit Playwright and then performing a save.
(d) try/catch every write; on quota error offload to IDB and report it; never swallow silently.

### 10. Patching `localStorage.setItem = fn` on the instance is unreliable; patch the prototype
(a) Assigning to the Storage instance is treated as a stored key / ignored in some engines (the project
already hit this in Safari, see CLAUDE.md §2). Firefox never allowed instance overrides; WebKit
historically returned prototype methods over same-named keys.
(b) https://bugzilla.mozilla.org/show_bug.cgi?id=1141698 ; https://bugs.webkit.org/show_bug.cgi?id=30996
(c) `rg -n 'localStorage\.(setItem|getItem|removeItem)\s*='` ; regression test
`scratchpad/test-safari-storage-hook.mjs`.
(d) Override `Storage.prototype.setItem` (checking `this===localStorage`) or route through a wrapper
function; verify with a WebKit test.

### 11. `navigator.storage.persist()` usually returns false / is not a guarantee
(a) Safari 17 reworked quota (origin up to 60% of disk in Safari, 15% in other apps incl. WKWebView);
persist() is auto-decided, a 2024 report says it always returned false in Safari 17. `estimate()` exists
from Safari 17 (verify).
(b) https://webkit.org/blog/14403/updates-to-storage-policy/ ; https://bugs.webkit.org/show_bug.cgi?id=271401
(c) `rg -n 'storage\.(persist|estimate)\('` and check nothing branches to "safe" on a true result, and
that `navigator.storage` is guarded.
(d) Call it (harmless), never rely on it.

### 12. Network errors on iOS say "Load failed", not "Failed to fetch"
(a) Safari's fetch TypeError message is `Load failed` (and requests in flight when the app backgrounds are
cancelled with it). Code that string-matches Chrome's message treats an offline save as a hard error or
as success.
(b) https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch#exceptions (verify wording)
(c) `rg -n "Failed to fetch|NetworkError when attempting"` ; any match without `Load failed` alongside.
(d) Treat any `TypeError` from fetch as a retryable network error; keep the queued write.

### 13. Timers and requests are suspended in the background; resumes can be very late
(a) iOS suspends JS within seconds of backgrounding (tab or PWA); `setInterval` sync loops stop, in-flight
fetches die; on resume, timers fire in a burst. No Background Sync / Periodic Sync / Background Fetch in
Safari.
(b) https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API (Safari: not supported)
(c) `rg -n 'setInterval\(' ` for sync/autosave; `rg -n "sync\.register|periodicSync|backgroundFetch"`
(d) Autosave on input (debounced) and on `visibilitychange`; on `visibilitychange:visible` / `pageshow`
re-check connectivity and re-run the sync queue.

### 14. bfcache restore: page comes back with stale in-memory state, no `load`/boot
(a) Safari restores pages from back/forward cache; `pageshow` with `event.persisted===true`. A stale tab
can then push old data. Also iOS may silently reload a killed tab ("A problem repeatedly occurred" or a
plain reload) losing in-memory edits.
(b) https://web.dev/articles/bfcache
(c) `rg -n "pageshow"` (zero hits = unhandled). Test in WebKit: navigate away to a same-origin page and
back.
(d) On `pageshow` persisted: re-pull before any push; persist drafts eagerly so a reload loses nothing.

### 15. WebContent process jetsam on memory pressure: "A problem repeatedly occurred" / white screen
(a) Large DOM, multi-MB strings (data URLs of photos), many canvases, or a 3 MB inline script on a 2-3 GB
RAM iPhone get the tab killed and reloaded; in Capacitor the WKWebView goes blank (white) unless the
native side handles `webViewWebContentProcessDidTerminate`.
(b) https://developer.apple.com/forums/thread/687866 ; https://www.pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit/
(c) Grep for photos kept as data-URL strings in memory arrays: `rg -n "readAsDataURL|toDataURL\("` ;
measure with `scratchpad/scaleaudit.mjs`. Capacitor: grep native `ios/` for
`webViewWebContentProcessDidTerminate`.
(d) Keep photos as Blob/object URLs and `URL.revokeObjectURL` them; virtualise long lists; in Capacitor
reload the web view on process termination (Capacitor's bridge does a reload; verify the version).

---

## P1 — broken screen / broken feature on iPhone

### 16. Photos: 48 MP camera images exceed the per-canvas pixel limit (16,777,216 px)
(a) iOS Safari canvases over 16.7 M px (width x height, *device pixels*) fail: blank/transparent draw,
`toBlob` gives null. iPhone 14 Pro+ ProRAW/48 MP images are 8064x6048 = 48.8 M px. Also a cumulative
canvas memory cap (224-384 MB by version) after which new canvases draw transparent.
(b) https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/ ;
https://www.pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit/ ;
https://developer.apple.com/forums/thread/112218
(c) `rg -n 'canvas\.width\s*=\s*(img|image)\.(naturalWidth|width)'` (full-size intermediate canvas);
`rg -n 'getContext\(.2d.\)'` and check every canvas is freed (`canvas.width=canvas.height=0`).
Test: feed an 8064x6048 JPEG to the resize function in WebKit and assert a non-empty output blob.
(d) Compute target size first and `drawImage(img,0,0,w,h)` directly into the small canvas; clamp any
canvas to <= 4096x4096; null out canvases after use; check `blob && blob.size>0`.

### 17. HEIC photos and EXIF orientation
(a) iPhone camera saves HEIC. With `accept="image/*"` iOS usually transcodes to JPEG for the file input,
but not always (Files app, "multiple" picks, some versions); Safari 17+ can *display* HEIC, Chrome/Windows
cannot, so a raw HEIC upload shows broken on the provider's PC. Since Safari 13.4/iOS 13.4 images
are auto-rotated by EXIF (`image-orientation: from-image`) including in `drawImage`, so code that
ALSO rotates by EXIF double-rotates (sideways photos).
(b) https://developer.mozilla.org/en-US/docs/Web/CSS/image-orientation ;
https://developer.apple.com/forums/thread/95911 (PWA file handling context)
(c) `rg -n "accept=.image/(heic|\*)"` ; `rg -n "image/heic|\.heic"` ; `rg -n "Orientation|exif" -i` near
`ctx.rotate(`. Test: upload a HEIC file and a JPEG with EXIF orientation 6 in WebKit.
(d) Always re-encode through canvas to JPEG before upload; detect `file.type==='image/heic'` or
`.heic` name and decode via `createImageBitmap`/img (works on Safari 17+); remove manual EXIF rotation
or use `createImageBitmap(file,{imageOrientation:'from-image'})`.

### 18. `canvas.toBlob('image/webp')` silently returns PNG in Safari
(a) Safari does not encode WebP from canvas (decodes it fine since 14); it falls back to PNG, which is
5-10x larger -> uploads exceed body limits/quotas. (verify current Safari 26 status)
(b) https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
(c) `rg -n "toBlob\([^)]*webp|toDataURL\([^)]*webp"`
(d) Use `image/jpeg` with quality 0.8, or check `blob.type` after encode and fall back.

### 19. MediaRecorder: Safari records `audio/mp4` (AAC), not WebM; `isTypeSupported` absent on early 14.x
(a) MediaRecorder on by default iOS 14.3+; container MP4/AAC. `new MediaRecorder(stream,{mimeType:'audio/webm'})`
throws NotSupportedError on most iOS versions (Safari 18.4 added WebM recording; verify). `isTypeSupported`
was missing on 14.3. Blobs saved as `.webm` with mp4 content fail to play on other devices.
(b) https://webkit.org/blog/11353/mediarecorder-api/ ; https://bugs.webkit.org/show_bug.cgi?id=216664 ;
https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static
(c) `rg -n "audio/webm|audio/ogg|codecs=opus"` ; `rg -n "new MediaRecorder\("` and check a mimeType
probe list; check file extension/Content-Type derived from `recorder.mimeType`, not hard-coded.
(d) Probe `['audio/mp4','audio/webm;codecs=opus','audio/webm']` with `isTypeSupported` guarded; store the
actual `recorder.mimeType`; server should accept both.

### 20. Voice recording stops/corrupts when the screen locks, a call arrives, or the app backgrounds
(a) iOS ends the mic capture (track `ended`/`mute`) on interruption; the recorder may never fire a final
`dataavailable`, losing the whole note if chunks are only assembled in `onstop`.
(b) https://bugs.webkit.org/show_bug.cgi?id=245962 (related getUserMedia stream-kill reports)
(c) `rg -n "onstop|ondataavailable|\.start\(\)"` near MediaRecorder; check `start(timeslice)` is used and
chunks are persisted progressively; check `track.onended` handling.
(d) `recorder.start(1000)`, persist chunks to IDB as they arrive, handle `track.onended` by stopping and
saving what exists.

### 21. getUserMedia in a home-screen web app re-prompts / stops on route change
(a) In standalone mode iOS revokes camera/mic permission or stops the stream when the URL hash/route
changes; black video after relaunch; iOS 17.4 beta stream never started. Also no persistent
permission in PWAs on many versions: prompt every launch.
(b) https://bugs.webkit.org/show_bug.cgi?id=215884 ; https://bugs.webkit.org/show_bug.cgi?id=212040 ;
https://bugs.webkit.org/show_bug.cgi?id=206219 ; https://bugs.webkit.org/show_bug.cgi?id=268159
(c) `rg -n "getUserMedia"` then check whether the app changes `location.hash`/`history.pushState`
while recording; `rg -n "location\.hash\s*="`.
(d) Do not change hash/route during capture; request the mic only on tap; call `getUserMedia` once per
recording and stop tracks afterwards.

### 22. Capacitor/WKWebView: missing Info.plist usage strings crash the app; media capture prompts
(a) `<input type=file capture>` or getUserMedia without `NSCameraUsageDescription`,
`NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription` = immediate crash. getUserMedia in
WKWebView needs iOS 14.3+; without a `WKUIDelegate` `requestMediaCapturePermissionFor` (iOS 15+) users
get a web prompt each launch.
(b) https://capacitorjs.com/docs/ios/configuration (Info.plist) (verify page)
(c) `rg -n "NSCameraUsageDescription|NSMicrophoneUsageDescription|NSPhotoLibrary" ios/`
(d) Add all three strings; implement the media-capture delegate in the shell.

### 23. `font-size` < 16px on inputs makes iOS zoom in on focus (and not zoom back)
(a) All iOS Safari versions; layout looks broken after typing, especially in forms and signature pages.
(b) https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag (and many SO answers)
(c) `rg -nP "(input|textarea|select)[^{]*\{[^}]*font-size:\s*(1[0-5]|[0-9])(\.\d+)?px"` plus inline
`style="...font-size:1[0-5]px"` on inputs; also `font-size:0.8rem/em` on inputs.
(d) `input,textarea,select{font-size:max(16px,1em)}`; do NOT fix with `maximum-scale=1` (accessibility).

### 24. `100vh` is taller than the visible area; keyboard does not resize the layout viewport
(a) iOS Safari `100vh` = largest viewport (toolbar hidden); bottoms of modals/sheets are cut off.
`dvh/svh/lvh` supported from **15.4**. The on-screen keyboard overlays content instead of resizing;
`position:fixed` bottom bars float over/under the keyboard; use `visualViewport`.
(b) https://developer.mozilla.org/en-US/docs/Web/CSS/length#viewport-percentage_lengths ;
https://developer.apple.com/forums/thread/800125
(c) `rg -n "100vh|height:\s*100%\s*;.*fixed"` ; `rg -n "visualViewport"` (zero = unhandled keyboard)
(d) `height:100dvh` with `100vh` fallback first; for bottom action bars listen to `visualViewport`
`resize/scroll` and offset; ensure Save buttons are reachable with the keyboard open.

### 25. iOS 26 fixed-position / viewport gaps (Liquid Glass Safari)
(a) iOS 26.0: fixed headers/footers offset after keyboard closes (`visualViewport.offsetTop` stays
non-zero), bottom bars drift, `100dvh` overlays leave a gap. Safari 26.1 fixed the gap for viewport-sized
fixed containers; keyboard offset reported again in iOS 27 beta.
(b) https://developer.apple.com/forums/thread/800125 ; https://developer.apple.com/forums/thread/799216
(c) Screens with `position:fixed;bottom:0` + inputs. Test on an iOS 26.0 simulator if available.
(d) Make an inner element the scroll container instead of `html/body`; re-layout on `visualViewport`
resize; `env(safe-area-inset-bottom)` padding.

### 26. Safe-area insets ignored without `viewport-fit=cover`
(a) In standalone mode content sits under the notch/home indicator; `env(safe-area-inset-*)` is 0 unless
the viewport meta has `viewport-fit=cover`.
(b) https://webkit.org/blog/7929/designing-websites-for-iphone-x/
(c) `rg -n 'name="viewport"'` and check `viewport-fit=cover`; `rg -n 'safe-area-inset'`.
(d) Add it, pad fixed bars with `env(safe-area-inset-bottom)`.

### 27. Signature canvas: page scrolls/zooms instead of drawing; drawing lost on rotate
(a) Without `touch-action:none` and non-passive listeners, iOS scrolls the page under the finger;
`touchstart` listeners on document are passive by default so `preventDefault()` is ignored. Resizing the
canvas (orientation change, keyboard) clears its bitmap. Unscaled canvases are blurry on 3x screens and
very large scaled ones hit item 16.
(b) https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action ;
https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#improving_scroll_performance_using_passive_listeners
(c) `rg -n "touch-action"` ; `rg -n "addEventListener\(['\"]touch(start|move)['\"][^)]*\)" | rg -v "passive:\s*false"` ;
check `resize` handlers that set `canvas.width`.
(d) `touch-action:none` on the pad; pointer events with `{passive:false}`; store strokes as point
arrays and redraw on resize; cap DPR scaling at 2.

### 28. Date parsing: `new Date('YYYY-MM-DD HH:mm')` is Invalid Date in Safari; date-only strings are UTC
(a) Safari rejects the space-separated form (Chrome accepts) -> `NaN` dates, "Invalid Date" on screen,
appointments sorting to the end or reminders never firing. Separately (all engines) `new Date('2026-10-18')`
is parsed as UTC midnight, which is the previous day in the US.
(b) https://bugs.webkit.org/show_bug.cgi?id=283825 ; https://developer.apple.com/forums/thread/706752 ;
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Invalid_date
(c) `rg -n "new Date\([^)]*\+\s*['\"] ['\"]\s*\+"` (date + ' ' + time) ;
`rg -nP "new Date\(['\"]\d{4}-\d{2}-\d{2} \d"` ; `rg -nP "Date\.parse\("` ; for UTC drift:
`rg -n "new Date\((\w+\.)?(date|day|dob)\w*\)"` where the value comes from `<input type=date>`.
Test: run the date helpers in WebKit Playwright with `TZ=America/Los_Angeles`.
(d) Build dates with `new Date(y, m-1, d, hh, mm)` or use `'T'`; parse `<input type=date>` values
manually; never pass user-ish strings to `Date`.

### 29. Native `<input type=date/time/datetime-local>` quirks
(a) iOS shows its own wheel/inline picker; `min`/`max`/`step` are only partially enforced in the picker;
a cleared iOS date input gives `''`; `datetime-local` value has no seconds; the input cannot be styled
with `::-webkit-calendar-picker-indicator` the same as desktop; `showPicker()` exists from Safari 16
(must be in a user gesture). Placeholder text is not shown for empty date inputs on iOS (field looks
blank/collapsed with no height).
(b) https://developer.chrome.com/blog/show-picker ; https://stefanjudis.com/blog/new-on-the-web-programmatically-open-a-native-date-picker
(c) `rg -n 'type="(date|time|datetime-local)"'` and check validation re-checks `min/max` in JS;
`rg -n "showPicker\("` not inside a click handler or without `'showPicker' in`;
check CSS gives date inputs an explicit `min-height`.
(d) Validate in JS on save; give date inputs `min-height` and `-webkit-appearance:none` styling; guard
showPicker.

### 30. `window.open` / `a.click()` / clipboard after an `await` lose the user gesture
(a) Safari's transient activation is consumed by an `await` of a network call; `window.open` returns
null (popup blocked), `navigator.clipboard.writeText` rejects `NotAllowedError`, `showPicker` throws.
(b) https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText ;
https://webkit.org/blog/10855/async-clipboard-api/
(c) `rg -nU "await [^;]+;[\s\S]{0,200}(window\.open|clipboard\.writeText|showPicker)\("`
(d) Open the window first (`const w=window.open('about:blank')`) then set `w.location` after the await;
for clipboard use `navigator.clipboard.write([new ClipboardItem({'text/plain': promiseOfBlob})])`
(Safari accepts a promise); always have a "select text" fallback.

### 31. Downloads (`a[download]`, blob URLs) are broken or strand the user in a home-screen web app
(a) In standalone mode an `a[download]` opens a file preview with no way back (force-quit needed);
blob URLs broke in 17.4.1 (fixed 17.5). Works in Safari tab, fails in PWA.
(b) https://bugs.webkit.org/show_bug.cgi?id=167341 ; https://developer.apple.com/forums/thread/751063 ;
https://developer.apple.com/forums/thread/119017
(c) `rg -n "\.download\s*=|download=\"|createObjectURL\("`
(d) In standalone (`matchMedia('(display-mode: standalone)').matches || navigator.standalone`) use
`navigator.share({files:[file]})` after `navigator.canShare({files})` (send the file alone, no title),
else open in a new tab; in Capacitor use the Filesystem/Share plugins.

### 32. Web Push / Notifications only in home-screen web apps, iOS 16.4+, and not in WKWebView
(a) `Notification` is **undefined** in a Safari tab on iOS (and in Capacitor). Permission must be requested
from a user gesture. Badging API 16.4+.
(b) https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ ; https://mjtsai.com/blog/?p=38542
(c) `rg -n "Notification\.(permission|requestPermission)|new Notification\(" ` without a preceding
`'Notification' in window` / `typeof Notification` guard -> ReferenceError that can abort boot.
`rg -n "setAppBadge|pushManager"` guards.
(d) Guard every use; in Capacitor use native push.

### 33. APIs missing in Safari: `requestIdleCallback`, `navigator.vibrate`, `scheduler.*`, Background Sync
(a) `requestIdleCallback`: behind a flag / unreliable in Safari (17.4 STP report: sometimes never fires);
`navigator.vibrate`: not supported on iOS; `scheduler.postTask/yield`: not in Safari;
`SyncManager`/`periodicSync`: no.
(b) https://www2.webkit.org/show_bug.cgi?id=164193 ; https://www2.webkit.org/show_bug.cgi?id=268152 ;
https://docs.w3cub.com/browser_support_tables/requestidlecallback
(c) `rg -n "requestIdleCallback\(|navigator\.vibrate\(|scheduler\.(postTask|yield)"` and check each is
guarded (`window.requestIdleCallback ? ... : setTimeout`). Note: an unguarded rIC that IS defined but
never fires means deferred saves never run.
(d) Always fall back to `setTimeout(fn, 1)`; for work that must happen (saves), never defer through rIC.

### 34. JS built-ins newer than the floor (TypeError "x is not a function" -> screen dies)
(a) Safari versions (verify each at caniuse): `Array.prototype.at`, `findLast`, `Object.hasOwn`,
`structuredClone`, `crypto.randomUUID`, `BroadcastChannel`, `<dialog>`, `:has()`, `dvh` = **15.4**;
`toSorted/toReversed/toSpliced/with` = **16.0**; `Array.fromAsync`, `CompressionStream`,
`OffscreenCanvas` (2D) = **16.4**; `Set.prototype.union` etc., `URL.canParse`, `storage.estimate`,
popover = **17.0**; `Object.groupBy`, `Map.groupBy`, `Promise.withResolvers` = **17.4**;
`URL.parse` = **18.0**; `Promise.try`, `RegExp.escape`, `Uint8Array.fromBase64` = **18.2**;
iterator helpers (`.values().map()`) = **18.4**; `Temporal` = not shipped in Safari (verify).
`crypto.randomUUID` also requires a **secure context** (not `http://` LAN testing).
(b) https://developer.mozilla.org/ (browser-compat-data per API); https://webkit.org/blog/13966/webkit-features-in-safari-16-4/
(c) `rg -n "Object\.groupBy|Map\.groupBy|Promise\.withResolvers|\.toSorted\(|\.toReversed\(|\.toSpliced\(|\.with\(|Array\.fromAsync|URL\.parse\(|URL\.canParse|Promise\.try|RegExp\.escape|fromBase64|Temporal\.|\.union\(|\.intersection\("`
plus iterator helpers `rg -n "\.(values|keys|entries)\(\)\.(map|filter|take|toArray)\("`.
(d) Replace with plain loops, or one tiny polyfill block at the top of the script; add an eslint
`compat` / `es-x` rule set to Safari 16.4.

### 35. CSS that silently drops on older Safari (layout breaks, no error)
(a) Native CSS nesting = **16.5** (relaxed syntax 17.2) -> on 16.4 a nested rule block is discarded;
`color-mix()` 16.2; `:has()` 15.4; container queries 16.0; `text-wrap:balance` 17.5; `@starting-style`
17.5; `backdrop-filter` needed `-webkit-backdrop-filter` until **18.0**; `overscroll-behavior` 16.0;
`inset` 14.5; flex `gap` 14.1. (verify each)
(b) https://webkit.org/blog/13966/webkit-features-in-safari-16-4/ ; caniuse per feature
(c) `rg -nP "^\s*&[\s.:>]" ` inside `<style>` (nesting); `rg -n "backdrop-filter" | rg -v webkit` ;
`rg -n "color-mix\(|@starting-style|text-wrap:\s*balance"`
(d) Flatten nesting in shipped CSS; always pair `-webkit-backdrop-filter`; provide plain fallbacks
before `color-mix`.

### 36. `backdrop-filter` / large blur and heavy shadows cause jank and memory kills on iPhone
(a) Each blurred layer is a GPU surface; many (e.g. on every card or a full-screen sheet over a long
list) causes scroll stutter and contributes to process kills on older devices.
(b) https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter (performance notes) (verify)
(c) `rg -c "backdrop-filter"` and look for it on repeated elements (`.card`, list rows).
(d) Restrict to one or two fixed surfaces; use a solid translucent background on lists.

### 37. Overscroll / rubber-band bounce and body scroll lock
(a) iOS bounces the whole page in standalone mode, pulling fixed headers; `overscroll-behavior` only from
16.0; `body{overflow:hidden}` does NOT stop background scrolling under a modal on iOS < 16.
(b) https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior
(c) `rg -n "overscroll-behavior|overflow:\s*hidden" ` around modal open code.
(d) `overscroll-behavior:contain` on scroll containers and modals; for older iOS set
`body{position:fixed;top:-scrollY}` while a modal is open and restore.

### 38. AudioContext / audio playback needs a user gesture; silent switch mutes Web Audio
(a) `new AudioContext()` starts `suspended` until `resume()` inside a tap; `audio.play()` without a
gesture rejects `NotAllowedError`; Web Audio is silenced by the ring/silent switch (HTMLAudio is not,
until iOS 17-ish `navigator.audioSession`, Safari 16.4+ verify). Context also suspends on background
(`interrupted` state).
(b) https://developer.mozilla.org/en-US/docs/Web/Media/Autoplay_guide ;
https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume
(c) `rg -n "new (webkit)?AudioContext|\.play\(\)" ` and check `.catch` and a tap-triggered `resume()`.
(d) Create/resume on first tap; always `.catch()` `play()`; show a play button rather than autoplaying
voice-note playback.

### 39. `<dialog>` and popover
(a) `<dialog>` + `showModal()` = Safari **15.4**; `::backdrop` styling quirks; `dialog.requestClose`,
`closedby` = newer/absent; Popover API = **17.0**. On 15.x, `showModal` is undefined -> TypeError.
(b) https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog
(c) `rg -n "showModal\(|popovertarget|showPopover\(|closedby="`
(d) Guard or use a div modal; avoid popover below a 17 floor.

### 40. Service worker: no SW in Capacitor; per-container SW in PWA; stale shell
(a) WKWebView (Capacitor `capacitor://localhost`) has no service worker support unless App-Bound Domains
are configured (iOS 14+); home-screen apps have their own SW separate from Safari's; a waiting SW can
keep serving the old shell for a long time because iOS PWAs are rarely fully closed; SW caches are
subject to the same 7-day/quota eviction in Safari tab. WebKit's SW can answer `/api/**` requests
(noted in CLAUDE.md test harness).
(b) https://webkit.org/blog/10882/app-bound-domains/ ; https://webkit.org/blog/14403/updates-to-storage-policy/
(c) `rg -n "serviceWorker\.register" ` and check it is guarded by `'serviceWorker' in navigator`;
`rg -n "skipWaiting|clients\.claim|controllerchange"`; in `sw.js` check `/api/` is never cached
(`rg -n "/api" sw.js`).
(d) Never cache API responses; network-only for writes; version the shell and check for updates at
launch (already latched in `_checkForNewBuild`); do not depend on the SW in Capacitor.

### 41. OAuth / external links from a home-screen app open outside the app
(a) In standalone mode, navigating to an out-of-scope URL (Square/Google OAuth) opens an in-app browser
sheet or Safari; cookies/localStorage set there are NOT visible to the PWA container (item 6); the
redirect back lands in Safari, not the PWA.
(b) https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (standalone container model);
https://heise.de/-10749652
(c) `rg -n "oauth|authorize\?|redirect_uri"` and check how the result reaches the PWA (server-side state
keyed by the session token is safe; a cookie or localStorage flag is not).
(d) Complete OAuth server-side keyed to the provider's account; have the PWA poll/pull status on
`visibilitychange` when she returns.

### 42. Third-party cookies blocked everywhere (ITP), including WKWebView
(a) Safari 13.1+ blocks all third-party cookies; Capacitor pages at `capacitor://localhost` calling the
API at `https://slickchart.app` are third-party, so cookie auth fails; must use bearer headers.
(b) https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
(c) `rg -n "credentials:\s*['\"]include['\"]|document\.cookie"` ; server `Set-Cookie` used for auth.
(d) Token in `Authorization` header (stored in Preferences in Capacitor).

---

## P2 — degraded behaviour / annoyances

### 43. Visibility and Wake Lock
(a) Screen Wake Lock API shipped Safari 16.4 but did not work in home-screen web apps until **18.4**
(verify). A provider timing a treatment with the screen sleeping loses the timer UI; JS suspends.
(b) https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
(c) `rg -n "wakeLock\.request"` guarded and re-requested on `visibilitychange`.
(d) Guard; re-acquire on visible; compute timers from timestamps, not tick counts.

### 44. `BroadcastChannel` (15.4) / `storage` event do not cross containers
(a) Works between tabs of the same container only; Safari tab and home-screen app never see each
other's messages (item 6).
(b) https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel
(c) `rg -n "BroadcastChannel|addEventListener\(['\"]storage"`
(d) Use the server pull for cross-container consistency.

### 45. `Intl` / timezone / locale formatting differences
(a) `toLocaleTimeString` output differs (narrow no-break space U+202F before AM/PM in newer ICU across
engines) so string comparisons/parsing of formatted times break; `hourCycle` defaults follow the
device's 24-hour setting.
(b) https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
(c) `rg -n "toLocale(Time|Date)?String\([^)]*\)\s*\.(split|replace|match)|=== *['\"]\d{1,2}:\d{2} ?[AP]M"`
(d) Never parse formatted strings; keep ISO/epoch for logic, format only for display.

### 46. `input type=number` and keyboards
(a) iOS numeric keypad from `type=number` has no minus/decimal on some layouts; `inputmode` supported
since 12.2; `pattern="[0-9]*"` forces digits-only keypad (no decimal point) -> prices can't be typed.
(b) https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inputmode
(c) `rg -n 'type="number"|pattern="\[0-9\]\*"'`
(d) `type=text inputmode=decimal` for money; `inputmode=numeric` for integers; `type=tel` for phones.

### 47. Autocorrect / autocapitalize on names, emails, codes
(a) iOS autocapitalises and autocorrects email/login code fields; a magic-link 6-digit code without
`autocomplete="one-time-code"` misses SMS/email autofill.
(b) https://developer.apple.com/documentation/security/enabling-password-autofill-on-an-html-input-element
(c) `rg -n 'type="email"|name="code"|id="code"'` check `autocapitalize="off" autocorrect="off"
spellcheck="false"` and `autocomplete="one-time-code"`.
(d) Add the attributes.

### 48. Hover-only UI and `:hover` sticky on touch
(a) iOS applies `:hover` on tap and keeps it until tapping elsewhere; tooltips/menus that appear only on
hover are unreachable; first tap may trigger hover instead of click.
(b) https://developer.mozilla.org/en-US/docs/Web/CSS/@media/hover
(c) `rg -n ":hover\s*\{[^}]*(display:\s*block|visibility:\s*visible|opacity:\s*1)"`
(d) Wrap in `@media (hover:hover)`; make menus tap-driven.

### 49. `contenteditable` and `-webkit-user-select:none`
(a) `user-select:none` on a container also blocks typing/selection in inputs inside it on older iOS;
`contenteditable` notes lose caret on re-render.
(b) https://developer.mozilla.org/en-US/docs/Web/CSS/user-select
(c) `rg -n "user-select:\s*none"` on `body`/wrappers containing inputs.
(d) Limit it to buttons/handles; set `user-select:text` on inputs/textareas.

### 50. Large data URLs, `FileReader` and string memory
(a) Converting each photo to base64 (+33%) and keeping it in JS strings/localStorage blows memory and the
5 MB quota quickly on iPhone.
(b) https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static
(c) `rg -n "readAsDataURL|toDataURL\(" ` count; check whether results are stored in arrays/state.
(d) Keep Blob + object URL; upload `Blob` via `FormData`/body; revoke URLs.

### 51. `navigator.onLine` is unreliable
(a) Reports `true` on captive portal / weak signal; the `online` event may not fire after background.
(b) https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
(c) `rg -n "navigator\.onLine"` used to skip saves.
(d) Always attempt + queue; use it only as a hint.

### 52. Private browsing / Lockdown Mode
(a) Lockdown Mode (iOS 16+) disables JIT, some web fonts, WebGL, some media APIs, PDF previews in some
cases; the 3 MB script runs much slower (interpreter). Private tabs wipe storage on close.
(b) https://support.apple.com/en-us/105120
(c) Test: run `scratchpad/perf-boot.mjs` with JIT disabled is not possible in Playwright; instead measure
boot on an older device. Grep for WebGL/OffscreenCanvas use without fallback.
(d) Keep a non-WebGL path; tell users in private mode that data will not stay (detect by a failed IDB
open / `storage.estimate` quota tiny).

---

## Quick automated sweep (copy into a script)

```
F=slickchart.html  # also slickchart-client.html, sw.js
rg -n '\(\?<[=!]' $F                                   # 1 lookbehind (16.4)
rg -n 'static\s*\{' $F                                 # 1 class static blocks (16.4)
rg -n 'Object\.groupBy|Promise\.withResolvers|\.toSorted\(|Array\.fromAsync|URL\.parse\(|Promise\.try|RegExp\.escape' $F   # 34
rg -n 'requestIdleCallback\(|navigator\.vibrate\(|scheduler\.(postTask|yield)' $F                                    # 33
rg -n 'Notification\.(permission|requestPermission)|new Notification\(' $F                                         # 32
rg -n "audio/webm|codecs=opus" $F                                                                                   # 19
rg -n "toBlob\([^)]*webp|toDataURL\([^)]*webp" $F                                                                   # 18
rg -nP "new Date\(['\"]\d{4}-\d{2}-\d{2} \d" $F; rg -n "new Date\([^)]*\+\s*['\"] ['\"]" $F                        # 28
rg -nP "font-size:\s*(1[0-5]|[0-9])(\.\d+)?px" $F      # 23 then filter to input/select/textarea
rg -n "100vh" $F; rg -c "visualViewport" $F                                                                          # 24
rg -n "sendBeacon\(" $F; rg -n "visibilitychange" $F; rg -n "pageshow" $F                                           # 7, 14
rg -n "Failed to fetch" $F                                                                                          # 12
rg -n "indexedDB\.open|onclose|UnknownError" $F                                                                     # 2
rg -n "\.download\s*=|createObjectURL\(" $F                                                                         # 31
rg -nU "await [^;]+;[\s\S]{0,200}(window\.open|clipboard\.writeText|showPicker)\(" $F                               # 30
rg -n "backdrop-filter" $F | rg -v -- -webkit-                                                                      # 35
```

Runtime tests worth adding (WebKit Playwright, via `scratchpad/run-in-safari.sh`):
1. Boot with `pageerror` listener: zero SyntaxError/TypeError (items 1, 32-34).
2. Resize an 8064x6048 JPEG and a HEIC through the photo pipeline; assert non-empty JPEG (16-18).
3. Close the IDB connection mid-session, then save; assert data persisted after reload (2).
4. Fill localStorage to quota, then save a note; assert it lands somewhere and the user is told (9).
5. Fire `visibilitychange` hidden with a 100 KB pending payload; assert nothing is dropped (7).
6. Date helpers under `TZ=America/Los_Angeles` with `'2026-10-18'` and `'2026-10-18 10:00'` (28).
7. MediaRecorder probe stub returning false for webm; assert mp4 path is chosen and stored mimeType
   is used for upload (19).

## Sources (consolidated)
- https://9to5mac.com/2026/06/10/ios-26-adoption-grows-but-still-lags-slightly-behind-ios-18/
- https://www.macrumors.com/2026/02/17/how-popular-is-ios-26
- https://www.gigazine.net/gsc_news/en/20260109-ios-android-os
- https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- https://bugs.webkit.org/show_bug.cgi?id=211775
- https://webkit.org/blog/14403/updates-to-storage-policy/
- https://bugs.webkit.org/show_bug.cgi?id=271401
- https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- https://bugs.webkit.org/show_bug.cgi?id=197050 , 235579 , 273827 , 277615
- https://bugs.webkit.org/show_bug.cgi?id=268037 , 188438
- https://webkit.org/blog/11353/mediarecorder-api/ ; https://bugs.webkit.org/show_bug.cgi?id=216664
- https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/ ; https://www.pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit/
- https://developer.apple.com/forums/thread/687866 ; https://developer.apple.com/forums/thread/112218
- https://developer.mozilla.org/docs/Web/API/Navigator/sendBeacon ; https://blog.huli.tw/2025/01/06/en/navigator-sendbeacon-64kib-and-source-code/
- https://capacitorjs.com/docs/guides/storage ; https://capacitorjs.com/docs/apis/preferences
- https://bugs.webkit.org/show_bug.cgi?id=215884 , 212040 , 206219 , 245962 , 268159
- https://webkit.org/blog/13966/webkit-features-in-safari-16-4/ ; https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://www2.webkit.org/show_bug.cgi?id=164193 , 268152 ; https://docs.w3cub.com/browser_support_tables/requestidlecallback
- https://bugzilla.mozilla.org/show_bug.cgi?id=1141698 ; https://bugs.webkit.org/show_bug.cgi?id=30996
- https://developer.chrome.com/blog/show-picker
- https://heise.de/-10749652
- https://developer.apple.com/forums/thread/800125 ; https://developer.apple.com/forums/thread/799216
- https://bugs.webkit.org/show_bug.cgi?id=167341 ; https://developer.apple.com/forums/thread/751063 ; https://developer.apple.com/forums/thread/119017
- https://bugs.webkit.org/show_bug.cgi?id=283825 ; https://developer.apple.com/forums/thread/706752
