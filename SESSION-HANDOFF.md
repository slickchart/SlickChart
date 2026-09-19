# Session handoff — 2026-09-13 (last updated 2026-09-17, pre-visit check-ins + push)

Written at the end of a long session so the next one starts informed. `CLAUDE.md` is the standing
guidance and still governs; this file is *state*: what shipped, what's unfinished, and what will
break quietly if nobody touches it.

---

## 1. READ THIS FIRST — the Monday blog Routines are bound to a session

`CLAUDE.md` §4 explains the mechanism. **There are TWO of them now**, one per blog:

- **SlickChart blog** (`blog-src/` → `/blog`): trigger `trig_01Kpq3HtFnWqgea1bUozHbbM`,
  cron `0 14 * * 1`, next run 2026-09-21 14:04 UTC
- **Build blog** (`build-blog-src/` → `/build/blog`): trigger `trig_01JeGumaZUvUoy6aBCSxJS38`,
  cron `0 15 * * 1`, next run 2026-09-21 15:01 UTC, created 2026-09-16
- both bound to `persistent_session_id: session_01A4GwJis96cYnvN4yMbpBtt`

**Nothing was broken about the 2026-09-14 Monday miss.** That Monday fell *before* the 2026-09-15
re-point, so the draft went to the old session. The re-pointed Routine has not had a Monday yet.
- **Re-pointed 2026-09-15 at Ashley's request.** The previous trigger
  (`trig_01GLnvYt3jrAhjPPCQZFY9Uw`, bound to `cse_014uZePRTjnrVD5MwGzq6Tde`) fired on 2026-09-14 at
  14:03 UTC and she never saw the draft — the wake landed in a session she was not reading. It has
  been deleted and re-created with the identical prompt, bound to the session above. That is the
  silent failure this section exists to prevent; check the binding again in any new session.

**A Routine bound to a retired session delivers nowhere and fails silently** — no draft, no error,
and Ashley would never see it stop. If you are a new session, run `list_triggers`, and for **each** of
the two, if it is still pointing at a session that isn't you, delete it and re-create it with the same
prompt (`create_trigger` with **no** `create_new_session_on_fire` and **no** `persistent_session_id`
binds it to you). Then update the ids in `CLAUDE.md` §4 and tell Ashley you moved them.

Do **not** "fix" this by making it spawn a fresh session per fire. That was tried on 2026-09-10 and
failed silently — the spawned session had no repo checkout, produced nothing, and reported SUCCEEDED.

---

## 2. What shipped in this session

All on `main`, all deployed. Newest last:

| Commit | What |
|---|---|
| `6bf7652` | Migration engine: per-platform CSV import mapping (`import-profiles.json`), honest preview, 30-day undo |
| `a54c758` `21b4a58` `aa33709` | Swept out false-promise integration copy; rebuilt Switch Apps around Square |
| `70618af` | `/switch` guides behind a publish gate (hand-written copy AND a verified export path) |
| `3817982` | Photo ghosting — line a new photo up with the last one at the same angle |
| `c916a5b` | Voice notes suggest products/guides/courses from the provider's own catalog |
| `d7ed9e5` | Paid courses: Square checkout link + auto-unlock on payment |
| `eb5a368` | Dictate the recommended-products list, validated against the real library |
| `eaf643f` | **A real client can no longer reach the sample space, by construction** |
| `d0dd96b` | Equine: one owner, several horses, each with its own chart |
| `1bb5602` | Owners see each horse in their own app |
| `22670c7` `49e91a1` | Build landing matched to slickchart.app: centred, opal pill buttons, hero order, mobile |
| `4289749` | **A roadmap sale can no longer become a paid SlickChart subscription** — plus its own push and stats |
| `84a3da1` | Access page explains the Claude desktop app, and warns that ticks save per browser |
| `bf92fd1` | **Access email never sent** (fire-and-forget on serverless) — fixed, plus `/build/access` to get back in |
| `1c71a6c` | Buyer list with real consent, kept separate from SlickChart's; logo points at `/build` |

### Things worth knowing about, not just reading in the diff

- **The sample/demo client space is now opt-in only** (`?preview=1`, `?demo=1`, or a baked-in seed in a
  `*-demo.html` build). It is never a fallback. Two separate bugs had let real clients see it: every
  push deep link was tokenless (`/client?s=...`), and the sample was what you got whenever no token
  was found. Both fixed; `scripts/check-no-demo-data.cjs` now **fails the build** on any tokenless
  `/client` link in `api/` or `lib/`. Use `spaceUrl(token, screen)` from `lib/clients.js`.
- **An animal is a client record** linked by `ownerId` (equine only). That is what gives each horse its
  own notes, photos, forms and history without re-keying anything. Animals are excluded from the
  duplicate finder and cannot be merged; merging two owners re-homes the dropped owner's animals.
- **`sc_course_purchases` and `sc_import_batches` accumulate** and are registered for merge-on-pull
  (`_TOMB_OBJ` / the `Cloud.pull()` dispatch). Per `CLAUDE.md` §0 rule 6, any new synced key that
  accumulates needs the same or it will be silently clobbered by a stale device.
- **Generated files**: `node scripts/build-demo.cjs`, `build-client-page.cjs`, `build-switch.cjs`, then
  `build-blog.cjs` **last** (it owns `sitemap.xml`). CI fails if any of them are stale.

---

## 2b. Cloud.pull() — which keys merge, and which still don't (2026-09-14)

Ashley lost a course she had built three times, while deleted sample courses kept returning. Root
cause was `CLAUDE.md` §0 rule 6: `sc_courses` rode the DEFAULT OVERWRITE, so whichever device synced
last won wholesale. Deleting recorded nothing, and the reseeder could not tell "deleted them all"
from "new account", so it re-seeded samples and pushed them. Guides, forms and several flags had the
same shape of hole. Fixed across `4bf9827`, `7a5cedc`, `a2663d9`.

Three mechanisms now, and any new synced key needs the right one:

