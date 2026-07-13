# SlickChart — Changelog

Newest entries at the top. One entry per deploy. Dates are US-formatted.

## 2026-07-13 — Courses: lessons now open when you tap them

On a course's detail screen the lesson rows were inert — tapping one did nothing, so lessons "didn't
pull up." Each lesson row is now tappable (with a chevron + "Tap to open") and opens a **lesson viewer**
bottom sheet showing the written **reading** content, plus buttons to **Watch video**, **Open worksheet**,
and **Download** any attached file (via the existing guide-file store, offline-capable). Empty lessons show
a gentle hint to add content. Provider-side; demo in lockstep; both apps parse.

## 2026-07-13 — Tattoo: Square deposit → auto-send intake & consent

When a client pays a deposit in Square, SlickChart can now automatically get their tattoo intake &
consent link to them so paperwork's done before they sit down. It runs on the existing Square payment
sync (fires whenever the app opens / refreshes) — **no Square dashboard setup required**. A new setting on
**Square Sync** (tattoo profession only) offers three modes: **Auto-send** (sends the link the moment a
deposit clears), **Ask first** (default for tattoo — prompts before sending), and **Off**. Matching prefers
the invoice recipient's email, then their full name; only clients with an email who haven't already been
invited are eligible, and every send is deduped by invoice id + the client's `appInvited` flag so no one is
emailed twice. Sends reuse the proven client-invite path and drop a note in the notifications feed. Server:
`api/square/invoices.js` now also returns the recipient's `email` + `customerId` for reliable matching.
Provider-side; demo in lockstep; both apps parse.

## 2026-07-13 — Tattoo: stencil overlay on Before photos

The Progress Photos screen now has a **Stencil** button (tattoo profession only). It lays a stencil or
reference image over the client's most recent **Before** photo so the artist can check placement and
sizing before committing: pick a reference already on file or **upload** a stencil, then **drag to
position**, and adjust **opacity (starts at 50%)** and **size** with sliders. **Save overlay** composites
the two at the Before photo's full resolution into a new Before photo (tagged "Stencil overlay") for the
record. Pure canvas + data-URL image — no camera permissions, works offline. Provider-side only; demo in
lockstep; both apps parse.

## 2026-07-13 — Tattoo: needle & machine preset library (one-tap setups)

