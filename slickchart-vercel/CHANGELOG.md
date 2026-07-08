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