1. **Authored libraries** (`sc_courses`, `sc_resources`, and `sc_forms`' `custom` array) go through
   `_mergeAuthoredById(server, local, hiddenKey)` — union by id, newer `_ts` wins, tombstoned ids
   dropped. Stamp `_ts` wherever the record is saved or the newer edit cannot win.
2. **Delete lists** (`sc_hidden_courses`, `sc_hidden_guides`, `sc_hidden_forms`, …) belong in
   `_TOMB_OBJ`/`_TOMB_ARR` so they UNION. A delete list that overwrites is worse than none: a stale
   device's shorter copy silently un-deletes things.
3. **One-way latches** (`_STICKY_TRUE`: `sc_hide_sample`, `sc_courses_custom`, `sc_*_custom`,
   `sc_photorelease_migrated`) are plain `'1'` strings. Sync may SET one, never clear one. A cleared
   `sc_courses_custom` is what let the reseeder overwrite real courses.

**Still on the plain overwrite and still at risk**, all the same authored-library shape:
`sc_protocols`, `sc_service_menu`, `sc_docs`, `sc_routines`, `sc_vendors`, `sc_staff`,
`sc_inventory`. Nobody has reported losing one yet. Genuine last-write-wins settings (`sc_tax_rate`,
`sc_brand_colors`, `sc_wsname`, `sc_note_fmt`, `sc_ai`) are correct as overwrites — this is a
specific list, not "merge everything".

The suite lives in the scratchpad as `t-courses.mjs` (27 assertions, drives the real
`Cloud.pull()` merge functions against stale-server fixtures). Worth re-creating if a future session
touches this area.

---

## 2c. Course snapshots — the blob is no longer the only copy (2026-09-14)

Section 2b fixed the *merge*. It did not fix the *architecture*: a course still lived in exactly one
place, so anything that went wrong with `sc_courses` took the whole course with it. Ashley lost the
same course close to ten times, and the last two causes were not merge bugs at all:

- **A full device.** `persistCourses()` did `try{localStorage.setItem(...)}catch(e){}`. On a phone
  whose origin quota was exhausted — hundreds of cached lesson files will do it — that threw,
  silently.
- **A silent push.** `_pushKeyNow` ended in `.catch(function(){})`, so a 401/500 resolved like a
  success. `saveCourse` awaited it and printed "Course created ✓" with the course stored nowhere at
  all. Refresh, gone, no error, ever.

What is in place now:

1. **`/api/course-versions`** (`lib/db.js` → `ensureCourseVersionsTable`). Every save writes an
   immutable, owner-scoped snapshot; the builder also autosaves one every 45s and on `pagehide`, so
   a course that has never been saved once is still held. **Deleting a course deliberately does NOT
   delete its snapshots** — a wrong delete was one of the ways work vanished. Keeps 20 saves + 3
   autosaves per course; payload is the course record only (no file bytes) so it is a few KB.
2. **Courses tab → "Course backups & find a lost course"** (`openCourseHistory`). Lists every
   snapshot, courses missing from the library FIRST and labelled. `restoreCourseVersion` puts one
   back, lifts its tombstone, and stamps a fresh `_ts` so the next sync can't undo the restore.
3. **`persistCourses()` / `_pushKeyNow` now report.** They resolve `{local,server}` / `{ok}`.
   `saveCourse` prints ✓ only when something actually landed; if nothing did it says so, **keeps the
   builder open with the work still in it**, and does not clear the draft. Don't re-swallow these.
4. **More → Device storage** (`openStoragePanel`). Shows `navigator.storage.estimate()` and clears
   cached lesson/guide file bytes — but ONLY ids that `/api/guide-file?list=files` confirms the
   server still holds, re-checked at the moment of deletion. If that list can't be fetched it drops
   nothing. Files re-download on demand via `_guideFilePayload`.
5. The "storage is full" toast is sticky now and names the biggest consumer. It used to
   auto-dismiss before it could be read, which is why this went undiagnosed for weeks.

Suite: `t-snapshots.mjs` in the scratchpad, 44 assertions, including the two real-world scenarios
(device full + push failing; device full + server down).

---

## 2d. The course builder, rebuilt around autosave (2026-09-14, late)

After a long night of course-loss bugs Ashley said the plain truth: *"this whole process should be
really simple and you have made this entirely too complicated... it is just a digital asset builder
and there are tons out there."* She picked three changes. All three shipped.

**Autosave replaced the Save button.** `_cbCommit(id,{silent})` is now the single writer; `saveCourse`
is a thin alias for `_cbDone()` (save, then leave). A delegated `input`/`change` listener on
`#cb-root` plus explicit `_cbTouch()` calls from every structural edit debounce a commit ~1.1s after
the last change, and a chip in the builder header reports Editing / Saving / Saved / Saved to your
account / Not saved yet — retrying. Things to keep true if you touch this:
- `_cbCommit` **mutates the draft** after committing a file: `f.fileId=fid; delete f._newFileData`.
  Without that every autosave re-uploads every file attached this session.
- `l._removedFileIds` is cleared after each commit for the same reason.
- an untitled course saves as "Untitled course" rather than being refused; `_cbHasContent()` stops an
  opened-and-abandoned builder leaving a stray one behind.
- `_cbDone` only clears `window._cbDraft` **after** a successful save. Clearing first and then
  discovering the save failed is how you lose the thing you were trying to keep.

**Lessons are a collapsible outline.** `window._cbOpen` keyed by lesson id; a closed row shows
number, title and a summary (`3 files · video · 10 words`). `_cbSyncFromDOM()` still indexes by
`.cb-lesson` position, so closed lessons (which render no inputs) are skipped and keep their content
— there is a test for exactly that.

**Upload state sits on the file.** `_cbFileState` keyed by `_cbFileKey(f)` — `f.fileId` once it has
one, otherwise a `_uid` minted when the file is attached. That handle matters: during the upload the
file has no server id yet, so keying on the id meant the spinner had nothing to attach to.

Suites in the scratchpad: `t-builder` (36 assertions) covers all three. `t-quiet` covers the
subtraction pass that took the recovery scaffolding off the Courses tab.

---

## 2e. The 5MB box is no longer where the business lives (2026-09-14, b15)

Ashley: *"that storage is still super full when the app is barely being used… this is meant to be a
whole practice management system."* She was right, and it was structural. Safari caps localStorage at
**5MB per site and it does not grow**. Her one month of real use was already at 2.0MB: 652 client
records (787KB), the Square catalogue (368KB), her logo (186KB), the delete list (144KB). A full year
of notes, forms and photos would have hit the ceiling, and past the ceiling every save on the device
silently no-ops — the original "my course disappeared".

**Any value ≥ 24KB now lives in IndexedDB (~76GB) instead.** Measured on her data shape: the capped
box went **1354KB → 15KB**, with all 652 clients still loaded.

How it works (`slickchart.html`, near `_lsPersist`):

- `_offloadEligible(k,len)` decides. It offloads **only** keys that are (a) big, (b) `_syncable` —
  so the account always holds a copy and a wiped IndexedDB costs nothing — and (c) on a device with
  an account signed in. Never in the demo.
- Two families are **excluded by name and must stay excluded**: `sc_room_draft_*` (the crash-safety
  copy of photos taken minutes ago) and `sc_captured_photos` (written only when an IndexedDB write
  has already failed). Being *outside* IndexedDB is the entire point of both — moving them in would
  put the backup in the same place as the thing it backs up.
- `localStorage.getItem` / `removeItem` are now patched alongside the existing `setItem` patch, so
  all ~155 existing read sites work unchanged. **Do not add code that enumerates `localStorage`
  directly** — use `_lsAllKeys()` (localStorage ∪ offloaded) and `_lsGet(k)`. Enumerating raw is how
  `pushAllLocal`, the boot catch-up and the sign-out sweep would each have silently skipped the
  client list.
- `_hydrateOffloaded()` runs at the **top of `_cloudInit`, before the pull and before `_reloadAll`**.
  Nothing may read storage before it finishes.

**Isolation (CLAUDE.md §0).** This introduced exactly one new way to leak across accounts: IndexedDB
is not touched by the sign-out sweep that walked localStorage. Two defences, both tested in
`t-isolate`, and *neither may be removed*:

1. `_doLogout` (now `async`) enumerates with `_lsAllKeys()` and **awaits** `_purgeOffloaded()` before
   `location.reload()` — the reload was cancelling the in-flight IndexedDB deletes.
2. The offloaded store is stamped with the account it belongs to (`lskv-owner`). `_hydrateOffloaded`
   purges rather than reads anything stamped for a different account, and loads nothing at all when
   no account is signed in. This is what covers an interrupted sign-out (force-quit, crash).

Server side is untouched: `/api/store` is still `WHERE owner = ${owner}` with `owner` from the
verified token only. This change moves bytes between two places on one device; it adds no endpoint
and changes nothing about how identity is derived.

**Also fixed on the way (a real bug, not a consequence).** `_payments`, `_importedProducts`,
`manualAppts`, `_svcMenu`, `_deletedSquareIds`, `_notifCleared`, `_notifRead` and `affiliateLinks`
were read **once, during script parse** — before the account pull — and never re-read. On a device
that had just signed in, the in-memory copy stayed empty while storage held the real list, and the
next save wrote the empty version straight back over it. Payments are money records. They are now
re-read by `_reloadTopLevelStores()` at the top of `_reloadAll()`, ahead of `applyProfessionConfig()`
(which judges whether the service menu is still at its defaults).

Suites: `t-offload` (24 assertions), `t-isolate` (11). `t-quota`, `t-fullsync` and `t-reconcile` were
updated — the old quota/eviction path is still tested, now through `sc_captured_photos`, which is the
key that genuinely cannot move.

---

## 2f. The free starter funnel (2026-09-14 evening, b16)

A lead magnet for Build Your Own App: a free artifact ("Your First Screen"), an opt-in page, and six
emails. Her plan is `FREE-FUNNEL.md` (she pasted it in chat; not in the repo).

**The pieces.** `free.html` → `/free` (cleanUrls, no rewrite). `api/free-signup.js` records the
address and sends the artifact link instantly. `lib/free-funnel.js` holds the emails, the table, and
the run. Five follow-ups on days 1/3/5/7/10 ride the existing cron. Three ways through from `/build`:
a strip above the sticky nav (scrolls away), a block after the final CTA, a footer line. `/free` is
in `sitemap.xml`; `/build` deliberately is not.

**Where the funnel's rules live, so they are not re-litigated:**

- **`free_signups`, never `waitlist`.** The waitlist feeds the SlickChart provider sequence — a
  person who wanted an app-building freebie would have started getting esthetician software emails.
- **`FREE_AUDIENCE_ID` is deliberately UNSET, and topics are deliberately NOT wired.** Her Resend
  account has ONE audience. Putting freebie signups in it makes them reachable by SlickChart
  broadcasts — the same contamination, pointed the other way. Doing it properly needs two topics
  (one per product), both opt-out, every contact assigned. Not worth it until she broadcasts to
  freebie signups. **The `free_signups` table is the real list**; the cron reads it, not Resend.
  - She created a Resend topic **"Build Your Own App", opt-out, private** and verified all 40
    SlickChart contacts are NOT on it. **In Resend, "opt-in" means subscribed by default** (their
    words: "every contact in the audience is treated as subscribed automatically, including contacts
    added later"). It reads backwards. The setting cannot be changed after creation — delete and
    recreate. Getting this wrong once already put all 40 on the topic.
  - To wire it later you need the **Update Contact Topics API** page from Resend's docs. Do not guess
    the shape: `addToAudience` swallows its own errors, so a wrong guess subscribes nobody and looks
    like it worked. resend.com is blocked by this environment's egress proxy.
- **Buyers exit by SQL filter, not by a removal at purchase time** (`runFreeFunnel`'s query excludes
  `build_purchases`). That is why it cannot be missed: it covers the Stripe webhook path, the
  `/build/unlocked` path, purchases made before this shipped, and a webhook that never arrived.
- **One opt-out silences everything.** `nurture_optout` is shared by all three sequences. So when
  testing the unsubscribe link, use a throwaway `+alias` — never a real address.
- The signup route answers identically whether an address is new, already on the list, or
  unsubscribed (CLAUDE.md §0.4), is rate-limited per address and per IP, and sends once per address
  with a 24h re-ask window so a lost email is not a dead end.

**Also fixed in the shared engine** (helps the SlickChart sequences too): a failed send-claim meant
"already sent, try the next step" even when the claim was seconds old, so two overlapping runs — a
manual `?key=` trigger landing on the scheduled one — could send two emails minutes apart. A claim
under ten minutes old now stops that contact for the run.

**One email list across all three products.** `api/admin/contacts.js` (owner-only) folds `providers`,
`waitlist`, `build_purchases` and `free_signups` into one deduped list, carrying consent honestly
(`opted in` / `customer` / `not asked` / `no`) plus `unsubscribed`. **The CSV exports mailable people
only** — that file is what gets imported into a mail tool months later, and a "no" surviving the trip
is how someone gets emailed who declined; `&all=1` gives the full picture. Surfaced as a card at the
top of Growth Stats.

Suites in the scratchpad: `t-free` (26, the page), `t-freeapi` (30, the signup route), `t-freedrip`
(28, the five follow-ups), `t-buildfree` (20, the paths in from /build), `t-contacts` (40, the list
and its owner gate), `t-emaillist` (12, the card). Each was sabotaged to confirm it tests something —
two of them passed at first with the fix removed, so do that check.

**Branding (corrected 2026-09-15 after she saw the first real email).** These carry SlickChart's own
chrome — the logo and wordmark images, `#0a1719` ground, `#26c1b0` teal — identical to the SlickChart
nurture emails, with "Build Your Own App" as the kicker where those put their tagline, and signed
"Ashley / Founder, SlickChart". They are NOT branded "with Ashley": it is SlickChart's product.
What they still leave out is the Botanical Aesthetics line, which is her esthetics business. The
wordmark carries `alt="SlickChart"` because mail clients block remote images by default. `t-freedrip`
asserts all of this.

**Env vars she has set:** `FREE_ROADMAP_URL`, `BUSINESS_ADDRESS`. Optional and unset on purpose:
`FREE_AUDIENCE_ID`, `FREE_FROM` (defaults to `Ashley <hello@slickchart.app>`), `FREE_REPLY_TO`.

---

## 2g. The /build and landing page rewrite (2026-09-15)

Ashley asked for `/build` to carry more feeling: the dream of building something that is hers, time
and location freedom, and the potential of life-changing money. Four research threads ran (conversion
evidence, emotional copywriting craft, income-claim/processor rules, competitor teardown). WebFetch is
blocked by this environment's egress proxy, so findings came via search, not primary sources.

**What shipped on `/build`:** a hero built on ownership rather than credentials; a new "Your hands can
only be in one room at a time" section naming time, location and financial freedom explicitly; a "why
you, specifically" identity beat; a process-flavoured "what this looks like on a Tuesday" section; a
revised close; two extra in-flow CTAs. Zero em dashes (her instruction) across both pages.

**The income-claims line, so it is not re-litigated.** Ashley asked for the money language and
reaffirmed it after being shown the risk; it is in, worded as *possibility* with the no-promise
sentence adjacent rather than in the footer. What the research established, and what should not be
quietly undone:
- An earnings claim is about the BUYER'S future money. Her own past result, already qualified as
  "my result, not a forecast", is a different category and is fine. Keep her Stripe records forever.
- A disclaimer does NOT cure a contradicting claim (FTC .com Disclosures). The footer disclaimer works
  only while the rest of the page agrees with it. Do not add a promise above it.
- **Never publish a buyer testimonial about money.** That triggers the Endorsement Guides, which would
  require disclosing what buyers *generally* earn. Process testimonials only ("I shipped it in seven
  weeks"). The FTC fake-review rule (in force Oct 2024) also means any free access given in exchange
  for a review must be disclosed.
- **`api/build-checkout.js` and `api/stripe-webhook.js` share one `STRIPE_SECRET_KEY`.** The roadmap
  and SlickChart subscriptions are the same Stripe account, so a copy-driven risk action on `/build`
  would freeze provider billing. Separating them was raised with Ashley and is still open.

**Biggest un-actioned lever:** the page has zero testimonials. Spiegel/Northwestern found purchase
likelihood ~270% higher at five reviews vs none, flattening after five, and peaking around 4.0-4.7
stars rather than a perfect 5.0. Real buyers exist since 2026-09-13. Asking them is worth more than
any further copy work.

**Corrected in passing:** an earlier claim in this session that `/build` had "9 screens with no buy
button" was wrong. Both pages have a sticky CTA (`#bar` on `/build`, `position:sticky` header on the
landing page), so a button is always on screen. The added in-flow CTAs are a modest gain, not a fix
for a missing affordance.

**Landing page (`index.html`):** already carried the recognition beat and three named testimonials, so
it got tuning only: em dashes removed, three in-flow CTAs added (longest gap 20.5 -> 6 screens). No
claims were changed.

---

## 2h. The app's readability and design pass (2026-09-15)

Ashley: people are getting confused by the app, and she suspected the reading level was too high.
**It wasn't.** Measured headless across eight screens: interface prose was already plain, and only a
handful of strings were hard. What was actually wrong was physical, not verbal.

**Careful: readability formulas do not work on interface text.** Flesch-Kincaid scores "Sync now" at
grade -3.0 and "Save changes" at grade 2.9, rating the confusing word six grades *easier*. They count
syllables, not familiarity. Score prose (onboarding, help, emails) only; never labels or buttons. For
a button the test is to cover it and ask someone what they think tapping it does.

**What shipped:**
- **Text size.** Sentence-length text was rendering at 12px. All 3,024 inline `font-size`
  declarations remapped onto one scale (12/14/16/18/22/26). Body is now 16px, secondary 14px, 12px
  for metadata only. Sentences under 16px went 10 -> 3 on Home, 5 -> 1 on Clients.
  **`.ni span` (tab bar labels) is deliberately back at 11px** - the bump collided the six tabs at
  phone width. Tab labels are micro-labels; do not raise them.
- **Radii** remapped (832 declarations) onto 2/4/8/12/16/24; 14 distinct values down to 7.
- **Tokens.** Added type/space/radius/motion tokens at `:root`. The app had 43 colour variables and
  no other scale, which is why values like 13.3333px and 9px radius existed.
- **Tap targets.** One rule gives borderless text buttons a 44px hit area without changing text size:
  `button[style*="border:none"][style*="background:none"]`. App-wide, targets failing the WCAG 2.2 AA
  24px floor went 92/261 (35%) -> 11/261 (4%). Resources alone: 59 failures -> 1.
- **`prefers-reduced-motion`** block added (WCAG 2.3.3).
- **Strings people hit when stuck.** One told a provider to "redeploy". Note `_loadSessions`'
  "No session activity recorded yet" is the SIGN-IN list, not client visits - it became "No sign-ins
  recorded yet"; a context-free rewrite would have made it "No visits yet", which is wrong.

**Still open, deliberately not done:** Resources still nests two tab rows (Forms & guides / My docs /
Partners, then Forms / Guides / Courses). That is a structural redesign, and the evidence says depth
costs more than breadth. Also unbuilt: contextual surfacing (photos, consent, products, invoice
belong *inside* an open client rather than as global peers), a visible "Saved" stamp plus undo
toasts, and curated themes for the client-facing side.

**Do not "simplify" by cutting features.** The Office 2007 case is the counter-example: the most
requested features already existed and could not be found. And choice-overload failed to replicate
(meta-analysis, ~50 studies, effect near zero) - though its moderators (time pressure, high stakes)
describe an esthetician mid-treatment, so the in-treatment flow is where density actually matters.

**Verification method, reusable:** the scratchpad scripts drive the demo build headless and measure
tap targets, contrast, font-size-by-text-length, clipping and page overflow per screen at 320px and
390px. Re-run them after any UI change.

---

## 2i. The client file is one page now (2026-09-15)

**Note on history:** the commit that shipped this is titled "PROPOSAL (branch only): one client file,
no tabs" (`25bff91`). It is NOT a proposal any more - Ashley asked for it and it was merged to `main`.
The title is stale, not the state.

The client chart used to carry a four-tab bar (Overview / Forms / Care / Setup) *and* action buttons,
so it had two navigation systems on one screen. Measured: Overview 0.96 screens, Forms **0.20**
(169px, 20 words, two buttons), Care 1.47, Setup 0.35 - **3.0 screens total**. A four-tab system for
three screens about one person is what made it feel complicated.

The tab bar is gone and every section renders in sequence. 2,802px inside `main.scr`, 3.9 screens of
ordinary scrolling, nothing hidden. The whole change is five lines: the `${_clientTabBar(id)}` call
and the four `${_clientTab==='x'?'':' hidden'}` conditionals. `_clientTabBar` and `_setClientTab`
still exist but are unused - nothing else ever called them.

**The finding that matters more than the change.** `Recommended Products` ("What Maya sees in their
shop", drag to order) and `Virtual Consult` (AI skin analysis, "Invite Maya to a new virtual consult")
were ALREADY BUILT and ALREADY SCOPED PER CLIENT. They were behind the Care tab. The new landing page
leads with the shoppable homecare plan and virtual consults, and the app was hiding both one tap deep.
Before building anything new for the income angle, look at what is already there.

**A rejected design, so it is not re-attempted.** An earlier pass added a "Recommend & earn" group
(Homecare / Send form / Products) to Today's visit. Ashley correctly rejected it: it duplicated the
Forms tab and the Care tab, which is the opposite of simplifying. Adding shortcuts next to an existing
navigation system makes a screen more complex, not less. Removing the tabs was the right move instead.

**Still not client-scoped:** `nav('shop')` appears 7 times and is never scoped to a client, so
recommending a product still means leaving the chart for the global shop. That is the one genuine gap
on the earning path.

---

## 2j. The Build blog (2026-09-16)

`/build/blog` is a second blog for the Build Your Own App product, launched with five posts. Same
machinery as the SlickChart blog, and deliberately **one script builds both**.

**Why one script.** `scripts/build-blog.cjs` owns `sitemap.xml`. A second generator writing its own
sitemap would silently clobber the first one's entries, and nobody would notice until search traffic
dropped. So the script grew a `BLOGS` config array instead: source folder, output folder, URL base,
index copy, breadcrumb label, end-of-post CTA, and header CTA per blog. Adding a *post* needs no
script change; adding a *third blog* is one entry in that array.

- **Source:** `slickchart-vercel/build-blog-src/` (+ its own `README.md` and `TOPICS.md`)
- **Output:** `build-blog/`, rewritten to `/build/blog` and `/build/blog/:slug` in `vercel.json`
  (same pattern as `/build/unlocked` → `/build-unlocked`; `cleanUrls` resolves the `.html`)
- **Five posts, all dated 2026-09-16:** you do not need to learn to code; the Google Play rule that
  costs a month; what building an app actually costs; Claude Chat or Claude Code; you might not need
  the app stores. They were all written on that date, so they carry that date. Nothing is backdated.

**The refactor was verified not to change the existing blog.** The pre-refactor `blog/` output was
snapshotted and diffed after: byte-identical except the one footer nav line below. Do that again if
you touch the generator.

**Two chrome changes that affect every generated page:**

1. `chromeFooter` gained a `Build blog` link, so `blog/`, `switch/` and `build-blog/` all changed by
   exactly that one line.
2. `chromeHeader` is now `headerWith(href, label)` with `chromeHeader` kept as the default
   (`/slickchart`, "Open the app"). `head()` takes an optional `headerCta`. The Build blog passes
   `/build`, "Build your own app", because sending someone reading about app costs to the esthetician
   provider app was a funnel leak.

**The writing rules are not stylistic and are in `build-blog-src/README.md`.** The important one:
**no income claims, ever** — no numbers, no ranges, no "life-changing money", none implied through a
story. That is FTC exposure under Ashley's own name, and it is the same boundary `/build` itself
holds. Second: **no em dashes**, consistent with `/build` and `/free`. Third: platform rules and fees
change, so a post either fetches the current policy page and cites it, or frames it as what Ashley
planned around in her own build and tells the reader to check. Fourth: don't hand over the roadmap's
ordered sequence for free — the blog argues the *why*, the $97 product is the ordered *how*.

The end-of-post CTA points at `/free`, not `/build`, on purpose: the blog is top-of-funnel and `/free`
is where the email capture is.

---

## 2k. Why signup alerts went silent (2026-09-17)

Ashley missed two real provider signups. Both founder test pushes delivered to her Android phone,
which is what made this take so long: **the test was proving a different claim than the one that
mattered.**

**The two lookups were not the same.** `test-push` resolved her phone as
`{this session's provider id} ∪ {providers whose email is in FOUNDER_EMAILS}`. A signup or sale push
runs server-side with no session, so it only ever had the second half. A broken
`FOUNDER_EMAILS → providers.email → native_push_tokens` chain therefore passed the test via the
session id and reached nobody for real. `test-push` now sends down the real chain first and only
falls back to the session id when that finds nothing, saying so when it does. **A passing test now
means the real path passed.** Don't undo that.

**The actual gate.** `api/signup.js` skipped BOTH the founder email and the founder push whenever
`hasActiveSubscription(email)` was true, to avoid double-pinging a paid signup the Stripe webhook
already announced. A Build roadmap sale used to write a row into `subscriptions` (fixed forward in
`4289749`; the rows written before it remain), so a roadmap buyer looks "already paying" forever —
and roadmap buyers are exactly who the `/build` funnel sends to SlickChart. That matches Ashley's own
observation that alerts stopped when `/build` launched.

**The dedupe was restored on the right signal (2026-09-17, later).** Inverting it stopped the silence
but gave Ashley TWO pings per paying provider, and she only wants the PAID one. The fix is to gate on
`subscriptions.paid_notified_at` — stamped by the webhook at the moment it actually announces someone
— instead of `hasActiveSubscription()`. "Already told" is safe to skip; "probably paid" is not.

- webhook already announced them → the signup ping is silent
- never announced → it fires, so there is no gap
- looks paid but never announced → it fires AND flags "check this one", because that is the stale
  roadmap-sale row giving somebody SlickChart free

**Never gate a founder alert on `hasActiveSubscription()` again.** That is the exact mistake that
silenced real signups for days.

**`notify_log` (lib/notify-log.js)** records one row per founder-notification attempt: masked
address, whether it was skipped and why, devices found, devices sent, and which link broke. The
founder test tool reads the last five back, so a test that passes while real alerts vanish now says
so. Provider signups and build sales both record. Addresses are masked going in — never store the
full one.

**iOS push goes straight to Apple now (`lib/apns.js`).** The iOS project has no Firebase SDK (stock
`AppDelegate.swift`, nothing in `Package.swift`, `GoogleService-Info.plist` unread), so
`@capacitor/push-notifications` returns a raw APNs token. Everything used to go through FCM, which
rejected it — and the old code read that rejection as a dead token and **deleted the row**, so an
iPhone registered, lost its token on the first send, and reached zero devices forever.

Fixed by sending to Apple directly rather than rebuilding the app: the tokens already stored are
exactly what APNs wants, so **no App Store resubmit was needed**. `lib/fcm.js` routes per token by
its SHAPE (colon = FCM, plain hex = APNs), not the stored platform label, because the shape is what
decides which service can deliver it. `nativePushConfigured()` is the gate to use — `lib/push.js`
exports a `pushConfigured()` of its own for web push, hence the name.

**It needs four env vars in Vercel and they are not set yet:** `APNS_KEY_P8`, `APNS_KEY_ID`,
`APNS_TEAM_ID` (plus optional `APNS_BUNDLE_ID`, `APNS_ENV`). The `.p8` already uploaded to Firebase
works; one key serves both, and a lost one can be re-created without breaking Firebase. Until they
are set, iPhone push is a clean no-op that names the missing config, and Android is untouched. Full
setup, plus the sandbox-vs-production token trap, is in `PUSH-NATIVE-SETUP.md`.

**Never prune on a credentials error.** `Unregistered` and `BadDeviceToken` mean the token is dead;
`InvalidProviderToken` and friends mean *we* are misconfigured, and deleting a registration over a
wrong env var is how this whole bug started.

**Free-starter signups deliberately do NOT push.** Ashley wants her phone to buzz for provider
signups and roadmap sales only. A push was added and then removed at her request; the `free_signups`
row is the record. Don't add it back.

---

## 2l. Pre-visit check-ins: three bugs, one morning (2026-09-17)

Ashley: no nudges on Up Next or Today's, Sheri's check-in showed "ready" but opened to one from
**August 20**, and nothing auto-sent. Her instinct was that a recent change broke it. It hadn't —
**every check-in and appointment function is byte-identical to before the design pass** (diffed
`_checkinDone`, `_ciMatchesVisit`, `_checkinForClient`, `_needsCheckin`, `_hoursUntilVisit`,
`_apptSig`, `_apptsToday`, `_realApptsMerged`, `_loadSquareAppts`, `sendCheckin` and 8 more; the only
change in any of them was font-size values). Check that before assuming damage.

**1. The sync re-dated old check-ins to now.** It stamped
`at: ev.created_at ? (new Date(ev.created_at).getTime() || Date.now()) : Date.now()`. That runs on
EVERY sync including for month-old events, so any check-in whose `created_at` would not parse got
today's timestamp — and `_ciMatchesVisit` judged "is this for the visit in front of me" on exactly
that. Unparseable now means `0`, which every consumer already reads as "cannot confirm".

**2. `checkinDoneFor` copied the client's CURRENT `nextVisit`.** The check-in log auto-clears, so old
events get re-adopted on a later sync — and it then stamped last month's check-in against TODAY's
appointment. `_checkinDone` read today as done, which is what removed the nudges.

**The durable rule: judge on the check-in's own stated visit, not its timestamp.** A check-in carries
the label it was submitted for ("Thursday, August 20 at 10:00 AM") and that label is never rewritten.
`_ciMatchesVisit` compares it at day resolution and only falls back to `at` when there is no usable
label; `_checkinDone` and `_stampCheckinDone` both route through it, so a corrupted timestamp can
never claim a visit on its own. `_stampCheckinDone` also REPAIRS a bad stamp, so files heal on the
next sync. The live-arrival path (`SlickBridge` `checkin-submitted`) is deliberately untouched —
that one genuinely is happening now.

**3. Auto-send never worked for phone-only clients.** `cron-checkins` matches a Square customer to a
client by email OR phone. Both client-sync payloads in `slickchart.html` are built by hand as
`{id, name, email, data}` — **phone was not in them** — and `upsertClient` wrote
`phone = ${c.phone || ''}` on both paths, so every sync actively BLANKED the column. Anyone booking
through Square with a phone and no email could never be matched. Phone is now in both payloads and
is `COALESCE`d on write so a caller that omits it can't blank a stored one. **If you add a third
sync call site, include phone.**

**The day-of nudge window.** `_needsCheckin` only surfaced a client within ±2 HOURS of their
appointment, so at 8am a 2pm client showed nothing. Now 24h out through shortly after the start,
which is what Ashley means by "if it isn't done on the day, nudge me".

**A Square load failure no longer hides.** `_loadSquareAppts` caught everything silently, so the
schedule fell back to `manualAppts`/`confirmedAppts` (weeks old) while looking live, `nextVisit` was
never re-stamped, and the nudges stopped. It now records why, shows a banner on Today's and This
week's with Try again / Reconnect Square, and retries instead of latching for the session.
`lib/square.js` logs a failed token refresh and returns null for an already-expired connection.
**This was NOT Ashley's bug** — her schedule was always correct, and she said so before I listened.
The banner is still right to have.

**Tone note, and it was fair.** Mid-session: *"I am tired of you adding founder buttons that clog up
my app and make me do extra work. this should be things you can find on your own."* Correct. The
three real fixes came from diffing the code and reproducing her exact case headless, not from
instrumentation. Reach for a diagnostic surface only when there is genuinely no other way, and prefer
an error state where the problem shows over a tool in Admin.

---

## 2m. Paid, but no account (2026-09-17)

A provider paid, never got the welcome email, and could not log in. **Paying and creating the
account are two separate steps.** Stripe checkout writes a `subscriptions` row; the person must then
come back and create a provider account with the SAME email, which is what issues the password.

**The welcome email is the tell.** It is sent only inside `api/signup.js`. No welcome email means
signup never ran, which means there is no `providers` row, which is why login says "Email or password
is incorrect" — that message is deliberately generic so it cannot be used to enumerate accounts, so
it reads identically for "wrong password" and "no account at all".

**First thing to ask a locked-out payer:** have them try *Create an account* with the exact email
they paid with. If it goes through, that was it. If it says the account already exists, then signup
DID run and the welcome email failed — a different bug worth chasing.

`api/cron-orphan-checkout.js` (hourly, :40) now closes the gap: active subscriptions older than 3h
with no matching provider account get emailed a one-tap link to finish, and after 48h Ashley is
pushed and emailed so a person can step in. Both steps claimed once in `nurture_sends`.

**Two rules in there worth not undoing:**
- It only considers rows with a real `stripe_subscription_id`. A Build roadmap sale used to write a
  `subscriptions` row with none, and those buyers must never be told to finish setting up a
  SlickChart account they did not buy.
- An unsubscribed person is never emailed but IS still escalated to Ashley. Opting out of marketing
  must not mean silently staying locked out of something they pay for.

`?signup=1&email=` opens the Create-account form with the address prefilled (`_signupEmail`, used for
one render and deliberately never written to localStorage, so it cannot mark a client's device as a
returning provider).

---

## 2n. Saved settings were being thrown away by the next pull (2026-09-18)

A provider reported business hours, logo and forms resetting all day. Ashley's guess was that it was
our deploying. **Half right: the deploys raised the odds, they were not the cause.** Two real bugs,
both reproduced against the live code before fixing.

**1. `_mergeForms` discarded every edit to an existing form.** The three id-keyed maps (`tmpls`,
`guides`, `emojis`) were merged with an unconditional *server overrides local*. `Cloud.pull()` runs on
every app load, so a save + successful push was still undone by the next pull putting the stock copy
back. The giveaway in the report: a **brand-new** form survived (no server id to win with), which is
why it reads as "resets to the defaults" rather than "save is broken". The `custom` array directly
above already used a `_ts` comparison — the maps were simply never given one. Now newer-wins, with
`persistForms` stamping `_ts` on **only the entries whose content changed**, so a routine save cannot
make one device's whole form set outrank another device's real edits.

**2. `sc_bizinfo` and `sc_brand_colors` had no merge at all.** They fell through to the pull's plain
`set(k, data[k])`, so the server copy overwrote the device. Any edit not yet on the server — failed
push, or a reload landing first — was gone. Both now use `_mergeStamped` (stamped last-writer-wins,
pushes back when local is newer). `_stampNow()` stamps them at every save site.

**Unstamped data keeps the old behaviour**, so nothing written before this changes meaning.

**The general rule this is the third instance of:** anything in `Cloud.pull()` that is not explicitly
merged is *overwritten by the server*. `sc_clients`, `sc_msgstore`, `sc_threads`, `sc_seen_events`,
tombstones, courses, resources and forms have merges; everything else does not. **If you add a synced
key a provider can edit, it needs a merge or a stamp — a plain overwrite means their edit is one pull
away from vanishing.** CLAUDE.md §0.6 says this; it keeps being learned the hard way.

**Deploying while a provider is working is not harmless.** Every deploy makes their app reload, every
load pulls, and every pull is a chance to lose an unsynced edit. Worth timing deploys away from her
working hours where possible, independent of these fixes.

---

## 2o. The rest of that same report: the edit never reached a save at all (2026-09-18)

The provider in §2n came back after those fixes still saying hours, branding and forms reset when she
moved to another part of the app — **on a brand-new profile, her first login**.

**I got this wrong once first, and it is worth recording why.** Three unrelated features failing the
same way pointed me at the one thing they share, the device's storage, so I shipped a toast telling
her she was out of space. Ashley's answer was correct on both counts: a first-login account cannot be
full, and telling a provider that is embarrassing when it isn't even true. **A brand-new account holds
about 20KB in localStorage after a full walk through the app** — measured headless, the number is not
close to the 5MB cap. That message is gone. Check the claim before shipping the message.

**The actual cause needs no sync bug at all.** Every settings editor is DOM-only until its own Save is
pressed, and the two longest screens made that easy to miss:

* **"Business & Branding" was two forms in one screen with TWO Save buttons.** `saveBizInfo()` saved
  the business half, `saveBranding()` saved the branding half, neither touched the other. Fill in your
  details and hours, scroll past the fold, press the Save you can see — that one saved the branding,
  dropped everything above it, and toasted success.
* **The form builder's Save was at the top of the question list**, with nothing at the bottom, so the
  natural way out of a long form discarded every edit.

Either way, leaving the screen dropped the work silently and returning re-rendered the stored value.
It is worst on a new profile because that is when someone fills a long settings screen from scratch.

Now: both buttons on that screen save both halves (`saveBusinessBranding`), there is a Save at the end
of both long screens, and **`nav()` + `pagehide` flush whatever editor is open before leaving**
(`_flushSettingsEdits`) — quietly, no toast.

**The guards on that flush matter, don't remove them.** Each screen records a signature when it opens
(`_bizSig` / `_brandSigOpen` / `_fbInitialSig`); an untouched screen writes **nothing**. Without that,
merely visiting Business & Branding would re-stamp `_ts` and outrank a genuinely newer edit from
another device — the flush would have become instance four of §2n. An abandoned new form is not
created, and an explicit Save re-arms the signature so the `nav()` that follows it doesn't save twice
(which for a new form made a duplicate).

**Design rule this leaves behind:** one screen, one Save, and a screen longer than a phone viewport
needs a Save at the bottom too. If a value only exists in an input until a button is pressed, leaving
the screen has to persist it.

**The old `_persistFailWarn` banner is gone too** (Ashley's call, same session). It was a sticky
"this device is out of storage, open More → Device storage" toast on any refused write to
`sc_clients` / `sc_courses` / `sc_session_summaries`. Since the IndexedDB offload (§2e) the patched
`setItem` sends anything big to IndexedDB and **pushes to the account before it throws**, so by the
time that handler runs the change is already on the server and returns on the next load — the banner
was alarming a provider about a save that had not lost anything. It now logs to the console only.
`_lsBiggestKeyLabel` and `_storageWarned` went with it; `_lsLabel` / `_LS_LABELS` stay, the Device
storage panel still uses them.

**Photos are the deliberate exception and must keep saying so.** `_commitPhoto` and the stencil
overlay still toast about a full device, because a photo that will not store really is lost at that
moment and is not on the server. Don't "tidy" those two to match.

---

## 2p. A paid course could only ever be unlocked by a Square webhook (2026-09-18)

A client bought one of Ashley's courses and said she never got it. The send path is fine — traced end
to end headless (provider `confirmSendCourse` → `_assembleClientData` → `/api/clients` → the client's
blob → `/api/client-data` → the client app): the course arrives, with its lessons, and renders. What
it renders as is **locked**, and that is where the real problem was.

**A paid course opened on exactly one condition:** an entry in the provider's `sc_course_purchases`,
and the only thing in the whole product that could write one was Square delivering a `payment.*`
webhook for the checkout link in the client's app. That chain has at least five links that each fail
silently — `payment.*` subscribed in the Square app, `SQUARE_WEBHOOK_SIGNATURE_KEY` set (without it
the handler answers `not-configured` and does nothing), `SQUARE_WEBHOOK_URL` matching exactly, a
`square_connections` row for the merchant, and the event actually arriving. Open thread §3.1 has said
since 2026-09-14 that nobody has ever confirmed the first one.

**And it only covered one way of paying.** Cash, an invoice, Venmo, a card taken in person — no
`SC1:` note exists, so no webhook can ever fire, so the course stays locked *forever*. The client's
"Already paid? Refresh" only re-read the same blob, so it could never help; the provider had no
screen anywhere showing that a course she'd sent was sitting locked, and no way to open it.

Three fixes:

1. **The provider can open it.** Course detail now has a **"Sent to"** list — everyone the course went
   to, and whether it's open, locked waiting on payment, or waiting on an invite. A locked row gets a
   **Mark paid** button (`_confirmMarkCoursePaid` → `_markCoursePaid`), which records the purchase,
   pushes it, and republishes that client's blob so it opens in their app immediately. **One-way on
   purpose:** `sc_course_purchases` is union-merged (`_TOMB_OBJ`), so a removal would come straight
   back on the next pull — don't add an undo that silently doesn't work.
2. **"Already paid? Refresh" asks Square** — new `POST /api/course-paid` `{t, courseId}`. It looks up
   a COMPLETED payment carrying that link's `SC1:<clientId>:<courseId>` note and records the unlock
   itself, so the webhook is now the *fast* path rather than the *only* path. Isolation: provider,
   client id and Square token all come from the client's own row via the link token, the courseId is
   honoured only if already assigned to that client, both ids are `SAFE_ID`-checked before reaching a
   key. Bounded to 3 pages of `/v2/payments` with a per-instance 4s throttle.
3. **"Sent ✓" stopped lying.** `/api/clients` answers `ok:true` even when an individual row's upsert
   threw — those come back in `failed`, the saved ones in `clients`. `_pushClientNow` checked only
   `ok`, so a client whose blob never saved still produced "Sent". It now checks both, and every send
   flow that routes through it (courses, forms, guides) inherits the fix.

**Then Ashley removed the lock entirely, later the same day, and she was right to.** Her words: *"this
would be really confusing for a provider and they would never know to go into a course and mark it
unlocked"* and *"if i send it that means they should be able to open it."* Marking paid by hand is a
step nobody would discover, on a screen nobody would think to open, to fix a problem they could not
see. It only existed to prop up a lock that could be wrong.

**So: nothing a provider sends is locked. Sending IS the permission.** Gone in both apps and on the
server — `_courseLocked` / `_coursePaid` / `_courseBuyHTML` / `_courseCheckPaid` / `_courseLockedTap`
in the client; `_coursePaidFor` / `_markCoursePaid` / `_confirmMarkCoursePaid` / `_mintCourseBuyUrl` /
`_ensureCourseBuyUrl` / `_coursePurchases` in the provider app; `paid` and `buyUrl` out of the synced
course payload; `recordCoursePurchase` out of the Square webhook; `data.purchases` out of
`/api/client-data`; and `api/course-paid.js` deleted outright, one day old.

What stayed: the **"Sent to"** list on course detail (who has it, and whether they've been invited to
the app yet) — that part was useful and isn't about money. `/api/square/payment-link` stays too; it
is still how she takes payments and invoices, just not how a course opens. `sc_course_purchases`
keeps its `_TOMB_OBJ` merge entry and its storage-panel label so a legacy key on an old device merges
instead of clobbering; nothing reads it.

**The rule this leaves:** providers take payment their own way and then send the thing. Do not add a
gate whose "unlocked" state depends on an external event arriving — when it doesn't arrive, the
failure is invisible on both sides and the person who paid is the one who suffers.

Suites in the scratchpad: `nolock.mjs` (a $49 course sends with no checkout link minted, no `paid` or
`buyUrl` in the blob, both lessons tappable in the client, a lesson really opens, nothing routes to a
lock) and `oldblob.mjs` (a client whose stored data still carries `paid:false` and a stale `buyUrl`
from before today — those are ignored and the course opens, so nobody needs re-sending).

**§3.1 (is Square's `payment.*` webhook subscribed?) is CLOSED — it was, all along.** Ashley's webhook
logs show `payment.created` and `payment.updated` delivering to
`https://slick-chart.vercel.app/api/square/webhook` and returning 200, which only happens after the
signature check passes. The Square side was configured correctly the whole time. Whatever kept that
one course locked was further down — almost certainly a payment made outside the in-app link, which
is exactly the case the lock could never handle. Moot now.

`GET /api/square/webhook` is a setup check (signing key present, the URL signatures are verified
against, which events to subscribe) and returns nothing secret. It remains useful for bookings,
refunds and catalog sync, which still ride the webhook.

---

## 2q. FOUND IT: her account was holding the four characters `null` (2026-09-18)

Third report from the same provider (`sunkissedbeautyllc1@gmail.com`), after two fixes shipped on
theories that were not her problem. Ashley: *"it doesnt happen in mine."* Correct — it was data, not
code, and nothing in the repo could show it. The founder tool (§below) printed her account in one
line: **business hours, 4 bytes, last written 2 days ago, no edit stamp.** Four bytes is the string
`null`. Business info 274B and branding 85KB were minutes old; only hours were dead.

**The loop, start to finish:**

1. `let bizHours=null`, filled in only when the Business info screen renders. A `saveBizInfo()` that
   ran before that did `SlickBridge.setAvailability(null)` → `JSON.stringify(null)` → the four
   characters `null` written to `sc_availability`, and pushed to her account.
2. Every load after that, `Cloud.pull()` ran `_mergeStamped("null", <her real hours>)`. It parsed the
   server side to `null`, failed `typeof srv!=='object'`, and **returned `null` meaning "no opinion"**
   — which sent the caller to its plain overwrite. So the pull wrote `"null"` over a device that had
   perfectly good hours on it.
3. `renderBizInfo` → `normalizeAvail(null)` → the stock Mon–Sat 9–5. **"My hours reset to default."**
4. She re-entered them and saved. The device write landed. The push did not, because
   **`sc_availability` was the only one of these settings without an immediate `_pushKeyNow`** — it
   alone rode the 700ms debounced queue. That is exactly what the account showed: four rows minutes
   old, hours untouched for two days.
5. Next load, back to step 2. Re-entering them could never win.

**Four fixes, all shipped together:**

* `_mergeStamped` **never lets an unusable account copy overwrite a usable device copy.** It keeps the
  device copy and pushes it back, repairing the account row instead of spreading it. This is the
  general fix — it protects `sc_bizinfo` and `sc_brand_colors` from the same shape of poisoning.
* `SlickBridge.setAvailability` **refuses anything that is not a real object**, so `null` can't be
  stored again by any caller.
* `saveBizInfo` normalizes the hours before writing and **pushes them immediately**, like every other
  setting.
* `_healAvailability()` in `_reloadAll` **repairs an account already holding junk** — an account
  poisoned on both sides could not fix itself, since every load re-read the junk. Real defaults on
  both sides beat `null` on both sides, and her next edit has something to change.

**The rule:** a merge that returns "no opinion" must not fall through to an overwrite. "I can't tell"
and "take the server's copy" are different answers, and the second one destroys data.

Suite: `riquelle.mjs` in the scratchpad — boots against her exact account state, proves the junk is
cleared on load, that hours set + saved survive navigation AND a reload, that a junk value arriving
later can no longer win, and that a save with no hours loaded can't write `null` again.

### The instruments, which are the reason this took an hour instead of another day

* **Build stamp** at the bottom of Settings (`APP_BUILD`). Bump it on every ship. Two days were spent
  debugging fixes a provider may never have received.
* **`/slickchart?selfcheck=1`** — no button, no menu entry, only the link. Walks the save path in
  order (device write → live session → reaches the account → **comes back**) and prints device vs
  account for the four settings, with which side was edited more recently. Runs *before* the rest of
  boot on purpose: a rejected session drops the token and bounces to sign-in, which is both the state
  most worth seeing and the state that would stop the check running.
* **Admin tools → "Are a provider's saves landing?"** (`api/admin/kv-health.js`, founder-only).
  Per-key size, last write, and the app's own `_ts` stamp. **Metadata only — it never reads a stored
  value**, and must stay that way. This is what found the four bytes.

**CLOSED on the evidence.** Her self-check, run inside the real app on build `2026-09-18g`, came back
green the whole way down: the write lands on the device, she is signed in, it reaches the account, and
**it comes back correctly** — the round trip nobody had ever tested. Business hours read **372 bytes,
edited 1 min ago, both sides matching**, where the day before they were 4 bytes and two days stale.
That is the §2q fix confirmed on her phone rather than in a test. Business info and branding matched
byte for byte. Storage: 220KB on a device with 9.8GB free, so the very first theory was wrong by four
orders of magnitude.

The one row that read "They do not match" was **forms — and that difference is correct**. The device
copy has the forms she deleted stripped out of it (`_mergeForms` filters `sc_hidden_forms`); the
account keeps the raw copy. 2,236 bytes is about one form template. The report was crying wolf about
healthy data, which is the same mistake the webhook check made the day before with
`urlMatchesThisHost`, and it sent us looking for a bug that did not exist. **The forms row now counts
what is actually in each side (forms / her own / guides), says when a difference is only her
deletions, and keeps flagging a real mismatch.** Tested all three ways in `formsrow.mjs`.

**A tool that reports a false alarm costs exactly as much as a bug.** Twice now. Before adding a
check, work out what a HEALTHY system looks like through it — and make sure that reads as healthy.

**The first self-check came back from the wrong browser, and every line of it was meaningless.**
It reported no session and nothing saved for any of the four settings, while the founder tool showed
her account holding 58 keys and 222KB with six live sign-ins. Both were true: she tapped the link from
a message, which opens Safari or Chrome — and on a phone where SlickChart was added to the home
screen, **that is a different storage box from the installed app.** A link can therefore never reach
the app a provider is actually using.

Two changes so it can't happen again:
* The check **detects it**: no session AND nothing stored means it was never this app, and it says so
  in plain words at the top instead of printing a wall of red, plus a "Back to SlickChart" button
  (it replaces the whole screen before boot, and editing a URL on a phone is not a thing to ask of
  someone).
* **Five taps on the version line at the bottom of Settings runs it**, which works INSIDE the
  installed app. No button, no menu entry, nothing added to the UI — it is the text that was already
  there. That is the route to give a provider; `?selfcheck=1` is only for someone on a desktop
  browser they actually sign in with.

---

## 2r. The bug sweep: closing the whole family, not one more instance (2026-09-18)

Ashley, after the third round on the same provider: *"I feel like we are coming across so many that
are unnecessary. is there anything you can do to bug sweep?"* She is right — §2b, §2n and §2q were
three faces of one bug, so the sweep went after the family rather than the instances.

**Finding 1 — every merge had the hole that ate her hours.** Eleven `_mergeX` functions, and all of
them bail with `return null` when they can't make sense of a side. In `Cloud.pull()` that fell
through to the plain overwrite — so "I can't tell" and "take the server's copy" were the same answer,
and the second one destroys work. `_mergeClients` guards the entire client list. `_mergeMsgStore`
guards every message ever sent. Any junk in those account rows would have wiped the device.

Fixed **once, at the call site** (`setFromServer` in `Cloud.pull`) rather than eleven times, so it
also covers the seven keys that have **no merge at all** and were listed in §2b as still at risk
(`sc_protocols`, `sc_service_menu`, `sc_docs`, `sc_routines`, `sc_vendors`, `sc_staff`,
`sc_inventory`). The rule it enforces: **an account copy that is nothing, broken, or a shape smaller
than what the device holds never overwrites the device** — the device's copy is kept and pushed back,
repairing the account. `_syncShape()` compares shapes, because judging a value alone isn't enough:
`123` is fine for a latch and is corruption for the vendor list.

**Finding 2 — the app could still create the poison.** `JSON.stringify(notFilledInYet)` produces the
four characters `null`, which is exactly how §2q started. The patched `setItem` now refuses to store
that for a synced key and logs the call site instead. Clearing a setting is `removeItem`; a write of
`"null"` is always a bug.

**Finding 3 — messages rode the same fragile path her hours did.** Hours were lost because
`sc_availability` was the only setting without an immediate `_pushKeyNow` — it alone used the 700ms
debounced queue, and on her account that queue silently stopped landing. A sweep of all 111 written
keys found 24 more on the queue alone. Most are dismissals nobody would miss; four carried real work
and now push immediately: **`sc_msgstore` and `sc_threads` (a provider-sent message has no other copy
anywhere)**, `sc_pro_vc_invites`, `sc_shop_catalog`.

**Finding 4 — an empty studio name was being pushed over a real one.** Two write sites wrote
`sc_wsname` unconditionally, so a save with a blank business name published a blank studio name to
every client. Both now skip a blank.

**Also checked, clean:** all 103 `persist*`/`save*` functions were called cold (the state that created
the `null`) — none wrote a bad value, and the only three that threw simply require an argument the UI
always supplies.

**Suite: `hostile.mjs`.** Sets up a real workspace (client, hours, branding, an edited form, vendors,
inventory), then poisons **all 27 account keys** with `null` / `undefined` / `""` / a bare string / a
number / broken JSON, and relaunches the same browser profile. Everything survives, the account is
repaired from the device, and nothing junk lands. Run it after touching `Cloud.pull()`.

**What was deliberately NOT done:** giving the seven unmerged keys a real per-item merge
(`_mergeAuthoredById` + tombstones, as courses and resources have). They are now safe from *junk*,
but a stale device can still overwrite newer data on those keys. That is a real remaining gap and a
much bigger change — each needs its own "a delete must not resurrect" story — and it did not belong
in a same-day push while Ashley is supporting live providers. It is open thread §3.16.

---

## 2s. The provider's own calendar is hers — no booking hours (2026-09-18)

Right after §2q confirmed her hours were saving, the same provider said her calendar still wouldn't
let her book inside them and looked "stuck on the default hours". It was not a sync bug at all.

**Her three booking pickers were hardcoded dropdowns**, and none of them had anything to do with her
saved hours: a new appointment offered 9:00 AM – 4:00 PM, editing one offered 9–6, and suggesting a
time back to a client offered 8–8. A provider whose day starts at 7:30 simply had no 7:30 to pick,
so whatever she saved, booking behaved like the defaults.

Ashley: *"booking hours should just never be restricted — for the provider"*, *"they should be able
to manually book whatever they want."* Right: **business hours bound what CLIENTS may request; they
were never meant to bind her.**

All three are now a native time field — any hour, any minute, including 6:15am and 7:45pm — and the
new-appointment date no longer blocks past dates, so a visit can be logged after the fact.
`_time24()` / `_time12()` convert between the field's 24-hour value and the `"2:30 PM"` the app
stores and displays everywhere else, so nothing downstream changed.

**Not touched:** the Square booking sheet, whose slots come from Square's own availability search.
That is Square's rule, not ours, and "Add locally instead" is already on that screen as the way past
it. If a provider reports being blocked there, that is the answer — don't try to override Square.

Suite: `anytime.mjs` — conversion both directions, a 7:30 AM and a 7:45 PM booking, a 6:15 AM edit, a
7:30 AM suggestion reaching the client in friendly form, and past dates allowed.

**The lesson worth keeping:** when a provider says a setting "isn't taking effect", check what the
consuming screen actually reads before assuming the setting is broken. Two of these three pickers had
never read her hours at all.

---

## 2t. The public booking link (2026-09-18)

A provider asked for a link she could put on her website and her Instagram bio so someone who is not
a client yet can book her. Most of it already existed — this mostly joined up pieces.

| | |
|---|---|
| `/book/<slug>` | `api/book-page.js` — branded, no login, same shell as the consult page |
| `GET /api/book-slots` | free times for one day (instant mode only) |
| `POST /api/book-request` | creates the booking |
| `lib/booking.js` | settings, hours, free/busy, slot maths |
| Settings → **Booking link** | `renderBookingLink()`, config in `sc_booking_page` |

**One handle, two pages.** The slug is the SAME one the consult link uses (`providers.consult_slug`),
so `/consult/<slug>` and `/book/<slug>` are both hers and she has one thing to share. `book`,
`booking` and `bookings` were added to the reserved list.

**Two modes, and the PROVIDER picks** (Ashley: *"let them make the setting"*):
* **Ask me first** — they request a day and time inside her posted hours; it lands in Booking
  Requests and she confirms / suggests / declines. Her calendar stays completely private.
* **Book it instantly** — the page shows genuinely free times and books straight in. Works for every
  provider, not only Square ones, because we already know her hours and her calendar.

Instant mode inevitably reveals when she is busy. **The setting says so on the screen, in plain
words.** It is her trade to make and she can only make it if she is told — don't quietly soften that
copy later.

**The guard worth keeping:** `busyRanges()` returns **null**, not a partial answer, when it cannot
see the whole calendar (she has Square connected but Square is unreachable). Every caller treats null
as "take a request instead". Publishing a half-informed slot list hands her a double booking, which
is worse than asking. The slot is re-checked at submit, so one taken while someone filled the form is
caught rather than accepted.

**Isolation:** the provider is resolved from the SLUG, never from anything a caller sends. Free/busy
is reduced to times before it leaves `lib/booking.js` — never what she is booked with or who with.
The reply is identical whether or not that email was already on file, because a public form that said
"welcome back" would be an enumeration oracle for her client list. Rate limited per IP and per slug.

Whoever books becomes a real client (find-or-create by email, scoped to her account) and the booking
arrives as an ordinary `booking` event — same inbox, same push, same confirm flow as a client booking
from their own app. No new screens on the provider side beyond the settings one.

### What came next, the same day — emails, deposits, per-service lengths, buffers

**Confirmation emails, and both are OPTIONAL.** Ashley: *"make sure booking emails is an option
because those with square will already have those … is optional"*. Two switches in
`sc_booking_page`, both defaulting to on:
* `emailGuest` — the person booking gets a confirmation. Its reply-to is HER, not our support
  inbox, so a reply reaches her.
* `emailMe` — her own copy, carrying their email and phone (the push does not). Reply-to is the
  guest.

Both are honest about which mode it was: *"You're booked"* vs *"She'll confirm"*. The settings
screen tells a Square-connected provider that Square sends its own, so she can turn ours off rather
than sending two of everything. Templates: `bookingGuestEmail{Html,Text}` /
`bookingProviderEmail{Html,Text}` in `lib/email.js`.

**Per-service lengths.** `cfg.services` is now `[{name, mins, deposit}]`. **The old name-only shape
is still accepted, for ever** — a provider who set hers up before durations existed must never have
her list silently emptied. `openSlots()` steps by the CHOSEN service's length, so picking a 90-minute
facial re-asks the server and gets a different grid than a 30-minute consult. The public page
re-fetches on every service change.

**Buffers.** `cfg.bufferMins`, padded onto **both ends** of every busy range — one number applied
symmetrically, rather than a "before" and an "after" she'd have to reason about.

**Deposits** ride her own Square, the only payment rail a provider has here, so the toggle refuses to
switch on without it and says why. `depositLinkFor()` mints a Square payment link; a default amount
with a per-service override. **An explicit `0` on a service means "no deposit on this one", and
survives the round trip** — the input sheet promises that in words, so `getBookingConfig` keeps a
stored zero instead of treating it as absent. If the link cannot be minted, **the booking still
stands** and simply carries no link: a Square hiccup must never cost her the appointment. The link
shows on the confirmation screen and in the guest email.

The confirmation screen escapes everything that came back over the wire and drops a deposit URL that
is not `https://` — nothing from a response can inject markup into a public page.

Suites: `bk/slots.mjs` (free/busy and slot maths against a stubbed db + Square), `bk/svc.mjs`
(services, lengths, deposits, the legacy shape), `bk/req.mjs` (the POST end to end, both emails,
deposits), `bookpage.mjs` (the public page driven in all three configurations, including the no-slot
fallback, a slot taken mid-form, and a hostile deposit link) and `booklink.mjs` (her settings
screen). Those suites live in the scratchpad and run the real `lib/booking.js` / `api/book-*.js` with
only their imports pointed at stubs, because `@neondatabase/serverless` isn't installed here — so a
copy has to be re-made after editing any of them, or the suites quietly test yesterday's code. That
happened once and reported a false failure.

**The name sheet belongs to BOTH links.** `_setConsultSlug()` is reached from the Booking link screen
as often as from Virtual Consultations, and it used to open saying *"Choose your consult link name"*
with a *"Consult link ready"* toast — wrong wording on the booking screen, where Ashley spotted it. It
now says *"Choose your link name … The same name is used for your booking link and your consult
link."* It also re-renders the Booking link screen on save: it set `_consultSlug` and refreshed only
the Virtual Consultations tab, so saving a name there left the screen still asking her to pick one.

**How she finds it: the CALENDAR, not just Settings.** Ashley: *"accessing the link via the
booking/calendar section would make more sense"*. `_calBookLinkRowHTML()` puts a **Your booking link**
row on the Calendar directly under Booking requests — always present so she knows the feature exists,
and honest about its state: the live URL with a **Copy** button when it is on, *"Turned off — tap to
turn it back on"* when it is not, and an invitation when she has no handle yet. It never shows a URL
that would not work. Tapping the row opens the settings screen; Copy stops the tap from navigating.
`renderCalendar()` kicks off `_loadBookingSlug()` and is re-rendered when the handle lands.

The settings row (Settings → **Booking link**) stays — that is where the configuration lives. The
Calendar is where she goes to *grab the link*. Full path: choose a handle → turn it on → pick a mode
→ Copy or Share. The link is `slickchart.app/book/<handle>`.

### The two public pages now carry HER branding (`lib/public-brand.js`)

Ashley: *"let's make sure that the way it looks carries over their branding."* Whoever opens
`/book/<slug>` or `/consult/<slug>` has never heard of SlickChart — as far as they are concerned the
page IS her business. Both pages used to show only her accent colour and her initials in a square.
Now, from `sc_brand_colors` + `sc_bizinfo`:

* **Her logo** in place of the initials square (initials remain the fallback).
* **Both brand colours**, as `linear-gradient(135deg, primary, secondary)` on the button, the mark and
  the confirmation tick — the same gradient the app's own Branding preview shows her, so the page
  matches what she approved.
* **Her tagline** under the business name.
* Copy speaks as HER: *"Pick a day and time that suits you. Sunkissed Beauty will confirm…"*, **Hours**
  rather than *"Their hours"*, and the footer says her details go only to that business.

**Two contrast bugs fixed while in there**, both of which hit a provider with a pale brand colour:
`inkOn()` picks the text colour ON her accent (white on cream was unreadable), and `accentText()`
walks her accent toward black — or toward white on the dark theme — until a link rendered in it can
actually be read. Her own website link was cream-on-cream before this.

**One module, deliberately.** The two pages are meant to look like one product and two copies of this
would drift. `lib/public-brand.js` owns `readBrand()`, `brandVars()`, `brandRowHtml()` and
`BRAND_CSS`; both pages import them and keep only their own page-specific styling. `logoSrc()` accepts
only `data:image/…` or `https:` — a `data:text/html` "logo" would be a script running on her own
booking page.

Suite: `calbook.mjs` (the Calendar row in all three states, including that Copy does not navigate).
The branded pages are rendered by `bk/render.mjs` / `bk/crender.mjs`, with a deliberately pale-brand
variant so the contrast maths stays honest.

**Still not built:** nothing cancels or reschedules from the public link — that goes through her.
Deposits are a link to pay, not a hold: nothing checks whether it was actually paid before the
appointment.

---

## 2u. Branding and forms "resetting to default" — the async storage race (2026-09-18)

**This is the second half of Riquelle's problem, and it is NOT the same bug as the hours.** The hours
were the four characters `null` sitting on her account (§2q). Her branding and her forms kept resetting
after that was fixed, and the cause is completely separate.

**What was happening.** Values ≥ 24KB do not live in localStorage — they are offloaded to IndexedDB
(§2e). IndexedDB is **asynchronous**. But two of the app's loaders run during SCRIPT EVALUATION,
before `_cloudInit` has even been called, let alone `await _hydrateOffloaded()`:

* `let brandColors = loadBrandColors();`
* `loadForms();` near the bottom of the file

For a provider whose branding or form library is big enough to have been offloaded — **a logo alone
clears 24KB** — both reads came back empty and both loaders fell back to the built-in defaults: stock
teal, no logo, no tagline, the bundled intake form, zero custom forms. `_reloadAll()` fixed it up, but
only **after the pull**, which on a phone is seconds later.

So she opened the app, saw her branding gone, did the only sensible thing — set it again and saved —
and **that save wrote the defaults over the real copy on her account.** Measured on the repro: her
`sc_brand_colors` went from 40,153 characters to **63**. Logo gone, tagline gone, custom form gone,
from every device, permanently.

Ashley's own account was fine throughout, which is exactly what you would expect: her settings are
under the 24KB line, so they never left localStorage and the loaders always found them. **"It works on
mine" was a symptom of the bug, not evidence against it.**

**The fix, in three parts:**
1. **`sc_off_index`** — a tiny device-local list, in localStorage, of which keys currently live in
   IndexedDB. It is the one thing that can be read synchronously at script-eval time. Never synced.
2. **A write guard.** `_awaitingHydration(k)` is true while the index says a key is in IndexedDB and
   memory does not have it yet. The patched `setItem` **refuses** such a write, because anything
   computed in that state was built on a hole. It only ever holds writes back, so every exit from
   `_hydrateOffloaded()` releases it, `_cloudInit` releases it unconditionally after the await, and an
   8-second failsafe timer releases it if nothing ever answers. **A guard that can only refuse must
   never be able to stick.**
3. **`_reloadAfterHydrate()`** — re-runs the loaders the moment IndexedDB answers, instead of waiting
   for the pull, and redraws the current screen. The window where she can see defaults drops from
   "until the network returns" to a few milliseconds. Only runs on a device that actually had
   something offloaded, so a small account pays nothing.

**Already-lost data is not recoverable from here.** Branding is last-writer-wins, and the defaults were
written more recently than the real thing. Forms are unioned by id, so a custom form still sitting on
another of her devices WILL come back on that device's next sync — but anything that only ever existed
on the damaged device is gone. She has to set her logo and colours once more; this time it sticks.

Suite: `hydrate.mjs` — the full repro (offload, reopen on a slow pull, save during the window, assert
the account is intact), the guard in isolation, and four device shapes that must be unaffected: a new
account, a device with no IndexedDB, a signed-out device, and a key too small to ever be offloaded.
`riq4.mjs` is the bare before/after repro if this ever needs re-demonstrating.

The self-check now reports both: whether this device has the fix, and whether any settings are
currently in the big box and still loading.

---

## 2v. Why opening the app felt slow, and what it actually was (2026-09-18)

Ashley: *"when i first open the app it takes a minute for everything to load and looks like theres
nothing there, square isnt connected, etc. … this feels very low-end."* Measured rather than guessed,
with a 400ms-per-request network. Three separate things, none of them the 2.5MB file:

**1. Boot uploaded forty times and changed nothing.** Every loader that normalises or re-seeds a value
on load wrote it straight back, one HTTP request each — `sc_shop_catalog` alone went up **seven
times, byte-identical**. 29 uploads, 54KB, on an app open that edited nothing. A phone runs about six
connections at once, so **the requests that mattered — the client list, the Square status — queued
behind that storm.** That is the whole of "it takes a minute" and most of "Square isn't connected".

Fixes, in `Cloud` and `_pushKeyNow`:
* `Cloud._serverSeen` — what the account holds, seeded from the pull and updated on every confirmed
  write. A push whose value is identical **sends nothing**. An echo of the pull is not a save.
* `_pushKeyNow` now **batches**: calls in the same 25ms become one request with many keys, which
  `/api/store` has always accepted. It still resolves per-caller to `{ok}`, so nothing that awaits it
  changed. It also now **re-queues on failure** into the retrying queue instead of reporting the
  failure and forgetting the value.
* `Cloud._booting` — while booting, writes queue but do not send. `Cloud.bootDone()` (after
  `nav('home')`) drops everything identical to the account's copy, folds the two queues into one and
  sends once. A 6-second failsafe and every early-return path also call it, because a queue that only
  ever holds things back must never be able to strand them.
* `_syncShopCatalog` was sending the same bytes **twice** — once via `_pushKeyNow`, once via a direct
  fetch that existed only because `localStorage.setItem` might throw. `_pushKeyNow` is already
  independent of localStorage, so the second one is gone. `_syncBrandNow` routes through it too.
* The boot "catch up keys the server never got" block feeds the same queue instead of its own request.

**Result: first-ever boot 41 calls / 29 uploads / 54KB → 18 calls / 4 uploads / 10KB. Reopening an
already-synced account: 12 calls, 1 upload.**

**2. Nothing was drawn until the network answered.** Home rendered only after `Cloud.status()` AND the
pull — so a cold open showed a bare navigation bar and nothing else for a second or more, with all the
data sitting on the device the whole time. `_cloudInit` now calls `nav('home')` **before the first
network call**, guarded on `Cloud.token && sc_onboarded` (a first-run wizard must not be skipped), and
the existing `nav('home')` after the pull refreshes it. Safe because hydration (§2u) has already run,
so what it draws from is real.

**First real content on screen: ~1.1s → ~210ms, and no longer depends on the connection at all.**

**3. It said "Connect Square" to providers who have Square.** For the first second `_sqApptsState` is
`idle`/`loading` and the empty-state copy read that as "not connected". `_sqSettled()` now gates it:
until there is something true to say it says *"Checking your schedule…"*. A provider who genuinely has
no Square still gets the real prompt the moment the answer arrives.

**A data-loss bug fell out of this.** `Cloud.push()` began `if(!this.enabled||!this.token)return;` —
and before `status()` answers, `enabled:false` only means *we have not asked yet*. **Anything saved in
the first seconds of a cold open was silently dropped.** (The boot "catch up missing keys" block was
papering over it.) That window got easier to reach the moment Home started drawing early. `_statusKnown`
now distinguishes the two, and a save made before the answer is queued rather than discarded.
`flushBeacon` also drains the immediate-push batch, so a refresh mid-boot cannot lose a held write.

Suites: `bootfeel.mjs` (what is on screen in the first second, the Square copy, and the call counts),
`ttfc.mjs` (time to first content at three network speeds), `beacon.mjs` (a save made mid-boot survives
a refresh), `boot2.mjs`/`boot3.mjs`/`boot4.mjs` (the raw request timelines — `boot3` prints whether a
repeated write's value actually differed, which is how the seven identical uploads were found).

**Not changed, on purpose:** `setInterval(…,15000)` still polls `syncClientEvents()` and
`_pollFounderSignups()` every 15 seconds, including when the app is in the background. Pausing that
while hidden would save a phone real battery, but it changes how quickly a new booking or form appears,
which is Ashley's call rather than a silent optimisation.

---

## 2w. A form made on the phone did not reach the computer (2026-09-18)

Ashley made "Spicule Peel Consent" on her phone; it saved, she closed the app, opened the browser on
her computer and it was not there. The aftercare GUIDE she made at the same moment **was** there.

**Not reproduced on the shipped build.** `xdev.mjs` drives two browser contexts against one shared
fake account: make a custom form and a custom guide on device A, close it, open device B. Both cross
over. Re-run with `sc_forms` padded past 24KB so it is offloaded to IndexedDB on the "phone" (the one
way her device genuinely differs, and the shape of §2u): both still cross over.

The likely explanation is that her phone was on the build from before §2u/§2v, both of which were
live on it at the time and both of which could do exactly this:
* §2u — a phone whose `sc_forms` is offloaded read it before IndexedDB answered, so the app was
  holding the DEFAULT form set when she saved.
* §2v — `Cloud.push()` began `if(!this.enabled)return`, and before `status()` answered that only
  meant "not asked yet", so anything saved in the first seconds of a cold open was silently dropped.

**Rather than guess again, the self-check now NAMES the difference.** Its forms row already compared
counts; counts tell you something is wrong, not what. `formNames()` + `onlyIn()` list the forms she
built herself that exist on one side and not the other:

> **Only on this device, not on your account: Spicule Peel Consent** — it will not appear on your
> other devices.

and the reverse for anything on the account but missing locally. Both lines are in the copyable text
report too. One screenshot now answers "did my save reach my account, or only my phone?", which is the
question every one of these reports has really been.

Suite: `formsdiag.mjs` (a device-only form is named; nothing is flagged when both sides agree),
`xdev.mjs` (the two-device round trip, small and offloaded).

### FOUND IT: a new form was born with a DELETED form's id

Her self-check settled it in one line: `sc_forms` **identical** on device and account, 1 custom form
on both. Nothing failed to send — the form was **removed at both ends**.

Custom form ids were `'custom'+(++customFormSeq)`, and `customFormSeq` is rebuilt on every load from
the forms that STILL EXIST (`loadForms`, from `d.custom`). Deleting a form does not free its id:
`sc_hidden_forms` keeps it for ever, on purpose, so a deleted form cannot come back on the next sync
(`_TOMB_OBJ`, and `_mergeForms` strips anything in it).

**So deleting `custom2` put the number back in circulation.** The next form she created was handed
`custom2` — an id on the permanent deleted list — and was therefore filtered out of every list that
renders forms (`customForms.filter(cf=>!hiddenForms[cf.id])`) and stripped by `_mergeForms` the moment
it synced. It said *Form saved* and was never seen again.

**Her guide survived because guide ids are `'g-custom-'+Date.now()`**, and course ids are
`'c'+time+random`. Forms were the only library using a reusable counter. That is the entire reason one
crossed over and the other did not — not the network, not the size, not §2u.

Fix: `_newCustomFormId()` skips any id that is taken (`hiddenForms`, `formTmpls`, `customForms`, and
the stored `sc_hidden_forms` in case it is not in memory yet) and falls back to a timestamped id after
1000 tries. `loadForms` also seeds the counter from the tombstones and the templates, so it rarely has
to skip. Deletion is unchanged — a deleted form stays deleted.

Suite: `formid.mjs` — the full history (make two, delete one, reopen, make a third), asserting the new
form keeps its own id, renders immediately, survives a reload, reaches the account, appears on a second
device, and that the deleted one stays gone on both. `idreuse.mjs` is the bare before/after repro.

**That fix was the wrong layer, and the rebuild proved it.** She remade the form on the fixed build
and it STILL did not reach her computer. Skipping the ids *this device* knows were deleted only works
if the device knows every deletion ever made on any device — and that assumption cannot hold:

* Deleted ids are permanent and are UNIONED across devices (`_mergeTombstone`).
* But `customFormSeq` is rebuilt **per device** from the forms that still exist.

So a phone can hand a new form a number a computer retired months ago and never told it about in time.
The form then looks perfectly fine on the phone, while on the computer it is invisible AND stripped by
`_mergeForms` — **and the computer pushes that stripped copy back, deleting it from the account.** That
is exactly what her self-check showed: device and account identical, one custom form, no error anywhere.

**Real fix, two parts:**

1. **Form ids are now unique by construction** — `'custom_'+Date.now().toString(36)+random`, the same
   shape guides (`'g-custom-'+Date.now()`) and courses (`'c'+time+random`) have always used. A
   timestamped id cannot collide with any historical `customN` tombstone from any device, ever.
   **That guides and courses never had this bug is the diagnosis, not a coincidence** — it is why her
   aftercare guide crossed over and the consent form did not.
2. **`_healGhostForms()` repairs the damage with no action from her.** A form that EXISTS and whose id
   is on the deleted list is a contradiction — deleting removes the form and tombstones the id in one
   step, so holding both is damage, never intent. The heal re-keys such a form (moving its `tmpls`,
   `guides` and `emojis` entries with it) to a fresh unique id and persists, which pushes it. It runs
   in `_reloadAll()` after the pull (both forms and tombstones settled) and in `_reloadAfterHydrate()`.
   A genuinely deleted form is absent from `customForms`, so it is never resurrected.

The self-check also now lists her own forms **with their ids** on both sides, and flags the
contradiction directly: *"On your deleted list even though it still exists: … a form in this state is
invisible everywhere and cannot sync."*

Suites: `ghostheal.mjs` — the exact divergence (the computer retired `custom2`, the phone did not know,
the phone's form carries `custom2`): the phone repairs it, the questions travel with it, the repair
reaches the account, the computer finally shows it, the retired id stays retired, and a form she really
deleted is not resurrected. `ghost.mjs` covers the self-check detection.

**Her lost form:** if her phone still holds it, opening the app re-keys it and it appears everywhere.
If it was already stripped on both sides, it has to be remade once — and will then stay.

**If a form goes missing again:** get the self-check BEFORE re-creating it. If it says "only on this
device", the save never left the phone and the push path is the place to look. If the account has it
and the other device does not, it is the merge or `loadForms()`. If BOTH sides agree and the form is
simply absent, it was deleted — look at ids and tombstones, as here.

---

## 2x. The devices were never running the fixes (2026-09-19)

**Read this before debugging anything a provider reports.** Three fixes for the missing-form bug went
to `main` and each one came back "nothing changed". The fourth message finally said it: *"they are
both on the build ending in q."* Build `q` is `bc02260` — the fix BEFORE the real one. **Her devices
had never run the code being tested.** Every "still broken" was a report about old code, and each
reply aimed the next fix somewhere further from the truth.

Nothing in the app could say which build a device was on, and `slickchart.html` is 2.5MB behind a
service worker, so a stale copy is quiet and easy.

**Now the app checks itself:**
* `lib/app-build.js` holds THE stamp. `slickchart.html` carries the same string in its own
  `APP_BUILD` (it is standalone and cannot import), and **`scripts/check-build-stamp.cjs` fails if the
  two drift** — a mismatch would tell every device it is stale, for ever.
* `api/build-id.js` returns it. Public, no auth, no account data: one version string, identical for
  everyone, `Cache-Control: no-store`.
* `_checkForNewBuild()` runs after `Cloud.bootDone()`. Different from `APP_BUILD` → clear every cache,
  update the service worker registration, beacon anything pending, reload. A `sessionStorage` latch
  keyed on the live build means a misconfiguration can never become a reload loop, and an empty or
  failed answer does nothing.

**Run `node scripts/check-build-stamp.cjs` alongside `check-no-demo-data.cjs` after touching either
file.** Bumping `APP_BUILD` in the HTML alone is now a build failure, on purpose.

Suite: `buildcheck.mjs` — up-to-date device does not reload, stale device reloads exactly once, empty
answer ignored.

**The lesson, bluntly:** when a provider says a fix did not work, confirm the build they are on before
believing the fix failed. Three rounds of increasingly wrong theories came out of skipping that, and
the missing-form diagnosis (§2w) is still UNCONFIRMED against her real data for exactly this reason.

---

## 2y. THE form bug: boot pushed the DEFAULT forms over her real ones (2026-09-19)

**This is the actual root cause of the missing form AND the reverting renames.** §2w's id theory was
wrong; so was the round before it. The clue that cracked it was Ashley mentioning a second symptom:
*"i keep changing microneedling consent to microchanneling consent and it keeps going back."* A
bundled template reverting has nothing to do with custom-form ids — both symptoms are `sc_forms`
edits not surviving, so they had to be one bug.

**The mechanism.** `sc_forms` is ~82KB, so it is offloaded to IndexedDB (§2e), which answers
asynchronously. Boot's `loadForms()` runs during script evaluation, reads nothing, and leaves
`formTmpls` as the **bundled defaults** with `customForms` empty. A migration
(`_migrateSkinConcernLongText`, `_migratePhotoReleaseWording`, `_ensureBundledFormQs`) then calls
`persistForms()`. With no previous copy to diff against, `_stampChangedEntries` stamped **all 75
templates with `now`** — and `persistForms` pushed that to the account.

Measured on the repro: an 83,934-byte push carrying `custom: 0`. Those timestamps beat every genuine
edit on every device, for ever, and the empty `custom` array wipes her own forms. **It fired on every
single app open**, which is why three fixes in a row changed nothing.

§2u's write guard was supposed to stop exactly this and did not: it guards the patched
`localStorage.setItem`, while `persistForms()` calls `_pushKeyNow()` **separately**, straight to the
account. The local write was refused and the bad value was uploaded anyway.

**Fix, four parts:**
1. `_pushKeyNow()` honours `_awaitingHydration(k)` — the hole. A value computed from an unread key is
   never sent, not locally and not to the account.
2. `persistForms()` returns early while `sc_forms` is awaiting hydration. `_reloadAfterHydrate()`
   re-runs the loaders the moment IndexedDB answers, so nothing is lost by waiting.
3. **`_stampChangedEntries` no longer stamps anything when `prevMap` is missing.** "I cannot tell what
   changed" must mean leaving the stamps alone, not claiming authorship of all 75. This is the root
   fix and it protects every other path into that function.
4. `saveFormBuilder` stamps the edited template explicitly (`formTmpls[id]={name,qs,_ts}`) rather than
   relying on a diff against a snapshot that may not exist.

Suite: `formstamp.mjs` — a pre-hydration boot pushes NOTHING, her rename and her own form both survive
it, a real edit afterwards still reaches the account, and `_stampChangedEntries(map,null,now)` stamps
nothing. `bulkstamp.mjs` is the bare before/after repro (before the fix it prints
`HER RENAME WAS REVERTED ON THE ACCOUNT: true`).

**Her account still holds the defaults** — days of every-boot overwrites. The rename has to be redone
once after this ships; it will stick.

**The lesson:** two symptoms that look unrelated are evidence, not noise. The rename reverting was
diagnostic in a way the missing form never was, because it ruled out every id-based theory in one
line. Ask for the second symptom sooner.

### §2y still was not enough — the RESIDUAL damage, and a self-inflicted wound

§2y stops new poisoning. It does nothing for the poison already sitting in her data, and her next
sentence was the one that actually cracked it: *"the spicule form and the microchanneling edit are on
my phone but not computer."* Phone and account both correct; **the COMPUTER was rejecting them.**
That is a one-sided problem, and `_mergeForms` narrows it to exactly two causes, because every other
path in it is an unconditional union.

**1. A bug I introduced in §2y, same day.** Both repairs (`_healGhostForms`, `_healBulkStamps`) were
wired into `_reloadAfterHydrate()`, which runs **BEFORE `Cloud.pull()`**. Both end in
`persistForms()`, which pushes. So the computer healed its own STALE copy and uploaded it over the
good one on the account, then pulled its own stale data back — on every open. A repair that runs
before the pull is a data-loss bug. **Repairs belong in `_reloadAll()`, after the pull, when local IS
the merged superset.**

**2. Poisoned timestamps, and timing matters.** Her computer's copy carries all 75 templates stamped
with one identical millisecond. `mergeMap` decides per template by `_ts`, so those beat her phone's
genuine rename. `_healBulkStamps()` clears them, but running it after the pull is **too late** — the
merge has already rejected the edit. `_healBulkStampsStored()` now cleans the STORED copy **before**
`Cloud.pull()`, writing through `_lsPersist` (local only, never pushes, because pre-pull this device
is not yet the truth). Five templates sharing one millisecond cannot be real edits; that signature is
the bulk stamp and nothing else.

**3. Undated tombstones are absolute for ever.** `hidden[id]` stripped a form regardless of age, so
the computer's long-ago deletion of `custom2` silently discarded the form her phone had since created
with that id — the only way a server-side form fails to reach a device. Deletions now record WHEN
(`hiddenForms[id]=Date.now()`), and `_tombBeats()` lets a deletion win only over something older than
it. A legacy tombstone (the literal `1`) still deletes an undated item — old deleted forms stay
deleted — but does NOT outrank a form carrying a real timestamp. Resurrecting a form she can delete
in one tap beats silently destroying one she just made.

Suite: `twodev.mjs` — her exact setup (edits on the phone and the account; the computer bulk-stamped
and holding `{custom2:1}`): the computer accepts the rename, the form arrives despite the old
deletion, the stamps are cleared, both render, and a form deleted TODAY stays deleted.
`mergeprobe.mjs` calls `_mergeForms` directly when the merge itself needs ruling in or out.

---

## 2z. STILL NOT FIXED after five builds — read this before touching forms again

**Status: UNRESOLVED.** Builds `q`, `19a`, `19b`, `19c`, `19d`, `19e` all shipped fixes for this and
none changed what Ashley sees. Do not ship a sixth theory.

**What is actually established:**
* Her phone holds the edits (a renamed template, a custom form). Her computer does not.
* Guide titles (`sc_resources`) sync fine between the same two devices. Only `sc_forms` fails.
* Her self-check has shown `sc_forms` device and account **byte-identical**, and has shown
  `Spicule Peel Consent (custom2)` present on BOTH device and account — while the Forms screen showed
  nothing. Data present, screen empty.
* A single-device rename through the real UI (Forms → Edit → Save → back) works: memory, storage and
  the card all update (`cardrename.mjs`). So the plain save path is NOT broken.

**What has been fixed along the way** (all real, none sufficient): the bulk-stamp poisoning
(§2y), repairs running before the pull and uploading a stale copy (§2y follow-up), undated tombstones
being absolute (`_tombBeats`), and — in `19e` — the screen still filtering on raw `hiddenForms[id]`
while the merge had moved to `_tombBeats`, so the sync could KEEP a form the list then hid
(`_formHidden`, suite `uifilter.mjs`). That last one matches "present in the data, invisible on
screen" exactly and may or may not be the whole story.

**WHY FIVE FIXES MISSED: every one was reasoned from code, never verified against her data.** Each
reproduced a plausible version of her symptoms in a test, went green, and changed nothing for her —
which proves the reproduction was not her situation. Stop reproducing guesses.

**The one thing that splits the problem** is now in the self-check, added in `19e`: it compares form
NAMES between device and account and prints the disagreements —

> Form names that disagree: “Microneedling consent” here vs “Microchanneling consent” on the account

* Account has her new name → the phone's push works, the COMPUTER is rejecting it → the merge, and
  `_mergeForms` narrows it to `hidden[]` or the per-template `_ts` comparison; nothing else in it is
  conditional.
* Account has the OLD name → the edit never left the phone → the push path, and five builds have been
  aimed at the wrong machine.

Those need opposite fixes. **Get that line from the COMPUTER before writing any more code.** Suite:
`namediff.mjs`.

**Diagnostics that exist** (all behind five taps on the version stamp, no everyday UI): per-key device
vs account bytes and edit times, her own forms with ids on both sides, forms on the deleted list that
still exist, and now the name disagreements. `mergeprobe.mjs` calls `_mergeForms` directly with two
blobs when the merge itself needs ruling in or out.

---

## 3. Open threads — needs Ashley, or needs verifying

1. ~~**Square `payment.*` webhook subscription.**~~ **CLOSED 2026-09-18 — it is subscribed and has
   been all along.** Her webhook logs show `payment.created` / `payment.updated` delivering and
   returning 200 (which only happens after our signature check passes). Paid-course unlocking no
   longer exists anyway (§2p). The webhook still carries bookings, refunds and catalog sync, and
   `GET /api/square/webhook` reports whether it is configured.
2. **Progress photos may never have reached real clients.** `/api/guide-file` only allowlisted
   `fileId`/`guideId`, not `pid`, so a client's own shared before/afters 404'd silently. Fixed in
   `1bb5602` — but Ashley should turn on photo sharing for one client and open their link to confirm.
3. **Re-send the check-ins from 2026-09-12.** Anyone who tapped a *push* that day hit the tokenless
   link. If any of them filled something in on the sample screen, it went nowhere.
4. **Acuity and Vagaro export paths are unverified.** `import-profiles.json` maps their column names
   but shows no click-path, and no `/switch/from-*` page publishes for them. Flipping `verified: true`
   requires somebody actually walking the export in that product — never from docs, a search, or
   memory. Recipe in `switch-src/README.md`.
5. **Android notification icon** (`ic_stat_notify.xml` + manifest meta-data) is committed but needs a
   native rebuild. Ashley asked to hold on shipping an app update.
6. **`/api/sync-request`** is no longer called from anywhere; the table still holds requests people
   submitted. Ashley chose to leave it. Offer to pull that list before it's forgotten.
7. **Landing FAQ** still promises a new profession "usually ready within a few days at no extra cost."
   Ashley's own commitment, deliberately left alone.
8. ~~**The free funnel has never been run end to end by a human.**~~ **CLOSED 2026-09-15 — Ashley ran
   the whole checklist herself and the emails arrived:** bad address refused → real signup with a
   `+alias` → email arrives → link opens the artifact → signing up twice sends nothing → the day-1
   email lands. Don't re-open this; if something in the funnel changes, re-run it rather than
   asking her again.
9. **The numbers in free-funnel emails 5 and 7 are unverified** — Claude's plan at $20–100/mo, Apple
   $99/yr, Google $25 once, the 28-day D-U-N-S. Her own claims from her own build, left exactly as
   she wrote them. Prices move; she was asked to re-read before the first send.
10. **Stray `subscriptions` rows from pre-fix roadmap sales.** "Check for stray subscription rows"
    in Admin tools lists them (founder-only, read-only, `api/admin/stale-subs.js`). Each one is also
    a free SlickChart subscription nobody paid for, because `subscriptions` is what decides who gets
    a paid account. **Nothing has been deleted** — that is a live billing decision and it is Ashley's
    to make. Ask before writing to that table.
11. **Did check-in auto-send actually start working?** The phone fix only helps once clients re-sync
    and a booking enters the 24h window, so the first real test is the morning after 2026-09-17. If a
    client still gets nothing, the remaining candidates are the `hasApp` gate (the server needs
    `opened_at` or a push subscription) and `autoSendOn` reading a `sc_checkin_cfg` KV copy that
    disagrees with what the app shows.
12. **iPhone push needs the APNs key added in Vercel.** The sender is built, tested and deployed,
    but dormant until `APNS_KEY_P8` / `APNS_KEY_ID` / `APNS_TEAM_ID` exist. Ashley is on Android so
    nothing of hers is blocked; any iPhone provider gets no push until this is done.
13. ~~**Did the signup fix work?**~~ **CONFIRMED 2026-09-17 — Ashley: "push notifications are
    working again".** The cause was the `_alreadyPaid` gate in `api/signup.js` suppressing BOTH the
    founder email and the push (see 2k). Do not reinstate that skip. `notify_log` still records every
    attempt if it ever regresses.
14. **baremarissajoi@gmail.com** — the provider who paid and could not log in (2026-09-17). Ashley
    sent her the "Create an account with the same email" steps. **Find out which branch she landed
    on:** if creating the account worked, the rescue cron now covers that case for everyone. If it
    said the account already existed, then signup ran and the WELCOME EMAIL failed to send, which is
    a separate and more serious bug affecting every new provider — chase it.
15. **`BUILD_EXCLUDE_EMAILS`** is still unset in Vercel. Her own test purchases therefore count in
   the Build Your Own App stats.
16. **`sunkissedbeautyllc1@gmail.com` gets a deliberately FREE month on 2026-10-15.** Ashley comped
   Riquelle one month for her patience through the §2q hours bug, via a Stripe coupon
   ("Thank you — 1 month on us", 100% off, duration `once`) applied to her subscription on
   2026-09-18. **Her Oct 15 invoice will be $0.00 and that is correct — not a billing failure.** Her
   subscription stays `active` throughout, so nothing in the app changes (a coupon was chosen over
   pausing or cancelling precisely because `canceled` locks a provider out, which is what happened to
   her once already). Plan is $10.00/month, billing on the 15th. Nothing to do; this note exists so
   nobody "fixes" it.
17. **Seven synced keys still have no per-item merge** — `sc_protocols`, `sc_service_menu`, `sc_docs`,
   `sc_routines`, `sc_vendors`, `sc_staff`, `sc_inventory`. Since §2r they are safe from junk (the
   `setFromServer` guard), but a stale device can still overwrite newer data on them: edit vendors on
   the phone, then open a laptop tab that has been sitting open since yesterday, and the laptop wins.
   The fix is the `_mergeAuthoredById` + tombstone pattern courses and resources already use, one key
   at a time, each with its own "a delete must not come back" test. Not a same-day change.

---

## 4. Build Your Own App — built and live on this deployment

Ashley's $97 product. Four files, no new infrastructure:

| File | Serves | Does |
|---|---|---|
| `build.html` | `/build` | the landing page |
| `build-unlocked.html` | `/build/unlocked` (a `vercel.json` rewrite) | the access page |
| `build-access.html` | `/build/access` (a `vercel.json` rewrite) | "I lost my email" — sends the links again |
| `api/build-checkout.js` | | starts a Stripe Checkout Session |
| `api/build-unlock.js` | | verifies the purchase, returns the links, emails them once |
| `api/build-access.js` | | finds a buyer's paid sessions in Stripe and re-sends |
| `api/admin/build-buyers.js` | | owner-only CSV of the buyer list |
| `lib/build-sales.js` | | records a sale, pings the founder, owns the access email |

**The gate is stateless.** Stripe redirects to `/build/unlocked?session_id=cs_...`; that page asks our
server, which asks *Stripe* whether the session is paid. A `cs_` id can't be forged into a paid one
because we never take the caller's word for it. No buyers table, no licence keys, and **no second
Stripe webhook** — which would have needed its own signing secret alongside SlickChart's
`STRIPE_WEBHOOK_SECRET`. Don't add one unless there's a reason the success redirect can't cover.

Config lives in Vercel env vars so price/video/Artifact changes are never a deploy:
`BUILD_PRICE_ID`, `BUILD_VIDEO_URL` (YouTube, Vimeo or a direct `.mp4` — all three render),
`BUILD_ARTIFACT_URL`. `STRIPE_SECRET_KEY` is already set for SlickChart. Until the two `BUILD_` URLs
are set, a paid buyer is told their purchase went through and where to email — never "not found".

### Four things here that already bit once — don't undo them

1. **A roadmap sale is NOT a subscription.** Both arrive at `api/stripe-webhook.js` as
   `checkout.session.completed`. The unguarded handler wrote the buyer into `subscriptions` with
   `status='active'` — which is what `api/login.js` gates a paid SlickChart account on — so a $97
   buyer got a free subscription, Ashley got a "New PAID provider" push, and the paid count was
   wrong. The guard checks `metadata[product]=build` AND `mode`: a subscription checkout is always
   `mode='subscription'`, so anything in payment mode can never reach that table. It really happened,
   on 2026-09-13, to the first purchase.
2. **Never fire-and-forget on a serverless function.** `build-unlock.js` started the access email and
   the sale recording, then responded without awaiting them. Vercel freezes the function the instant
   it responds, so the DB write and the Resend call never ran: the first buyer got a perfect access
   page and no email. Both are awaited now. Same trap applies to anything added there later.
3. **The once-only email marker releases on failure.** It used to be written before the send and left
   in place if the send failed, so a purchase that never got its email looked sent forever and no
   reload could fix it. `/build/access` deliberately has no marker — it always sends — which is the
   way back in when a marker is already stuck.
4. **Two products, two mailing lists.** `addToAudience` auto-picks the account's FIRST Resend audience
   when none is named, so reusing it for buyers would merge them into SlickChart provider marketing.
   It now takes an explicit audience; the build path passes `BUILD_AUDIENCE_ID` and adds nothing at
   all when that is unset. Consent comes from Stripe's checkout tickbox
   (`session.consent.promotions`) and is stored per purchase as yes / no / **null = never asked**.
   Null is not consent — don't collapse it to a no, and don't market to it.

Extra env vars beyond the three above:

- `BUILD_EXCLUDE_EMAILS` — comma separated; their purchases are left out of the stats and the buyer
  export (Ashley's own test buys). Deliberately does NOT suppress the push or the access email, so a
  test purchase still exercises the whole delivery path.
- `BUILD_AUDIENCE_ID` — **leave unset.** Ashley's Resend account has ONE audience, holding her 40
  SlickChart contacts. Pointing this at it merges the two products' mailing lists, which is the exact
  thing the separate variable exists to prevent. Her plan surfaces Segments (groupings) and **Topics**
  (subscription categories, "let users choose the content they want to receive") — Topics is the right
  mechanism: a buyer on a "Build Your Own App" topic can't be reached by a SlickChart broadcast even
  in a shared audience. Not built yet: resend.com is blocked by this environment's egress proxy, so
  the exact API shape for topics is unverified and guessing it would fail silently (the audience call
  swallows its own errors). Get the snippet from the `</>` button on the dashboard's Topics tab first.
  If a topic is ever created, make it NON-default — a default topic auto-subscribes the existing 40.

Buyer consent is stored on `build_purchases.marketing_opt_in` regardless of any of this, so nothing is
lost while the Resend side is undecided; `/api/admin/build-buyers?format=csv` exports it.

**Rendering an email to look at it.** `CLAUDE.md` §3 says not to import `lib/*` locally because
`@neondatabase/serverless` isn't installed — but a two-line stub at
`slickchart-vercel/node_modules/@neondatabase/serverless/` (gitignored, already there) makes it
importable, so `accessEmailBody()` can be rendered to real HTML and screenshotted instead of eyeballed
as a string. That is how the branded access email was checked, including what it looks like with
images blocked.

There is also a `~/Desktop/Build-Your-Own-App/` folder on Ashley's Mac (START-HERE, PROMPTS, docs, the
video). Nothing from it is in this repo; the four files above were written from scratch to keep it
simple. If anything there needs porting, read it first rather than assuming.

## 5. House rules that are easy to miss

- **Ship it.** Ashley has standing permission-to-merge; verify first, then push to `main`. Don't park
  work on a branch and ask.
- **Verify before saying "fixed."** Drive the app headless — Chromium at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, Playwright at
  `/opt/node22/lib/node_modules/playwright/index.js`. Serve over `http://127.0.0.1:8899` (not `file://`
  — CORS blocks the PUTs) and use **one** `**/api/**` route handler; Playwright matches the most
  recently added route first, so a catch-all added last swallows everything. `/api/cloud-status` must
  return `{"enabled":true}` for cloud sync to switch on.
- `CL` and `Cloud` are `const` — mutate in place, don't reassign. Top-level `function` declarations
  *are* overridable window props; top-level `let` is not on `window` but is in scope for `evaluate`.
- Run git from the repo root `/home/user/SlickChart`, build scripts from `slickchart-vercel/`.
- Tone with Ashley: plain answers, own failures without defensiveness, don't over-claim. She runs her
  real business on this and has been through a data scare.