The **Needle & machine log** field on the tattoo record now has a row of **one-tap preset chips**. Tapping
one appends a clean setup line (e.g. `3RL · Lining · 7.5V`) to the log so the artist doesn't retype their
standard configurations every session. **New / manage** opens a builder — needle group + size, technique
(Lining / Shading / Color pack / Whip / Blackwork), optional machine, and voltage — with a live preview,
plus a list of saved presets you can delete. Ships seeded with five sensible defaults; presets live in a
new auto-synced `sc_needle_presets` store so they follow the artist across devices. Provider-side only
(shown only on the tattoo template's `tt3` field); demo in lockstep; both apps parse.

## 2026-07-13 — High-accuracy voice notes (Groq Whisper), with graceful fallback

Voice notes can now be transcribed by **Groq's Whisper (`whisper-large-v3-turbo`)** server-side instead of
the phone's built-in dictation — far more accurate on medical/product terminology and no more Android
word-doubling, because the audio is recorded once and transcribed in one pass rather than streamed.

- **New `/api/transcribe.js` proxy.** `GET` is a cheap capability probe (`{enabled}`); `POST` takes a
  base64 audio clip and forwards it to Groq as multipart, returning `{text}`. The `GROQ_API_KEY` stays
  server-side. Same caller-keyed burst limiter as `/api/ai` (default 12/min, `TRANSCRIBE_BURST_LIMIT`);
  optional `GROQ_STT_MODEL` override. Rejects clips over ~4.5 MB (413).
- **Client records, then transcribes.** On boot `_probeWhisper()` sets `_whisperOn`. When it's on and the
  device can record, tapping the mic now records via `MediaRecorder` (opus, low bitrate) with a live timer
  and a **5-minute auto-stop cap** so a marathon note can't exceed the upload limit, then posts the clip
  for transcription.
- **Same clean-up-and-file flow.** The transcript feeds the existing preview → "clean up & file into
  sections" step, so it still routes into your named treatment-note sections exactly as before.
- **Graceful fallback everywhere.** If the key isn't set (`enabled:false`), the mic is blocked, recording
  isn't supported, or transcription fails, it quietly falls back to the phone's live dictation (or a
  type-it box). Nothing breaks when Whisper isn't configured. Provider-side only; demo in lockstep; both
  apps parse.

## 2026-07-12 — Summary share message now matches the session date

When you sent a summary whose session date was a past day (e.g. writing yesterday's notes today), the
text/email/app message still said "…summary and aftercare **from today**." It now reads the actual
session date: **"from today," "from yesterday,"** or **"from your visit on Jul 11."** A `_visitDatePhrase`
helper derives the wording, and the specific saved summary's date is threaded through the link / to-app /
resend paths (falling back to today when there's no dated summary). Provider-side only; demo in lockstep;
both apps parse.

## 2026-07-12 — Notes & summaries: fix cross-client bleed, one card per session, bigger editor, dates

Five fixes to the treatment-note / session-summary flow from provider feedback:

- **Client summary no longer bleeds another client's notes.** When a real client had no note yet in the
  active format, the summary fell through to a demo-seeded global store (Maya's sample notes), so a new
  client's summary could show someone else's content. A real client now returns empty there instead of
  the demo data.
- **One card per session, not two.** Saving a treatment note and sending a client summary used to create
  two separate summary cards. They now merge into a single session record (keyed by the session date) with
  the existing **Provider notes / Client summary** tabs — write-note first or summary first both land on
  one card, and re-editing the note never clobbers the client-facing version.
- **Next appointment no longer shows a past date.** `_nextApptForClient`'s stored-value fallback now only
  returns `nextVisit` if it hasn't already passed (fixes the summary and, via it, the AI brief).
- **Editable session date on saved summaries.** New **Date** button on each summary card opens a date
  picker — handy when you write the note the next day. Keeps the client-facing copy in sync.
- **Bigger Write Note editor.** Section textareas are much taller now (extra-tall for single-field
  formats like Free form) and resizable.

Provider-side only; demo in lockstep; both apps parse; merge + past-date logic verified.

## 2026-07-12 — Smarter AI dictation: cleans terminology + files into your note sections

The voice note now does what the card always promised. After you dictate, the preview's primary action
is **✨ Clean up & file into sections**: it sends the raw transcript to Claude, which (1) fixes
speech-to-text mistakes and corrects professional / medical terminology to what you most likely said
(product & ingredient names, techniques, anatomy, units), and (2) sorts the content into the active note
format's sections — matching the section names you speak as you go ("skin observations, mild
erythema…"). The result drops into the right fields of your record for review before saving. A **Save
as-is** option keeps the plain single-note behavior, and if AI is off or the response can't be parsed it
falls back to a plain save so a dictation is never lost. Works with every note format (SOAP, color
record, tattoo record, etc.) since it reads that format's own section labels.

Note: this cleans up the *final* transcript; the live capture still uses the phone's built-in speech
engine (accuracy varies by device). Provider-side only; demo in lockstep; both apps parse.

## 2026-07-12 — Voice-note doubling (real fix) + compact Clients action buttons

- **Voice-note doubling on Android — root cause fixed.** A Pixel screenshot showed the real pattern:
  Android Chrome emits a single spoken phrase as a *run of growing "final" snapshots* ("treatment" →
  "treatment performed" → "treatment performed on" → …) and re-reads finalized text across recognizer
  restarts, so the transcript concatenated to "treatment treatment treatment performed…". Added an
  overlap-merge (`_mergeText`) that collapses any text where one segment's leading words repeat the
  previous segment's trailing words — applied when combining final results, the interim, and the
  cross-restart accumulator. Growing snapshots and re-reads now reduce to the sentence said once, while
  genuinely distinct phrases still concatenate (verified). Also bumped the service-worker cache
  (v23→v24) so no stale HTML lingers.
- **Clients screen: the "Invite clients" and "Virtual Consults" cards are now a compact two-column row**
  instead of two full-width stacked cards, so searching clients (buttons + keyboard) no longer eats the
  whole screen.

Provider-side only; demo in lockstep; both apps parse.

## 2026-07-12 — Fixes: past-dated "next visit" in the AI brief + voice-note doubling on Android

- **AI brief showed a past appointment as the upcoming visit** (e.g. "next visit already scheduled for
  Jul 11" when that was yesterday). The brief read the stored `nextVisit` string without checking whether
  it had passed, so a stale date was both displayed and fed to the AI as "scheduled." Added a future-aware
  `_upcomingVisit(id)` that prefers a real future appointment (`_nextApptForClient`) and otherwise returns
  the stored date only if it hasn't passed — used for the brief header and the AI's chart context. A
  past date now reads "No upcoming visit" / "Not scheduled."
- **Voice notes doubled words on Android (Pixel).** The prior fix (fresh recognizer per restart) still had
  two gaps on Android Chrome: the session accumulator was shared across recognizer instances, and there was
  no guard against late/duplicate callbacks from a recognizer that had already been replaced — so a dead
  recognizer would re-bank its text and spawn a second overlapping mic session ("today today today"). The
  session buffer is now a per-recognizer closure local, and every callback (`onresult`/`onend`/`onerror`)
  is dropped unless it comes from the current active recognizer. Banks each phrase exactly once, one mic
  session at a time; still correct on iOS Safari.

Provider-side only; demo in lockstep; both apps parse.

## 2026-07-12 — Tattoo: automated aftercare drip + 2D body-map placement + landing copy

Two of the flagged tattoo follow-ups, built on the existing infrastructure.

- **Automated aftercare drip (the Healing Journey).** When a provider sends a session summary for a
  tattoo client, a timed 3-message series auto-starts (and there's a manual **Start / stop healing
  check-ins** control on the client screen). The reminder cron sends, in the client's local morning,
  once each and only within its window: **Day 1** (unwrap & first wash), **Day 3** (peeling & itching
  phase), **~Month 1** (send a healed photo + touch-up nudge). Each message lands in the client's real
  message thread *and* as a push. Server side: a `heal_started_at` column (idempotent migration), a
  provider-authed `/api/aftercare-drip` to start/cancel, drip stages added to `cron-reminders.js`
  (deduped via `reminder_log`, auto-retired after 45 days), and the cron's client query now joins the
  provider id + heal timestamp. Gated on the client's `aftercareReminder` toggle and quiet hours like
  every other reminder.
- **2D body-map placement.** In the tattoo record's "Design & placement" field there's now a **Body map**
  button: tap a front/back body outline to drop a pin, get an auto-suggested (and editable) body-area tag
  (e.g. "Left forearm"), and it writes a `📍 Placement: …` line into the note (searchable) plus a mini pin
  preview. Stored in a synced `sc_body_maps` store. Coordinate math modeled on the signature pad;
  area-detection verified (9/9) and drip windows verified (10/10).
- **Landing page** now lists **Tattoo artists** among the professions (hero list, sign-up dropdown, and
  the "who it's for" copy).

Provider app + demo in lockstep; client app unchanged (the drip rides the existing message thread);
all server modules and both apps parse.

## 2026-07-12 — New profession: Tattoo artist (forms, guides, products, records)

Added **Tattoo artist** to the profession picker with a full, data-driven workspace that flows through the
existing systems (so selecting it configures everything automatically, and the client app needs no changes):

- **Forms.** *Tattoo intake & medical history* with high-risk flags that alert you on submission — blood
  thinners / bleeding disorders, diabetes, pregnancy, **eczema/psoriasis in the tattoo area**, **keloid
  history**, fainting around needles, skin infection/sunburn, recent Accutane, intoxication. A *Tattoo
  consent & release* with explicit **Permanency** and **Touch-up Policy** clauses (plus aftercare, risk,
  and photo/media acknowledgments) and a signature. An *Aftercare acknowledgment* form.
- **Procedure record** ("Tattoo record" note format): **Ink Lot Tracking** (log each ink as Brand · Color ·
  Batch/Lot #), a **Needle & Machine Log** (needle groups RL/RM/RS/M1 + machine voltage per pass), design &
  placement (with body area), technique & passes, skin observations, healing, and touch-up plan.
- **Healing-Journey guides.** First-2-weeks aftercare, the peeling & itching phase (days 3–14), long-term
  sun protection, and pre-appointment prep — the content for the automated day-by-day drip that's coming next.
- **Suggested aftercare products** (Saniderm second-skin, Hustle Butter, fragrance-free lotion, antibacterial
  soap, mineral SPF), a **Tattoo Aftercare & Healing** course, a **healing check-in**, tattoo license/permit
  vault templates, and a default service menu (deposit, hourly, half/full-day, touch-up).

Reference photos default ON (image-forward), and AI-written copy now knows the "tattoo artist" voice.
Provider-side only; demo regenerated in lockstep; both parse; forms/guides/record cross-references and the
config wiring verified (15/15). This is Phase 1 — the interactive extras (needle/machine preset library,
automated aftercare drips, 2D body-map with pins, stencil overlay, Square-deposit auto-send, and lot-number
OCR) are tracked as follow-ups.

## 2026-07-12 — Courses: Delete right on the course card

Follow-up to the course-delete feature: the delete lived only inside a course's Edit screen, which
wasn't discoverable from the Courses list. Added a **Delete** button directly to each course card
(next to Edit / Preview), so the starter/demo courses can be removed without opening the editor.
Provider-side only; demo in lockstep; both parse.

## 2026-07-12 — Course lessons: attach big worksheets via a document link (no size limit)

Direct file uploads are capped at 3MB — not an arbitrary number but Vercel's ~4.5MB serverless
request/response limit (files are base64-encoded, +33%, and travel through the function on both upload
and download). Rather than a fragile bump, added a **worksheet / document link** field to every course
lesson: paste a Google Drive / Dropbox / etc. share link for a file of any size, and the client taps
**Open worksheet** to view it. No storage, no infrastructure, no size limit.

- Provider course builder: a new link field under the video link, with a hint pointing over-3MB
  worksheets to it; the 3MB upload toast now suggests the link instead. Lessons with only a link save
  correctly, and the course preview shows a "Worksheet" tag.
- Client lesson view: an "Open worksheet" button (opens in a new tab) plus a "Worksheet" tag in the
  lesson list. The link is scheme-validated through `_safeUrl` (a `javascript:` link renders nothing) and
  attribute-escaped.

Both apps + both demos updated in lockstep and parse; save/round-trip and the URL gate verified (6/6).
(Native large-file upload via Vercel Blob remains available as a future option if in-app upload of big
files is preferred over links.)

## 2026-07-12 — Courses are now deletable (including the demo/starter ones)

Courses could be created, edited, previewed, and sent — but never deleted, so the seeded starter
courses were stuck on the list. Added a **Delete course** action (Edit a course → Delete course at the
bottom, with a confirm). It removes the course, cleans up any attached lesson files (server + local),
and marks the course set as customized so a deleted starter course doesn't get reseeded back on the next
load. Provider-side only; demo regenerated in lockstep; both parse.

## 2026-07-12 — XSS round 35: escape client name/treatment in the provider session-summary screen

A render-sink sweep of both apps came back almost entirely clean — messages, consult requests, form answers,
check-in detail, virtual-consult labels, the notification feed, booking cards, and the whole client app were
all already escaped. It found three misses, all in the provider-side `renderSessionSummary` screen, where
client-influenced fields rendered as raw HTML in the provider's authenticated session (stored XSS):

- **Client display name** (`c.name`) in the edit-summary header — the client's name arrives via
  self-registration / Square + CSV import / booking events, and is `_fileEsc`'d in ~15 other renders; this
  one was missed. Now escaped.
- **Treatment** (`c.treatment`) in two spots (the summary header and the "next appointment" block) — arrives
  via `payload.treatment` on booking/check-in sync events. Now escaped, matching the adjacent calendar
  `onclick` that already used `_jsAttr(c.treatment)`.
- Also escaped the sibling fields on those lines for good measure: the summary's `s.treatment`/`s.date` and
  the next-appointment `nextDate`/`nextTime` (the latter derive from client-submitted booking data, the same
  class escaped in round 33).

Provider-side only; demo regenerated in lockstep; both apps + demo parse.

## 2026-07-12 — Server security sweep: reset-link host poisoning + push-endpoint SSRF

Extended the security sweep from the client apps into the API/server layer. A focused authz/tenant-isolation
audit came back clean — every provider endpoint constrains its queries by the signed-JWT provider id, every
client endpoint resolves strictly from the unguessable link token (never a request-supplied id), Square is
isolated by the caller's own OAuth token, owner-only endpoints check `OWNER_EMAIL` against the signed JWT, and
the new client-deletion/tombstone path holds up (no cross-client delete, no resurrection). SQL is fully
parameterized (Neon tagged templates), the Stripe webhook verifies its HMAC + replay window, cron fails closed
without `CRON_SECRET`, and all tokens use `crypto.randomBytes` + `timingSafeEqual`. Two real issues fixed:

- **Password-reset / verify link host poisoning (account-takeover class).** `appOrigin(req)` built links from the
  `Host` / `X-Forwarded-Host` request header, which is attacker-influenced. For the emails that carry a live
  secret token — password reset, email verification, and a client's private invite link — a spoofed header could
  deliver a genuine email whose link points at an attacker origin, leaking the token on click. Those three now
  build from a new `trustedOrigin()` that resolves only to an origin we control (`APP_ORIGIN` env, else the known
  production origin) and **never** from a request header. Non-secret uses (Square's registered `redirect_uri`,
  the calendar/portal URLs returned to the already-authenticated provider, the cosmetic consult link) still use
  `appOrigin`. The client-invite still honors the provider app's own `location.origin`, now validated as a clean
  http(s) origin with `trustedOrigin()` as the fallback.
- **Blind SSRF via the web-push subscription endpoint (low).** A subscription is client-supplied JSON and the
  server later POSTs to its `endpoint`; only a truthy check existed, so a token holder could point `endpoint` at
  an internal URL (e.g. the cloud metadata IP) and turn a later send into a blind SSRF. Added `validPushEndpoint()`
  (https + public host only; rejects loopback, private/link-local/reserved IPv4, IPv6 loopback/ULA/link-local, and
  `localhost`/`.internal`/`.local`/metadata hosts), enforced both when a subscription is stored and again before
  every send (so any endpoint stored before this guard still never gets hit). Verified 22/22 against real push
  services (FCM/Mozilla/Apple/WNS pass) and SSRF targets (blocked).

Server-only; all modules parse; validators unit-tested.

## 2026-07-12 — Client account deletion now really deletes (server-side purge + tombstone)

Reviewed the client app's three "native" needs. Two were already built correctly for a TWA/PWA and
needed no change: **push notifications** run on real Web Push/VAPID (FCM on Android, APNs on installed
iOS PWAs, both under the browser's push service) — wired end to end (`enableNotifs` → permission →
`pushManager.subscribe` → `/api/push-subscribe`, service-worker `push`/`notificationclick`, cron
reminders); and **native camera** uses `<input type="file" accept="image/*" capture="environment">`,
which opens the device camera inside the WebView. The third — account deletion — had a real gap and is
fixed here.

Before, "Delete My Data" removed the client's prefs + push subscriptions and notified the provider, but
the client's server-side **PII** (name/email/phone) and everything they'd **submitted** (check-in photos,
form answers, the message thread, consult/booking events) stayed in the database, and the link kept
working — so it wasn't an honest deletion. Worse, because the provider app is the source of truth and
re-syncs its whole client list, any naive server scrub would have been **resurrected on the next sync**.

Now `/api/client-delete` does a real, durable deletion:

- **Purges the client's submissions.** Every `client_events` row for that client (check-ins, forms, the
  full two-way message thread, virtual-consult/booking/contact events) is deleted. This runs *before* the
  `delete-request` notification is logged, so the provider is still told.
- **Scrubs server-held PII + the chart mirror.** The `clients` row's name/email/phone and the server-side
  `data` blob are blanked. The provider never reads that mirror back (their retained record is their own
  local copy), so this removes our identifiable copy without touching what a provider keeps for legal
  retention.
- **Revokes the link.** The token is rotated to an unshared value, so the old client link is immediately
  dead (matching the "ask your provider to resend your link" copy).
- **Tombstones the row** (`deleted_at`) so a provider re-sync can't undo any of the above — `upsertClient`
  now no-ops on a deleted client, and `listClients` hides it from the roster. A one-line idempotent
  migration adds the column.

Client-side copy updated to describe the stronger behavior honestly. Verified end to end with an
in-memory model of the exact query sequence (13/13: purge, PII scrub, token revocation,
resurrection-blocked, roster exclusion, other clients untouched); all server modules and both client
apps parse; client demo synced.

## 2026-07-12 — XSS sweep, round 34: finish escaping the client check-in / form-fill surface

The escaping sweep had been thorough on the provider app but the **client app** (`slickchart-client.html`)
got less attention, and it renders two kinds of untrusted content: fields the provider authors and syncs
down (check-in comfort config, form definitions, recommended-product/guide icons) and fields the client
types themselves. Audited both apps' inline event handlers and the client render sinks and closed the
remaining gaps — all are output-escaping only, no logic changes, values render and store identically.

- **Client check-in rendering.** The comfort "level" buttons put the provider-synced option value and
  question id straight into an inline `onclick` (`checkinAnswers['${id}']='${o}'`) with no escaping — a
  synced config value carrying a `'` or `"` could break out of the handler. Routed the id/value through
  `_jsAttr` (JS-string-in-attribute escaping) in `_ciLevel`, `_ciBoolean`, and `_ciNotes`, and escaped the
  yes/no button labels, the notes label, the detail/notes placeholders, and the re-rendered answer text
  (`_txt`). Verified against `'`, `"`, `</textarea>…`, and `<img onerror>` payloads: the handler can no
  longer be broken out of and `_jsAttr` round-trips every value back to its original at runtime (so a
  saved answer like `Off` still compares and stores exactly).
- **Client magic-link form fill.** The multiple-choice option in `_cfField` was escaped with a
  single-quote→`&#39;` replace, which the browser HTML-decodes back to `'` *before* JS parses the handler,
  so it gave no protection (and ignored `"`); switched it and the field id to `_jsAttr`. The consent
  paragraph and the recommended-product / guide icons were rendered as raw HTML — now `_txt`-escaped.
- **Provider intake/preview handlers (defense-in-depth, provider-authored).** In the new-client intake
  (`_ncQHTML`), the send-to-app form preview (`_sdField`), and the profile-fill renderer (`_pfiQHTML`),
  form-option handlers used a double-quote-blind `'` escape and rendered option text, question labels,
  and contraindication items raw — upgraded to `_jsAttr` for the handlers and `_fileEsc` for the displayed
  text.

Client- and provider-side only. Demos regenerated in lockstep (`slickchart-provider-demo.html`,
`slickchart-client-demo.html`). Both apps and both demos parse; escaping verified end to end against a
breakout-payload harness.

## 2026-07-10 — Info-leak cleanup: no endpoint returns raw internal errors

Following the auth review, swept every API handler for the same info-leak. 14 endpoints (client-data,
client-messages, client-submit, provider-message, client-invite, clients, signup, billing-status,
create-portal-session, push-subscribe, client-prefs, client-delete, square/connection, admin-stats) were
returning the raw exception `e.message` — DB/driver internals, constraint names, connection details — to
the caller. They now log server-side and return a generic message (HTTP status preserved). The Square
service handlers intentionally relay their controlled, friendly messages (e.g. "card declined") plus the
"reconnect" hint, and the Square diagnostics endpoint intentionally shows detail — those are left as-is.

Server-only; all modules parse.

## 2026-07-10 — Auth: real 2FA enforced + spraying defense + generic login + subscription re-check

Closed the four flagged auth gaps.

- **Two-factor authentication is now real and enforced.** The client app already had the full 2FA UI
  (QR enrollment in Settings, a code prompt at login), and the TOTP implementation (`totp.js`) was a
  correct RFC 6238 — but the setup endpoints sat at the repo root (never deployed) importing a
  non-existent `lib/totp.js`, and login never checked the second factor. So "2FA" implied protection it
  didn't give. Fixed the wiring: moved the code to `lib/totp.js` + `api/totp-setup.js` +
  `api/totp-verify.js`, and **login now requires a valid 6-digit code when the account has 2FA on**
  (returns a `requiresTotp` challenge otherwise). Verified against the RFC 6238 test vectors, so
  Google Authenticator / Authy / 1Password interoperate; drift window ±30s; non-numeric codes rejected.
- **Login no longer reveals whether an email is registered.** Both "no account" and "wrong password" now
  return one generic "Email or password is incorrect."
- **Brute-force throttling is now per-IP as well as per-email.** The per-email limit didn't stop password
  spraying (one guess each across many emails from one IP); added a per-IP cap (using the platform's real
  client IP, not the spoofable forwarded header), fail-open when no trustworthy IP is available.
- **The subscription is re-checked at login, not only at signup.** When `REQUIRE_PAYMENT` is on, a lapsed
  subscription is now caught at login (fail-open on a billing-lookup error so a transient hiccup can't
  lock out a paying customer).

Server-only (lib/totp, lib/auth, lib/db, api/login, api/totp-setup, api/totp-verify). TOTP verified end to
end; all modules parse. No app rebuild (the client 2FA UI already existed).

## 2026-07-10 — Auth hardening (security review): session revocation + no error leaks

An auth/session security review confirmed the crypto core is solid (constant-time HMAC session tokens,
scrypt+per-user-salt passwords, single-use time-limited reset tokens bound to the account, fully
parameterized SQL, fail-closed on a missing SESSION_SECRET, and clean tenant isolation). Two clear wins
fixed here:

- **Changing or resetting your password now signs out other sessions.** Session tokens are stateless
  30-day JWTs, and the data endpoint checks session revocation on every request — but password
  reset/change never revoked anything, so a stolen or stale token kept full access for up to 30 days
  *even after* the owner changed their password (the exact thing you do after a suspected compromise).
  Reset now revokes **all** sessions; change-password revokes **all but the current** device.
- **Auth endpoints no longer return internal error details.** login/store/sessions/verify/reset returned
  the raw exception message (DB/driver internals) to the caller; now they log server-side and return a
  generic message.

Server-only (api/login, reset, change-password, store, sessions, verify). All parse.

_Flagged for your decision (not changed): (1) TOTP 2FA is wired into the UI but not enforced at login and
its setup endpoints are mis-placed — it should be either fully built or removed so it doesn't imply
protection it doesn't give; (2) login/signup reveal whether an email is registered (enumeration) vs the
helpful "no account — create one" message; (3) brute-force throttling is per-email only (no per-IP cap);
(4) the payment gate is checked only at signup, not on continued use._

## 2026-07-10 — Native-app readiness: self-host the icon font (was CDN-only)

Prepping for Android/iOS store wrapping. The single biggest blocker found: **every icon in both apps
loaded from a jsdelivr CDN** (`@tabler/icons-webfont`). In a native WebView wrapper, if the device is
offline or the CDN is blocked/slow, the entire UI renders with missing icons — which reads as a broken
app and risks App Store / Play rejection. It also wasn't offline-cached (the service worker skips
cross-origin requests).

- Self-hosted the Tabler icon font in-repo (`/assets/tabler/tabler-icons.min.css` + `fonts/*.woff2`,
  trimmed to woff2 which every modern iOS/Android WebView supports). Both apps now load icons same-origin,
  so they work offline (the service worker caches them) and inside a native bundle with no external
  dependency. Verified the used icon classes resolve and both apps boot.

Also confirmed store-readiness basics are already in place: both PWA manifests are complete
(name/short_name/icons incl. 192·512·maskable/display:standalone/theme+background/orientation/id), icons
are correctly sized (apple-touch 180, 192, 512), `viewport-fit=cover` + safe-area insets are used,
`apple-mobile-web-app-*` + theme-color are set, in-app account deletion and a privacy policy exist, and
the auth crypto core (HMAC tokens, scrypt passwords, parameterized SQL, tenant isolation) audited clean.

Client re-embedded (byte-identical); both demos regenerated (banner-only).

## 2026-07-10 — State-integrity: check-in re-arm + virtual-consult submission guard

- **The check-in nudge now re-arms for a returning client.** The provider-side "needs check-in" flag was
  write-once (and also treated *any* past check-in as "done"), so once a client checked in for one visit
  the provider was never nudged to request one again — even after they booked a new appointment. It's now
  scoped to the current appointment (stores which `nextVisit` it was completed for and auto-invalidates
  when that changes), matching what the client app already did. Verified across done/rebooked/never/legacy.
- **Re-inviting a virtual consult no longer silently drops a submission awaiting review.** If a client had
  submitted their consult photos (a paid service) and the provider tapped "Invite to a new consult" before
  reviewing, the pending submission vanished from the Needs-review queue. Now it asks first ("… has a
  submission awaiting your review — replace it?").

Provider-app only. Boot passes; check-in logic simulated; demo regenerated (banner-only).

_Flagged (not changed): a confirmed appointment whose time has passed keeps showing as the client's
"next visit" until replaced/edited — what to show instead (its own "last visit"? "not scheduled"?) is a
display/product choice worth deciding rather than auto-clearing the data._

## 2026-07-10 — Payments/Square money-integrity fixes (state-transition sweep)

A state-transition sweep found several ways the money numbers could go wrong. All fixed:

- **Partial payments (deposits) now count correctly.** A payment marked **Partial** stored only a total
  with no record of how much was collected — so it counted as **fully outstanding** in A/R *and* the
  collected portion counted as **$0 revenue** (invisible on the CPA export). "Log a payment" now has a
  "Paid so far" field; Outstanding/A/R use `amount − paid`, and the collected portion counts toward
  revenue and "collected this month". Centralized in two helpers (`_payCollected`/`_payOwed`) and
  simulated across paid/unpaid/partial/refunded/canceled + over/under-payment boundaries.
- **Square auto-sync can no longer undo a manual "Mark paid" or resurrect a deleted invoice.** If you
  collected a Square invoice out-of-band (cash/Venmo) and marked it paid, the 60-second sync used to
  flip it back to unpaid every cycle (Square still showed it open) — money stuck in Outstanding. Now a
  locally-paid record stays paid. And deleting a Square-linked invoice now tombstones it so the sync
  doesn't re-add it on the next run.
- **Deleting a client no longer leaves ghost A/R.** Their outstanding invoices were orphaned and kept
  inflating Outstanding/A/R forever with no chart to resolve them. They're now canceled on delete (drop
  out of A/R) while **paid** records are kept so revenue history stays intact.
- **"Mark paid" won't re-collect a refunded/canceled payment** (defense-in-depth guard).

Provider-app only. Boot passes; money math simulated; demo regenerated (banner-only).

## 2026-07-10 — Reminder cron: fire morning-of for early appointments; DST-safe "tomorrow"

A date/time/timezone sweep confirmed the countdown/parsing is DST-safe (local midnight-to-midnight with
rounding), 12h/AM-PM parsing handles midnight & noon, the hourly cron hits every timezone's morning
window, and reminder dedup holds across DST. Two cron fixes:

- **The "Appointment today" push now fires for early appointments.** The morning-of reminder required
  `apptAt > now`, but the morning window starts at 7am — so an appointment at exactly 7:00 (or earlier)
  never got one (at the 7:00 run `apptAt > now` is false; by 8:00 it's already past). Now allows a few
  hours' grace, so early/at-open appointments get their morning-of reminder at the first morning run,
  while ones that passed hours ago still don't.
- **DST-hardened the "tomorrow" calculation.** The day-before reminder derived tomorrow via a fixed
  `+24h` of milliseconds, which can skip a calendar day across a spring-forward boundary. Now increments
  the calendar day component directly (verified across month/year rollover and leap years). It was
  dormant (gated to mid-day), but the cron is the app's core promise, so it's worth making robust.

Server-only (api/cron-reminders.js); no app rebuild.

_Flagged for a product decision (not changed): appointment times are anchored to the **client's** device
timezone, not the salon's, so a client in a different timezone than the salon sees a shifted countdown /
reminder. Correct for same-timezone clients (the common case); fixing cross-timezone needs carrying the
salon's timezone through the whole pipeline — a deliberate architecture change to discuss._

## 2026-07-10 — Boundary-input hardening (money/validation already solid)

An input/edge-case sweep confirmed the money, division, required-field, and date-math paths are
genuinely hardened (prices strip `$`/commas and reject negative/NaN/Infinity; all charge/invoice paths
guard `amount>0`; divisions guard the denominator). Two real residual issues, both fixed:

- **A long unbroken consult-request no longer breaks the layout.** A prospect can submit a 120-char name
  or 2000-char message through the public consult form; the provider's Consult-requests card rendered the
  name and message with no `word-break`, so a pasted long URL / unbroken string overflowed the card
  sideways. Added `overflow-wrap`/`word-break` (the email/phone line already had it).
- **Emoji / non-Latin names now make correct avatar initials.** Two new-client paths and `_cIni` built
  initials with `name.split(...).map(w=>w[0])`, which returns a broken surrogate half for a name starting
  with an emoji or astral character (e.g. "😀 Nguyen" → a mojibake "�N"). Routed them through the
  existing `_initials()` helper (code-point-safe via `Array.from`), which the rest of the app already uses.

Provider-app only. Boot passes; demo regenerated (banner-only).

## 2026-07-10 — Accessibility: WCAG-AA contrast + screen-reader dialog semantics

- **Text contrast now meets WCAG AA (4.5:1).** The muted greys used for secondary text failed badly —
  the client app's `#b8a898` (2.3:1), `#c4b9ae` (1.9:1), `#9a8a7e` (3.3:1) on white, and the provider's
  `#666` (3.2:1) / `#777` (4.0:1) on dark. Recolored **only the text uses** (borders/backgrounds/icons
  untouched) to compliant equivalents that preserve the light→dark hierarchy — every replacement's ratio
  was computed and verified ≥4.5:1 (client → `#82715f`/`#786858`/`#6b5d52`; provider → `#929292`/`#9a9a9a`).
  Also fixed the public consult page's footer (compliant in both light and dark mode). ~370 text colors
  updated; no layout or structural change.
- **Bottom sheets are now real dialogs for screen readers.** The ~30 ad-hoc overlays (start-a-message,
  checkout item picker, client picker, send product/form, etc.) were keyboard- and Escape-operable but
  never announced as dialogs and didn't move focus in. A runtime enhancer now marks each full-viewport
  overlay `role="dialog" aria-modal="true"`, moves focus into it on open (unless it already focused
  something itself), and restores focus to the opener when it closes — in both apps, automatically, for
  current and future sheets. It only targets true full-viewport modals (so toasts and the demo banner are
  left alone) and skips overlays that already manage this (confirmModal). Verified against a real DOM.

Client re-embedded (byte-identical); both demos regenerated (banner-only); boot + 9-screen smoke pass.

## 2026-07-10 — Accessibility: every form field now has a screen-reader name

An accessibility pass found the apps already handle most of it well (icon buttons are labeled, click-only
cards are made keyboard-operable at runtime, modals trap focus, images have alt text, pages set `lang`).
The one real gap the runtime layer didn't cover: form fields whose visible label is a styled
`<span class="fl-lbl">` (not a real `<label for>`), so a screen reader announced them as bare "edit text"
on nearly every data-entry flow (client intake, charging a client, editing a chart, changing password,
and every search box).

- Upgraded the runtime accessibility enhancer so **every** unlabeled input/textarea/select gets an
  accessible name automatically: it uses the field's nearest preceding `.fl-lbl` (walking siblings then a
  couple of containers, with a field-boundary check so it never borrows a neighboring field's label),
  falling back to the field's placeholder for search boxes that have no visible label. Runs on every
  render via the existing MutationObserver, in **both** apps — so all ~160 previously-unnamed controls,
  and any added later, are covered with **zero visual change**. Verified against a real DOM across direct-
  sibling, intervening-element, wrapped-input, placeholder-only, and multi-field-container layouts.

Client re-embedded (byte-identical); both demos regenerated (banner-only); boot + 9-screen smoke pass.
Remaining a11y items are polish / judgment calls (see notes): a few grey text colors fail WCAG contrast
(a visual/brand choice), and the ad-hoc bottom sheets could add `role="dialog"` + focus-in (they're
already keyboard- and Escape-operable via the runtime layer).

## 2026-07-10 — Photos moved to IndexedDB (no more storage-quota ceiling)

Before-and-after / captured photos were stored as base64 in a single localStorage key
(`sc_captured_photos`), which has a ~5MB browser cap — a busy provider would eventually hit it and get
"storage full", unable to save new photos. They now live in **IndexedDB** (hundreds of MB, and off the
localStorage stringify path):

- Added a tiny promise-based IndexedDB key→value store (`_idb`) that degrades gracefully — if IndexedDB
  is unavailable (private mode / very old browser) it transparently falls back to the old localStorage
  behavior, so nothing breaks.
- **Loss-proof migration:** on load, any existing `sc_captured_photos` in localStorage is read
  synchronously (so a provider's photos are available instantly, no blank gap), then moved into
  IndexedDB, and only then is the localStorage key freed. Verified end-to-end (round-trip + migration)
  against a real IndexedDB.
- Photos are kept in memory for synchronous rendering exactly as before; only the persistence backend
  changed. Account deletion now also clears the IndexedDB copy.

Provider-app only. Boot passes; demo regenerated (banner-only).

## 2026-07-10 — Consult feature: security hardening (adversarial review of my own new code)

An adversarial security pass on the just-added public consult endpoints caught a real one:

- **HIGH — fixed stored XSS on the public consult page.** The prospect-facing page embeds the provider's
  business name in an inline `<script>` via `JSON.stringify`, which does NOT escape `<` — so a provider
  whose business name contained `</script><img onerror=…>` could run arbitrary script on every prospect
  who opened their consult link. `jsStr` now escapes `<`/`>` to `\u003c`/`\u003e`, closing the
  `</script>` breakout (verified: the payload renders inert). The HTML-text/attribute/URL/color paths were
  already correctly escaped (`esc`/`normUrl`/`hex`); this was the one JS-string-context gap.
- **MED — public submit no longer leaks internal errors.** The unauthenticated POST returned `e.message`
  (DB/driver internals) verbatim; now returns a generic message and logs the detail server-side. Same for
  the two provider-authed consult endpoints.
- **MED — sturdier rate-limit IP.** The per-IP limiter keyed off the spoofable leftmost `X-Forwarded-For`;
  now prefers the platform-set `x-real-ip`, falling back to XFF only if absent (the per-slug cap stays as
  defense-in-depth).
- **LOW — reserved slugs + safer thank-you.** Blocked impersonation slugs (`admin`, `support`, `official`,
  …); the thank-you message now uses `textContent` instead of `innerHTML` string-building.

Verified clean by the same review: SQL injection (all parameterized), tenant isolation (auth fails closed,
requests scoped to the caller, slugs can't be hijacked), and the page's not-found/error paths (no leak).
Server-only change — no app rebuild.

## 2026-07-10 — Data-resilience: stale/malformed saved data can no longer blank a screen

A dedicated pass for the highest-stakes class — a newer app version reading older/partial/corrupted
saved data and crashing a render (a blank screen a beta tester can't get past). Both apps were already
well-guarded (every `JSON.parse` of localStorage is wrapped; the big ingest functions validate with
`Array.isArray`); these were the spots that slipped through:

- **HOME could be taken down on boot by one malformed client.** The "Needs your attention" section
  dereferenced `flaggedContra.items` (`.length`/`.join`/`.map`) assuming it's an array — a client record
  whose `flaggedContra` drifted shape (older version / partial write) threw mid-render and locked the
  user out of the first screen. All 8 read sites now go through a crash-proof `_fcItems()` helper.
- **Check-in detail could blank on the alert path.** `renderCheckinDetail` guarded every array except
  the per-group `g.rows` (and didn't default `ci.client`). A check-in synced by an older client app threw
  on `g.rows.map`. Guarded both — same class as the already-fixed "summary with no homecare array."
- **Session-summaries screen** crashed if a summary outlived its client (`CL[id]` gone): added the
  missing null guard, matching every sibling client screen.
- **Submitted-form view** dereferenced `sf.answers[q.id]` in one branch without the `sf.answers &&` guard
  the other branches have — a pre-`answers` record threw. Guarded.
- **Homecare** now returns its stored value only when it's actually an array (a non-array persisted value
  would have thrown on `.map` in client detail).

Provider-app only. Boot passes; demo regenerated (banner-only).

## 2026-07-10 — Communication sweep: honest errors, no false confirmations, clearer empty/chat states

- **"Your account has been deleted" is no longer shown when the server wipe fails.** The delete-account
  flow cleared local data and reported success even if the network request to actually wipe the account
  (and all client data) never landed. Now it **confirms** the server side is gone first; if it can't, it
  keeps you signed in, restores the button, and says so honestly ("We couldn't reach the server to delete
  your account… try again") instead of falsely claiming your data is gone.
- **No more raw error codes on the payment/Square screens.** Failed Square actions (take payment, send
  invoice, charge card, book, import) could surface developer text like "Request failed (500)" in the red
  box while you're trying to charge a client. Those now read "Something went wrong on Square's side —
  please try again in a moment," with the technical detail kept in the console only. Same for the owner-only
  "Publish update" error and the feedback pulse (which also no longer says "Thanks" if the send failed).
- **Client chat no longer shows a fake fixed date.** Every real client's message thread rendered a static
  "Jun 26, 2026" divider at the top regardless of actual dates — removed.
- **Notifications screen now has a proper empty state** ("You're all caught up") instead of looking like it
  failed to load on a fresh account.

Client re-embedded (byte-identical); both demos regenerated (banner-only). Both apps boot; 9-screen smoke
passes. (The client app's own send/submit failure messaging was audited and confirmed already solid —
visible "Not delivered · Tap to retry", friendly "couldn't send" on every critical path.)

## 2026-07-10 — Performance: kill per-nav megabyte writes, debounce note typing, dedupe polling

- **Navigation no longer re-serializes your whole photo library.** `_savePersistenceSweep` ran on
  every screen change and, among 16 stores, re-wrote `sc_session_summaries` and `sc_captured_photos`
  (base64 JPEGs — potentially megabytes) to localStorage synchronously. Both are already saved at every
  point they actually change, so writing them again on every tap was pure overhead that made navigation
  progressively jankier for providers with lots of photos. Removed those two from the per-nav sweep;
  the 14 small stores still sweep as before.
- **Typing a client note no longer writes the whole workspace on every keystroke.** The "note the
  client will see" fields called `persistWorkspace()` (a full `JSON.stringify` of recs/reasons/homecare/
  products) on every `oninput`. Now debounced (trailing 500ms) and flushed on navigation and on
  pagehide/close, so nothing is lost but typing stays smooth on big accounts.
- **Client app stopped double-polling messages.** `/api/client-messages` was fetched by both a 20s
  timer and the 30s data poll. Dropped the duplicate fetch from the 30s poll — the dedicated 20s timer
  owns messages now, cutting redundant network/serverless calls by ~a third with no latency change.

Both apps boot; client re-embedded (byte-identical); both demos regenerated (banner-only); 9-screen
smoke passes. (Two bigger items were left as flagged decisions — see notes: base64 photos still grow
unbounded in localStorage, better solved with IndexedDB; and the full-client-sync fan-out could batch.)

## 2026-07-10 — Client home now surfaces new messages live

- **Unread badge on the home "Message" tile.** A dead-code sweep found the 20-second message poll
  tried to refresh the home screen via `getElementById('home-screen')` — an id that only exists in the
  *provider* app, so on the client the branch never fired (leftover from a copy-paste). Fixed it to use
  the client's real `currentScreen` check, and added a red unread count badge to the home "Message
  [provider]" tile (driven by the provider thread's `unread`). Now a client sitting on Home sees a live
  badge appear the moment a message arrives — not only after they navigate. Clears when they open the
  thread. (Everything else in that sweep — dead buttons, dead links, missing nav targets, broken submit
  flows — came back clean across both apps.)

Client re-embedded (byte-identical); demo regenerated (banner-only). Boot + 9-screen smoke pass.

## 2026-07-11 — Public "request a consult" link is now real (was a dead mockup)

The Virtual Consultations → Client link tab used to show a hardcoded, non-working
`slickchart.com/consult/jessica-lee` (the demo persona's name, and no backend route). It's now a
real feature end-to-end:

- **New public page** `slickchart.com/consult/<your-slug>` (`api/consult-page.js`, routed via
  `vercel.json`). It resolves the slug to the provider, pulls their real business name / website /
  brand color from their synced settings, and renders a branded, mobile-first request form. No login
  needed — these are prospects, not clients yet.
- **Public submit** (`api/consult-request.js`): strictly validated, size-capped, and rate-limited by
  IP and by slug (it's an unauthenticated endpoint). Records a lead in a new `consult_requests` table.
- **Slug management** (`api/consult-slug.js`): each provider claims a unique slug (auto-suggested from
  their business name); stored on the `providers` row behind a unique index. `lib/consult.js` holds the
  schema migration (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`, so it's safe on the live DB) and helpers.
- **Provider app**: the Client-link tab now loads the real slug, shows the real link with working
  Copy/Share, lets you create/edit the slug, and lists incoming consult requests (name, contact,
  message, with Email/Call buttons) pulled from `api/consult-requests.js`. The old copy that promised
  photo upload / "within 48 hours" was reworded to match the real flow (request → you follow up).

Backend verified: all modules `node --check` clean, the public page renders valid HTML (both the
found and not-found paths), the in-page browser script parses, and the provider render helpers were
runtime-tested across all states (unloaded / none-set / active). Provider demo regenerated (banner-only).

## 2026-07-11 — Hardcoded-default sweep: money leak + demo-identity leaks

- **Amazon affiliate links no longer default to the demo's account (real money).** `amazonAssociates`
  defaulted to `{tag:'glowingskin-20', store:'amazon.com/shop/glowingskinstudio'}`, so until a provider
  opened the Amazon screen and saved their own, every "Buy on Amazon" link they showed clients appended
  the **demo's** affiliate tag and fell back to the **demo's** storefront — routing client purchases'
  commission to the wrong account. Now defaults to empty; `amazonBuyUrl` already hides the Amazon option
  when there's no tag/store, so nothing breaks — links simply don't appear until the provider connects
  their own Associates account.
- **Client-facing footers no longer show the demo's city/domain.** The client home footer hardcoded
  "· Oakland, CA · glowingskinstudio.com" and the shared-link landing footer hardcoded
  "· glowingskinstudio.com" — every real client saw the demo's location/website attributed to their own
  provider. The provider's real `website` now rides in the client data blob and the footers show that
  (or nothing if unset); the wrong city literal is gone.
- **Removed two hardcoded turnaround promises made on the provider's behalf.** The virtual-consult
  preview said "You review within 48 hours" and the client rebook screen said the provider "will confirm
  within 24 hours" — neither provider set those SLAs. Reworded to non-committal ("You review & send
  notes", "will review and confirm your request").

Client re-embedded into `api/client-page.js` (byte-identical); both demos regenerated (banner-only).
Boot + 9-screen smoke pass.

## 2026-07-11 — Virtual consult: no default price

- **The consultation-fee selector no longer assumes $25.** The "Client link" tab pre-highlighted the
  **$25** pill and `vcFee` defaulted to `'$25'`, implying every provider charges that and that the
  consult is always paid. It now **defaults to Free** (no price pre-selected) — because not every
  provider charges, and those who do don't all charge the same. The fee pills are now real (they were
  decorative before): tapping Free / $15 / $25 / $49 or a **Custom** amount sets and persists the
  provider's choice (`sc_vc_fee`), and the helper text reads "This consult is free — tap a price only
  if you charge for it." The client app never displays this fee, so nothing changes for clients.


## 2026-07-11 — Third audit round (server): brand-new-client token race

- **A client's link could be born dead under concurrent syncs.** For a brand-new client, two
  overlapping `upsertClient` calls both saw no token, both generated one, and both ran
  `INSERT … ON CONFLICT (id) DO NOTHING` — the DB kept the first token, but the *loser* returned its
  own discarded token to the caller, which the provider then stored locally and copied into the invite
  link. Result: a "copy link" that points at a token the DB never saved. `upsertClient` now re-reads
  the persisted token after the insert and returns that, so every caller gets the token that actually
  landed. Server-only; runs only on brand-new clients.

## 2026-07-11 — Third audit round (idempotency + form-photo leak)

- **A dropped response could duplicate a client's submission.** `_clientSubmit` retries once on a
  network failure — but if the *original* request actually reached the server and committed before its
  response was lost, the retry wrote a **second** check-in / booking / form / message. The client now
  mints a stable idempotency key (`_idem`) once and carries it through the retry; the server derives the
  event's primary key from it (`ON CONFLICT (id) DO NOTHING`), so a retried-but-already-saved submission
  collapses to one row. No schema change — reuses the existing `client_events.id` PK.
- **Same fix for provider→client messages.** `_sendProviderMessageToClient` retries the same way and had
  the same duplicate-on-lost-response window (a doubled message + a second push). It now threads a stable
  key through the retry and `/api/provider-message` passes it to the same idempotent `logEvent`.
- **Abandoned form photos leaked into the next form.** `_ffPhotos` (in-memory, keyed by field index) was
  only cleared on a completed send. Attach photos to a form, leave without submitting, open a *different*
  form → its photo tiles rendered empty but `_submitFillForm` still read `_ffPhotos[i]` and **silently
  attached the first form's photos to the second at the same index**. `renderFillForm` now resets
  `_ffPhotos` on entry, so a fresh form always starts with no inherited photos.

Client re-embedded into `api/client-page.js` (byte-identical) and both demos regenerated (banner-only).
`node --check` on all changed modules, boot on all four surfaces, and the 9-screen client render smoke test
all pass. The idempotency keys are backward/forward compatible (an old client omits `_idem` → random id
as before; the server ignores an unknown field), so no coordinated-deploy window.

## 2026-07-11 — Third audit round (provider): payment double-submit + stale invoice-edit target

- **"Send invoice via Square" and "Text a payment link" (Build-invoice screen) could fire twice.**
  `_biSend`/`_biTextLink` do the same real-money work as the checkout path (`_coInvoice`/`_coLink`) —
  POST to Square + log a payment record — but were the only money actions with **no in-flight guard**.
  A laggy Square call plus an impatient second tap meant **two invoices emailed / two payment-link
  records**. Both now take the shared `_coLock()` before the request and release it in a `finally`.
- **After one checkout send, every checkout button went dead.** `_coLink`/`_coInvoice` acquired
  `_coLock()` but never released it on the *success* path (only on error), so once you sent a payment
  link or invoice from "Take payment," "Charge card on file" / "Send invoice" / "Send link" all silently
  no-op'd until you left and re-entered the screen. Both now release the lock in a `finally`.
- **An abandoned "Edit & resend" corrupted the next fresh invoice.** `renderBuildInvoice` reset
  `_coItems` but not `_biEditId`, so opening "Edit & resend," backing out without sending, then tapping
  "Build an invoice" opened a *new* invoice still in edit mode — and sending it **spliced out an
  unrelated prior payment**. Edit state is now kept only when arriving via `_payEdit` (one-shot
  `_biEnterEdit` flag); a fresh entry clears `_biEditId`/`_coItems` and any stale lock.
- **"Send text link" from a payment row could mint two Square links** on a double-tap (per-record
  guard via `_payLinking`, kept out of the persisted record so it can't stick across reloads).

Provider-app only. Regenerated the provider demo (banner-only, +14/−0). `node --check` + boot pass.
Escaping re-verified clean in the same round (no XSS regressions).

## 2026-07-11 — Second audit round (client): two HIGH bugs — summary crash + negative countdown

- **The "Latest summary" screen crashed for real clients.** `renderLatestSummary` did `s.homecare.map(...)`
  unguarded, but a real synced summary has **no** `homecare` field (the provider builds it as
  `{date,title,note,products,guides}`) — so `.map` threw mid-template, `nav()` doesn't try/catch, and the
  screen stayed blank/stuck. It hit **every real client who'd received a summary** (it worked in the demo
  only because Maya's seed summaries include a `homecare` array). Guarded to `(s.homecare||[]).map`.
- **Every unscheduled client saw a large negative countdown.** For a client with no booking the provider
  syncs `nextVisit:'Not scheduled'`; the client did `new Date("Not scheduled <year>")`, which V8 parses as
  **Jan 1** — so `apptISO` became Jan 1 and the home screen showed e.g. **"-189 days away"** / a "-189d"
  tile while the date said "Not scheduled." Now "Not scheduled"/empty leaves `apptISO` empty so the UI
  correctly shows "Not scheduled" (and the old phantom "appointment in 14 days" fallback is gone).
- **Year-boundary appointments got the wrong year.** The year-less `nextVisit` always got the *current*
  year, so from December a "Jan 5" booking landed in the past → negative countdown **and** the push
  reminder's `apptAt` was in the past so it never fired. Now it rolls to next year when the current-year
  guess is well in the past (matching the provider side).

Client-app only → re-embedded into `api/client-page.js` (byte-identical) and demo regenerated
(banner-only). `node --check` + boot pass; the parse logic (Not-scheduled → empty, year rollover) verified
by simulation.

## 2026-07-11 — Second audit round (provider): delete-cleanup, vendor indices, booking-date parse

- **Deleting a client now cleans up their data.** `deleteClient` removed only the chart record and
  orphaned every id-keyed side store — `capturedPhotos`/`vcSubmissions` (base64 images that bloat
  storage), plus messages/threads, session summaries, product recs, homecare, VC state, note drafts,
  and healing stage — leaving them stranded forever. A new `_cleanupClientData(id)` clears and persists
  all of them (mirroring the existing demo-purge). Financial records (`_payments`) are intentionally
  **kept** — they stay manageable in the Payments hub, and silently destroying tax history on a delete
  would be worse.
- **Deleting a vendor no longer mis-points inventory.** Vendors are referenced by array index
  (`inv[*].vendorIdx`); `deleteVendor` spliced the array without remapping, so every item that pointed
  past the deleted vendor silently shifted to the wrong vendor (and a wrong reorder link). Now the delete
  remaps: `===` deleted → null, `>` deleted → decremented.
- **A sooner confirmed booking now updates the client's next visit.** The booking-confirm handler parsed
  the stored year-less `nextVisit` ("Jul 17") with `new Date()`, which V8 reads as year **2001** — so the
  "only replace with an earlier visit" comparison always failed and a genuinely sooner appointment never
  replaced the shown one. Now it appends the current year (rolling to next year if that lands in the past).

Provider-only; demo regenerated (banner-only). `node --check` + boot pass; vendor-remap and date-parse
logic verified by simulation.

## 2026-07-11 — API hardening from the security audit (low-severity, no user impact)

The API security audit found **no** high-severity authorization gaps or SQL injection (every provider
endpoint derives the provider id from the signed token, client endpoints are link-token gated, and all
`sql` interpolations are bound params). Two clean, no-downside hardening items applied:

- **Reminder cron fails closed.** `/api/cron-reminders` previously allowed the request when `CRON_SECRET`
  was unset — a public endpoint that scans the prefs table + queries push subs per call. It now refuses
  unless the secret is set (Vercel Cron auto-sends it, and it *is* set in this project, so no behavior
  change here — this just closes the misconfiguration hole).
- **Client-prefs PUT size cap.** Added a 512 KB payload guard (mirroring `/api/client-submit`) so a link-
  token holder can't bloat `client_prefs` with a multi-megabyte blob.

Config/API only; both files `node --check` clean. (Two other low-severity items — login returns distinct
"no account" vs "wrong password" messages, and signup returns 409 on an existing email — are account-
existence enumeration vectors, but fixing them trades away helpful login/signup UX, so they're flagged for
your call rather than changed unilaterally.)

## 2026-07-11 — Client fixes from the audit: real clients no longer see the demo's data

`_applyRealClientData` (which switches from demo mode to a real client's data) wiped *most* of the
sample "Maya" seed data but missed several fields, so real clients were shown another person's info.

- **Skin profile** (`profileFields`/`profileTitle`), **shop goals** (`shopGoals`), **recommendation
  history** (`recLog`), **saved products** (`saved`), the **demo guide** (`resources`), the **demo
  Amazon-store link** (`amazonStore`), and the hardcoded **"Esthetician"** label (`kind`) are now all
  reset for real clients. Highest-impact finding — a real client could see another client's skin type,
  allergies, and product history. (Real guides use a different field, `pendingGuides`, so nothing real
  is lost; the profession label falls back to the provider's name + credentials.)
- **Pre-visit check-in now uses the provider's real questions.** The client only read the check-in
  config from a localStorage key written by the same-browser preview bridge, so every real client got
  Maya's esthetician questions regardless of provider. The config already rides in the blob
  (`d.checkinCfg`); `_applyRealClientData` now persists it where the check-in reads it.
- **Saved products persist** (were memory-only, lost on reload) — now saved to localStorage + synced.
- **Data-deletion is honest** — `_doDeleteClientData` used to wipe the device and report success even
  if the server call failed. Now it deletes server-side **first** and only wipes + confirms on success;
  on failure it keeps everything and tells the client to retry.

Client-app only → re-embedded into `api/client-page.js` (byte-identical) and demo regenerated
(banner-only). `node --check` + boot + render smoke-test pass.

## 2026-07-11 — Provider fixes from a parallel audit: false confirmations + delivery/persistence gaps

A multi-agent audit surfaced several real provider-side bugs; all verified and fixed here.

**False confirmations (said "done" but did nothing / didn't reach the client):**
- **Partner intro** (`sendPartnerIntro`) toasted "Intro sent to <client> — <partner> Cc'd" but the function was empty — no email, no message, nothing. Now it opens the provider's own email composer pre-filled with the edited message, the client as recipient, and the partner **Cc'd** (the natural form for a referral intro), and says so honestly. Requires picking a client first.
- **Virtual-consult review** (`sendVcReview`) — a paid ($25) service — set a "reviewed" flag and toasted "Review sent" but **discarded the notes textarea** and delivered nothing. Now it reads the notes, requires them, and actually sends the review to the client (real clients via `/api/provider-message`, demo via the bridge), reflecting it in the provider's thread; the screen only navigates away on a successful send.
- **Rebook invite** (`_sendRebookInvite`) pushed the message to the local thread + a blob sync, but chat messages ride `/api/provider-message` (read via `/api/client-messages`), NOT the client-data blob — so a real client never got the nudge. Now it sends for real.

**Delivery gaps (edits that didn't reach the client):**
- **Business info & hours** (`saveBizInfo`) — studio name and booking **availability** live only in each client's synced blob, but the save never triggered a sync, so real clients kept stale hours. Added a roster sync.
- **Product-rec reorder** (`moveClientProd`) and the **"why I recommend this" note** (`_setRecReason`) now schedule a per-client sync, so re-ordering or editing a rec reason reaches the client (matching the summary-view editors fixed earlier).

**Silent data loss:**
- **Document renewal-reminder toggle** (`toggleDocReminder`) called `persistWorkspace()` — the wrong store, which doesn't include `docs` — so the toggle was lost on reload. Now calls `saveDocs()`.
- **Chat unread flag** (`renderChat`) now persists when a thread is opened, so it doesn't show unread again after reload.

The same audit **verified clean**: the payments/Square flow, session-summary send/delete/rename, check-in config (reaches clients via KV), branding, bundles, and every client/vendor/inventory/payment/protocol mutator persists correctly. Provider-only; demo regenerated (banner-only). `node --check` + boot pass.

## 2026-07-11 — Fix: in-place routine & product-rec edits now sync to real clients

Continuing the delivery sweep from the course fix: several ways of *editing* a real client's
recommendations after the first send updated the chart locally but never pushed to the client's
synced data blob, so the client kept seeing the old version until some unrelated action happened to
trigger a sync. The initial "send" actions synced (`_persistAndSyncClient`); the in-place edits used
`persistWorkspace()` / `persistClientRecs()` which persist locally but don't sync.

- **Homecare / routine edits** (`addHomecareTag` / `removeHomecareTag`, via `_pushRoutine`) — adding or
  removing a routine step now schedules a per-client sync so the client's aftercare updates on their
  device, not just Maya's same-browser preview.
- **Resending a routine** (`resendRoutine`) — now pushes to the real client's blob (it only did a
  local persist + bridge post before), matching `confirmSendRoutine`.
- **Product-recommendation edits** — `addClientProd` / `removeClientProd` and the summary/profile rec
  editor (`_rerenderRecs`, covering `addSummaryProd` / `removeSummaryProd` / `toggleProdInOffice`) now
  schedule a per-client sync, so adding/removing a recommended product reaches the client.
- All use the existing **debounced** `_scheduleSpecificClientSync(id)` (2.5s), so a rapid burst of edits
  collapses into one network call; the demo client is excluded (it uses the live same-browser bridge).
- Provider-only change; demo regenerated (banner-only). `node --check` + boot pass. This closes the
  "edits don't reach the client" gap that the course fix surfaced — verified that every send *and* edit
  path for routines, products, guides, forms, and courses now syncs.

## 2026-07-11 — Fix: sending a course to a real client now actually delivers it

- **"Send course" was a false confirmation for real clients.** `confirmSendCourse` posted over the
  same-browser bridge only for the demo client and, for a real client, just showed *Sent "<course>" to
  <name>* while delivering **nothing** — no assignment, no sync, so the client never received it (the
  same class as the old virtual-consult-invite and booking bugs). Now a real client actually gets the
  course: it's assigned to their `pendingGuides` as a "📚 Course" resource card (with the course's
  external link when set) and `saveClients()` triggers the client-data sync, so it reaches their app on
  their own device — matching how forms, guides, and products already deliver. `_findGuide` was extended
  to resolve a course id into a guide-shaped card so the blob assembly picks it up; existing guides are
  unchanged and an unknown id still drops cleanly (verified by simulation). Uninvited clients now get an
  honest "invite them first, then this course will be waiting" message instead of a false "Sent".
- Audited the rest of the send-to-client flows and confirmed they already reach real clients: **forms**
  and **guides** deliver via `_assignFormsToClient`/`pendingGuides` + `saveClients()` (which itself
  schedules the client sync — line 1100), and **products**/**bundles** call `_persistAndSyncClient`
  explicitly. Course was the only broken one.
- Provider-only change; demo regenerated (banner-only). `node --check` + boot pass; course resolution +
  blob assembly verified by simulation.

## 2026-07-11 — Hardcoded/fake-data sweep: honest virtual-consult metrics + audit

Swept both apps for hardcoded/fake values that could show to *real* users (vs. intentional demo
data). The app is mostly honest — most hardcoded values are correctly gated to the demo clients or
sit in unreachable/shelved code — but one reachable leak was found and fixed.

- **Fixed — virtual-consult "AI detected" metrics on the client chart.** On a real client's chart,
  the consult card labeled the built-in **sample** metrics ("Hydration 62%, Barrier 71%…") as
  **"AI detected"** whenever they'd submitted — i.e. fake numbers presented as if measured from that
  client's photos. It now computes the **real** metrics from the submission's on-device measures
  (`_metricsFromMeasures`) when present, and honestly labels the block **"Sample analysis"** (matching
  the app's own `_vcSourceLabel` wording) when there's nothing measured — so real clients see real
  values and never fake ones.
- **Audited and confirmed OK (no change needed):** provider home tiles (real counts), Beta stats
  (loads from the API), Reports (computed from real payments), the automation header (fixed earlier),
  contact info (fixed earlier). The demo-only skin metrics carry a "Provider estimates / not clinical
  measurements" disclaimer and only render for the demo client; a real client's demo data
  (sessions, timeline, aftercare, ratings) is fully wiped by `_applyRealClientData`.
- **Left intentionally alone (unreachable):** the Studio/staff dashboard + staff-invite (a `display:none`
  toggle with a dev note to re-enable when team features return) and the older `renderVirtual`/`switchVTab`
  consult mockup (superseded by the live `renderVcInbox`, reachable only from its own back button). Both
  are shelved dead code; fixing/removing would work against the intent to revive or would risk the live
  path — flagged rather than touched.
- Provider-only change; demo regenerated (banner-only). `node --check` + boot pass.

## 2026-07-11 — Fix: client form-fill feedback was invisible (proToast doesn't exist on the client)

- **Filling out a form gave the client no feedback.** The client-app form-fill flow called `proToast(...)`
  — but that function only exists in the *provider* app; the client's toast function is `showToast`. Every
  call was guarded with `if(typeof proToast==='function')`, so it silently did nothing. The practical bug:
  a client who missed a **required field** (or typed a bad email/phone) tapped **Submit** and saw
  *nothing happen* — no "please fill in the required fields", no "Sending…", and no "couldn't send" on a
  failed submit. Repointed all five calls to `showToast`, so the form now actually tells the client what's
  going on. (This is the same class of bug as the earlier check-in reset issue — a client stuck with no
  explanation.)
- **Toasts no longer show a green ✓ on an error.** `showToast` gained an optional status flag; errors and
  validation messages ("Couldn't send", "That email doesn't look right", "Please pick a date", etc.) now
  show a warning icon instead of a reassuring checkmark, and long messages wrap instead of overflowing.
  Swept the whole client app and flagged every clear error/validation toast.
- Also confirmed while sweeping: **homecare** check-off persists + syncs (with streaks), the **guide/consult
  and signing** flows already handle success/failure correctly, and **Square sync** is a live OAuth
  integration best tested on your real account.
- Client-app only → `slickchart-client.html` re-embedded into `api/client-page.js` (byte-identical) and the
  client demo regenerated (banner-only). `node --check` + boot pass; a render smoke-test exercises the form,
  check-in, profile, and privacy screens without error.

## 2026-07-11 — App-store readiness: privacy policy, in-app data deletion, camera capture

Prep for wrapping the client app for the App Store / Play Store.

- **Privacy policy page.** New self-contained `privacy.html`, served at **`/privacy`** (Vercel cleanUrls),
  covering what the app handles, how it's used, sharing, notifications, security, deletion, children, and
  contact — light/dark aware, no external assets. Linked from the client app's new Privacy & Data screen.
  *(Owner TODO: replace the `REPLACE_ME@example.com` contact and confirm the business name before store
  submission — flagged in an HTML comment.)*
- **In-app account/data deletion (Apple 5.1.1(v) requirement).** The client's Settings → **Privacy & data**
  screen (the old dead "Privacy" row is now a real destination) explains what's stored, links the policy,
  and offers **Delete my data**. It calls a new token-authed `/api/client-delete` that removes the data the
  client controls (their saved prefs + every device push subscription), unsubscribes this device from push,
  wipes local storage, and logs a `delete-request` event. The provider's app surfaces that as a "Data
  deletion request" notification so they can remove the clinical record per their own retention duties (the
  record and history are intentionally not force-deleted client-side, since the provider is the custodian).
- **Native camera capture.** Photo pickers gained a `capture` path: the chat composer now has a dedicated
  **Take a photo** button (opens the camera directly) alongside **Choose from library**. In a wrapped build
  these invoke the native camera/library picker; on mobile web they already do.
- **Push notifications** (built earlier) are the fourth native-ready piece and are already live once the
  VAPID env vars are set.
- Touches both apps + new `privacy.html` + `/api/client-delete` → `slickchart-client.html` re-embedded into
  `api/client-page.js` (byte-identical) and both demos regenerated (banner-only). `node --check` + boot pass
  for all surfaces.

## 2026-07-11 — Feature: client profile photo (replaces the "coming soon" alert; shows on the chart)

- **Clients can set a profile photo, and it shows up on their chart in your app.** The camera button
  on the client's profile used to just `alert('Photo upload coming soon!')` — a dead end. It now lets
  them pick a photo (downscaled to 400px), shows it as their profile avatar, saves it locally, and
  syncs it to you over the existing `contact` channel. Your `av()` avatar renderer now shows a client's
  uploaded photo wherever their avatar appears (client list, chat, chart) and falls back to the initials
  tile otherwise — genuinely useful for putting a face to a name. Delivery is honest: "Photo updated ✓"
  only when it reached you, otherwise "Saved here — couldn't reach your provider."
- Guardrails: only real `data:image/…` values are accepted on both ends (bogus/`javascript:` sources are
  ignored), an unchanged photo is a no-op, and the provider gets a "Contact info updated · photo" note.
- Also confirmed while sweeping that **Export/CSV** (services, sales, clients, sales-tax, full JSON
  backup — all real downloads, with CSV-formula-injection escaping), **Reports**, **Inventory**
  (quantity +/- persists, edit/add/delete, reorder links), and **Vendors** are all working correctly —
  no changes needed there.
- Touches both apps → `slickchart-client.html` re-embedded into `api/client-page.js` (byte-identical)
  and both demos regenerated (banner-only). `node --check` + boot pass; avatar rendering and the
  contact-handler photo logic verified by simulation.

## 2026-07-11 — Reminder cron back to hourly (Vercel Pro) for per-timezone morning timing

- Switched the cron schedule to **hourly** (`0 * * * *`) now that the project is on Vercel Pro.
  The reminder logic is already cadence-agnostic (fires once per client per morning, deduped via
  `reminder_log`), so hourly means every client is reminded at the first run inside **their own**
  local 7–11am window — timezone-correct for all clients, not just Pacific. No logic change needed;
  only `vercel.json`.

## 2026-07-11 — Reminder cron: once-daily schedule + cadence-agnostic timing

- **Cron schedule set to once daily** (`0 15 * * *` = 8:00am Pacific) so it runs on Vercel's
  Hobby plan (hourly needs Pro). Real-time message pushes are unaffected — they don't use the cron.
- **Reminder timing reworked to suit a daily run.** The appointment reminder previously used a
  tight "23–25 hours away" window that only made sense for an hourly cron — a once-daily run would
  miss almost every appointment. Reminders are now **calendar-day based within the client's local
  morning (7–11am):** a **day-before** reminder when the appointment is on tomorrow's local date, a
  **morning-of** reminder when it's today, and the **homecare nudge** each morning. This fires
  correctly whether the cron runs once daily (schedule it in the morning window) or hourly (fires
  once, deduped) — verified by simulation across timezones, the morning window, and the toggles.
- Because the single daily run is timed to Pacific 8am, it lands in the 7–11am local window for
  clients roughly Pacific-through-Eastern; a provider whose clients span wider timezones (or who's on
  Pro) can switch back to hourly (`0 * * * *`) in `vercel.json` for per-timezone-correct morning timing.
- Server/config only (`api/cron-reminders.js`, `vercel.json`); no app change.

## 2026-07-11 — Feature: real push notifications (web-push + service worker + reminder cron)

Notifications now reach a client's phone **even when the app is closed** — the piece that was
missing (there was no background push infrastructure, so scheduled/away notifications couldn't fire).
Requires a one-time Vercel setup (see `PUSH-SETUP.md`); if the env vars aren't set, everything else
keeps working and pushes are simply skipped.

- **Web Push foundation.** Added a VAPID-based push sender (`lib/push.js`, `web-push` dependency), a
  `push` + `notificationclick` handler in the service worker (`sw.js`), a token-authed
  `/api/push-subscribe` endpoint, and a `push_subscriptions` table. The client subscribes this device
  when a client turns notifications on (and re-registers on each visit), embedding the public VAPID key.
- **New-message push (works on any plan, no cron).** `/api/provider-message` now sends a web-push to
  the client's devices when the provider messages them — so a reply lands on their phone with the app
  closed. It respects the client's "New message" toggle (read from their synced prefs), shows the
  provider's name + a preview ("📷 Photo" for image-only), and tapping it opens the chat. Best-effort:
  a push failure never affects the provider's send.
- **Scheduled reminders (cron).** A new hourly `vercel.json` cron hits `/api/cron-reminders`, which
  sends a **24-hour appointment reminder**, a **morning-of reminder (~8am local)**, and a **daily
  homecare nudge (~8am local)** — each gated on that client's individual toggle + quiet hours, and
  claimed atomically (`reminder_log`) so it fires at most once. Reminders are driven by data the
  client's app computes and syncs (its resolved IANA timezone + the already-parsed appointment
  timestamp), so the server never guess-parses a display string; timezone placement, the 23–25h
  window, quiet-hours wrap, and once-only sending were all verified by simulation.
- **Setup + safety.** `PUSH-SETUP.md` documents the env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `CRON_SECRET`, optional `VAPID_SUBJECT`), the Hobby-vs-Pro cron-frequency note, the iOS "Add to Home
  Screen" requirement, and how to test. Added a `.gitignore` (node_modules etc.); the VAPID public key
  is committed (safe), the private key is not. `node --check` passes for all new modules; the VAPID
  keypair is accepted by `web-push`, and `lib/push.js` is a safe no-op when unconfigured.
- Client-app change → `slickchart-client.html` re-embedded into `api/client-page.js` (byte-identical)
  and the client demo regenerated (banner-only).

## 2026-07-11 — Tweak: check-in comfort default drops "Heated blanket"

- The pre-visit check-in **comfort defaults** now include only the **Heated mattress pad** (with its Off/Low/Med/High levels); the **Heated blanket** control is no longer seeded by default, since not every provider has one. Applied in three places so it's consistent: the base default, the "+ Restore section" re-seed, and a one-time migration (matching the existing drinks/blankets migration) that drops the heated blanket for any provider still on the exact old default without touching anyone who customized their heat controls. Providers who do have a heated blanket can re-add it any time via "+ Add heated control." Provider-only; demo regenerated (banner-only).

## 2026-07-11 — Fix: clients now actually get notified of a new message

- **A new message from the provider now fires the "New message" notification it promised.** When a real client's app polled and found a new provider message while they weren't looking at the thread, it bumped the unread badge but never called `pushNotify` — so the client got no banner and no system notification, even though the notification type, the "New message" toggle, and the gating logic all existed. Now the incoming-message path fires a `messagereply` notification (title names the provider, body shows the message preview or "📷 Photo", tapping opens the thread). It goes through `pushNotify`, so it still respects the client's "New message" toggle and quiet hours, and it's recorded in the notification center. Multiple new messages in one poll collapse into a single "N new messages" notification instead of a burst.
- Client-app change → `slickchart-client.html` re-embedded into `api/client-page.js` (verified byte-identical) and the client demo regenerated (banner-only). `node --check` + boot pass; the title/preview logic (single/multi, text vs photo-only) verified by simulation.
- **Known limitation flagged, not silently faked:** the two *scheduled* reminder toggles ("Day-of reminder" and "Daily homecare nudge") can't fire yet — there's no background push infrastructure (no service worker push handler, VAPID keys, or cron), so nothing can wake the app at 8 AM. Left untouched pending a decision on building real scheduled push; the event-driven notifications (appointment confirmations, summaries, and now messages) all work.

## 2026-07-11 — Feature: provider→client chat photos (two-way photo messaging complete)

- **The provider can now send photos to a client in chat and they actually arrive.** This closes the other half of chat photos: `sendMsg` was text-only over the wire and honestly told the provider "photos aren't delivered to the client app yet." Now the (already downscaled) photos ride in the `provider-message` call, `/api/provider-message` stores them on the `provider_message` event, and the client renders them in the thread — on first load (via `/api/client-messages`, which already returns `photos`) and on the live 20-second poll (the incremental append now carries `imgs` too). So an annotated aftercare photo or a product pic reaches the client wherever they are.
- **Symmetric guardrails with the client→provider direction.** Photo-or-text is now valid (`/api/provider-message` no longer requires text); non-image/malformed sources are filtered server-side; a message is capped at **6 photos** on both the client-side send and the server; and an oversized payload is rejected with a 413 (mirroring `/api/client-submit`). The existing send reliability is preserved — `_sendProviderMessageToClient` still retries once and, only after that fails, tells the provider the message didn't reach the client. Text-only callers (client invites, booking replies) are unaffected by the new `photos` argument.
- Touches both apps + `/api/provider-message` → `slickchart-client.html` re-embedded into `api/client-page.js` (verified byte-identical) and both demos regenerated (banner-only). `node --check` + boot pass for all four surfaces; API validation (photo-only accept, bad-source filter, count cap) and the delivery guard (incl. legacy 2-arg callers) verified by simulation.

## 2026-07-11 — Feature: client chat photos reach the provider (thread + photo chart)

- **Clients can now send photos in chat and the provider actually gets them.** Previously the message sync only carried text, so a photo a client attached in chat showed in their own thread but never reached the provider (round 48 called this out honestly). Now the downscaled photos ride in the `message` submission payload, and the provider's `syncClientEvents` message handler renders them in the conversation **and files them onto the client's photo chart** (`capturedPhotos`, tagged `source:'message'`) so a photo of a reaction or concern isn't stranded in a chat bubble. The thread preview and notification are photo-aware ("📷 Photo" / "📷 2 photos" when there's no caption).
- **Photos survive the client's own reload too.** The client's chat history is rebuilt from the server on load; `/api/client-messages` now returns each message's `photos`, and the client thread map carries them through, so a client's sent photo stays visible for them after a refresh (not just until they navigate away).
- **Guardrails.** A single message is capped at **6 photos** (client-side, with a "send the rest in another message" note) to stay under the server's payload limit; invalid/non-image sources are filtered server-side before they're shown or filed; and photo messages get the same live delivery status + retry as text (round 48). The **provider→client** direction still can't send photos and remains honestly labelled — this change is client→provider only.
- Touches both apps + `/api/client-messages` → `slickchart-client.html` re-embedded into `api/client-page.js` (verified byte-identical) and both demos regenerated (banner-only). `node --check` + boot pass for all four surfaces; the provider photo-handling (valid-src filter, preview text, photo-chart filing) verified by simulation.

## 2026-07-11 — Functional QA sweep, round 48 (client messages show real delivery status)

- **A client's message now shows whether it actually reached the provider.** `sendClientMsg` was fire-and-forget — it pushed the bubble, called `_clientSubmit('message',…)`, and threw the result away, so a message that failed to send looked identical to one that landed. Now a real text message shows **"Sending…"** under the bubble, then either the timestamp (delivered) or a tappable **"Not delivered · Tap to retry"** if it didn't make it — mirroring the honesty the provider side already had in the other direction. Retry (`retryClientMsg`) re-sends the same message and updates the status. The delivery helper also copes with `_clientSubmit`'s per-kind in-flight guard (a quick second message) by re-attempting a few times before giving up, so a rapid double-send isn't falsely marked failed.
- **Photos are called out honestly.** The message sync only carries text today, so a client attaching a photo used to see it in their own thread with no hint the provider wouldn't. Now, exactly like the provider→client direction, sending a photo to a real provider shows "photos aren't shared with <provider> yet — send a message instead" (or "Message sent — photos aren't shared yet" when there's text too), instead of implying the photo was delivered. (Text delivery is unaffected.)
- Client-app change → `slickchart-client.html` re-embedded into `api/client-page.js` (verified byte-identical) and the client demo regenerated (banner-only). `node --check` + boot pass; the send / fail / retry / duplicate-then-succeed state machine verified by simulation.

## 2026-07-11 — Functional QA sweep, round 47 (client trust: no lost consults, real contact info)

- **Virtual-consult submissions can no longer be silently lost.** `submitVirtualConsult` recorded the consult, set the "already submitted" marker, cleared the invite, and showed "Consult submitted ✨" *before* the async send finished — so if the send failed (even after `_clientSubmit`'s own retry) the whole consult vanished with no way to try again, and the provider never got it. Now nothing is consumed until the send actually succeeds: on success we record it, mark the invite done, notify, and go to the journey; on failure we keep the invite and the uploaded photos in place and show "Couldn't send your consult — please check your connection and try again," so the client can just tap submit again. (Fixes the regression introduced in round 45's invite-nonce change.) Demo/same-browser preview still finalizes immediately since there's no server round-trip.
- **Contact info is the client's real info, and editing it actually reaches the provider.** The profile's Email/Phone rows were hardcoded to the demo's `maya@email.com` / `(510) 442-8801` for *every* real client, and tapping edit → Save showed "Profile updated" while saving nothing (no persistence, no sync). Now the provider's on-file email/phone ride along in the client's synced data blob (`_assembleClientData`), the client app reads them into `client.email`/`client.phone` and shows them (or "Not set"), and a client's edit is **validated, saved locally, and synced to the provider** via a new `contact` submission kind. The provider processes that event in `syncClientEvents` — updating the chart and posting a "Contact info updated" notification — so future invites and reminders use the corrected address. The toast is now honest: "Sent to <provider>" only when it landed, "Saved here — couldn't reach your provider, will retry" otherwise. A pending local edit is preserved across reloads (and stops being overlaid once the provider's synced value catches up, so a later provider-side change isn't hidden).
- **Privacy row no longer looks tappable.** The Settings → Privacy row rendered with a pointer cursor and a chevron but had no destination (dead tap). It's now a plain, non-interactive row with an honest one-line explanation of how the client's info is shared, matching the contact-info note.
- Touches both apps + the submit API → `slickchart-client.html` re-embedded into `api/client-page.js` (verified byte-identical), `api/client-submit.js` accepts the new `contact` kind, and all demos regenerated (banner-only). `node --check` + boot pass for all four surfaces; the new validation, pending-overlay, and event-diff logic verified by simulation.

## 2026-07-11 — Functional QA sweep, round 46 (provider reliability + honest confirmations)

- **"Feedback sent" is now honest.** `_sendBetaFeedback` fire-and-forgot the `/api/feedback` POST and *always* showed "Thanks! Your feedback was sent 💛" — even if the request 500'd or the network dropped, so a provider thought feedback landed when it didn't. Now the success toast (and clearing the form) only happens when the response is actually `ok`; otherwise it shows "Couldn't send just now — please try again." and keeps what they typed.
- **Delete guards on payments and services.** Removing a payment (`_payDelete`, from both the list row and the detail sheet) and deleting a named service from the service menu (`_svcDel`) went straight through on a single tap with no undo — easy to mis-tap and silently lose a record. Both now route through the existing `confirmModal`, and a removed payment shows a "Payment removed" toast. Deleting a blank/unnamed service row stays instant (no friction while editing).
- **Automation stats are real, not hardcoded.** The Messages → Automations header showed a fixed "91 sent / 85% open / 34 replies" regardless of the actual automations — it never moved even if a provider deleted every automation. It now computes **Total sent**, **Open rate**, and **Active** from the real `autos` data (`—` open rate when nothing's been sent), so it reflects the provider's actual automations.
- **New-client email is validated.** `ncSaveBasic` accepted any string as an email, so a typo'd address saved silently and later invites/sync would just fail. It now rejects an obviously malformed email ("check it or leave it blank") before creating the client; blank stays allowed.
- **Two smaller trust fixes.** Saving a custom note format (`saveNoteTemplate`) now confirms with a "Note format saved" toast instead of navigating away with no feedback. And the inbox poll (`syncClientEvents`) now bails quietly on a non-`ok` response (e.g. a stale token returning an HTML error page) instead of throwing inside `r.json()` — the next poll just retries.
- Provider-only change (no client edits, no re-embed). `node --check` + boot pass; provider demo regenerated (banner-only).

## 2026-07-11 — Functional QA sweep, round 45 (provider→client sync gaps: virtual-consult invites + booking responses)

- **Virtual-consult invites now reach real clients.** `inviteVirtualConsult` only posted over `SlickBridge` (same-browser preview) and pushed the invite message to the *local* store, so a client on their own device never saw the invite — the whole VC feature was effectively preview-only. Now the invite is carried in the client's synced data blob (`_assembleClientData` includes a `vcInvite` while `vcInvites[id]` is invited-and-not-yet-submitted), the invite message is delivered through `/api/provider-message`, and inviting triggers an immediate per-client sync. The client app reads `d.vcInvite` in `_applyRealClientData`, shows the invite, and notifies once. To avoid the invite re-appearing in the window between the client submitting and the provider's app processing it, the invite carries an `invitedAt` nonce and the client records which invite it submitted (same technique as the pending-form fix) — a genuinely new re-invite (new nonce) still shows again. Verified the full lifecycle by simulation: shows + notifies once → no duplicate on re-poll → suppressed after submit → re-invite shows again.
- **Booking confirm / decline / suggest now notify real clients.** Those handlers only posted over `SlickBridge`, so a cross-device client got no word on their request. Each now also sends a plain-language message through `/api/provider-message` (via a small `_notifyBookingClient` helper that no-ops for demo/unsynced clients): a confirmation, a "that slot filled up, please pick another" for declines, and the proposed alternative time for suggestions.
- Touches both apps → `slickchart-client.html` re-embedded into `api/client-page.js` (byte-identical) and both demos regenerated (banner-only). `node --check` + boot pass for all four surfaces.

## 2026-07-11 — Functional QA sweep, round 44 (treatment protocols now persist)

- **Created/edited/deleted treatment protocols no longer vanish on reload.** `protocols` is a `const` array that `applyProfessionConfig()` resets from the profession defaults on every boot, and `saveProtocol`/`deleteProtocol` only mutated it in memory — protocols aren't in the on-`nav` persistence sweep and there was no `persistProtocols`, so any protocol a provider built silently reverted to the defaults on their next visit (the exact same class of bug as the old course builder).
- **Fix** mirrors how courses/service-menu keep custom edits: added `persistProtocols` / `loadProtocols` / a `sc_protocols_custom` flag; `saveProtocol` and `deleteProtocol` now mark-custom + persist; and `applyProfessionConfig` restores the saved set over the profession defaults once the provider has customized (mutating the const array in place). A fresh account with no custom protocols still gets the correct profession defaults.
- Verified by simulation against the real script: a custom protocol survives a reconfigure/reload, the custom set isn't clobbered by defaults, and a non-custom account still resets to profession defaults. `node --check` + boot pass; provider-only, demo regenerated (banner-only).

## 2026-07-11 — Functional QA sweep, round 43 (course builder + silent data-loss fixes)

- **Course builder now actually builds courses (main fix)**: `renderCourseBuilder`'s "Save" / "Save course" buttons only called `nav('learn')` — the form inputs had no ids and were never read, so creating or editing a course did nothing (the course was silently discarded). Rebuilt it into a real editor: `saveCourse(id)` reads the title / description / price / status / module rows, creates a new course or updates the existing one, and persists (`persistCourses`). Module names are now stored (`moduleNames`) and shown on the course detail instead of placeholder text. **Added the requested PDF/resource import**: a "Learning materials" section lets a provider attach PDFs/images (stored as data URLs, images downscaled, 8 MB cap — same pattern as the docs vault) and paste resource links; attachments render on the course detail and open in a viewer. Verified by simulation against the real script: create → captured + persisted, edit → updates in place, empty-title rejected, and both the builder and detail render without error.
- **Client detail edits were lost on reload**: `saveVitals` and `saveTreatment` mutated `CL[id]` but never called `saveClients()`, and the client store isn't covered by the on-`nav` persistence sweep — so editing a client's vitals or treatment looked saved (toast + re-render) but reverted on reload. Added `saveClients()` to both.
- **Removing a profession didn't stick**: on the profession-settings screen, "Add to workspace" persisted (via `applyProfessions`) but "Remove" only filtered the in-memory list and navigated — and `selectedProfessions` isn't in the sweep — so a removed profession reappeared on reload. The Remove path now `saveProfessions()` + re-runs `applyProfessionConfig()`.
- **Notification toggles**: now persist immediately (`persistNotifSettings()` inline), matching the AI-settings toggle, instead of relying on the next navigation to flush them.
- Noted for a focused follow-up (same class as the old course bug, needs boot-sequence scaffolding): **treatment protocols** (`saveProtocol`/`deleteProtocol`) are never written to storage and are reset from profession defaults on every boot, so created/edited/deleted protocols vanish on reload. Also flagged: the **staff invite/remove** screens are non-functional mockups (invite never saves; remove is a literal no-op).
- Provider-only change. `node --check` + boot pass; provider demo regenerated (banner-only). This was informed by a parallel audit that also confirmed a global on-`nav` persistence sweep rescues most other stores — so the fixes above are the genuine silent-data-loss gaps, not a broad rewrite.

## 2026-07-10 — Bug sweep, round 42 (reset-email rate limit + Subresource Integrity on the icon CDN)

- **Password-reset rate limit**: `/api/request-reset` sent a reset email on every request with no throttle, so a known provider address could be bombed with reset emails (nuisance + email cost). Added a cap of **5 requests per address per hour**, reusing the existing `login_attempts` table via a **namespaced key** (`reset:<email>`) so it never collides with — or triggers — a real login lockout. The no-enumeration behavior is preserved: over the limit still returns `200`, and every request (matching address or not) is recorded so the response is identical whether the email exists or not.
- **Subresource Integrity (SRI) on the Tabler icon font**: the apps load `tabler-icons.min.css` from jsDelivr with no integrity check, so a CDN compromise could serve tampered CSS. Added `integrity="sha384-…"` + `crossorigin="anonymous"` to the `<link>` in every surface that loads it (`slickchart.html`, `slickchart-client.html`, `slickchart-client-walkthrough.html`, both demos, and the `api/client-page.js` embed). The version is pinned (`@3.19.0`) and jsDelivr serves the npm file byte-for-byte, so the hash is stable; if the CDN ever served a different file the browser would simply refuse it. Computed the hash from the exact npm package (`npm pack @tabler/icons-webfont@3.19.0`) and **verified in headless Chromium** that the browser accepts the stylesheet under that hash (loads + applies, no integrity error).
- Client-app change → `slickchart-client.html` re-embedded into `api/client-page.js` (byte-identical, SRI present), and both demos regenerated (banner-only diffs). All apps parse (`node --check`) and boot clean.

## 2026-07-10 — Bug sweep, round 41 (abuse/DoS guards on the client-submit boundary)

- **Finding**: `/api/client-submit` (the token-authed endpoint where a client submits forms, check-ins, bookings, messages, and virtual-consult photos) stored `body.payload` **verbatim with no size cap and no rate limit**. A client with a valid link token — or anyone who got hold of one — could flood their provider's event feed / database with rapid-fire submissions, or persist oversized blobs. Severity is modest (it requires a valid token and the blast radius is that one provider), but it's an unguarded write path, so worth hardening.
- **Added two boundary guards**:
  - **Payload size guard** — reject any submission whose serialized payload exceeds 4 MB (`413`). A legitimate check-in with several downscaled (1000px) data-URL photos stays well under this; the cap only stops abuse/bugs from bloating the DB. (Vercel already caps the raw request at ~4.5 MB; this makes the app-level boundary explicit.)
  - **Per-token burst limiter** — best-effort in-memory throttle (default 20 submissions per token per minute, `SUBMIT_BURST_LIMIT` env-overridable, `429` when exceeded), reusing the same proven pattern as `/api/ai`. It's per function instance and fails open, which is the right trade-off for a low-severity, token-scoped endpoint.
- Verified with `node --check` and a simulation: a legitimate ~400 KB photo submission passes the size check, a 5 MB blob is rejected, and the burst limiter allows 20 then blocks the next 10 of 30 rapid calls.
- Server/API-only change (`api/client-submit.js`) — no app HTML/JS change, so the demos and `api/client-page.js` embed are untouched.

## 2026-07-10 — Bug sweep, round 40 (security response headers)

- **New angle**: the app was serving **no security response headers at all** (no CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or HSTS). Added a baseline set via `vercel.json` `headers` (applies to every route — static files, the API, and the `/client/:token` client app), which backstops the whole XSS surface and closes clickjacking/MIME-sniffing/referrer-leak gaps without touching any app code.
- **Headers added** (to `/(.*)`):
  - `Content-Security-Policy: object-src 'none'; base-uri 'self'; frame-ancestors 'self'` — a deliberately *partial* CSP. The app is inline-everything (inline `<script>`, `onclick=`, `style=`), so a strict `script-src` would break it; instead this blocks plugin-based XSS (`object-src`), base-tag hijacking (`base-uri`), and cross-origin framing (`frame-ancestors`) with **no** `default-src`, so scripts/styles/images/fonts/fetch are unaffected.
  - `X-Frame-Options: SAMEORIGIN` + the CSP `frame-ancestors 'self'` — clickjacking protection. Set to SAMEORIGIN (not DENY) on purpose: the landing page (`index.html`) iframes `/slickchart-provider-demo` and `/slickchart-client-walkthrough` same-origin, and DENY would have broken that.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (keeps the client link token in the URL from leaking down cross-origin referrers — e.g. when a client taps an affiliate "Buy" link), and `Strict-Transport-Security: max-age=31536000` (enforce HTTPS; no `includeSubDomains`/`preload`, kept conservative).
- **Verified in a real browser** (headless Chromium): served all three pages locally with these exact headers and confirmed **zero CSP violations**, full render of the provider app (1.4 MB) and client app, and that the landing page's same-origin demo **iframe still loads** — so the frame policy protects against clickjacking without breaking the legitimate embed. Confirmed the apps use no `<base>`/`<object>`/`<embed>` and make no cross-origin client-side fetches, so nothing the CSP restricts is in use.
- Config-only change (`vercel.json`) — no app HTML/JS change, so the demos and `api/client-page.js` embed are untouched.

## 2026-07-10 — Bug sweep, round 39 (defense-in-depth: escape the attribute-breakout class)

- **Scope**: a focused defense-in-depth pass on the render spots that matter most for "a future change can't regress into XSS" — the ones where an interpolated value sits **inside an HTML attribute** and could *break out of it*, which is strictly worse than a text-node. Like round 38, these are **provider-authored** values (self-XSS today), so this is hardening, not a live vulnerability — but the attribute-breakout class is exactly where a future data-flow change would turn a self-XSS into a real one, so it's the right place to spend the effort.
- **Fixed**: escaped every raw color interpolated into a `style="…"` attribute (`background:${…}` / `color:${…}` across the write-note editor, session/timeline sections, comparison columns, doc/bundle/notification chips, metric cards, and the automation icon color — `s.color`, `p.col`, `b.col`, `d.col`, `n.col`, `m.col`, `t.col`, `sec.color`, `left.col`, `right.col`, `s.col`, `a.col`), and the provider free-text fields in the **edit-partner form** that were interpolated raw into `value="…"` inputs (`p.name`, `p.email`, `p.phone`, `p.website`, `p.discount`, `p.type`). All routed through `_fileEsc`, whose `"`-escaping is what actually prevents an attribute breakout. Verified: a crafted color or field value can no longer close the attribute (`&quot;`), while legitimate colors (`#4ec49a`, `var(--accent)`) and text render unchanged.
- **Deliberately left as-is**: the remaining raw interpolations are provider/config values in plain **text-node** contexts (product/guide/bundle emoji + names on the provider's own screens). Those are pure self-XSS with no breakout path, and mass-escaping ~40 more hardcoded-config spots on a 1.4 MB live file is more regression risk than security value. Noting the decision rather than chasing it.
- Provider-only round — no client-app change, so `api/client-page.js` did not need re-embedding. Both apps parse (`node --check`) and boot clean; the provider demo differs from the app only by the injected banner.

## 2026-07-10 — Bug sweep, round 38 (defense-in-depth: finish affiliate-product escaping)

- **Honest scope note**: this round found no new cross-boundary XSS (rounds 32–37 covered the client→provider, Square→provider, reflected-URL, and access-control surfaces). It's a **defense-in-depth / consistency pass**, completing the affiliate-product escaping that round 31 set out to finish. These are **provider-authored fields** — a provider would have to put a payload in their *own* product's name/icon/brand to hit their *own* provider-app view (self-XSS), so this is not a live vulnerability. It's worth doing because the same product fields flow to the client app, and a uniform "every render escapes" rule is what keeps a future change from silently becoming a real hole.
- **Fixed**: eight affiliate-product render sites still interpolated product fields raw — the session-summary preview, the recommend-to-client picker, the messages-tab retail strip, the shop-bundle detail, the send-bundle sheet, the add-bundle product list, and the guide-attached product lists. Routed `a.icon` / `a.name` / `a.brand` / `a.commission` through `_fileEsc` at every one (they're all text-node renders, and the values are provider-set product strings — mostly emoji + short text, so escaping is a no-op for legitimate values and only neutralizes an injected string). Verified: a malicious product name collapses to inert text under `_fileEsc`, while legit emoji icons and names (`✨`, `C E Ferulic`) render unchanged.
- Also confirmed clean this round: the Square appointment-booking modal (service names, team-member names/ids, and client name/email prefill all `_fileEsc`'d or attribute-escaped; staff come from the provider's own Square account anyway), and the session room (no client-submitted intake field renders raw).
- Provider-only round — no client-app change, so `api/client-page.js` did not need re-embedding. Both apps parse (`node --check`) and boot clean; the provider demo differs from the app only by the injected banner.

## 2026-07-10 — Fix: submitted pre-visit forms reappearing as to-do on reload (same class as the check-in fix)

- **Proactive follow-up to the check-in fix**: audited the rest of the client flow for the same "completion state lost on reload" pattern. Found one genuine sibling in **pre-visit forms** (and cleared virtual-consult submit + rebook as safe — VC is persisted to localStorage and cleared on submit; rebook is fire-and-forget).
- **Bug**: when a client submits a pre-visit form it's removed from `pendingForms` locally, but on reload `p.pendingForms` is replaced by the **server's** copy — and the server only drops the form once the *provider's* app has ingested the submission event and re-synced (every 45s while open; longer if closed). In that window, reopening the link showed the just-completed form back on the to-do list, inviting a duplicate submission — the same multi-step "reopen the link between steps" workflow that surfaced the check-in bug.
- **Fix**: remember which specific form instances the client submitted (`provider|formId → the form's assignedAt`) in server-synced prefs + a localStorage cache, and filter those out of every provider's `pendingForms` on load — in `_applyRealClientData()` (boot + the 30s poll) and `_loadClientPrefsFromServer()` (cross-device). Keyed on `assignedAt`, so a form the provider deliberately **re-sends** gets a new `assignedAt` and correctly reappears (verified in simulation: submit → hidden on reload; re-send → shows again; a different un-submitted form is never hidden; and it works on a fresh device via server prefs).
- Client-app change → `slickchart-client.html` re-embedded into `api/client-page.js` (verified byte-identical), `slickchart-client-demo.html` regenerated (banner-only diff). No provider-app change. Both apps parse (`node --check`) and boot clean.

## 2026-07-10 — Fix: pre-visit check-in reset when a client reopened their link

- **Bug (reported by a provider)**: a client completed her pre-visit check-in, then reopened her personal link to fill out the still-pending intake form — and the app showed the check-in as **not done again**, re-prompting her to redo a check-in she'd already submitted.
- **Cause**: the client app tracked check-in completion only as an in-memory `checkinDone` flag on the provider object. It was **never persisted** — `_collectClientPrefs()` didn't include it and `_loadClientPrefsFromServer()` didn't restore it — and every page load rebuilds the provider object from scratch in `_applyRealClientData()`, wiping the flag. So any fresh load of the link forgot the check-in was done. (The pending-form banner only shows while a form is still outstanding, which is exactly why she hit it: the check-in was done but the intake wasn't.)
- **Fix**: persist check-in completion per provider, keyed to the appointment date, in the client's server-synced prefs (`client-prefs`) plus a localStorage cache. On load it's restored in both `_applyRealClientData()` (instant, same-device) and `_loadClientPrefsFromServer()` (cross-device). Crucially it's **keyed to the appointment date**, so a completed check-in is remembered for *that* visit but a new or rescheduled appointment still resets to prompt a fresh check-in. Simulated the full flow: submit → reopen same device → reopen new device (server prefs) all show "complete"; a new appointment date correctly resets to "not done".
- Client-app change → `slickchart-client.html` re-embedded into `api/client-page.js` (verified byte-identical), and `slickchart-client-demo.html` regenerated (banner-only diff). No provider-app change. Both apps parse (`node --check`) and boot clean (provider `applyProfessionConfig`/`renderHome` OK; client `renderHome` OK).

## 2026-07-09 — Bug sweep, round 37 (access-control review + AI-proxy hardening)

- **Focus shift**: the cross-boundary XSS/escaping surface swept in rounds 32–36 came up **clean** this round (verified reflected-XSS via URL params in both apps, the static landing page, the client-writable API endpoints, the client message thread, `av()`/initials, the session room, and the AI Brief — all safe). So this round pivoted to an **access-control / IDOR review of the whole `/api` layer**.
- **Access control — no IDOR / data-leak / account-takeover found.** Verified: provider data (`store`, `clients`) is scoped to the HMAC-verified session token; client data (`client-data`, `client-messages`, `client-prefs`) is scoped to the 128-bit unguessable link token; cross-tenant writes (`provider-message`) explicitly confirm the client belongs to the provider; owner endpoints (`feedback`, `admin-stats`) gate on `OWNER_EMAIL`, fail closed, and return aggregate counts only; session revoke is provider-scoped; the calendar ICS feed is signed-token-scoped and escapes ICS control chars; Square access tokens are encrypted at rest, scoped per verified provider, and fail closed; reset tokens are single-use with a 1-hour expiry and no email enumeration; login is rate-limited; and every query is parameterized.
- **AI proxy cost-abuse hardening (`/api/ai`)**: the endpoint intentionally serves anonymous callers (so AI works in demo/pre-login) using the server-side Anthropic key, but it forwarded any caller-supplied `body.model` verbatim — letting someone point the key at a pricier model. Added a **model allow-list**: requests are restricted to the models the app actually uses (`claude-sonnet-4-6`, plus `claude-haiku-4-5-20251001`); anything else quietly falls back to the default, so a legitimate call is never broken while an arbitrary/expensive model request is neutralized. Verified with `node --check` and a coercion simulation (legit models pass; opus/garbage → default).
- **Noted, not changed (design tradeoffs for the owner to decide)**: `/api/ai` still has no default daily cap unless `AI_DAILY_LIMIT` is set in the environment; `login` distinguishes "no account" from "wrong password" (minor user-enumeration); `reset` doesn't revoke existing sessions after a password change; `request-reset` isn't rate-limited.
- Server/API-only change — no change to `slickchart.html` / `slickchart-client.html`, so the demos and `api/client-page.js` embed are untouched. `node --check` passes on `api/ai.js`.

## 2026-07-09 — Bug sweep, round 36

- **Square appointments preview — customer name rendered raw (main find — cross-boundary XSS)**: `_sqLoadAppointments()` (the "upcoming appointments" list on the Square integration screen) fetches `/api/square/appointments` and rendered each `a.customerName` **raw** in the card. Unlike the sibling `_loadSquareAppts()` — which escapes the name at ingest (`client: esc(a.customerName)`) — and the customer-import list `_sqLoadCustomers()` (which uses `_fileEsc`), this preview applied no escaping at all. A person booking through the provider's Square online booking with a display name like `<img src=x onerror=…>` would run JS **in the provider's session** when the provider opened that Square screen — with access to the provider's cloud token and every client's chart. Escaped it (and the adjacent status text, defense-in-depth) with `_fileEsc`, restoring the app's established posture of escaping Square-supplied names at every render. Simulated the payload: the injection fires when raw and collapses to inert text under `_fileEsc`, while a legitimate customer name still renders.
- Verified clean this round: the other Square-derived surfaces — the customer-import list (`_sqLoadCustomers` — name/email/phone via `_fileEsc`, initials are single characters), the primary appointment feed (`_loadSquareAppts` pre-escapes `customerName` into `squareAppts[].client`, and the calendar/today/week cards re-escape via `_fileEsc`), Square-synced payments (`_paySyncSquare` stores `sv.client` as `clientName`, which the payments list/detail render with `<`-escaping in a text-node context; method/status via `_fileEsc`), and the service catalog / invoice line-item editor (names `<`-escaped in text nodes and `"`-escaped in `value=""` inputs; these come from the provider's own Square catalog). Also re-confirmed the **AI Brief** is hardened (section `icon` validated against `/^ti-[a-z0-9-]+$/`, `color` against a hex/`var()`/named-color allow-list, `label`/`detail` via `_fileEsc`).
- Provider-only round — no client-app change, so `api/client-page.js` did not need re-embedding. Both apps parse (`node --check`) and boot clean (provider: `applyProfessionConfig: OK` / `renderHome: OK`; client: `renderHome: OK`), and both demos differ from their app only by the injected demo banner.

## 2026-07-09 — Bug sweep, round 35

- **Virtual-consult date stamp on the provider review screen (main find — cross-boundary XSS)**: `vc_submit` events store the client-supplied `payload.date` verbatim (`syncClientEvents` sets `vcSubmissions[cid].date = payload.date||'Today'`; `/api/client-submit` logs the payload as-is). `renderVirtualClient` then built `vcStamp = (sub&&sub.date)||<today>` and interpolated it **raw** in two places: the little date badge overlaid on **every** submitted/reference photo (`realImg`), and the "Submitted {date} · …" line in the client header. A client submitting a virtual consult directly against `/api/client-submit` with `payload.date` like `<img src=x onerror=…>` would run JS **in the provider's session** the moment the provider opened that consult — with access to the provider's cloud token and every client's chart. Escaped `vcStamp` once at its definition with `_fileEsc`, which covers both render sites. The sibling VC-inbox card already escaped its date via `_fileEsc`, and `sub.goals` / photo labels were escaped in R33 — this stamp was the one remaining raw spot on the VC path. Simulated the payload end-to-end: the injection fires when rendered raw and collapses to inert text under `_fileEsc`, while a legitimate date still renders.
- Verified clean this round: the rest of the `vc_submit` ingest (`measures` are numerically clamped or mapped to fixed label strings before `_metricCardsHTML`, which itself `_fileEsc`'s every card field; `sub.title` is `_fileEsc`'d at its inbox render and only the profession-config `v.title` reaches the header via `textContent`; `kind` is used only to pick a profile branch, never rendered); the submitted-form action buttons (`sf.formId` in the `resendFormToClient`/`shareFormLink` onclicks is gated behind `tmpl = formTmpls[sf.formId]`, so a crafted id yields no template and the buttons never render); check-in-derived data on the chart (`flaggedContra` form/date/items and `lastCheckin` dateLabel/treatment/flagged all `_fileEsc`'d); the provider chat/thread (message text via `_fileEsc`, images via `_imgSrc`, and client message ingest hard-codes `imgs:[]`); and the client app (the "My Records" export pre-escapes `studio`/`prov` via `_myEsc` and hex-validates the accent color; `showToast` writes via `textContent`; `profileTitle` is a fixed per-profession literal, never server-synced; every provider-synced free-text field renders through `_txt`).
- Provider-only round — no client-app change, so `api/client-page.js` did not need re-embedding. Both apps parse (`node --check`) and boot clean (provider: `applyProfessionConfig: OK` / `renderHome: OK`; client: `renderHome: OK`), and both demos differ from their app only by the injected demo banner.

## 2026-07-09 — Bug sweep, round 34

- **Submitted-form title/date on the provider chart (main find — cross-boundary XSS)**: when a client submits a form, the provider stores the client-supplied `payload.title` and `payload.date` verbatim (`/api/client-submit` logs the payload as-is; `syncClientEvents` copies `title=payload.title||'Form'` and `date=payload.date||'Today'` straight onto `c.submittedForms`). Two on-screen render sites interpolated these **raw**: the submitted-form detail sheet (`renderSubform` — `${sf.title}`, `${sf.date}`) and the "Forms & documents" list row (`renderClientForms` — `${sf.title}`, `${sf.date}`). A client POSTing a `form` submission directly against `/api/client-submit` with a title like `<img src=x onerror=…>` would run JS **in the provider's session** the moment the provider opened that form — with access to the provider's cloud token and every client's chart. Escaped all four with `_fileEsc` (the print/export path already escaped both via `_fileEsc`, so this brought the on-screen views in line).
- **Signed-consent name in the same list (same class)**: the "Signed consents" section of `renderClientForms` rendered each entry (`${n}`) raw. Those entries come from `c.signedForms`, which is appended from the client-submitted `payload.title` whenever a submission is marked signed (`syncClientEvents`), so it is the same client-controlled string — escaped with `_fileEsc` (the export path already did).
- **Check-in detail "Message {first}" button (same class)**: `renderCheckinDetail` derives `first = ci.client.split(' ')[0]` from the client-submitted check-in `payload.client` and, while every other use of that name was escaped, the "Message {first}" button label rendered it **raw**. A crafted check-in with a space-free client name (`<img/src=x/onerror=…>`) would execute in the provider's session when they opened the check-in. Wrapped it in `_fileEsc`. Simulated all three finds end-to-end: the injection strings fire when rendered raw and collapse to inert text under `_fileEsc`, while legitimate names/titles still render.
- Verified clean this round: the client form-fill screen (`renderFillForm` — provider-authored question labels/options via `_txt`, single-select values via `_jsAttr`, photos via `_imgSrc`), the booking-request card (`b.client`/`treatment`/`note`/`time` via `_fileEsc`; the booking id in every `onclick` is the server-assigned `ev_…` token, not client input), booking/check-in/message notification bodies (rendered via `_fileEsc` in `renderNotifFeed`), the virtual-consult review screen (`sub.goals`, photo labels, terminology, concerns all `_fileEsc`'d; R33 covered the labels), the invoice/service-menu preview (provider-authored, text-node `<`-escaped), and the owner "What's New" announcements (owner-authored, text-node `<`-escaped).
- Provider-only round — no client-app change, so `api/client-page.js` did not need re-embedding. Both apps parse (`node --check`) and boot clean (provider: `applyProfessionConfig: OK` / `renderHome: OK`; client: `renderHome: OK`), and both demos differ from their app only by the injected demo banner.

## 2026-07-09 — Bug sweep, round 33

- **Virtual-consult photo labels (main find — cross-boundary XSS)**: the "From virtual consult" block on the client-detail screen rendered each photo's `label` **raw** (`${o.label}`). Those labels come from `vcSubmissions[cid].photos`, populated straight from the client-submitted `payload.photos` (and the cloud-load path) with no validation — so a client submitting a consult with a photo label like `<img src=x onerror=…>` would run JS in the provider's session when the provider opened that client. Escaped both occurrences with `_fileEsc` (the `renderVirtualClient` review screen already escaped its labels, and photo `src` already went through `_imgSrc` from round 32 — this was the one remaining raw spot).
- **Ingest-time hardening for client-submitted photos (defense-in-depth)**: added `_validImgSrc` / `_sanVcPhotos` at the `syncClientEvents` boundary. Check-in photo arrays are now filtered to real image sources (`data:image/`, `http(s):`, `blob:`) at ingest, and virtual-consult photo/reference entries are normalized to `{label:String, src:validated}`, on both the event-sync and cloud-load paths. Every render site already guards with `_imgSrc`, but this means a crafted photo string never even persists onto the chart, `capturedPhotos`, or `vcSubmissions`. Simulated the payloads to confirm injection strings are dropped while legitimate photos pass through.
- **Client app — appointment date/time**: `client.nextDate` / `client.nextTime` are provider-synced fields that were rendered raw in six HTML spots (they sat right next to `_txt(client.treatment)`, which was escaped). Wrapped them in `_txt` for consistent provider→client escaping. The one remaining raw use is inside a notification-payload object that is `_txt`'d when the notification is rendered, so it was left as-is to avoid double-escaping. Client app re-embedded into `api/client-page.js`.
- **Docs vault open-fallback**: the catch-branch that opens a document in a new window built `document.write('<iframe src="'+d.file+'">')` by raw concatenation. Documents are provider-uploaded (self-XSS only), but routed `d.file` through `_docSrc` to match the escaped render path.
- Verified clean: provider chat/thread list (message text via `_fileEsc`, images via `_imgSrc`, previews/times escaped), virtual-consult metrics/terminology (numeric measures + `_fileEsc`'d strings on both on-device and server-analysis paths), the client app's provider-message/summary/announcement renders (uniform `_txt`), and CSV export (formula-injection guard neutralizes leading `= + - @`). Noted but not changed: automation `icon`/`col` and check-in `music` emoji/label are provider-authored (self-XSS only).
- Both apps parse (`node --check`) and boot clean (provider: `applyProfessionConfig: OK` / `renderHome: OK`).

## 2026-07-09 — Bug sweep, round 32

- **Client-submitted photos rendered as raw `<img src>` (main find — genuine cross-boundary XSS)**: check-in reference photos and submitted-form photo answers arrive from the client app (`payload.photos` / photo-type form answers via `syncClientEvents`) and were stored **without format validation**, then rendered as `<img src="${src}">` with no escaping and no `_imgSrc` guard. A client crafting a check-in/form submission directly against `/api/clients` (bypassing the client UI) with a photo string like `x" onerror="…"` would execute arbitrary JS **in the provider's session** when the provider opened the check-in — with access to the provider's cloud token and every client's chart. Fixed by routing all three photo render sites through `_imgSrc` (check-in detail, submitted-form sheet, and the `openPhoto` lightbox), and `_jsAttr`-escaping the one `onclick="openPhoto('…')"` that also inlined the raw src. `_imgSrc` only passes `data:image/…`, `http(s):`, and `blob:` URLs (url-attr-escaped), so a breakout string collapses to an empty `src` while legitimate photos still load. Simulated the payload end-to-end to confirm the breakout and the fix.
- **Photo-upload thumbnail** (same class, provider-local): the pending-photo thumbnail rendered `<img src="${url}">` raw. The `url` is a canvas-generated `data:` URL from the provider's own file picker, so this was self-only, not cross-boundary — hardened through `_imgSrc` anyway so every image render site now goes through one guard.
- **Session-room alerts** (session/active-treatment flow): the allergies, medications, and medical-conditions rows in the live session room escaped only `<` (`.replace(/</g,'&lt;')`). Text-node context, so `<`-only already blocks tag injection — but these fields can be populated from client-submitted intake answers, so routed them through the central `_fileEsc` for consistency and full `&`/`"`/`>` coverage.
- **Payments (checkout/detail screens)**: `p.method` was interpolated with no escaping in both the payments list row and the payment-detail sheet, and `p.status` was raw in the detail sheet plus the list-row status-chip fallback. All current sources are controlled (a fixed `<select>` for manual logging, hardcoded `'Square'`/`'Invoice'` literals, and a whitelisted status mapping on Square sync), so this was **not** live-exploitable — escaped them via `_fileEsc` as defense-in-depth so the only fully-unescaped interpolations in the payment views are gone.
- Verified clean: the **AI Brief** screen (AI/JSON output rendered via `_fileEsc`, with `icon`/`color` validated against strict allow-list regexes), the **calendar / appointment detail** (Square customer names escaped at ingest *and* re-escaped at render via `_fileEsc`; appointment `tx`/`dur` are hardcoded/numeric), and the **settings → notification-preferences** screen (renders only hardcoded section/label/sub literals and fixed toggle keys — no user-controlled data). The client app already routes every `<img src>` through `_imgSrc`, so nothing to change there.
- Provider-only round — no client-app change, so `api/client-page.js` did not need re-embedding. Both apps parse (`node --check`) and boot clean (provider: `applyProfessionConfig: OK` / `renderHome: OK`).

## 2026-07-08 — Bug sweep, round 31

- **Docs / vault detail** (main find): escaped provider-entered document fields that were rendering raw — the document number, issued date, and expiration date in the detail info table, plus the status label (`d.lbl`, which is derived from the provider's expiration text) in both the detail view and the vault list row. The edit/upload forms were already escaping their value attributes.
- **Affiliate products (continued from round 29)**: escaped product icon/name/brand in two more sheets — the buy-options preview and the recommend-to-client sheet. That should be the last of the affiliate-product render sites.
- **Treatment protocols**: escaped the provider-authored protocol name and step titles in the session-room protocol picker (protocols are user-created; their icon/color are fixed).
- **Partner intro**: escaped partner name/type in the send-intro header card (the plain-text intro-message builder was already escaped by its caller before hitting the textarea). Partner icon/color/discount are fixed on creation.
- **Client invite / first-visit package**: escaped the client first name in the invite-sheet header. The rest of the flow is solid — private links are built with `encodeURIComponent` on the token, names/emails escaped, and share messages are plain-text copied (never innerHTML'd).
- Verified clean: vendor directory, profession-config (built-in profession definitions, not user input), and the invite-clients bulk list.

## 2026-07-08 — Bug sweep, round 30

- **Courses / Learn** (main find): courses are provider-authored (title, description, price, module names) and were rendered unescaped in the course-list card, the course-detail view, and the course-builder inputs. Escaped title/status/duration/price/description across all three (value attrs via `_jsAttr`, textarea + display via `_fileEsc`).
- **Inventory**: escaped the provider-entered item icon (a free-text emoji field) in the stock-card display. Rest of inventory was already clean — item name/brand via `_fileEsc`, reorder link via `_urlAttr(_safeUrl(...))`, vendor phone via `_urlAttr` in a `tel:` link, and add/edit inputs escape their value attributes.
- Verified clean: provider messages/threads (names, previews, times escaped; automation name/trigger escaped; automation icon/color are fixed literals), the rebooking flow (built entirely from generated dates + fixed labels; no client free-text renders), and the toast/notification system (`proToast` sets the message via `textContent`, `providerSystemNotify` uses the native Notification API — so all the "Removed X"/"Sent to Y" toasts carrying user data are safe by construction). `confirmModal` escapes its title + body centrally.

## 2026-07-08 — Bug sweep, round 29

- **Affiliate / recommended-product rendering** (the round's main theme): product `icon` / `name` / `brand` come from `affiliateLinks`, which includes CSV-imported and Square-synced items — i.e. external data — and were being rendered unescaped in several places. Escaped them in the routine builder's product selector, the client-detail recommendation cards, the "what your client sees" summary preview (also escaped the treatment, homecare chips, next-appointment line, and `_jsAttr`'d the buy-button id), the provider shop/affiliate card, and two other product rows. Buy-link URLs were already going through `_urlAttr(_safeUrl(...))`.
- **Client-detail**: escaped the client first-name in a recommendation-note `placeholder` attribute. Rest of the screen verified clean (name/treatment/contact/vitals/flagged-intake all escaped; the printable client-file builder escapes throughout).
- **Note-template editor**: escaped the custom section label in its `value` attribute (provider-authored free text).
- Verified clean: the form-builder question row (label/options were already escaped from round 22), and the **onboarding flow** — it's fixed instructional content and the profession list is built-in definitions, not user input; it echoes no provider-entered text unescaped.

## 2026-07-08 — Bug sweep, round 28

- **Client home screen** (biggest batch, client-facing): escaped a run of provider-authored text that was rendering raw — the brand tagline, the latest session-summary note, the next-appointment date/treatment/time, the check-in prompt date, and the client's own first name. This is the client's most-viewed screen, so it was the highest-value find of the round.
- **Branding & CSS-injection hardening** (both apps): the branding live-preview rendered the tagline and welcome message unescaped (textarea + preview) — escaped them. More importantly, brand **colors** (`primary`/`secondary`) flow into `style="…"` in ~11 places and sync to the client, but were only validated at input time. Hardened the single chokepoint `_normHex` to reject non-hex and fall back to a safe default, sanitized `brandColors` at load (`loadBrandColors`), and sanitized the synced accent color in the client's printable summary builder. A manipulated stored/synced color can no longer inject CSS.
- **Provider home/dashboard**: escaped the client first-name in a dismiss-reminder `aria-label` (real client data in an attribute; the visible text was already escaped). Rest of the dashboard verified clean — stat tiles, greetings, and activity are escaped or fixed literals; client ids are generated keys, not free text.
- Verified clean: provider client-list + search (names via `_fileEsc`, search index normalized, printable client-file builder escapes throughout), and the **AI voice-notes feature** — the transcript is escaped at capture-to-storage, rendered into textareas, and the assembled note text is escaped; handled carefully.

This file lives in the repo (`slickchart-vercel/CHANGELOG.md`). Vercel ignores it — it's documentation only. Append a new entry at the top each time you ship.

---

## 2026-07-08 — Profession-specific note defaults

The default treatment-note format now matches the provider's profession, instead of always defaulting to free form:

- Hair stylist → **Color record**
- Brow artist → **Brow record**
- PMU artist → **PMU record** (also fixed: the PMU record template wasn't being loaded for PMU-only providers)
- Lash tech → **Lash record**
- Waxer → **Wax record**
- Esthetician → **Service record** (new structured template: Treatment performed · Products used · Skin observations · Homecare plan · Next visit notes)
- Coach → **BIRP**
- Nutritionist → **Free form**

A format the provider explicitly picks still always wins and persists (`sc_note_fmt`); the profession default only applies when they haven't chosen one. All formats remain available in the picker. Verified each profession resolves to the correct default.

---

## 2026-07-08 — Square live sync + instant paths

Products, services, prices, clients, appointments, and tax rate now update from Square automatically — no reboot, no manual re-push.

- **Catalog auto-sync** (`_autoSyncCatalog`): background refresh of products/services/prices on boot, on opening the Shop / routine builder / treatment picker, on a 60 s poll, and on app refocus. Throttled, in-flight-locked, fingerprint change-detected.
- **Client auto-sync** (`_autoSyncCustomers`): new Square customers are auto-added as clients. Additive only — never overwrites an existing chart or deletes anyone.
- **Service/variation price fix**: change-detection fingerprint now includes per-variation prices and `priceMax`, so tiered service price changes re-sync.
- **Checkout menu freshness**: `_coMenu` cache expires after 60 s and is invalidated on catalog change, so invoice prices stay current.
- **Appointments auto-refresh**: bookings added/moved/canceled in Square surface on their own (60 s poll + refocus, with fingerprint change-detection so the screen only repaints on a real change). Previously manual-only.
- **Tax rate refresh**: 5-min TTL instead of a permanent cache, so a Square tax-rate change comes through without a reboot. Keeps the last known rate on transient errors instead of dropping tax to 0.
- Background poll pauses when the tab is hidden. All syncs fail silently when Square is unreachable.
- Escaped Square customer/product names in the integrations lists.

**Limitation:** pull-based, so "instant" means "within ~60 s or on refocus." True sub-second updates would need Square webhooks (server-side `/api/square`).

## 2026-07-08 — Owner dashboard: subscriber count + subscriptions breakdown

Added a "Subscribed" tile (active subscriptions + % of providers) and a "Subscriptions" breakdown block (active / past due / canceled, plus canceled-in-last-30-days as a churn signal) to the owner admin dashboard. Reads a new `subs` object from `/api/admin-stats`; hidden until the server returns it, so nothing breaks pre-deploy. The counts come straight from the existing `subscriptions` table the Stripe webhook already maintains (status normalized to active/past_due/canceled) — so this is a COUNT query, not new plumbing, and it also covers beta metric #6 (founding-member churn). Dropped the "Square sellers" tile to keep the top grid at 2×2. Backend queries are in BETA_METRICS_BACKEND_GUIDE.md (Step 5).

## 2026-07-08 — Beta metrics: charting activity + recurring pulse survey

Instrumented the two beta metrics the app can honestly measure itself, and wrote a server spec
(BETA_METRICS_SERVER_SPEC.md) for the aggregation the backend must add.

- **Weekly active charting (metric #2).** A privacy-safe, fire-and-forget `_pingChart()` fires when a treatment note is saved (from the shared `_commitWriteNote` path), POSTing to a new `/api/beta-event` — only the authenticated provider, a timestamp, and new-vs-edit; never client data or note content. Also keeps a small per-device weekly counter (`sc_chart_activity`).
- **Recurring pulse survey (metrics #3 + #4).** A bottom-sheet that appears at most once every 7 days, and only after ≥3 charts (so they have a view), asking an overall pulse rating and how charting time compares to their old method (much less / less / same / more). It records each impression (`pulse_shown`) so response rate has a denominator, and posts answers to `/api/feedback` with `kind:'pulse'`. Triggered gently ~1.4s after a chart save.
- **Owner dashboard.** `/api/admin-stats` gains "Charting activity" and "Pulse survey" tiles (weekly active charters + % of providers, charts 7/30d, pulse response rate, avg rating, % who say charting is faster). Renders a "waiting for server" note until the backend returns the new fields, so nothing breaks pre-deploy.
- The two new local keys (`sc_chart_activity`, `sc_pulse`) are excluded from cloud sync (per-device cadence/counters; the authoritative metric is server-aggregated).

Metrics #1 (applications vs. cap), #5 (client retention), and #6 (founding-member churn) are intentionally NOT faked in the app — they live in your application form, Square, and Stripe respectively. The spec explains where each comes from so the beta review pulls from the right sources.

## 2026-07-08 — Team access (shared-login guidance for small teams)

A beta tester wanted her employee (who works under the same Square account) to use the app too. It turns out this already works: SlickChart syncs one account across every signed-in device, so a teammate who signs in with the same login automatically shares the clients, catalog, notes, and Square connection, with changes syncing both ways — no code needed. Rather than build seats, added an honest "Team access" screen (Account → Team access) that explains the setup in three steps and sets expectations: changes sync both ways; it's one shared identity so notes aren't attributed per person and simultaneous edits to the same client are last-write-wins; it's a shared password (change it to revoke access when someone leaves); and "Sign out all other devices" will sign the teammate out too. Shows the account email for easy relay, and warns if the device isn't currently signed in with cloud sync (sharing needs an account). Notes on-screen that proper per-staff logins with per-note attribution are a roadmap item.

## 2026-07-08 — Self-serve data export + account deletion (privacy)

Added two self-serve privacy features under Account → Security & billing → "Privacy & your data," so the app can satisfy data-portability and right-to-erasure expectations (GDPR/CCPA) without manual support requests.

- **Export my data.** The existing Export Center gains an "Everything (full backup)" option that downloads a single JSON file containing every data set the app stores — the same complete `sc_*` set the cloud syncs, minus the three credential/transient keys (auth token, Square key, cross-tab bus). Values are parsed to readable JSON, with a manifest (account email, timestamp, key count). The per-category CSVs (clients, sales, services) remain.
- **Delete my account.** A guarded, full-screen flow that lists exactly what will be erased, offers a one-tap full export first, and requires typing DELETE to enable the button. On confirm it wipes cloud data (a dedicated `/api/delete-account` endpoint if present, otherwise by overwriting the synced store with empty values), clears all local `sc_*` data plus the session Square key, drops the auth session and cached app shell, and reloads to a clean start. Cancel keeps everything.

Added a generic `_downloadFile(name,text,mime)` helper (mirrors `_downloadCSV`'s anchor pattern) for the JSON export, and registered `export-data` / `delete-account` routes. Note: the account-deletion cloud wipe assumes a server `/api/delete-account` route for a hard server-side purge; until that's deployed, the fallback empties the synced store, which removes the data content but may leave empty keys — worth adding the endpoint server-side for a true purge.

## 2026-07-08 — Bug sweep, round 27

- **Square integration / diagnostics** (provider): the Square sync-diagnostic screen rendered location names, statuses, IDs, per-location booking counts, and error strings straight from the Square API response into HTML, unescaped. Location/business names can contain arbitrary characters set in the Square dashboard, so this is external data — added a local escaper to all of it, plus the permission-check labels from the token-status endpoint. Square retail products merged into the shop already render through escaped paths.
- **Notification feed** (provider): the notification onclick handlers interpolated the notif `data`/`id` into single-quoted JS strings; `data` can carry a bridge-supplied client id, so wrapped them in `_jsAttr` for defense-in-depth. Title/body/time were already `_fileEsc`'d, and icon/color are internal literals.
- **Checkout header** (provider): escaped the client email/phone contact line (provider-entered / CSV-importable, was unescaped).
- Verified clean: client shop / buy-links — product fields via `_txt`, all three buy-link URLs (site/store/Amazon) via `_urlAttr(_safeUrl(...))` with `rel="noopener"`, discount codes via `_txt` + `_jsAttr` copy button. CSV import — the preview escapes `<` in its sample list and imported records inherit the systematic `_fileEsc` escaping everywhere they render (and CSV *export* is formula-injection-safe from round 25). Calendar Square appointments were escaped in round 26.

## 2026-07-08 — Bug sweep, round 26

- **Virtual-consult flow** (provider) — the round's main find, two kinds of untrusted input:
  - *AI/server vision-analysis output.* The vision analysis (from the AI model's JSON or a server vision endpoint) returns metric labels/values/notes, a summary, and terminology pairs — all were rendered into HTML unescaped, the same injection class as the round-22 AI-brief. Escaped them in `_metricCardsHTML`, the analysis summary, and the terminology list (both the initial render and the async re-render patch).
  - *Client-submitted VC fields.* Escaped the submission title and date in the VC inbox, the client name/treatment in the invite picker, the submitted goals text (upgraded from `<`-only to full escaping), and the photo label in the review grid (the `alt` was already escaped; the visible caption wasn't). These arrive from the client via the bridge/server — a trust boundary.
- Verified clean: invoice/checkout builder — money is numeric, item name/note inputs escape quotes for their `value=""` attributes and `<` for display, and the invoice preview/PDF fully escape (round 25). Client messaging composer — text via `_txt`, images via `_imgSrc` (which rejects non-image/`javascript:` schemes, so a pasted link is safe), 5000-char cap, posts as data. Calendar/availability — Square, manual, and demo appointments all escape client/treatment/time via `_fileEsc`; quick-add has empty inputs + fixed selects and its free-text client name is escaped on render.

## 2026-07-08 — Bug sweep, round 25

- **Systemic client-field escaping pass** (provider): swept the whole file for the remaining common provider-entered client fields (skin, Fitzpatrick, next/last visit, phone, etc.). Result: they're already escaped everywhere they render as HTML — the only unescaped occurrences are inside AI prompts, which is correct (plain text sent to the model). The earlier client-name and vitals-loop passes had already covered these.
- **Check-in submission flow** (client): escaped the next-appointment date in the step header and the provider-authored hint on yes/no questions. The other question renderers were already escaped; the submission posts as data (provider escapes on its inbox), confirms the server received it before telling a real client "all set," and the confirmation flags are escaped.
- **Welcome / greetings** (client): escaped the client's first name in the Help-screen greeting. The provider's custom welcome-banner message was already escaped via `_txt` with a `_jsAttr`-escaped dismiss key, and the studio-switch toast is safe (rendered via `textContent`, not HTML).
- Verified clean: earnings/reports — on-screen figures are numeric/enum, the printable income-statement/PDF fully escapes every dynamic field via its local `esc`, and **all CSV exports are formula-injection-safe** (`_downloadCSV` prefixes cells starting with `= + - @ tab CR` with an apostrophe and quote-wraps as needed). Photo capture/consent — thumbnails render the image via `_imgSrc` and use only generated/enum data, and consent is a builder-driven form (already hardened). Client prefs sync to the server with localStorage as a cache.

## 2026-07-08 — Server-sync audit + "not backing up" warning

Audited whether everything that should reach the server actually does (prompted by the lost treatment notes). Findings:

- **The sync design is sound.** Every `localStorage.setItem` is wrapped so that any syncable key is also queued to the server (`/api/store`) — local persistence and cloud backup are coupled by construction. All 33 provider data structures (clients, session summaries, note drafts, workspace, automations, check-ins, etc.) are syncable; the only excluded keys are credentials/transient (`sc_token`, `sc_sqkey`, `sc_bus`), which is correct. No data key persists outside the sync net, and nothing bypasses the patched `setItem`. The unload path flushes pending writes via keepalive fetch (pagehide/visibilitychange/beforeunload), and on load the app reconciles any local-only key the server didn't return by pushing it up — so a value that reached only this browser still gets backed up.
- **This re-confirms the yesterday's-notes root cause.** Because sync is coupled to `setItem`, the lost summaries never reached the server for the same reason they never reached localStorage: `persistSessionSummaries()` was never called, so `setItem` never fired. Fixing the persist call (done earlier) fixes both local and cloud persistence at once.
- **Fixed a real gap in *signaling*.** The account screen showed a green "Cloud sync on" banner only when signed in, and nothing otherwise — so a provider running signed-out or with no database saw no indication their data wasn't backing up. Added two amber warning states: "Not backing up — you're signed out" (with a Sign-in button) when a database is available, and "This device only — no cloud backup is configured" when there's no database. This makes a local-only situation visible instead of silent.
- Client app verified: its durable data (check-ins, form submissions, prefs) posts to the server (`/api/client-submit`, `/api/client-prefs`); its localStorage holds only device-local UI state.

## 2026-07-08 — Treatment-note save/send buttons + hairstylist note formats

- **Save-and-send from the note screen.** The write-note screen previously had a single "Save session note" button (save only). It now has two: a primary **"Save and send"** (saves the note, then pushes the session summary to the client's app in one step) and a secondary **"Just save"** (the previous save-only behavior). Refactored the save logic into a shared `_commitWriteNote` core so both paths stay in sync; `_saveAndSendNote` saves then calls `resendSavedSummary` on the just-saved entry.
- **Consistent "Save and send" wording.** The summary-edit screen's send buttons now read "Save and send to app" and "Save and send link" (previously "Save & resend to app" / "Save & send link").
- **Hairstylist note formats.** The hair profession now offers three dedicated formats — **Color record** (formula/developer/timing/result, kept), **Haircut and color record** (new: consultation · cut · formula · processing/toner · result · homecare), and **Haircut record** (new: consultation · cut · styling · homecare · client notes) — plus Free form. Color record remains the default. Replaced the old generic hair "Service record."

## 2026-07-08 — Persistence audit (round 24): 4 more data-loss bugs fixed

Prompted by the session-summary data-loss bug, ran a systematic audit of every in-memory data structure that's meant to survive a reload (~35 persist/load pairs), checking that each mutation site (create / edit / toggle / delete) actually calls its persist function. Found and fixed four more "mutates in memory but never writes to storage" bugs — the same class as the summaries bug:

- **Automations** weren't persisting on create/edit (`saveAuto`), on delete (`_deleteAutomation`), or on the on/off toggle (routed the toggle through a new `_toggleAuto` helper). A provider building automations would see them all session, then lose them — or a deleted one would come back — on reload. Verified with a create→toggle→delete→reload round-trip.
- **Custom note formats** weren't persisting (`saveNoteTemplate`) — a provider's custom SOAP/chart format was lost on reload.
- **Shop bundles** weren't persisting (`saveBundle`) — a newly built product bundle was lost on reload.
- **Submitted check-ins** weren't fully persisting: the `checkin-submitted` bridge handler saved the client's `lastCheckin` (via `saveClients`) but never persisted the `checkins` inbox array, so a submitted check-in vanished from the provider's inbox on reload.
- Also added a `persistWorkspace()` to `resendRoutine`, which re-added products to `clientRecs` but only persisted the sent-routine record.

Verified clean (no fix needed): product recommendations (`confirmSendProduct/Bundle/Routine` → `_persistAndSyncClient` → `persistWorkspace`), the in-summary product editor helpers (committed on Save), affiliate save/delete, docs/vendors/partners/resources save+delete, inventory, photo capture (delete is a save-failure rollback), brand colors (live preview, persisted on the Save button — correct), and imported products (self-restore from a persisted import cache on boot). The End-session, rename, and delete summary paths were already correct.

## 2026-07-08 — Fix: session summaries from treatment notes weren't persisting

**Data-loss bug.** Saving a treatment note added the session summary to the in-memory `sessionSummaries` object (so it showed correctly under Previous sessions all session) but never wrote it to localStorage — `_saveWriteNote` called `saveClients()`, which persists the clients object, not summaries. So summaries created by saving a treatment note survived until the browser cleared memory (e.g. overnight), then vanished. Everything else (forms, client info, product recs, homecare) persisted because their save paths call their own persist functions.

Fix: added the missing `persistSessionSummaries()` call in two paths — `_saveWriteNote` (save treatment note) and the edit-summary path (editing a saved summary's note/homecare/products), which had the same omission. The End-session, rename, and delete paths already persisted correctly. Verified with an end-to-end round-trip simulation: save → clear memory → reload now retains the summary and its note text.

## 2026-07-08 — Bug sweep, round 23

- **Systemic client-name escaping** (provider): swept the whole file and escaped every remaining unescaped `${c.name}` in a display/attribute context — 20 spots across the client-detail, photos, summaries, VC review, intro-picker, invite lists, new-message sheet, and more — plus a handful of `c.treatment`/`c.email`/`c.concerns` display spots. Client names are provider-entered free-text, so this closes a broad category at once. (AI-prompt occurrences, which are plain text sent to the model, were correctly left alone.)
- **Booking-inbox hardening** (provider): bookings arrive from the client via the cross-app bridge, so this is a real trust boundary. Strengthened `_clientNameLink` to fully escape (was only escaping `<`, but it's used in a `title=""` attribute too), and escaped the bridge-supplied date/time/first-name fields in the pending cards, the suggest-time date input, and the recent-decisions list. The client's free-text note was already escaped.
- **Team/staff management** (provider): escaped staff name, title, initials, role, and specialty tags in both the roster and detail views (staff is provider-created and persisted). The invite form is UI-only with fixed role options.
- **Homecare routine screen** (client): escaped the provider's free-text homecare note (now also preserves line breaks), the avoid-list items, step icon, provider initials, and the step aria-label. Step name/time/tip were already escaped.
- **Chat composer** (provider): escaped the client first name in the message-input placeholder attribute. All message rendering, the 5000-char send cap, and the "photos aren't delivered to real clients yet" warning were already in place.
- Verified clean: client notification-settings — all toggle labels are fixed literals, permission UI is computed from a fixed enum, and provider name is escaped via `_txt`.

## 2026-07-08 — Bug sweep, round 22

- **AI-brief generator injection hardening** (provider): the brief's icon and color come from the AI model's JSON response and were interpolated raw into a class and two `style` color values. The model is prompted to return fixed tokens, but a hallucinated or manipulated response could break out of the style attribute — now the icon is restricted to a `ti-…` token pattern and the color to hex / `var(--…)` / a short named set, each with a safe fallback. The label/detail text was already escaped.
- **Forms / consent builder** (provider): escaped provider-authored question labels, multiple-choice/select options, and contraindication items in the sign-on-device and form-preview renderers (`_sdQHTML`, `_formQHTML`). The builder inputs were already attribute-safe; client-side form labels were already escaped or used only in non-rendering (regex/logic) contexts.
- **Rebook / appointment-request** (client): escaped the current next-appointment date/time and the selected time on the confirmation. Notes/treatment/provider were already escaped; dates are generated timezone-safe with an infinite-loop guard.
- **Journey / progress timeline** (client): escaped session dates in the photo dropdowns, session dots, and gallery captions. Observations (date + note text) and photo sources were already escaped via `_txt`/`_imgSrc`; colors/icons are fixed seed data (real mode sends none).
- Verified clean: subscription/billing settings — all values are numeric/enum/generated (status, amount, next-billing-date with the correct Stripe seconds→ms conversion), and card handling is correctly delegated to Stripe's secure portal.

## 2026-07-08 — Bug sweep, round 21

- **Client-detail / chart screen** (provider): escaped the general vitals-field renderer (skin, concerns, allergies, Fitzpatrick, medications — all provider-entered, this was the main gap), plus the treatment name in the suggested-forms panel, the custom form-template name, the last-checkin date/treatment, and the session-summary date/treatment. The chart-edit forms were already escaping their `value=""` inputs.
- **Photo gallery / comparison tool** (provider): escaped the client name, session dates (compare dropdowns + comparison headers), session labels, and improvement tags. Photo `<img>` sources were already going through `_imgSrc`. (Session dates/colors are generated/fixed values, so this is defense-in-depth.)
- **Product-shop / affiliate view** (client): escaped the recommendation-group date in the History tab. The buy-link handling was already exemplary — every affiliate/store URL runs through `_safeUrl` + `_urlAttr`, discount codes via `_txt`/`_jsAttr`.
- **Messaging thread** (client): escaped the provider initials in the header. Message text/images/times were already escaped via `_txt`/`_imgSrc`, the send path caps length at 5000 chars, and incoming provider messages escape at render.
- **Onboarding / profession-select** (provider): escaped the studio/business name and owner-name inputs (free-text, re-rendered from stored values on step navigation). The profession catalog is fixed built-in data.

## 2026-07-08 — Bug sweep, round 20

- **Check-in / intake-config builder** (provider): escaped a cluster of provider-customizable fields that were rendering raw — health-question labels, drink/snack/music option emoji+labels, comfort-section label, heat-control labels, and blanket emoji+labels. This covered both display spans and editable `value=""` inputs (a stored quote could break out of the attribute), plus the nested `confirmModal` onclick that embeds the comfort label in a JS string (`_jsAttr`). The client-facing preview of these was already escaped via `_txt`.
- **Automation / message-scheduler** (provider): the automation name is free-text and was unescaped in its editor `value=""` and list display; escaped both, plus the trigger label (defense-in-depth). Triggers are otherwise a fixed preset select; the message body uses fixed `{variable}` placeholders.
- **Session-summary history** (client): escaped session dates and the note preview in both the detail view and the journey list (the note preview is provider-written and was raw).
- **Virtual-consult submission** (client): escaped the consult title on the history card (photos/labels/dates were already via `_imgSrc`/`_txt`; the client's free-text goals are escaped on the provider's display).
- **Client-import review** (provider): escaped the imported customer's email/phone line in the Square review (name was already escaped; CSV preview escapes parsed cells; import IDs sanitized and dedup'd).

## 2026-07-08 — Bug sweep, round 19

- Escaped a batch of provider-authored / client-submitted fields that were rendering unescaped:
  - **Session room**: client vitals (skin type, Fitzpatrick, allergies), the flagged-contraindication item text (client-submitted via intake), the protocol name, and the step-toggle aria-label.
  - **Referral-partner directory**: name/type/discount in the list card, and name/type/discount/description/email/phone/website in the detail view (contact-button actions already scheme-sanitized via `_openExternal` + `_jsAttr`).
  - **Business info**: the website display text.
- Verified clean: aftercare timeline (safe progress math, all provider content escaped via `_txt`), client notification-center (title/body escaped, ids safe, badge caps at 99+), room protocol progress math (no divide-by-zero, per-client state isolated so protocols don't bleed between clients).

## 2026-07-08 — Bug sweep, round 18

- **Cross-provider homecare check-state leak fixed** (client): `_eng.steps` is a flat per-client daily map, so if a client had two providers whose routines shared a step key (e.g. both "cleanse"), completing it for one made it appear checked for the other after switching. Now the restore-on-switch is gated by `_eng.stepsProvider`, so today's checkmarks only apply to the provider they were recorded against. Verified: no leak, and each provider's own checks still restore.
- **Magic-link recap escaping** (client): escaped the provider-written session note (the richest authored field, was unescaped — now also preserves line breaks), plus routine step names, step time/tip, aftercare phase labels, the session date, and the client's first name.
- Verified clean: charge-card flow (double-tap guard, amount re-validation, `_coCharging` cleared in finally — critical money-movement code), calendar/week view (timezone-safe date math, appointment fields escaped, colors from a fixed palette), vendor directory (names/notes escaped, phone/email via `_urlAttr`, website/portal via `_safeUrl`+`_urlAttr`, onclick via `_jsAttr`, delete index-safe).

## 2026-07-08 — Bug sweep, round 17

- **Provider-switcher CSS-injection fix** (client): brand colors received via the bridge were used raw inside the switcher's `style` attribute (linear-gradient/box-shadow). A malformed value could break out of the attribute — now normalized to a valid 6-digit hex with a fallback, matching `applyClientTheme`.
- Escaped provider initials/first/kind/nextDate in the provider switcher; the suggested-time rebook status pill (date + time, injected via innerHTML); and client name/nextVisit in the protocol-apply picker.
- Verified clean: earnings/reports math (revenue allocation guarded, avg divide-by-zero safe, refunded/canceled excluded; tips flow through Square's total via a request flag, no in-app tip math), protocol editor (`_protoMins` free-text-safe, inputs escaped, name/steps validated), export center (all CSV exports route through the formula-injection-guarded `_downloadCSV`).

## 2026-07-08 — Bug sweep, round 16

- Escaped `workspace.name` in the 3 places it's displayed (studio header + staff-invite screens) — provider-set, self-XSS surface.
- Verified clean: notification/announcement feed (`notifCard` escapes all fields; announcement post validates + escapes on render), message-photo display (`_imgSrc` whitelists data:image/http(s)/blob and rejects `javascript:`/`data:text/html`), branding/theme color picker (input-validated *and* output-validated — only valid hex reaches CSS, with default fallbacks), routine streak (local-date day boundaries, increments once/day, `_engStreakLive` gates stale streaks). Team/staff invite is a UI-only demo (no persistence).

## 2026-07-08 — Bug sweeps, rounds 11–15

Systematic 5-area hardening passes. Highlights:

- **Messaging unread badge** (client): now clears when the thread is opened, instead of lingering until the next data poll.
- **Booking/calendar**: escaped client·treatment on request cards; confirmed `confirmBooking` is idempotent.
- **Welcome/install** (client): escaped the provider welcome message and its dismiss key (onclick JS-string breakout).
- **Referral-partner intro**: escaped name/email and the intro-message textarea (a `</textarea>` in a name could break out).
- **Client list / profile**: escaped client name/treatment and profile field values (provider-entered chart data).
- Verified clean: tax/money math, `.ics` calendar generation, CSV export (formula-injection guarded), photo compression, AI-brief generation (falls back to a chart-based brief; race-condition guarded), inventory, payments/refund exclusion from revenue & A/R, routine reminders, series tracking.
- Defensive guards added: skip Square catalog products with no id; guard product import against nameless rows.

## Earlier

Rounds 1–10 of bug sweeps and prior feature work (Square catalog auto-sync groundwork, phantom-toast fix, saved-summary tabs, keyboard-blocking-search fix, and the broader escaping/money/date hardening across both apps). See commit history.
