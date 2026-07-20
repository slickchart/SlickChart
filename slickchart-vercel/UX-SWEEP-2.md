# SlickChart — UX Sweep #2 (post-1.0)

A fresh full-app audit of the provider app (`slickchart.html`) and client app (`slickchart-client.html`)
across five lenses: navigation/IA, core provider workflows, the client experience, cross-app
design/polish, and AI features. Findings are merged, de-duplicated, and grouped by priority.
Line references are to the two files above.

Legend: **[H]** high impact · **[M]** medium · **[L]** low.

---

## Tier A — Ship-quality fixes (affect the LIVE iOS build or the most-used controls). Do first.

1. **[H] Provider header collides with the notch.** No `safe-area-inset-top` anywhere; the topbar
   still renders a fake "9:41" status bar (`slickchart.html:106`) under a black-translucent real
   status bar. On the installed iOS build the real clock overlays the fake one and controls hit the
   Dynamic Island. Fix: delete the fake `.sb` bar, add `padding-top:calc(10px + env(safe-area-inset-top))`
   to `.topbar` (the client already does this correctly).
2. **[H] Client primary buttons fail contrast.** `.btnp`, `.pill.active`, `.bub-me` use `#fff` on the
   tan `--accent` (~2.2:1) — the most-tapped client CTA is hard to read in sunlight. The provider does
   it right with dark `--accent-ink`. Fix: swap those `color:#fff` → `var(--accent-ink)` in the client.
3. **[H] Modal backdrop leaves a seam.** `.modal-bg{bottom:60px}` (`slickchart.html:92`) doesn't match
   the real nav height on notched phones, so a bright strip shows above the nav under every modal.
   Fix: anchor to `bottom:0` / compute from real nav height incl. safe-area.
4. **[H] Contraindication flag cleared on one unconfirmed tap.** "Mark reviewed" (`:4025`→`dismissFlag`)
   permanently clears the allergy/med alert and pushes to server immediately — no undo. Safety risk.
   Fix: undo toast or light confirm before the irreversible push.
5. **[H] Long intake form validation is a vanishing toast.** `_submitFillForm` (`client:3067`) toasts
   "fill required fields" with no scroll/highlight. On the most legally-critical flow, the client can't
   tell which of 15 fields is wrong. Fix: scroll to + red-border + focus the first offending field.
6. **[H] Native `alert()`/`confirm()` break the branded UI.** Used 16× in provider, several in client,
   despite `confirmModal()`/`proToast()`/`showToast()` existing. Renders as "yourapp.com says…" system
   chrome. Fix: route error copy through toasts, destructive prompts through the styled confirm modal.

## Tier B — Navigation & information architecture (provider)

7. **[H] Back-arrow appears on top-level tabs.** `nav()` only clears history for Home, so switching to
   any other tab builds a back-stack and shows a back chevron that walks *backward through tabs*.
   Fix: reset `_navStack` for all 6 primary destinations, not just Home.
8. **[H] One event shows up in four inboxes.** A booking request / check-in / form lands in the bell
   feed, a Home tile, the Home "Needs your attention" section, AND its own screen — each separately
   dismissible. Fix: make the bell feed canonical; Home cards become shortcuts, unify dismissal.
9. **[M] The next appointment is buried.** Home stacks ~7 blocks (KPIs, AI recap, promo hero, tiles,
   attention) above "Up next" (`:3513`). The #1 daily question ("who's next, when") is below the fold.
   Fix: promote the next appointment directly under the KPI row; demote the "See what clients see" hero.
10. **[M] Booking requests have no stable home.** Reachable only via a transient Home tile (vanishes once
    "seen"), a Calendar banner, and a feed row; `renderRequests` even sets nav to Home not Calendar.
    Fix: give requests a persistent labeled entry on the Calendar tab.
11. **[M] Flagged intakes / check-ins / Home attention overlap.** Three destinations slice the same
    flagged data with different framing. Fix: merge into one "Check-ins & flags" screen with a filter.
12. **[M] Client detail is a ~200-line single scroll.** Daily items (chart, notes, forms, photos) are
    interleaved with once-per-client setup (app invite, healing drip, virtual-consult). Nothing
    collapses. Fix: a segmented control (Overview · Chart · Forms · Products · Billing), or at minimum
    collapse the "Client setup & messages" cluster behind one row.
13. **[M] Three Edit buttons, two editors, overlapping fields** on the client profile. Fix: one edit
    entry with labeled Contact / Clinical groups, or scope each button's label.

## Tier C — Speed up the live appointment (provider workflows)

14. **[H] You can't dictate or type notes from inside the Session room.** The Room's "Session notes"
    card only navigates away; voice capture lives only on the Notes screen. Dictating hands-free
    mid-treatment takes 3 hops. Fix: put "Start voice note" + an inline textarea in the Room's notes card
    (`startVoiceNote(id)` already works from any screen).
15. **[M] Typed note needs two screen hops before you can type** (Client → Notes read-view → Edit →
    write-note). Fix: make the Notes section cards directly editable, or open write-note directly.
16. **[M] AI Brief re-runs a multi-second call on every open** (`loadBrief` unconditional, no cache).
    Fix: cache per client+chart-hash (like the day recap), show "generated 2m ago · Regenerate."
17. **[M] Session summary has three overlapping Send controls** (top Send + bottom Send + link variant +
    a toggle). Fix: one pinned primary Send, demote link to secondary "Copy link."
18. **[M] Two different "send a form" UIs on the same client** (suggested-forms checkboxes vs. the
    searchable sender sheet). Fix: make suggested forms the pre-checked top of the single sender sheet.

