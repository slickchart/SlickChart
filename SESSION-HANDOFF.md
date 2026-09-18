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

## 3. Open threads — needs Ashley, or needs verifying

1. **Square `payment.*` webhook subscription.** Paid-course auto-unlock depends on Square sending
   `payment.updated` to `/api/square/webhook`. The handler and signature check exist and are tested,
   but nobody has confirmed `payment.*` is actually subscribed in the Square app settings. A $1 test
   course on herself would settle it. The client's "Already paid? Refresh" button is the safety net.
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
