# SlickChart — Changelog

Newest entries at the top. One entry per deploy. Dates are US-formatted.

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