## Tier D — Payments / checkout

19. **[H] No way to record a cash / non-Square payment.** Every path routes through Square, so cash,
    Venmo, or external-reader sales can't be logged and Reports under-count revenue. Fix: a "Mark paid —
    cash/other" button calling the existing `_addPayment` with the current line items (~5 lines).
20. **[M] "Charge card on file" is a two-tap dead end** when the client has no `squareId`/saved card.
    Fix: hide/disable unless a saved card is known, or offer "Add a card" inline in the result.

## Tier E — Client app experience & trust

21. **[H] First-run gives no orientation.** Real clients boot straight to Home with no "what is this /
    private / shared by your provider" framing — that reassuring copy is stranded on the now-orphaned
    magic-landing screen. Fix: port the intro block (lock badge + "shared by {provider}" + "no app or
    login needed") into Home for first render, dismissible.
22. **[M] "Download my records" is unreachable for real clients** — the built, working export button
    exists only on the orphaned magic-landing. Fix: add a row to the profile/Home footer.
23. **[M] The aftercare "Ask" AI helper is buried** on the Session Summary screen, invisible from the
    Homecare tab it answers questions about; aftercare content is fragmented across 3 screens. Fix:
    surface Ask + the day-by-day aftercare timeline on the Homecare tab; make it the one aftercare hub.
24. **[M] Messaging shows a fake "online" dot and "Typically replies same day."** Hardcoded trust
    signals imply live presence/an SLA the provider never set. Fix: drop the green dot, remove/soften the
    reply-time claim, lead with the "stays private between you two" copy.
25. **[M] Two divergent form engines + a dead 130-line magic-landing.** The legacy `reviewClientForm`
    modal (used by the demo) lacks draft-save and real validation and carries dead signature-pad code.
    Fix: route everything through `renderFillForm`; retire/collapse the magic-landing duplication.
26. **[L] "Switch provider" affordance for single-provider clients.** Most clients have one provider;
    the top-of-Home switcher is meaningless to them. Fix: make it non-interactive / link to provider
    contact when `providers.length === 1`.

## Tier F — AI: close the gaps + new assists

27. **[H] Auto-draft the client summary note at "End session."** Biggest AI gap: the client-facing note
    is typed from scratch, *then* can be "made client-friendly," even though the session just captured
    provider notes + voice transcript + homecare. Fix: on entering the summary with an empty note but
    existing notes/voice, offer "Draft client note from today's notes" (ties voice → client note).
28. **[M] Reorder list is copy-only.** `_aiReorder` builds per-vendor order messages but the only action
    is clipboard copy, though vendor phone/email/portal are already on file. Fix: `sms:`/`mailto:`/portal
    Send buttons next to Copy.
29. **[M] "Ask your book" silently caps at 80 clients and results are read-only.** A 200-client roster
    gets a confident answer over the first 80. Fix: surface "searched your 80 most recent," and add a
    "message these clients" bulk action into the existing messaging/automation path.
30. **[M] Day recap is morning-only.** No end-of-day close-out ("2 summaries unsent, 1 balance unpaid")
    or weekly variant, both of which were intended. Fix: make it time-aware + add a weekly version.
31. **[M] "Draft with AI" silently overwrites typed campaign text** with no undo. Fix: if the box is
    non-empty, confirm or offer the draft as an accept-able preview (mirror the reply-drafts pattern).
32. **[M] AI Brief ignores the pre-visit check-in.** The app tracks check-ins but the Brief doesn't
    ingest them. Fix: add a "What changed since last visit" line sourced from the check-in.
33. **[L] New: re-engagement text drafts for overdue clients** — surface "who's due" clients with a
    "Draft a check-in text" action reusing the automation engine, turning a passive list into bookings.

## Tier G — Design polish

34. **[M] Low-contrast tan empty-state text** (`client:2756`, ~2.7:1). Darken body to ~`#6b5d52`.
35. **[M] No shared secondary button; three different grey "Cancel" variants.** Standardize on `.btng`.
36. **[M] Static, non-spinning loader icons** in several client actions (frozen `ti-loader-2`). Add the
    spin animation globally.
37. **[M] Two divergent empty-state systems in the client.** Port the provider's `emptyState()` factory.
38. **[M] Mixed button capitalization** (Title Case "AI Brief"/"Start Session" beside sentence-case
    neighbors). Normalize to sentence case.
39. **[L] Inconsistent loading copy tone** (bare "Loading…" beside warm specific lines). Normalize.
40. **[L] "BETA" badge + internal ops/analytics screens leak to real users.** Gate behind a flag.
41. **[L] Screenshot Mode / sample-data toggles sit in real Settings** — a provider could accidentally
    hide their real clients. Gate behind a dev flag or remove for production.
42. **[L] Orphaned `renderPro` hub still routable** — dead code that contradicts the flattened IA.
    Delete it or repoint `pro` → `renderMore`.

---

## Recommended sequencing
- **Batch 1 (Tier A):** 6 quick, high-impact fixes — two are real bugs in the shipped iOS build
  (notch collision, modal seam), one is a safety guard (flag confirm), one protects the critical intake
  flow. Low risk, high payoff.
- **Batch 2 (Tiers B–C):** navigation clarity + faster live-appointment charting.
- **Batch 3 (Tiers D–E):** cash payments + client-app trust/discoverability.
- **Batch 4 (Tier F):** AI gap-closers and new assists.
- **Batch 5 (Tier G):** design-system polish pass.

*Audit generated post-1.0 as planning input; validate each against current behavior before implementing.*
