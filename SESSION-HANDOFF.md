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

## 2ab. CHECK THIS FIRST when a provider says two devices don't sync

`/api/store` keys every read and write on `payload.u` from the verified token — **either a provider id
or the literal `'owner'`** for the legacy single-tenant login (see `requireLogin`). Two devices signed
in on the same email through different paths use **different `kv` rows**: each device perfectly
self-consistent, its self-check reporting device == account, and neither ever seeing the other's
edits. That is indistinguishable from "sync is broken" from the outside, and **no amount of reading
the sync code can rule it out** — the sync would be working correctly the whole time.

The self-check now prints it:

> Which account row this device saves to — `prov_a1b2c3d4e…` — this MUST be identical on every device

**Get that line from BOTH devices before touching sync code again.** Different → the answer is a
sign-in problem, not a merge problem. Suite: `whichrow.mjs`.

### CORRECTION: there was no §0 bug, and "fixing" it created one

I claimed `_tokenOwner()`'s `split('.')[0]` was reading a JWT header and shipped `[1]` in `19i`.
**Wrong.** These tokens are `b64url(payload) + '.' + hmac` — **TWO parts** (`lib/auth.js signToken`),
so `[0]` IS the payload and the original code was correct. `[1]` is the SIGNATURE, which differs per
session, so on `19i` every device fell back to `'t:'+signature` and no two devices on the same account
could agree. Both of Ashley's reports showed that useless value. Reverted in `19j` and covered by
`tokrow.mjs`, which builds tokens the way `signToken` actually does (two devices, same account,
different sessions → same id; different account → different id).

The owner guard it feeds (another account's offloaded cache is purged rather than read) **was working
correctly all along.** Do not "fix" it again without reading `signToken` first.

**Lesson: read the code that MINTS a value before writing code that parses it.** This cost a build and
sent Ashley to run a diagnostic that could not work.

### What her two reports (both on `19i`) actually established

* `sc_forms` is **byte-identical on the phone, the computer and the account** (82,355B), and **both
  devices list `Spicule Peel Consent (custom2)`** under "mine here" and "mine on account". Neither
  reports a name disagreement. **The data has arrived on the computer.**
* Her phone showed `sc_brand_colors` device 13 min ago vs account **1 min ago, DIFFERENT** — the
  account carrying an update her COMPUTER made two minutes earlier. **Both devices are on the same
  account row**, so the §2ab theory is dead.
* Her phone restored *"2 courses were missing from this device — put back from your account backups."*
  Sync is actively working.

**So if the computer's Forms screen still does not show the form, the data is there and the LIST is
hiding it** — a display filter (`_formHidden` / `hiddenForms`), not sync. That is the next place to
look, and it is a much smaller surface. Her last screenshot of that screen was from an older build,
before `19e` stopped the list hiding forms the merge had kept, so it needs re-checking before
assuming.

**ANSWERED — see §2ac. It was neither sync nor a display filter. `loadForms()` never ran.**

---

## 2ah. Forms sent to clients: re-send FIXED, "disappears after the appointment" NOT REPRODUCED

Ashley reported two things (`2026-09-19t`):

1. a pending form vanishes from the client's app once their appointment time passes — even by a
   minute — so a client filling it in the waiting room cannot get back to it;
2. a client who opened the link but did not finish never sees it again, however many times she
   re-sends it.

### (2) RE-SEND — real, fixed, verified

The client app hides anything whose `(formId + assignedAt)` is in its `sc_forms_done` map. **Five of
the six provider-side send paths skipped a form that was already on the pending list**, leaving the
old `assignedAt` untouched:

```js
if(formTmpls[fid] && !c.pendingForms.some(pf=>pf.formId===fid))
  c.pendingForms.push({formId:fid, assignedAt:Date.now()});   // already there ? do nothing
```

So once the client's app had marked it done — which happens on an incomplete or failed submit as
well as a real one — re-sending changed nothing at all. Same id, same timestamp, still filtered.

`_assignPending(list, key, id)` now refreshes `assignedAt` when the item is already pending, and all
six sites (forms AND guides) use it. `_assignFormsToClient` — the FIRST-VISIT PACKAGE path — already
did this correctly, which is why that one send sometimes worked when others did not.

Verified by `scratchpad/resend.mjs`: first send and re-send now produce different instances with one
entry on the list. Note the test needs an ~8ms gap; two sends inside the same millisecond are
indistinguishable by design and harmless.

### (1) THE DISAPPEARANCE — SOLVED (`2026-09-19u`). It was the client's own device.

Her third detail settled it: *"neither the banner nor clicking the link worked, i also sent a NEW
link and that didn't pull it up in their app either."* A new link rules out everything provider-side
— and nothing provider-side removes a pending form except a real submission event
(`slickchart.html:24345` and `:24558`). So the form was on the server's pending list the whole time
and the CLIENT's app was hiding it.

**Why.** `_ffSubmit` marks the form done OPTIMISTICALLY, before the submit lands, so the pre-visit
flow does not stall on the network. `_ffRestore` un-marks it if the submit fails — but only while
the app is still running. Close the app, lose signal, or have the tab killed mid-submit and the mark
survives in THAT DEVICE's `sc_forms_done` for ever. No link the provider sends can clear it. That is
all three of her symptoms at once: banner gone, link shows nothing, new link shows nothing.

**Three fixes, all covered by `scratchpad/formspersist.mjs` (13 checks):**

1. *The mark expires when nothing backs it up.* `_FORM_DONE_TRUST_MS` = 12h. If the provider still
   lists the form as pending and has no record of receiving it, the mark stops being trusted and the
   form returns on its own.
2. *A form genuinely received stays hidden.* `_providerHasSubmission()` reads `client._forms` (a real
   client's received-forms list; `p.forms` is the demo one) and the provider payload now carries
   `formId` on those entries as the proof. Nobody is asked to fill the same thing twice.
3. *Re-sending works* — see (2) above, `_assignPending`. That is the immediate escape hatch when a
   client is sitting in front of her.

Plus the time-gate gap closed earlier in this section: an unfinished form is no longer taken away
with the check-in card when the appointment time passes.

**Field names that cost time here:** the provider payload calls received forms `forms` (not
`submittedForms`), and on the client a REAL client's copy is `client._forms`, while `p.forms` is
demo-only. `p.submittedForms` does not exist on the client at all.

---

## 2ag. BOOKING-LINK FLOW: full audit (`2026-09-19s`)

Ashley asked for every function in the new booking-link flow to be checked. `scratchpad/bookflow.mjs`
drives the whole provider side and is now in the suite — **15 checks, all passing**:

* a request from the public link lands as pending and raises a notification;
* a RE-DELIVERED event duplicates neither the request nor the notification;
* confirm → out of pending, marked confirmed, and an appointment appears on the calendar;
* decline → out of pending, marked declined;
* suggest another time → marked suggested, nothing left pending;
* clearing a notification removes it, and it stays gone when the event is re-delivered AND after a
  full reload; decisions survive the reload too.

### Real hole found: "deleted stays deleted" had a CEILING

`_saveNotifState()` kept only the newest **800** cleared ids and 1200 read ids; `_mergeSeenEvents`
kept **1000** event ids. Measured in `scratchpad/notifcap.mjs`: after 900 further dismissals, a
specific cleared notification **was pushed off the list**, losing its protection entirely. It did not
resurface in that run only because its booking still existed — the ingest is idempotent only while
the booking is present (`if(_existBk)return;`), so had the booking been missing, the notification
would have come back. A busy practice passes 800 dismissals in a season.

All three ceilings are now **5000**. They exist only to stop unbounded growth, so they belong where a
real practice will not reach them for years. ~20 bytes an id ⇒ ~100KB, which the ≥24KB offload moves
to IndexedDB by itself rather than spending the 5MB localStorage budget.

### Server side, read and verified

* `api/book-request.js` — resolves the provider by slug; refuses when booking is off; requires the
  WHOLE appointment to fit inside her hours (not just the start); enforces `leadHours` and
  `horizonDays`; in instant mode re-checks the slot at submit and falls back to a plain request
  rather than risk a double-book; find-or-create is scoped `WHERE provider_id = ...`; `upsertClient`
  and `logEvent` both carry the provider id; rate-limited per IP (6/min) and per slug (30/min).
* `api/book-slots.js` — returns free time strings only. No client data of any kind.
* `api/consult-request.js` / `consult-requests.js` — public side resolves by slug; provider side
  takes the id from the verified token and `listConsultRequests(provider)` is scoped.

### Still worth knowing

The ingest's idempotence depends on the booking still being in `sc_bookings`
(`if(_existBk)return;`). §2af gave that key a merge so a stale copy can no longer drop one, and the
5000-id horizons mean a cleared id survives far longer — but the two protections are related. If a
booking is ever genuinely removed while its event id is still live, it WILL come back as pending.
That is by design (the event is real), but it is the mechanism behind the original report.

---

## 2af. "Every time I deleted an appointment request it came back" — FIXED (`2026-09-19r`)

A provider reported this on 2026-09-18. It is **not** the same thing as the appointment merge in
§2ad-b: booking REQUESTS live in `sc_bookings` (SlickBridge), not `sc_manual_appts`.

`sc_bookings` was synced (it starts `sc_`, and is not in `_SYNC_SKIP`) but rode the **plain
overwrite** with no merge and no delete record. So a device holding an older copy could put a
request back to `pending`, undoing a decline. And the incoming-event ingest treats a request it
cannot find as new:

```js
let _existBk=null;try{_existBk=(SlickBridge.getBookings()||[]).find(x=>x&&x.id===ev.id);}catch(e){}
if(_existBk)return;                       // idempotent ONLY while the booking is still in the list
```

so once a stale copy dropped a booking, the next sync **re-created it as pending**. That is the loop
she described. (Note `_mergeSeenEvents` caps at 1000 ids, so on a busy account old events do become
"fresh" again — which is what feeds the re-create.)

**Why the merge-coverage check never flagged it:** SlickBridge writes through a generic
`write(key,val)` helper rather than a literal `setItem('sc_bookings', JSON.stringify(x))`, and the
detector scans for the literal form. **Worth widening.**

**Fix:** `_mergeBookings()` in the pull dispatch. Union by id so a real request is never lost; a
DECIDED request (confirmed / declined / suggested) beats any copy that still says pending, whichever
side it came from; two decisions are settled by the newer `decidedAt`; and `seen` is sticky the way
thread read-state is.

**Proved by A/B** (`scratchpad/bookreq.mjs`, now in the suite). Without the merge:

```
2. she declines it on the computer.   account: bk1:declined/seen
3. the phone (still stale) syncs.     account: bk1:pending/unseen
4. she reopens the computer.          request is: pending; pending list shows 1   <-- her report
```

With it, step 4 reads `declined`, the pending list is empty, and the account heals back to
`declined/seen`. Step 3 still shows the account being overwritten — that is expected; what matters
is that her device no longer adopts it.

### Regression this introduced and fixed in the same build

`_dropBootShrinks` (§2ae) first treated ANY object losing a key as lost data. `sc_brand_colors` is a
settings blob whose keys are FIELDS, so clearing a setting looked like deletion and the save was
blocked — `hydrate.mjs` caught it. `_idsOf()` is now deliberately narrow: an array counts only when
every entry carries an `id`, and an object counts only when every value is itself a record (a map
like `sc_clients`). Settings blobs are not collections and the guard skips them.

---

## 2ae. SCALE SWEEP (`2026-09-19p`) — measured, with one fix and one UNFIXED data-loss window

Ashley asked for a sweep for data bloat and scale problems. Two harnesses do the measuring, both in
`scratchpad/`; **run them after any change to sync, storage or a loader**:

* `freshaudit.mjs` — boots a BRAND-NEW account against an empty server and reports every key it
  stores and every byte it uploads. Nothing there is her data, so everything it finds is the app
  seeding itself into her account.
* `scaleaudit.mjs` — seeds a busy practice (800 clients, 60 courses, 150 guides, 400 products, 300
  services, 250 stock items, 300 appointments, ~3MB) and reports boot timing, every upload with its
  largest keys, per-screen render time and DOM node counts, and device storage by key.

### GOOD: a new profile is clean

**7.8KB across 20 keys**, nothing offloaded to IndexedDB. The slim-forms work holds — `sc_forms` is
not stored at all for a fresh account (it was 82KB). Largest are `sc_shop_catalog` 1.9KB,
`sc_affiliate_links` 1.6KB, `sc_courses` 1.5KB. Boot makes 5 upload requests totalling 17.6KB, of
which **#1 and #2 are near-duplicates 21ms apart** — worth a look, not urgent.

### FIXED (`2026-09-19q`): boot no longer wipes her courses from the account

The bug: on a busy account the pull stored her 60 courses, and moments later an upload replaced them
with the app's 5 built-in ones. The account held five stock courses instead of sixty until the next
pull merged them back, and any device syncing in that window would have adopted the stock list.

**Why four earlier attempts all missed.** `bootDone()` sets `_booting = false` BEFORE it flushes the
boot batch, so the offending upload is always technically post-boot. Every guard written against
`Cloud._booting` was reading a flag that had already been cleared. A diagnostic line inside the
guard printed `booting=false; serverSeen has key=true; sending 5 vs account 60` and settled it in
one run, after tracing at `setItem`, `fetch`, `sendBeacon` and XHR had all come back empty (the
write never touches disk, and the app's own patched `setItem` can swallow it).

**The fix carries no timing at all.** `_dropBootShrinks()` runs on every upload path (`_send` for
the queue, `_pushFlushNow` for the batch). An upload that DROPS entries the account is known to
hold (`Cloud._serverSeen`) is allowed only when **every dropped id is on a delete list** — the union
of the `_TOMB_OBJ` / `_TOMB_ARR` keys (`sc_hidden_courses`, `sc_hidden_forms`, `sc_deleted_clients`,
`sc_deleted_appts`, …). Deleting really deletes; losing things does not.

Verified at 1000 clients: the account reports her 60 courses at BOTH pulls instead of dipping to 5.
`appts.mjs` still passes, which is the check that matters — a cancelled appointment still syncs as
deleted, because the cancellation is tombstoned and the guard consults exactly those lists.

**Residual, not fixed:** 5 app-default courses still end up merged onto the account (60 in, 65 out).
That is bloat, not loss, and it is the same family as the 82KB templates. The union merge treats the
device's starter content as data worth keeping; a stock-content predicate was tried and reverted
because it changed nothing while the real bug was still live. Worth retrying now that it is fixed.

### Server-side isolation: swept and clean

`scripts/check-tenant-isolation.cjs` (now in CI) reads all **106** endpoint files for the two shapes
§0.1 forbids: an owner-ish identity taken from `req.body` / `req.query`, and SQL against a
per-provider table (`clients`, `kv`, `client_events`, `square_connections`, `providers`,
`course_versions`) with no owner column in the statement. Four hits, all three files read by hand
and correct:

* `admin/kv-health.js` and `admin/provider-lookup.js` — both verify the token, check the session is
  still valid, and gate on `FOUNDER_EMAILS` using the **token's** email. The email in the request is
  the subject being looked up, never the authorizer.
* `request-reset.js` — the email is necessarily the input; it always returns 200 and is rate-limited
  per email, so it reveals nothing (§0.4).

Recorded in the script's ALLOW list with reasons. **If any of those three files changes, re-read it
rather than trusting the allow entry.**

### 1MB re-uploaded on every boot of a busy account

Unchanged data: 469KB `sc_clients`, 294KB `sc_courses`, 130KB `sc_affiliate_links`, 70KB
`sc_shop_catalog`. **Partly addressed:** every echo check compared exact STRINGS, and loaders
re-serialise with different key order, so identical data read as an edit. `_sameSyncValue()` now
compares canonical JSON in all four places (`push`, `_pushKeyNow`, `bootDone`, `_pushFlushNow`).
This did not by itself remove the 1MB, because those values genuinely differ at push time — for
courses because of the bug above, and for `sc_shop_catalog` because it is DERIVED data rebuilt from
products, stored, synced, and pushed twice per boot. Derived data arguably should not be a synced
key at all.

### Rendering: every row, every time

No virtualisation or paging anywhere. 800 clients ⇒ **9,639 DOM nodes** (192ms), shop 7,620 (84ms),
inventory 4,780 (112ms). Fine at this size, linear from here: 3,000 clients is ~36,000 nodes and
seconds of layout on a phone, plus the memory. Worth paging the Clients, Shop and Inventory lists
before a practice that size arrives.

### Not a problem, checked

Messages do NOT lose data across devices — an earlier reading of that was an artefact of seeding
`sc_msgstore` without matching `sc_threads`. With threads seeded the account keeps all 404KB.
Device storage totals 2.71MB with only 0.02MB in the 5MB localStorage box; the ≥24KB offload is
doing its job.

---

## 2ad. THE ROOT CAUSE, found by a sweep: boot's own write-back made the pull SKIP the key

`2026-09-19m`. This is almost certainly the real answer to *"I made it on my phone and it isn't on
my computer"*, and it is a whole CLASS of the bug, not one library.

`Cloud.pull()` had this guard:

```js
// Never overwrite a key that still has a pending local write queued
if(this._queue && hasOwnProperty(this._queue,k)) return;
```

The intent is right: a note saved moments before a reload must not be clobbered. But it could not
tell **her edit** apart from **boot's own write-back of defaults**. Every loader that normalises or
re-seeds a value writes it straight back on open — the code already notes this produced *forty*
identical uploads per boot.

So on a device that had just opened:

1. loaders queue `sc_staff`, `sc_courses`, … with the built-in defaults,
2. the pull sees a pending write for those keys and **skips them entirely**,
3. the account's real data never lands on the device,
4. the queued defaults then flush and **overwrite the account**.

The stale side wins and uploads itself — which is exactly why both devices kept reporting the same
bytes while her data was missing from one of them.

**Fix:** `Cloud.push()` records keys queued while `_booting` in `Cloud._bootQueued`. The pull honours
the guard only for keys NOT in that set, and drops the boot-queued write before storing the account
copy. A genuine edit made during boot still wins; a default write-back no longer does.

**Found by `scratchpad/sweep-crossdevice.mjs`**, which makes a real item in ten libraries on one
device and requires it on the other. Before the fix, courses and staff failed every time.

### RESOLVED (`2026-09-19o`) — it was `_savePersistenceSweep()` on boot's own navigations

The intermittent half of this was a SECOND instance of the same principle, one layer down.

`_savePersistenceSweep()` is the "persist everything on every navigation" safety net, called from
`nav()` (and from `pagehide`). Boot navigates — Home draws before the network answers — so it ran
during boot, when there are no edits to protect and the in-memory libraries still hold the DEFAULTS.

If one of those boot navs landed in the window **after** the pull stored the account copy and
**before** `_reloadAll()` read it back into memory, it wrote the defaults over the real data on disk
and pushed them up. A race, which is why it reproduced about one run in three rather than every time.

**Fix:** `_savePersistenceSweep()` returns immediately while `Cloud._booting`. Same principle as
`Cloud._bootQueued` — boot's own write-backs are not edits — applied to the navigation path instead
of the queue path.

**How it was found, worth repeating:** the sweep said the ACCOUNT had the course and the receiving
device's STORED copy did not. That rules out every theory about loaders and merges and points at one
thing: something wrote over the pulled data after it landed. `/tmp/coursefail.mjs` reproduced it on
the first run by replaying the sweep's exact scenario and dumping account vs stored vs memory.

**Measured after the fix:** `sweep-crossdevice.mjs` 6/6 green (it was failing 2 runs in 3), and the
isolated course repro 4/4. Staff is no longer part of the app at all (see below).


* **26 loaders read synced keys but were never re-run after a cloud pull** — shop products, shop
  bundles, protocols, staff, homecare, recommendations, note templates, note format, documents,
  needle presets, notification settings, automations, body maps, check-in log, healing stages,
  summary drafts, suggested forms, deleted forms/guides, and more. Same bug as the course that
  vanished: the data lands on the disk and never reaches the app. All are now `_reloadStep`s.
* **Three permanent checks** so none of it silently returns:
  * `scripts/check-reload-coverage.cjs` — every loader reading a synced key must be in `_reloadAll`.
  * `scripts/check-merge-coverage.cjs` — a NEW accumulating synced key may not join the plain
    -overwrite path (CLAUDE.md §0.6) without a recorded decision.
  * `scratchpad/sweep-crossdevice.mjs` — the ten-library A→B runtime sweep.
* **`sc_manual_appts` now MERGES** (`2026-09-19n`). It was the sharpest of the unmerged keys — a
  device that had not synced since before she added an appointment would push its older list back
  and the booking was gone everywhere. It now uses `_mergeAppts` → `_mergeAuthoredById` with
  **`sc_deleted_appts`** as the delete record, which is in `_TOMB_OBJ` so cancellations union across
  devices and a merge can never resurrect one. Appointments are stamped `_ts` on create AND on edit
  so the newer version wins; `_pruneDeletedAppts()` strips cancelled ones on load, and the
  first-paint initialiser honours the list too. Covered by `scratchpad/appts.mjs`, which checks all
  four directions: phone→computer, computer→phone, a stale device cannot wipe a booking, and a
  cancellation sticks.
* **Still open (thread 16):** the remaining unmerged accumulating keys listed in
  `check-merge-coverage.cjs`: `sc_note_drafts`, `sc_photo_index`, `sc_pro_vc_invites`,
  `sc_sent_routines`, `sc_summary_guides`, `sc_imported_products`, `sc_deleted_sq`, plus the older
  set (inventory, vendors, bundles, protocols, staff, docs, …).

---

## 2ac-FACTS. What Ashley OBSERVED on build `2026-09-19k` (8:36 PM, her computer)

Her words and her numbers. These are settled — do not re-derive them, do not adopt a theory that
contradicts one (CLAUDE.md §1b).

13. **`Every part of the app reloaded after syncing — all steps ran`.** No reload step threw. The
    §2ac fix below is real but it was NOT her bug. The reproduction matched her screenshot and was
    not her situation.
14. `Which account row this device saves to — p_bc6d4fe33c…` — a real provider row, so the
    `_tokenOwner` revert landed and both devices agree.
15. `sc_forms: device 82355B | account 82355B | identical | 76 forms, 1 of your own, 17 guides |
    mine here: Spicule Peel Consent (custom2) | mine on account: Spicule Peel Consent (custom2)`.
    **No ghost line and no NAMES DISAGREE line** — and both ARE included in the plain-text report
    she pastes, so their absence is real evidence, not a gap in the report.
16. The Forms screen at 8:35 PM still showed `Microneedling consent` and **no Custom forms section**.
17. *"the spicule form has never carried over but the spicule guide has. same with the
    microchanneling"* — the GUIDE crosses devices every time; the FORM never has, not once.
18. *"these should carry over the same way the courses do. my new courses i've made show both on
    computer and phone"* — courses cross devices fine.
19. Her self-check's big-box line names what lives in IndexedDB: `sc_affiliate_links, your logo &
    brand colours, sc_client_homecare, your client list, sc_deleted_clients, **your forms**,
    sc_merged_into, sc_payments, sc_shop_catalog, sc_square_catalog`. **Courses and guides are not
    in it.** The one library that will not cross devices is the one stored differently from the two
    that do.

**Read 17 + 18 + 19 together.** That is the shape of the bug, in her own observations, and it points
at the offload path (`_lsPersist` / `_hydrateOffloaded`), not at sync and not at the form list.

---

## 2ac. SOLVED — `_reloadAll()` was one try/catch, so one bad record hid her whole app (`2026-09-19k`)

This is the answer to the bug that cost eleven builds: *"I made a form on my phone and it isn't
showing on my computer,"* and *"I keep renaming Microneedling consent to Microchanneling consent and
it keeps going back."*

**It was never a sync bug.** Every sync fix shipped for it was aimed at the wrong thing, which is why
every one of them changed nothing.

### The mechanism

`_reloadAll()` — the function that re-reads every library into the app after a cloud pull — was
written as **one `try{ … }catch(e){}` wrapping about thirty bare statements**:

```js
function _reloadAll(){try{
  …
  if(typeof loadCourses==='function')loadCourses();          // <- statement 6
  loadProfessions();applyProfessionConfig();
  …
  if(typeof loadForms==='function')loadForms();              // <- statement 14
  loadBizInfo(); … loadClients(); … loadMessages(); … loadInv(); …
}catch(e){}}
```

A throw in **any** of those statements jumps straight to the outer `catch`, which swallows it. Every
statement after it never runs — and the app shows no error at all.

So one malformed record anywhere in her data (a course, a guide, a bundle) meant:

* `loadForms()` never ran → `formTmpls` and `customForms` stayed at the **built-in defaults**.
* The Forms screen therefore showed **"Microneedling consent"** (the bundled name) and **no Custom
  forms section** — while `sc_forms` on that same device held the rename and the custom form.
* `loadClients()`, `loadMessages()`, `loadInv()`, `loadSquareCatalog()` never ran either — which is
  exactly her other report: *"it takes a minute for everything to load and looks like there's
  nothing there, Square isn't connected."* Same single cause.

### Why every self-check said everything was fine

The self-check reads **stored** data (`_lsGet('sc_forms')`). Storage was always correct — that is why
it kept reporting `device 82355B | account 82355B | identical | mine here: Spicule Peel Consent
(custom2)`. The screen reads **memory**. The gap between them was the whole bug, and nothing printed
it.

### Reproduction (`scratchpad/reloadstep.mjs`, now a suite test)

A computer with its own IndexedDB profile, a phone that renames a built-in and adds a custom form,
and **one** reload step made to throw. Output before the fix — her screenshot, exactly:

```
pc  stored custom : ["Spicule Peel Consent"]     <- on the disk
pc  memory custom : []                            <- not in the app
pc  sections      : [… no "Custom forms" …]
pc  cards         : [… "Microneedling consent" …]   <- the old name
pc  hidden        : {}                            <- nothing was being filtered
```

### The fix

Each step runs inside its own `_reloadStep(name, fn)`. A step that throws is recorded and the
remaining steps still run. **Nothing in that list may depend on the step before it succeeding.**

The self-check now prints **"Parts of the app that failed to reload"** with the step name, so a
future instance of this is one screenshot, not eleven builds.

### The lesson worth keeping

`try{ … 30 statements … }catch(e){}` is not error handling, it is a silent single point of failure.
Anywhere a list of independent loaders shares one catch, one bad record takes out all of them. Check
`_reloadAfterHydrate()` stays per-step wrapped too (it already is).

---

## 2aa. THE ROOT CAUSE: every account stored the app's own 75 built-in form templates

Ashley, after six failed builds: *"this is an account with barely anything because its brand new,
only 2 forms … you're saying that the upload is too big … that is a tiny amount of information when
talking about businesses with full practices. if this is an issue with 2 forms how is this supposed to
handle what it is supposed to."*

**She was right and the §2v/batch-size explanation was treating a symptom.** Measured on a brand-new,
never-touched account (`whatsinit.mjs`):

```
sc_forms total : 82,434 bytes
of which tmpls : 81,232 bytes across 75 templates
her own forms  : 0  (2 bytes)
```

`persistForms()` wrote **all 75 built-in templates** — which ship inside `slickchart.html` — into every
provider's `kv` row, including `equine-intake`. Then `_mergeForms.mergeMap` compared all 75 per-entry
by `_ts` on every sync between devices. **A rename of ONE form was competing with bookkeeping on 74
templates she had never opened**, and that is where her edits kept dying. It also explains the 1.5MB
account, the oversized batch, and the "couldn't back up" banner — all downstream of this.

**Fix:** `persistForms()` stores only templates that DIFFER from the bundled set. `_snapshotBundled()`
captures the pristine templates at the top of the first `loadForms()` (before anything stored is
merged over them); `_isBundledUnchanged()` compares ignoring `_ts`. Anything absent falls back to the
copy inside the app, which is what `loadForms()` already did.

**82,434 bytes → 1,204. The merge surface goes from 75 entries to however many she actually edited.**

Old accounts still carrying the fat blob load unchanged and shrink on their next save (covered).

Suite: `slimforms.mjs` — renames a built-in form through the real UI, asserts the account stores ONE
template, a second fresh device shows the rename, all other built-ins are still present, and a legacy
fat blob loads then shrinks while keeping the rename. `whatsinit.mjs` prints the breakdown any time
this needs re-measuring.

**The lesson, and it is hers:** when a provider says the amount of data is implausible for the
symptom, believe it and go measure, rather than explaining why the symptom is reasonable. Six builds
were spent downstream of a number that should have been questioned the first time it appeared
(her self-check showed `sc_forms` at 81KB on day one).

---

## 2z-FACTS. What Ashley OBSERVED, in her words. Treat as settled.

**Do not contradict anything in this list with a theory read out of the code. See CLAUDE.md §1b.**
Add to it as she reports; never argue with it.

| # | She observed | When |
|---|---|---|
| 1 | Made a form ("Spicule Peel Consent") **on the phone**, saved, closed the app. **Not on the computer.** | first report |
| 2 | The aftercare GUIDE made at the same moment **did** reach the computer. | first report |
| 3 | Remade the form after a fix; **still not on the computer**. | after `19a` |
| 4 | Renames a form (Microneedling → Microchanneling) and **it goes back to the old name**. | after `19c` |
| 5 | "The spicule form and the microchanneling edit are **on my phone but not computer**." | after `19d` |
| 6 | Both devices confirmed on the **same latest build** each time she reports. | throughout |
| 7 | Screenshot, PHONE: shows "Microchanneling consent" AND "Spicule Peel Consent" under Custom Forms. | `19e` |
| 8 | Screenshot, COMPUTER: shows "Microneedling consent", **no Custom Forms section at all**. | `19e` |
| 9 | Guide title "Microchanneling aftercare" **does** show on the computer, on the same screen as the un-renamed form. | `19e` |
| 10 | Self-check (PHONE): `sc_forms` device == account, byte-identical, no name disagreements, Spicule present on both. | `19e` |
| 11 | **COMPUTER shows the banner "Changes couldn't back up to the cloud yet, they're saved on this device and will sync when you're back online."** | `19f` |
| 12 | Re-edited and saved on the PHONE first, then checked the computer — still not there. | `19f` |

**What these facts prove, without any code reading:**
* The direction is **phone → computer**, and it has been stated since the first message (1, 3, 5, 7, 8).
* `sc_resources` syncs between the very same two devices; only `sc_forms` fails (2, 9).
* Her account HOLDS the edits — fact 10 is from the phone, and the phone's copy matches the account
  (10 + 7). **So the COMPUTER discards them on arrival**, it is not a push problem.
* The forms screen can show nothing while the data is present (8 + 10).

**Fact 11 is the one that mattered and it came from her screen, not from code.** That banner is only
shown by `Cloud._flush` when the PUT to `/api/store` comes back NOT-OK and the items are re-queued
(`_retryLater`). So her computer **could not write to her account at all**, and sat in a retry loop
pushing its stale copy. Nothing on the receiving side could work while that was true.

**Cause: a batch with no ceiling, which I introduced.** §2v coalesced boot's forty small uploads into
ONE request. Her settings total ~1.5MB (`sc_forms` 82KB, `sc_brand_colors` 95KB, client list,
payments, Square catalog…), so that single PUT was big enough to fail. Batching was right; batching
without a limit was not. `Cloud._MAX_BATCH` (350KB) now splits a flush across requests, holding the
remainder in the queue, and `_pushKeyNow`'s batch hands anything over the ceiling to that same queue.
A single key larger than the ceiling still goes alone. Suite: `batchsize.mjs` — 5×300KB queued at once
goes out as five requests, none oversized, every key lands.

**Fact 10 was misread once** as "the account does not have her edits", by not recording which device
it came from — which contradicted facts 1, 3 and 5 and cost a build aimed at the wrong machine.
**Always record the device.**

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
still exist, the name disagreements, and a log of the last few form saves. `mergeprobe.mjs` calls
`_mergeForms` directly with two blobs when the merge itself needs ruling in or out.

### The direction, finally established (build `19f`)

Two screenshots settled it: her PHONE shows "Microchanneling consent" and "Spicule Peel Consent"
under Custom Forms; her COMPUTER shows neither. Her self-check reported **no name disagreement**,
which is only possible if that report came from the phone — so **the account HAS her edits and the
COMPUTER discards them on arrival.**

**ALWAYS ASK WHICH DEVICE A SELF-CHECK CAME FROM.** The same report means opposite things depending
on the answer, and one hour was spent concluding the exact reverse from it.

`19f`, two changes:
1. **An UNDATED (legacy) tombstone no longer strips a form the ACCOUNT is carrying.** Deleting removes
   a form from the account as well as tombstoning the id, so a form still on the account is one some
   device actively wants — it only inherited the id back when ids were a recycled counter. Undated
   means "cannot prove it is newer", which must not be enough to destroy her work. A DATED deletion
   still works normally, on both the merge and the screen (`_formHidden` agrees). Suite:
   `legacytomb.mjs`.
2. **A form save now verifies itself.** `_verifyFormSave()` reads back the single key
   (`GET /api/store?key=sc_forms`, added for this — owner still from the verified token) and confirms
   the name is really on the account. Not there → push again → still not there → tell her plainly
   instead of saying "Form saved". Every save is recorded in `_formSaves` and printed by the
   self-check. Suite: `verify.mjs`.
   Also: the hydration guard in `persistForms()` used to `return` silently, which DROPPED an edit made
   in that window. It now retries after 600ms.

**Why this matters more than the fix itself:** the app now reports whether a save reached the account
at the moment it happens. Five builds were spent guessing at that one fact.

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

---

## §2ai. Diana (esthieguild@gmail.com) — "all my info is deleted after about an hour". OPEN.

A SECOND provider, not Ashley, on her own account. Reported by email over four days.
**These are HER OBSERVATIONS. Per CLAUDE.md §1b they are ground truth — do not re-derive
them, do not discard one because a theory needs it to be false.**

1. **Sep 25, 7:48 PM** — "I checked again, and after about an hour, all of my saved client
   information — including notes, summaries, and product plans — is deleted. I even purchased
   the subscription after storing the data, but it is still gone. I have tried starting a new
   session, saving it, and sending it, but nothing seems to work."
2. **Sep 26, 12:16 PM** — "I love it so far but it looks like all my info is just deleted after
   a hour. Let me know if you can find it to[o] cause I know a few clients I added stuff and I
   can't remember it all."
3. **Sep 29 (relayed by Ashley)** — "I'm still getting used to the new system... I've been
   updating my clients' photos and notes, but when I check back a day or two later, the changes
   aren't saved. This is happening when I use the AI brief to categorize product notes —
   specifically on items I save for myself but mark not to send yet. Am I uploading these
   incorrectly?"

Facts to hold on to, in her words, NOT conclusions drawn from them:
- The window she names is **about an hour**. Twice.
- What is lost: client **notes, summaries, product plans, photos**.
- She is a **new account** ("still getting used to the new system", Re: Welcome to SlickChart
  on 9/25).
- She **bought the subscription after** the data was already stored, and the data was still gone.
- She tried **a new session, saving, and sending** — none of it helped.
- The path she names is the **AI brief → categorize product notes → saved for herself, marked
  NOT to send yet**.
- She expects it back: "let me know if you can find it."

NOT yet established (do not assume either way without asking her):
- Which device(s). One or two. Phone, computer, or both.
- Whether "an hour" is wall-clock since entry, or since she closed the app.
- Whether she was signed in the whole time.

### What was found, 2026-09-29 — and it matches her report exactly

**The mechanism.** `sc_workspace` is a COMPOUND blob written by `persistWorkspace()` holding
`clientRecs` (the product plan), `recReasons` and `clientHomecare`. `loadWorkspace()` assigns all
three straight over the live objects. It was pushed immediately on every edit, plain-overwrote on
pull, and — because its shape is mixed (three objects AND an array) — `_idsOf()` returned null for
it, so `_dropBootShrinks()` skipped it entirely. The dedicated keys were no better off:
`sc_client_recs`, `sc_client_homecare` and `sc_session_summaries` are maps whose values are ARRAYS,
a shape `_idsOf()` also returned null for.

So a device holding a partial copy could upload a map with clients missing, over the account's full
copy, **with no guard and no warning**. The entry lost is not a field — it is that client's whole
product plan, homecare list or set of visit summaries. Which is what she lost, and what she named.

The path she named — AI brief, categorize product notes, save for herself, not sent — is
`_setRecReason()` -> `_persistWorkspaceSoon()` -> `persistWorkspace()`, i.e. the blob above.

**Reproduced on the shipped build (2026-09-19u)** before changing anything: given an account holding
three clients' plans and a device holding one, `_dropBootShrinks` ALLOWED the upload for both
`sc_client_recs` and `sc_workspace`, and `_idsOf` returned null for both shapes.

**Fixed in 2026-09-29a:**
- `_mergeClientMap` + `_CLIENT_MAP_KEYS` — `sc_client_recs`, `sc_client_homecare`,
  `sc_session_summaries`, `sc_rec_reasons`, `sc_body_maps` union BY CLIENT on pull. The account's
  copy still wins where both sides have the client, so nothing inside an entry changes behaviour;
  the only change is that a whole client's entry can no longer vanish. Deleted/merged clients
  (`_goneClientIds`, which unions the live `_deletedClientIds` map with the on-disk record) are
  dropped rather than resurrected.
- `_mergeWorkspace` — the same union for the three maps inside the blob, plus union-by-id for the
  provider's own custom products.
- `_idsOf` now recognises a map whose every value is an array. Deliberately narrow: an object of
  scalars is still not a record collection, because clearing a setting must still sync.
- `_compoundIds` teaches `_dropBootShrinks` to look INSIDE `sc_workspace`, namespaced per field.
- `check-merge-coverage.cjs` reads `_CLIENT_MAP_KEYS`; those six keys came off the thread-16 list
  (46 -> 52 merged, 44 -> 39 still unmerged).

**Verified headlessly**, both directions: stale device keeps all three clients on pull; a client only
the device has is kept AND pushed back; a deleted client is not resurrected; the bad upload is
refused for both keys; clearing a brand colour STILL uploads (the regression a previous session
caused here); a genuine delete still uploads. `sweep-crossdevice.mjs` passes, no page errors.

**Recovery.** The `kv` table keeps no history (`SET v = EXCLUDED.v`), so nothing can be read back
from the server. BUT `_mergeClientMap` pushes the superset back — so if ANY of her devices still
holds those entries locally, opening the app on that device on this build restores them to the
account by itself. Worth having her open every device she has used. If they were wiped everywhere,
it is gone and we should say so plainly.

**Still unknown, worth asking her:** which device(s) she uses, and whether "about an hour" is
wall-clock since entry or since she reopened the app. The fix does not depend on the answer.

### Follow-on, same day: four more per-client maps (build 2026-09-29b)

Same shape, same delete record, same mechanism — so they went in behind the first fix rather than
waiting for someone else to lose data to them:

- `sc_photo_index`  `{clientId: [photo…]}`. DERIVED from `capturedPhotos`, and merging is still
  right: this is how a device learns which photos the ACCOUNT holds for a client, including ones
  taken on the other device that this one has never downloaded. Diana's first message said
  "updating my clients' photos and notes", so this one is arguably part of her report too.
- `sc_note_drafts`  `{clientId: {date,sections,templateId}}` — unfinished visit notes.
- `sc_healing_stage`  `{clientId: <index>}` — a scalar per client, so `_idsOf` still will not treat
  it as a record collection (correct: an object of scalars is a settings blob). The union on pull is
  the protection here, not the shrink guard.
- `sc_summary_guides`  `{clientId: [{kind,id}]}`.

All four already `delete <map>[id]` on client delete and fold on client merge, so
`sc_deleted_clients` / `sc_merged_ids` is the right delete record and no new tombstone was needed.

Verified headlessly: photos keep both clients when the device only downloaded one; a client only the
device has is kept AND pushed back; the shrink guard refuses a photo index that lost a client, but
still allows the upload when that client was genuinely deleted. The earlier regression checks
(clearing a brand colour still uploads, a real delete still uploads) all still pass, and
`sweep-crossdevice.mjs` is clean.

merge-coverage: 52 -> 56 merged, 39 -> 35 still plain-overwrite.

`check-merge-coverage.cjs --list` now prints the remaining ones. The next pass is the authored
LIBRARIES (`sc_docs`, `sc_protocols`, `sc_custom_note_templates`, `sc_needle_presets`, `sc_autos`,
`sc_inventory`, `sc_vendors`, `sc_shop_bundles`, `sc_partners`, `sc_payments`, `sc_checkins`). Those
are arrays of authored records and each one needs a DELETE RECORD before it can union, or the merge
resurrects everything the provider deleted — that is the real work, and it is why they were not done
here. The rest of the open list is genuinely one-record-per-account settings and is correct as is.

### §2aj. The authored libraries now merge too (build 2026-09-29c) — thread 16 mostly closed

Ashley asked for the rest of the list after the Diana fix. Twelve libraries of records the provider
made herself moved off the plain-overwrite path.

**Why they could not simply union:** a union with no delete record resurrects everything she ever
deleted. So each got one, and every delete site records it.

| library | key | delete record |
|---|---|---|
| documents | `sc_docs` | `sc_deleted_docs` |
| protocols | `sc_protocols` | `sc_deleted_protocols` |
| note templates | `sc_custom_note_templates` | `sc_deleted_note_tmpls` |
| needle presets | `sc_needle_presets` | `sc_deleted_needle_presets` |
| automations | `sc_autos` | `sc_deleted_autos` |
| inventory | `sc_inventory` | `sc_deleted_inv` |
| vendors | `sc_vendors` | `sc_deleted_vendors` |
| shop bundles | `sc_shop_bundles` | `sc_deleted_shop_bundles` |
| form & guide bundles | `sc_bundles` | `sc_deleted_bundles` |
| partners | `sc_partners` | `sc_deleted_partners` |
| payments | `sc_payments` | `sc_deleted_payments` |
| check-ins | `sc_checkins` | `sc_ci_cleared` (already existed) |

All eleven new records are in `_TOMB_OBJ`, so the delete records themselves union across devices.

**Three things this turned up that were not obvious:**

1. **`vendors`, `inv` and `partners` are stored with NO `id` field at all.** `_mergeAuthoredById`
   skipped any record without one, so using it unchanged would have DROPPED every vendor, every
   inventory row and every partner — the exact loss it exists to prevent. Their identity is now
   derived from what the provider typed (`_LIB_NATURAL`: name, or name+sku for inventory), which is
   stable across devices in a way a generated id would not be. A row with nothing typed in it yet
   has no identity, so it is kept as-is rather than dropped (`keepUnkeyed`).
2. **`sc_ci_cleared` is an ARRAY, not an `{id:ts}` map.** The old hidden-key read did
   `hidden[c.id]` against whatever it parsed, so reading an array would have missed every lookup and
   silently resurrected every cleared check-in. `_tombSet()` now normalises either shape.
3. **Hiding the demo content is a delete too.** Without a record of it the union brings the samples
   straight back from the other device, and for libraries whose rows carry ids the shrink guard
   refuses the upload outright — so "hide the sample data" would have quietly stopped reaching the
   account. All seven sample-purge sites now record it.

**Verified headless** (`scratchpad/libs.mjs`): account's extra documents kept; a document only this
device made is kept AND pushed back; a deleted document stays gone even though the other device
still has it; vendors with no ids union by typed name with no drops and no duplicates; a delete of
an id-less vendor sticks; inventory keyed on name+sku keeps two rows of the same name distinct; an
empty un-typed row is kept rather than dropped; a cleared check-in stays cleared through the
array-shaped record; a newer edit still wins; `_mergeCourses` behaviour unchanged. Plus the standing
regressions: clearing a brand colour still uploads, a shrunk document list is refused, a genuinely
deleted document uploads fine.

`sweep-crossdevice.mjs` clean. Fresh account writes ZERO delete-record keys (checked directly), so
none of this seeds anything into a new profile.

merge-coverage: **56 -> 79 merged, 35 -> 23 still plain-overwrite.**

**What is deliberately left**, and it is now nearly all correct as plain overwrite: one-record
settings (`sc_booking_page`, `sc_checkin_cfg`, `sc_login_email`, `sc_professions`,
`sc_service_menu`, `sc_totp_enabled`, `sc_wsname`, `sc_calendar_feed`, `sc_deposit_handled`,
`sc_summary_guide_optout`, `sc_notif_settings`, `sc_room_state_`), the deliberate exclusions
(`sc_captured_photos`), and a handful that are derived from Square or are genuinely per-account
lists nobody has decided about yet: `sc_affiliate_links`, `sc_amazon_assoc`, `sc_imported_products`,
`sc_square_catalog`, `sc_deleted_sq`, `sc_suggested_forms`, `sc_routines`, `sc_sent_routines`,
`sc_summary_drafts`, `sc_pro_vc_invites`. `sc_affiliate_links` is the most substantial of those (the
product catalogue) and is the obvious next one, but its custom products already ride
`sc_workspace.customProducts`, which DOES merge now, so the loss window is much narrower.

### §2ak. The shop catalogue (build 2026-09-30a) — and a regression from §2ai fixed with it

`sc_affiliate_links` now merges. It needed more care than the other libraries because a product can
leave the catalogue four different ways, and only two of them are the provider's decision.

**Two delete records, deliberately:**
- `sc_hidden_square` (already existed) stays the authority for a Square product she removed BY HAND.
  It survives a reconnect, which is the whole point of it.
- `sc_deleted_products` (new, in `_TOMB_OBJ`) covers everything else: her own products, the demo ones
  once hidden, and Square products dropped by a disconnect or by a catalog sync that no longer lists
  them.

**Automatic removals are withdrawable.** A disconnect or a reconcile is not her deciding to delete a
product, so `_libUnforget()` clears that record when Square carries the product again. It
deliberately does NOT touch `sc_hidden_square`, so a by-hand removal stays removed — there is a test
for exactly that (`unforget_leaves_manual`).

**Her own products had NO delete record at all.** `deleteAffiliate` only recorded Square ones. So
without this, a union would have brought back every product she ever deleted.

#### The regression this caught, from §2ai yesterday

`sc_workspace` carries a COPY of her custom products (`customProducts`), and the union I added to
`_mergeWorkspace` yesterday had no delete record. So as of yesterday's build, deleting a custom
product could be undone by the other device handing it back through the workspace key — even once
the catalogue itself got it right. `_mergeWorkspace` now consults the same two records.

It was live for one day. Worth remembering the shape of the mistake: **adding a union to a compound
blob silently re-opened a delete path that the dedicated key had covered.** Any future merge on a
key that duplicates another key's records has to share that key's delete record.

**Verified headless**, merge functions AND the real `deleteAffiliate` flow driven end to end with
`confirmModal` stubbed: her own deleted product stays gone; the workspace no longer resurrects it
but still unions genuinely new products; a by-hand Square removal survives; an automatic Square drop
holds and is then withdrawn when Square carries the product again; the shrink guard refuses a
shrunk catalogue but allows one whose losses are recorded. All earlier suites still pass,
`sweep-crossdevice.mjs` clean, fresh account still writes zero delete-record keys.

merge-coverage: **79 -> 81 merged, 23 -> 22 still plain-overwrite.**

What remains is genuinely settled: one-record settings, the deliberate exclusions
(`sc_captured_photos`), Square-derived caches that rebuild themselves (`sc_square_catalog`,
`sc_imported_products`, `sc_deleted_sq`), and a few small per-account lists (`sc_routines`,
`sc_sent_routines`, `sc_summary_drafts`, `sc_suggested_forms`, `sc_pro_vc_invites`,
`sc_amazon_assoc`). None of those is a library of authored work.

## §2al. Riquelle — "not receiving forms back that her clients are filling out". FOUND AND FIXED.

**Her observation (ground truth, CLAUDE.md §1b):** clients fill out forms and she does not receive
them. Ashley asked her to check whether they appear in the client file under saved forms; **that
answer had not come back when this was fixed**, so the question is still open and still worth having.

**The bug, reproduced on the shipped build before anything was changed.**

`_clientSubmit()` in slickchart-client.html blocks a double-tap with an in-flight lock keyed on
`kind + (payload._lock || '')`. **No form submission ever passed a `_lock`** — all three payload
construction sites (the pre-visit form, the package form, the signed consent) omitted it. So every
form on the device shared the single key `'form'`.

That collides with the deliberately optimistic pre-visit flow. On submit the app removes the form
from `pendingForms`, calls `_markFormDone`, fires the submit **in the background**, and immediately
`_advancePrevisitFlow()`s to the next item — which, for a multi-form package, is ANOTHER FORM. The
flow is built for this: `_previsitProgressHTML` renders "Step X of N" and the comments talk about
"a two-form package".

So: form 1 is still in flight, the client fills in form 2 and submits, `_clientSubmitInFlight['form']`
is still true, and form 2 returns `{ok:false,error:'inflight',duplicate:true}` **without ever being
sent**. Both callers then do `if(res&&res.duplicate)return;` — which is correct for a genuine
double-tap of the SAME form, but here it means no restore, no error toast, nothing. Form 2 stays
removed from the to-do list and marked done.

**The client believes they finished. The provider never receives it. Nothing logs anywhere.**
Intermittent by nature: it depends on how fast the client moves against how slow the network is,
which is exactly why it looks random and why it hits a first-visit package hardest.

**Fix:** every form payload now carries `_lock:'f:'+formId`, so the lock is per FORM. A real
double-tap of the same form is still deduped (and `_idem` still covers it server-side); two
different forms no longer collide. `_lock` is also now stripped from the body before the POST — it
names an in-flight slot on the device and has no business in the provider's stored event.

**Verified headless** (`scratchpad/formlock.mjs` reproduces, `formlock2.mjs` proves the fix):
before, only form 1 reached the network; after, both do. A double-tap of the same form still sends
once and still reports `duplicate`. A form and a check-in submitted together both go. `_lock` never
appears in a stored payload.

`api/client-page.js` regenerated (CLAUDE.md §3 — the client HTML is embedded there).

**Not ruled out, and worth asking her:** if her answer comes back "yes, they ARE in the client file
under saved forms", then the submission did arrive and the problem is in how she is being told about
it (notification / the Forms screen), not in the submit — a different bug from this one. This fix is
correct either way, but it would not be her whole story.

### §2ai (cont.) Diana's follow-up, 2026-09-30 11:18 PM — HER OBSERVATIONS, ground truth

Received after builds 2026-09-29a/b/c shipped. Verbatim facts, not conclusions:

5. **"I am following up on the app issue on my phone."** — the device is her PHONE. (Still not
   stated whether she also uses a computer. Do not assume either way.)
6. **"It works for some clients, but it is still deleting notes for others."**
7. **"For some profiles, old notes DO appear, and other data like home care, products, and photos
   are saved properly"** — so homecare, the product plan and photos are now behaving. Those are
   exactly the keys fixed in 2026-09-29a/b. Partial confirmation the merge work landed.
8. **"...but the SERVICE SUMMARIES remain inconsistent."** — narrowed to `sc_session_summaries`,
   which DOES merge as of 2026-09-29a. So the remaining fault is not the merge.
9. **THE WORKAROUND, and it is the diagnosis:** "if I check a client's service summary, close it,
   return to the client list, and click on the client again, the issue seems to temporarily
   resolve."

**What 9 means.** Re-navigating makes the summaries appear. So the data IS on the device — it is the
SCREEN that is not reading it. This is the same shape as Ashley's eleven-build forms bug, where the
fix that finally worked was making `renderForms()` read from disk on every draw rather than trusting
the in-memory copy. Treat a "navigate away and back fixes it" report as a RENDER/STALE-MEMORY bug,
not a sync bug.

Do not re-open the merge for this. Facts 7 and 8 together say the sync is now delivering the data;
fact 9 says the screen is showing a stale in-memory copy of it.

#### Found and fixed, build 2026-10-01a — and her workaround WAS the diagnosis

Two defects, both in "the data arrived but the screen never asked again":

1. **`_reloadAll()` never redrew anything.** It reads every library back into memory after the
   account pull and then just ended. On a phone, where the pull is seconds behind the first tap, a
   provider can open a client BEFORE her data lands, and that screen goes on showing what it drew
   from the defaults for as long as she stays on it. Her summaries were on the device AND in memory;
   the screen simply never asked again. Navigating out and back in is a redraw by hand — which is
   exactly the workaround she found.
2. **`_reloadAfterHydrate()` passed `_navCur.arg`, which has never existed.** `_navCur` is
   `{screen,data}`. So the one redraw that did exist navigated with an undefined argument, and a
   client screen bounced to the client list instead of redrawing.

Both now go through one `_redrawCurrentScreen()`, which refuses to redraw while an INPUT/TEXTAREA/
contentEditable has focus or a `confirm-modal` is open — never yank a screen out from under someone
mid-sentence.

Also applied the renderForms lesson to `renderSummaryHistory()` and `renderClient()`: both read
`sc_session_summaries` off the DISK at draw time. Storage is never behind memory, so this can only
add what memory is missing.

**Reproduced on the shipped build, then proved fixed** (`scratchpad/redraw2.mjs`). Note `_navCur` is
a `let`, so `window._navCur=…` does NOT reach the app's binding — the first version of this test set
it that way, measured nothing, and passed. It has to drive the real `nav()`.

| | shipped (2026-09-30a) | 2026-10-01a |
|---|---|---|
| `_reloadAll` redraws the open screen | no, zero nav calls | yes, `('client','cDIANA')` |
| summary on disk only, memory empty | screen says **"No summaries yet"** | renders it |
| redraw while typing | — | suppressed |
| redraw with a dialog open | — | suppressed |

That middle row is her report word for word: the note is on the device and the screen says it is gone.

**Caveat worth keeping:** this explains a summary that is PRESENT but not SHOWN. If she comes back
and says a summary is still missing after a full close-and-reopen of the app, that is a different
fault and the merge is back in scope.

## §2am. Product audit, built into Virtual Consult (build 2026-10-01b)

Diana asked for a way to write down client notes outside the session summary, so she could do product
audits after clients send their current routines. Ashley's call: build it as a feature, make the
routine step part of the consult BY DEFAULT, and make the invite setup obvious.

**Why it went in Virtual Consult rather than anywhere else:** VC already was invite -> client
submits -> provider reviews -> responds. The flow existed; only the routine was missing from it.

**What was added.**

*Client (slickchart-client.html)*
- A "What you use now" step on the consult submit screen, shown unless the invite says otherwise.
  Three fields per product — name, when (Morning/Night/Both/Now and then), and how it feels — chosen
  so it can be filled standing in a bathroom reading labels, not at a desk.
- Rides `_vcSubmitState.routine`, so it persists in the SAME draft as the photos. A failed send or a
  reload no longer loses a typed routine (`persistVcDraft` now counts routine rows as content).
- A photo-free consult can now be submitted on a routine alone, not just typed goals.
- Blank "Add a product" rows are dropped on submit (`_vcRoutineClean`).

*Provider (slickchart.html)*
- `_sanRoutine()` caps and strips every client-typed field before it reaches a screen, like
  `_sanVcPhotos` does for images.
- The review screen gets the audit itself: one feedback box per product plus ONE overall box,
  because the useful thing to say is usually about the shape of the routine, not a single bottle.
  Writes debounce (600ms) before persisting — the submission blob holds photos, so a keystroke-rate
  write would be brutal on a phone.
- Stored on `vcSubmissions[cid]` (`sc_pro_vc_subs`) and the flag on `vcInvites[cid]`
  (`sc_pro_vc_invites`). **No new synced key**, deliberately — both already sync and neither needed
  a new merge decision.
- The invite sheet now opens with "<Name> will be asked for" listing photos, their products, their
  goals and any attached form, and `_vcAsksSync()` keeps that list honest as she toggles things.
  That was Ashley's second ask: a provider could not previously tell what an invite would send
  without sending one.

*Back to the client*
- `routineReview` travels in `_assembleClientData`, **only once the consult is marked reviewed** and
  only if something was actually written. A client never sees a half-finished audit.
- Rendered at the top of "Your Routine" in the client app, and folded into the change signature so a
  new review actually re-renders.

**Verified headless end to end** (`scratchpad/audit.mjs`, `invitesheet.mjs`): the step shows and
hides with the invite flag; blank rows drop; the draft survives a reload; the submission carries the
routine; the provider screen lists products with the client's own notes; nothing reaches the client
before review and everything does after; the client app renders it. Invite sheet: summary present,
toggle on by default, summary tracks the toggle, and the invite carries true/false correctly.

All earlier suites pass, `sweep-crossdevice.mjs` clean, five CI sweeps pass, generated in sync, a
fresh account still writes zero delete-record keys.

**Not built, on purpose:** no repeating "add another product" FORM field type. The routine step is
bespoke UI inside the consult, which is where it belongs; a general repeater in the form builder is a
much bigger change and nothing needs it yet.

### §2am (cont.) Consult types are the provider's to edit (build 2026-10-01c)

Ashley, on the new invite sheet: *"it says Consult type and has a check for Skin Analysis. I'm not
sure why this is there if that is the only option."* She was right, and the reason is worth keeping:
`_vcKindOptions()` returned exactly ONE option per PROFESSION ticked, so an esthetician-only account
got a single radio button and no way to run a brow or lash analysis at all. Fifteen consult profiles
existed in the code; she could reach one of them.

**Now:** `sc_vc_types` is a normal authored library — merges by id via `_mergeAuthoredById`, delete
record `sc_deleted_vc_types` in `_TOMB_OBJ`, loader in `_reloadAll`. (83 keys merge, up from 81.)

- `_vcCatalogue()` is all 15 built-in consults regardless of profession. That is the menu she ADDS
  from, which is what lets an esthetician add "Brow analysis".
- `_vcAllTypes()` = her saved types, then the defaults matching her professions, minus hidden.
- **Nothing is seeded to storage.** A provider who never opens the editor has an empty
  `sc_vc_types` and still sees sensible defaults. This was deliberate: seeding a library at boot is
  the §2ad/§2ae write-back-over-real-data trap, and a fresh account still writes zero keys (checked).
- Each type has a `kind` (the base profile, which drives the photo prompts and the AI analysis copy)
  plus her own `title` and `photoLabels`. So "Brow analysis" gets brow metrics, not skin ones.
- **Editing a BUILT-IN makes a copy and hides the original** via `_libForget('sc_vc_types','def:<kind>')`,
  so the list never shows both. Synthetic `def:` ids are why a default can be hidden with nothing
  stored for it.
- An empty photo list is legitimate and means a consult with no photos. The invite sheet's "will be
  asked for" summary drops the photo line for those, and follows the SELECTED type rather than the
  first one.
- `_vcProfileFor()` now prefers the labels captured ON THE INVITE. A type renamed or deleted later
  does not change a consult she already sent.

**Verified headless** (`scratchpad/vctypes.mjs`, `sheet2.mjs`): esthetician-only starts at exactly
"Skin analysis" as before; catalogue is 15 and includes brow and lash; adding a brow analysis gets
`kind:'brow'` and brow photo prompts; editing a built-in renames with NO duplicate; a custom photo
prompt sticks and travels on the invite; the review screen follows the invited type; delete sticks.
Sheet: add button, per-row edit pencil, photo count follows the selection, photo line disappears for
a photo-free type.

All earlier suites pass, sweep clean, five CI sweeps pass, generated in sync.

### §2ai (cont.) Diana, 2026-10-02 — THE REDRAW FIX DID NOT FIX IT. New observations.

Build 2026-10-01a shipped the redraw fix. She is still losing summaries. **CLAUDE.md §1b rule 5: a
fix that ships and changes nothing means the reproduction was not her situation.** Do not defend the
redraw theory. These are her words:

10. "The client-friendly summaries not appearing in my app."
11. "When I open a client's profile, it displays **'no saved summaries' and 'no sessions'**."
12. "However, **all other information remains intact, including photos, home care routines, product
    analysis guides, and saved notes**." — so this is NOT a general data-loss problem. It is
    specific to summaries + the journey.
13. "**I am no longer able to preview the client-facing view.**"
14. "I recently completed and saved a client summary **less than an hour ago**, but **after logging
    out and logging back in, the summary had disappeared**." ← NEW AND SPECIFIC. Logout/login.
15. "so whether I leave it open, or I have to close it out, **the summary just keeps disappearing**."
16. "And so does **their journey**."

Screenshots show: the Session Summary COMPOSER with a 10-step homecare routine, products and an
aftercare guide all populated; Treatment Notes with Provider notes filled in; Progress Photos with
real before photos and a "1 session" badge. So she is composing real summaries and the rest of the
chart is healthy.

**What fact 14 means and why it matters most.** `_doLogout` awaits `_purgeOffloaded()` — signing out
deliberately wipes the IndexedDB offloaded store (CLAUDE.md §3). So ANY key that did not reach the
SERVER is destroyed by a logout. "Saved an hour ago, logged out, gone" is the signature of
`sc_session_summaries` never reaching the account, not of a stale screen.

So the question is no longer "why is the screen not showing it" (that was 2026-10-01a, and it was a
real bug, just not hers). It is **"why does a saved summary not reach the server"**.

Do not re-litigate 12: photos, homecare, guides and notes ARE fine. Whatever this is, it is specific
to summaries and the journey, and it must explain why those two and nothing else.

#### FOUND. Build 2026-10-02a. Two merges dropped the summary she had just saved.

A summary lives in TWO places, and **both discarded it**:

1. **`sc_session_summaries`** — `{clientId:[summaries]}`. `_mergeClientMap` (added 2026-09-29a)
   unions BY CLIENT and, where both sides hold a client, **keeps the account's copy**. I wrote that
   deliberately — "nothing inside an entry changes" — and it is exactly wrong for a list that grows.
   Account holds `[lastWeek]`, her phone holds `[justSaved, lastWeek]`, the pull keeps `[lastWeek]`.
2. **`c.summaries`** inside `sc_clients` — the client-facing copy, which lives ONLY there.
   `_unionClientForms` unions `submittedForms` and `signedForms` and **never touched `summaries`**,
   so `_mergeClients` picking a winning record wholesale dropped the loser's summaries. That is
   pre-existing, not mine.

Why only summaries and the journey: photos, homecare, product plans and notes all live in their own
keys, which merge correctly. Summaries are the only thing that lived solely in these two.

Why logging out finished the job: `_doLogout` purges the offloaded store, so anything that never
reached the account is destroyed. Both merges ALSO returned `changed:false`, so the device never
even tried to push the superset back. That is her fact 14 exactly.

**Fixed:** `_unionById` takes an optional per-value merge; `_CLIENT_MAP_LIST` names the per-client
maps whose entries ACCUMULATE (`sc_session_summaries`, `sc_photo_index`) and those union by day with
the newest `ts` winning. Everything not on that list keeps the old behaviour on purpose — removing a
product from a plan is a real edit and must not be undone. `_unionClientForms` now unions
`summaries` the same way.

**Reproduced on her build, then proved fixed:**

| | her build | 2026-10-02a |
|---|---|---|
| `sc_session_summaries` keeps the just-saved one | **no** | yes |
| `c.summaries` keeps it | **no** | yes |
| device pushes the superset back | **no** | yes |
| same-day EDIT wins without duplicating | yes | yes |
| a product removed from a plan stays removed | yes | yes |

**Recovery:** both merges now push the superset, so any device still holding her summaries will
restore them to the account on open. If every device has been logged out since, they are gone.

**Lesson for CLAUDE.md:** "union by client" is not enough when the per-client value is itself a
growing list. A merge has to know whether the thing inside accumulates.

#### Sweep of EVERY Diana complaint, build 2026-10-02b

Rather than wait for her to find the next one, each thing she has ever reported was turned into a
check (`scratchpad/diana.mjs`), run against the previous build and this one. Four were STILL broken
after the summary fix, including her very first report.

The common shape: `_mergeClientMap` kept the ACCOUNT's copy of a client wholesale. That is right for
a list where removal is meaningful and wrong for everything else.

| her words | key | was | now |
|---|---|---|---|
| "product plans" | `sc_client_recs` | ok | ok |
| **"AI brief to categorize product notes, items I save for myself"** | `sc_rec_reasons` | **LOST** | fixed |
| "home care" | `sc_client_homecare` | ok | ok |
| "photos" | `sc_photo_index` | ok | ok |
| "saved notes" | `sc_note_drafts` | **LOST** | fixed |
| "service summaries" | `sc_session_summaries` | fixed 10-02a | ok |
| "their journey" | `c.summaries` | fixed 10-02a | ok |
| body map placement | `sc_body_maps` | **LOST** | fixed |
| the workspace copy of the product notes | `sc_workspace.recReasons` | **LOST** | fixed |

`_CLIENT_MAP_OBJ` names the shape of each: `'map'` unions a bag of independent entries by key (the
account wins a collision — `sc_rec_reasons` is `{productId: note}`, and clearing one leaves an empty
string rather than removing the key, so a union resurrects nothing); `'stamped'` means ONE record per
client carrying `ts`, newest wins. `providerNoteDrafts` had no timestamp at any of its three write
sites, so it now carries one.

Three guards are asserted every run and must never flip: a product REMOVED from a plan stays
removed, a same-day summary EDIT updates rather than duplicating, and a DELETED client is not
resurrected.

**CLOSED by Ashley, 2026-10-06 — do not re-open this one.** The open question was what Diana meant
by "I am no longer able to preview the client-facing view": `_previewClientApp()` opens
`/client?preview=1`, the no-token path, which loads the DEMO client from `demo-seed-client.js`, so
there is no preview of a REAL client's app. The reading that matters is the Client summary tab going
empty, and the summary fixes cover that. Ashley's call: "let go of the part that is open and small, i
think we got it." Leave the Home "See what your clients see" tile as it is. Record kept only so a
later session does not rediscover it and start chasing her for an answer.

Also never explained: her "after about an hour". Nothing in the app runs on an hour timer; the
likeliest reading is "next time I looked". Not worth chasing unless she repeats it with a tighter
observation.

### §2ai (cont.) Diana, 2026-10-03 — "I DIDN'T LOG OUT". The logout half of §2ai was wrong.

17. **"I didn't log out, and this issue isn't occurring anywhere else."** ← kills the logout
    explanation. A pull can still drop a summary without a logout, but do NOT lean on logout again.
18. "When I checked earlier, the notes were still there, so I made them client-friendly and sent them."
19. "The summary was visible on her app at first, but when I checked again **20 minutes later**, the
    summary was gone **and the notes were no longer client-friendly**."
20. "I am unable to preview what she sees."
21. "this seems to be affecting **just the same summary**" — ONE summary, one client (Jennifer Ashley).
22. The client is a friend, so she can get reports from the client's side too.

**HER SCREENSHOTS ARE A TIMELINE, and they are the most useful thing yet:**

| time | screen | what it says |
|---|---|---|
| 6:21 | Jennifer's profile | **"1 saved summary"** · Last: Sep 30, 2026 |
| 6:24 | Session Summaries | **"1 summary"**, card shows the CLIENT-FRIENDLY text: *"Today was your very first facial, Jennifer, and you're already on a great path…"* |
| 6:55 | Jennifer's profile | **"0 saved summaries"** · "Finish a session to save one here" |
| 6:55 | Client summary tab | the note is now the RAW PROVIDER TEXT: *"Here's a recap of your visit, Jennifer: Performed the Restore Facial, including a Chocolate Enzyme treatment…"* |
| 6:55 | Provider notes | intact, and its TREATMENT PERFORMED box is that same raw sentence |

So within ~30 minutes, with no logout: the saved summary went 1 -> 0, and the client-facing note
REVERTED from her client-friendly rewrite to the raw provider note.

**That revert is the strongest clue in the whole thread.** The Client summary tab is rebuilding its
note from `providerNoteDrafts` because the saved summary record is gone. One cause, two symptoms.

So: something deletes the summary record **on a timer or a poll**, without a logout. That points at
the periodic client/event sync rather than at boot. Check `syncClientEvents()` and anything that
rebuilds `CL[id]` from the server's `clients` table — a server client record carries no `summaries`,
so overwriting the local record with it would wipe `c.summaries` on every poll.

#### Build 2026-10-03a — the client's own app was never healed

**Her screenshots predate the fix.** The 2026-10-02a/b merge fixes cover her exact record shapes,
verified directly (`scratchpad/jen.mjs`): server record with NO `summaries` key at all and a newer
`_uAt` (which is what `syncClientEvents` creates for a client that arrived via an intake link), server
record with an EMPTY array, account map holding an empty list for the client, account map missing the
client. All four now keep her summary and push it back.

**Mechanism, settled.** `syncClientEvents()` runs every 15s but only ADDS to a client record;
`_reconcileEventAttachments` likewise. Nothing on a timer empties summaries. The only thing that ever
did is `_mergeClients` on a PULL, and a phone PWA re-boots whenever it is backgrounded — which is why
it looked like a 20-30 minute timer and why "whether I leave it open or close it" made no difference.
No logout required, which matches fact 17.

**The hole this build closes.** The client's app does NOT read `sc_clients`. It reads the per-client
blob this device POSTs to `/api/clients`. So the merge could heal the provider's chart and the CLIENT
still saw nothing — exactly "the summary was visible on her app at first, but when I checked again it
was gone". `_mergeClients` now records every client it healed in `_repairedClientIds`, and a new
`_reloadAll` step re-sends those blobs via `_scheduleSpecificClientSync` once the loaders have read
the merged data back into memory.

Verified: chart healed, client queued, resend scheduled, queue cleared after, and nothing queued when
there was nothing to heal.

**What to ask her, and nothing else:** whether it STILL happens today, on this build. Her screenshots
are from before the fix shipped, so they cannot tell us. If it recurs on 2026-10-03a, the next thing
to get is her client's side — the client is a friend and Diana offered — because that distinguishes
"the account lost it" from "the client's app is not re-reading it".

### §2ai (cont.) Diana, 2026-10-05 21:58 — BETTER but not fixed, and now NARROW

23. **"The issue is still occurring. While the time between deletions is LONGER, the client summary
    ultimately disappears."** ← the fixes helped. Partial progress, not a miss.
24. **"All other sections, products, home care, the guide, and my notes, remain intact."**
25. **"The problem is specifically with the CLIENT SUMMARY, which fails to display, preventing
    clients from seeing their journey."**
26. **"It appears that everything is saving correctly except for the client summary."**

So the provider-side store (`sc_session_summaries`) and everything else now survive. What still goes
is `c.summaries`, the CLIENT-FACING copy that lives only inside the client record.

"Longer between deletions" is the tell: a merge either drops a thing or it does not, it does not get
slower. Something SIZE- or COUNT-dependent is more likely — a cap or a trim that only bites once the
record grows. Look for anything that trims the client blob to fit, and at the `.slice(0,8)` on
summaries in the sync payload.

### FOUND IT: the server replaced the whole client blob, so any device could wipe the summaries

`lib/clients.js` → `upsertClient()` wrote `data=${data}::jsonb` — the posted blob REPLACED the stored
one outright. Every sync from every device does this, for every client in the roster
(`_syncClientsToServer` posts `Object.keys(CL)`), and the posted `summaries` is just
`CL[id].summaries` as that device happens to hold it. So one device whose copy of a client had no
summaries yet destroyed the account's copy of them — and `clients.data` is the ONLY place the
client-facing summaries live, which is exactly why her products, home care, guide and notes (all
`kv`, all merging since §2ai) survived while the summary did not.

It also explains "the time between deletions is longer" without reaching for a size-dependent trim.
There is no such trim — the `.slice(0,8)` guessed at in observation 26's note is on the `animals`
sub-records only, not on `summaries`. The provider-side merges made the device's own copy correct
far more often, so it takes longer for a stale device to be the one that pushes. One unprotected
write was still enough, and no merge running on device A can protect the server from device B.

**The fix is in the statement, both branches** (`UPDATE`, and `INSERT … ON CONFLICT DO UPDATE`):

```sql
data = inc.d || COALESCE((
  SELECT jsonb_object_agg(k, clients.data->k)
    FROM (VALUES ('summaries'),('pendingForms')) AS t(k)
   WHERE <stored k is a non-empty array> AND <incoming k is empty or absent>
), '{}'::jsonb)
```

- An incoming EMPTY or ABSENT array never replaces a stored non-empty one. Narrow on purpose: it
  does not merge the lists, and a genuine shrink from 3 to 1 still lands. It stops the drop to zero.
- A shallow `||` overlay, so a blob that never had these keys does not sprout them.
- Both length tests sit INSIDE a `CASE`. SQL does not promise to evaluate `AND` left to right, and
  the first version threw `cannot get array length of a scalar` on a corrupted value — which would
  have failed that client's whole sync. The test below caught it.
- Cost, deliberately accepted: deleting your LAST summary needs a second write to stick. Visible and
  recoverable; losing the journey is not.
- Because the account's copy now survives, `_unionClientForms` hands it back to every device on the
  next pull. The guard repairs as well as protects. Summaries already destroyed before this shipped
  are only recoverable from a device that still holds them.

### The same look found a cross-account write hole (§0.1)

`ON CONFLICT (id) DO UPDATE` was conditioned on `clients.deleted_at IS NULL` and nothing else, while
the app minted client ids as `'c' + Date.now()` (bumped by 1 on a LOCAL clash only). Two providers
adding — or importing — clients at the same moment mint the same id, and the second provider's write
then replaced the first provider's row: her client's name, email, phone and whole data blob, summaries
included, inside her account. Found by a test asserting §0.1, not by reading.

- `DO UPDATE` now also requires `clients.provider_id = EXCLUDED.provider_id`, so a cross-account
  write matches no row.
- The re-read after it already existed; if it comes back empty the id belongs to someone else, and
  `upsertClient` now throws `id_taken`. `api/clients` reports that client in `failed` and the
  provider is told it could not be saved. A phantom token would have meant a client link that
  silently never worked.
- `_newClientId()` now appends a random tail. 2000 ids minted inside one millisecond, no duplicates.

### How to re-run the SQL tests

`slickchart-vercel/scripts/test-clients-sql.mjs` (committed, not in CI) boots a throwaway PostgreSQL
16 cluster, stubs `lib/db.js` onto it through
psql, imports the REAL `upsertClient`, and asserts 21 cases — the guard, the shrink that must still
land, the keys that must not be invented, junk on either side, the `ON CONFLICT` path, cross-account
rejection, the tombstone, and `phone` still being COALESCEd. Run it from the repo root after ANY
change to `lib/clients.js`:

    cd slickchart-vercel && node scripts/test-clients-sql.mjs

`@neondatabase/serverless` is not installed in the scratch env, which is why it goes through psql.
`initdb` refuses to run as root, so the script hands the cluster to a throwaway `pgtest` user and
makes its socket dir world-traversable. All 21 green on 2026-10-06a.

## 2aj. HEATHER (equestrian): every horse became its own client, mid-session (2026-10-07)

**What she OBSERVED** (ground truth — §1b; device not yet asked, ask her):

1. She is the equestrian provider. Horses were put **under the owner's client profile**, because an
   owner has more than one horse. Hers is the only account set up this way.
2. **While entering session notes today** it "suddenly reset" so the **horses are all their own
   clients** again.
3. Ashley told her **not to close the app**.

### Mechanism, reproduced

A horse IS a client record, tied to its owner by `ownerId` on the horse (`_isAnimal`, `_ownerIdOf`,
`_animalsOf`). `_mergeClients` picks **ONE WHOLE RECORD** by `_uAt` — it unions forms, summaries and
handled-marks inside the record, but everything else is take-it-or-leave-it. The horses-under-owners
edit added `ownerId`/`isAnimal`/`species` and nobody taught the merge about them, so a copy written
before the link existed — or one built by the `syncClientEvents` fill path, which gets its fields from
the server `clients` row and has no way to know an owner — **replaced a copy that had the link**. A
pull lands while she is typing notes and every horse in the account is suddenly a top-level client.

It happens in BOTH directions (account copy newer, or device copy newer), so preferring one side
fixes nothing. `scratchpad/heather.mjs` reproduces it: run it against `2026-10-06a` and every "link"
assertion comes back empty; against `2026-10-07a` all 13 pass.

**Her charts were never lost.** The repro confirms the records keep their notes, photos and summaries
through the merge — only the grouping broke, which is why it reads as "reset to their own clients"
rather than "data gone".

**What it was NOT:** `_mergeClients` is byte-identical across every commit from `2ab179d` through
`4ba4d8e`, so none of the merge work for Diana caused this. Checked, because Ashley asked directly.

### Fixed

- **`_carryAnimalLink(win,lose)`**, called in both branches of `_mergeClients`: carry `ownerId` (and
  `isAnimal`/`species` with it) onto the winning record whenever the winner hasn't got one. Safe
  because **nothing in the app ever unlinks a horse** — the only writes are `_addAnimalSave` creating
  one and the client-merge re-point at line ~1970 — so there is no deliberate action to undo. A
  dangling `ownerId` was already harmless (`_ownerIdOf` ignores an owner that is not in the roster).
  Returns true when it carried, so the merged superset is pushed back and the ACCOUNT is repaired
  too, not just the device that noticed.
- **A re-point still wins**: winner `ownerId=B` + loser `ownerId=A` keeps B (asserted).
- **Regular providers are untouched**: no link is invented on an ordinary client (asserted).
- **`animals` joined the protected keys in `lib/clients.js`** (§ above). It is the owner's list of
  their horses, each with that horse's own summaries and photos, so an empty one wipes what the owner
  sees in their app — AND it is the only copy of the grouping that lives anywhere but the provider's
  roster, which makes it the last fallback if a device ever loses the links. For a provider with no
  animals it is empty on both sides and the guard never fires.
- **"Choose owner" — the control that should have existed from the start.** An unlinked horse had no
  way back: `_addAnimalSheet` only ever CREATES one, so re-linking a horse that already had a chart
  meant retyping it or losing it. `_linkOwnerHTML`/`_linkOwnerSheet`/`_linkOwnerSave` offer it on an
  equine account for a client with no owner AND no horses of its own, so an owner's own chart never
  shows it, and a non-equine provider never sees it. **Deliberately no "unlink":** nothing records
  one, so `_carryAnimalLink` would put the link straight back — picking a different owner is how a
  mistake gets corrected. `scratchpad/heatherui.mjs` drives it end to end (18 assertions).

### Recovery, in order

1. The carry re-links automatically on the next pull **if either side still holds `ownerId`**. One
   refresh on `2026-10-07a`.
2. If both sides lost it, **"Choose owner"** on each horse's chart puts it back in seconds, with
   every note, photo and summary intact.
3. There is no third copy to recover from once the owner blobs' `animals` have been overwritten,
   which is why that guard shipped in the same build.

### 2026-10-07, from Ashley: she was on her PHONE, and the workspace STILL SAYS EQUINE

Both answers matter, and together they finish the story.

**Equine is intact → the `sc_professions` hazard below is RULED OUT by observation.** Do not spend
another minute on it. Her symptom was the links, not the mode.

**Phone → found how the linkless records were born, and it is worse than the merge.**
`syncClientEvents()` runs on a **15 second interval** and on **window focus** — i.e. every time a
backgrounded PWA comes back. It had no guard that this device had read its own roster yet. On a
phone the roster lives in IndexedDB (§2e), hydration is async, and boot has more awaits after it
before `loadClients()` runs, so a cold phone's boot can easily outlast a tick. In that window `CL`
is empty, and the fill path — the one that exists so a client created elsewhere isn't dropped —
**recreates the ENTIRE roster as blank skeletons**: no notes, no owner link, `treatment:'New
client'`. `scratchpad/prehydrate.mjs` proves it on `2026-10-07a` and shows it blocked on `b`.

Why she lost ONLY the grouping, which is the part that confused me: a skeleton carries **no `_uAt`
at all**, so `lu` is 0 and the ACCOUNT's real record wins the next merge, restoring her notes; the
per-client kv maps and `_unionClientForms` restore the summaries and forms. Nothing restored
`ownerId`, because nothing knew about it. **Hers is the only account with a field that lives on the
record and is not covered by any union** — which is exactly why hers is the only account where this
surfaced at all, and why it read as "the horses reset" instead of "my charts are blank".

Fixed by `_rosterNotReadYet()`, which compares what is on disk against what is in memory rather than
adding a flag or trusting boot order: ids this device has SAVED but not LOADED mean the read has not
happened. Deliberately false when there is no roster anywhere, so a brand-new provider still receives
a client created elsewhere (§2ah's "her intake never came through" fix — asserted, not assumed).

**Anything else that writes onto client records from a timer, a focus handler or an unload needs the
same question asked.** `_savePersistenceSweep` already returns while booting; `syncClientEvents` was
the one with a 15s interval AND a focus listener. Do NOT gate such a guard on `Cloud._booting`
(§2ad): `bootDone()` clears it before the boot batch flushes.

### Hazard found while looking, NOT shipped (ruled out 2026-10-07 — see above)

`_animalMode()` is `selectedProfessions.indexOf('equine')>=0`, and `sc_professions` is a
plain-overwrite sync key ("one selection" in check-merge-coverage). If the account's copy were ever
the stock default `['esty','wax','lash','brow']`, a pull would replace her selection and
`_ownerAnimalsHTML` + `_rosterSub` would stop showing horses account-wide (the roster indent would
survive — it reads `_ownerIdOf` directly). Only `saveProfessions()` writes that key and all three
call sites are deliberate taps, so this is unreached by inspection, and nothing she reported points
at it. Left alone on purpose: guessing a "non-default beats default" rule onto a sync key would lose
a genuine profession switch made on another device, and a speculative guard on a sync key is exactly
what caused the one-day `customProducts` regression. **Ask her whether the workspace still says
Equine before touching it.**

## 2aj-2. HEATHER, AGAIN and WORSE: clients themselves missing (2026-10-08) — OPEN

**What she OBSERVED** (ground truth, §1b — do NOT re-litigate any line of this):

1. **She had 4 clients. The app now shows only 2.**
2. **Two of her clients had multiple horses.**
3. **Multiple session summaries, notes and photos are gone.**
4. Ashley: this is priority #1, her work must not be lost.

**Still true from 2aj (asked and answered on 2026-10-07, settled):**
5. She was on her **PHONE**.
6. Her workspace **still says Equine**.

**NOT YET ASKED — ask, do not assume:**
- Are the 2 MISSING clients the same 2 that had horses? (Likely, but it decides whether this is the
  owner-record path or the roster path, so it is worth one question.)
- Which device is she looking at NOW — the same phone, or a computer?
- Did she do anything that could read as a delete (a swipe, a merge-duplicates, a "remove")?

**2aj is a DIFFERENT symptom and its fix is not in question here.** There, the grouping broke and the
charts were intact. Here the CLIENTS are missing. Do not assume one caused the other, and do not
assume `2026-10-07b` failed — §1b.5 says a fix that ships and changes nothing means the reproduction
was not her situation, and this is a new report, not the old one recurring.

### The fact that matters most, established 2026-10-08 by reading the code

**The server NEVER hard-deletes a provider's client.** `markClientDeleted` (lib/clients.js) only sets
`deleted_at`; the row, its `data` jsonb (notes, summaries, the `animals` list with each horse's own
summaries and photos), its PII and its `client_events` rows ALL SURVIVE. `listClients` filters on
`deleted_at IS NULL`, which is the only reason they stop appearing. `deleteClientData` is the
CLIENT-initiated erasure and is a different path she cannot have hit.

So unless something outside the app deleted rows, **her data is still in the database and a restore is
an UPDATE setting `deleted_at=NULL`.** Establish that before writing any merge fix: the recovery and
the root cause are two separate jobs and the recovery comes first.

**Second fact, as useful as the first: `clients.data` is an UNTOUCHED BACKUP nobody has ever read
back.** `_assembleClientData` sends the whole assembled blob per client on every roster sync — her
`summaries`, `forms`, `profile`, `progressPhotos` refs, and crucially **`animals`: every HORSE with
its own name, species, treatment and `summaries` (capped at 8 each)**. But `GET /api/clients` returns
only `id, token, name, email, phone, invited_at, opened_at, updated_at` via `listClients` — the
`data` column is **never** read back by the app. It has been accumulating as a write-only backup the
whole time. For an equine account it is the only place outside her device where the horse-level
charts exist.

**What is NOT in it, so do NOT promise it:** the provider's own clinical session `photos` are
deliberately never sent (the comment in `_assembleClientData` says so — blob size and the client
shouldn't see them). `progressPhotos` are REFS, not image data. So notes and summaries are
recoverable from the server; **her raw clinical photos are only on her device.** Say that plainly to
Ashley rather than letting "photos" ride along in a list of things coming back.

### SHIPPED the same hour: the founder tool to actually get them back (`2026-10-08k`)

`api/admin/client-recover.js` + "Get a provider's clients back" in the existing founder-only Admin
tools section on the Account screen (NOT a new button in the everyday UI — §5).

- **GET `?email=`** — the diagnosis. Rows total / showing / removed, per client the COUNTS of
  summaries, chart fields, forms and photo refs, **each animal by name with its own summary count**,
  the roster blob's shape and ids, `missingFromRoster` / `missingFromTable` (rows present but the
  account's `sc_clients` forgot them — the OTHER way a client vanishes), and
  `deletedRecordIds` from her `sc_deleted_clients`. That last one is the key question answered:
  **a device delete record means she really removed them; an empty one means something removed them
  for her.**
- **POST `{restoreIds}`** — clears `deleted_at`, scoped to that provider, only on rows already
  tombstoned AND still carrying a name (so a CLIENT's own erasure via `deleteClientData` is never
  undone). Reversible by removing again. Idempotent.
- **POST `{exportIds}`** — the full blob per id, for rebuilding by hand if the roster is beyond
  repair. Content, so it is explicit and per-id and never part of the diagnosis.
- Privacy line held: the diagnosis returns NAMES and COUNTS, never record content (asserted).
  Founder-gated on the verified token's email; added to `check-tenant-isolation`'s ALLOW as the
  tenth reviewed exception, and it is the only one of the three admin tools that WRITES.

**Search by NAME, not just email (`2026-10-08l`).** Ashley asked for Heather's email and nobody has
it — it is not in the repo and it should not be. She knows the NAME. So `?q=` takes a name or part
of one and matches the provider's name OR address: one hit runs the diagnosis, several hand back the
list for her to pick from (never a guess), none is a 404. A WRITE still demands the exact email, and
the app posts the RESOLVED email rather than what she typed. Two real bugs came out of testing it:
typed LIKE wildcards had to be stripped, and once stripped, a bare `%` left an EMPTY search that
matched every provider on the deployment — so a search now needs two real letters.

**Verified:** `scripts/test-client-recover.mjs` — 53 assertions against a REAL PostgreSQL 16 with her
exact situation seeded (4 clients, 2 soft-deleted, 2 owners with horses carrying their own
summaries). It proves the row, its summaries and its horses all survive `markClientDeleted`, that
the restore brings them back with the horse summaries intact, that another provider's client cannot
be restored or exported through her email, and that a client's own erasure is refused.
`scratchpad/recover.mjs` — 40 assertions driving the real UI.

**Two bugs the real database caught that a mock never would have:** `coalesce(data,'')` on a `jsonb`
column 500s the whole lookup ("invalid input syntax for type json" — it needs `data::text`), and a
column aliased `t` collides with the row alias in any `row_to_json(t)` wrapper. Run that script
after ANY change to this endpoint.

### The hypothesis the tool exists to SETTLE, not to assume

**"4 clients became 2" has two completely different causes and only one of them is data loss.**

An animal entry in `clients.data` carries the HORSE'S OWN CLIENT ID (`_animalsOf` finds CL records
whose `ownerId` is this client, so an animal IS a client record). So the diagnosis computes
`nestedUnder`: any client that is now listed as an animal under another client. If the two that
stopped showing are now horses nested under their owners, **nothing was lost** — 2aj's
`_carryAnimalLink` re-linked them, the roster correctly stopped showing them as top-level clients,
and their charts moved one level down. The tool says "NOT LOST", names where each one went, and says
plainly that restoring rows will not change it.

**This is a hypothesis, not a conclusion, and it CONTRADICTS what she reported ("notes and photos
are all gone"). §1b.2 applies: her observation stands and the theory does not.** The point of
putting it in the tool is that the database settles it in one tap instead of anyone arguing from
inference — which is exactly how a day was lost last time. If `rowsDeleted` is 0, all rows are live
and the summary counts are intact, it is a display problem and restoring achieves nothing. If rows
ARE tombstoned, the restore is the fix.

**No automatic path tombstones a client server-side.** Audited: only `_markClientDeleted` (a manual
delete) and `_impUndo` (an explicit "undo this import") call `_serverDeleteClients`. Both need a tap.
So `deletedRecordIds` coming back EMPTY while rows are tombstoned would be genuinely new and worth
chasing hard.

### 2026-10-08, FIRST REAL RUN on her account — what it actually said

Ashley ran it and sent a screenshot. **The output was so long the confirm modal could not be
scrolled or dismissed — she was stuck on it.** Two things were wrong and both are fixed
(`2026-10-08m`):

1. **`confirmModal` had no scroll at all.** A long body pushed the buttons off the bottom of the
   screen with nothing scrollable, so the dialog could be neither read nor closed. The dialog is now
   a flex column capped to the viewport, the body is the only scrolling part, the buttons stay
   pinned, and `white-space:pre-wrap` keeps multi-line bodies readable. **This was never specific to
   this tool — any long modal did it to a provider.**
2. **The diagnosis is a SCREEN now** (`renderClientRecover`), not a modal, with a checkbox per
   removed client and a sticky action bar.

**And the output itself showed the single "Restore all" button was dangerous.** Her account holds:

- **many rows with NO NAME** — both removed and showing. These are blank skeletons, almost certainly
  the pre-hydration bug in §2aj (`syncClientEvents` recreating the roster before it had been read).
- **duplicate names**: `Dena Fitzpatrick` showing AND removed, `Ingatara Perry` showing AND removed,
  `Sue` showing twice, and `Rainer` removed against `Reiner` showing — a one-letter near-miss.
- **12 ids in her device's `sc_deleted_clients`** — so the removals came FROM the app, not the
  server. Some of those were certainly deliberate tidying of exactly those duplicates.
- **6 live rows missing from her roster blob.**
- **4 of the "missing" clients are horses now nested under owners** (Amber, Bear, Reiner under
  Ingatara Perry; Kona under Sue) — the `nestedUnder` check earned itself immediately.

So restoring all 12 would have put the blanks and the duplicates back and left her roster WORSE
than it started. The screen now ticks only what is defensible and explains every row it leaves off:

| left unticked | why |
|---|---|
| `blank` | no name — an empty record the app made |
| `dupe` | the exact name is already showing |
| `near:<name>` | a name within 2 edits is already showing (Rainer/Reiner) |
| `empty` | named, but no summaries, forms, photos or animals to bring back |

**`profileFilled` is NOT evidence.** Almost every row on her account reported "5 chart fields", so
chart fields alone carry no information and must never tick a box. Only summaries, forms, photos and
animals count as content. A near-miss is checked BEFORE the empty case: all three leave the box
unticked, so the ordering only chooses which reason she is shown, and "there is already a Reiner" is
the one that helps her decide.

**Verification:** `scratchpad/recover2.mjs` — 27 assertions driving the screen with her real shape
(blanks, exact duplicates, the Rainer/Reiner near-miss, four nested horses), including that exactly
ONE box is ticked by default, that tick-all/untick-all work, that an empty selection posts nothing,
that the restore posts only the ticked ids, and that a 120-line modal now scrolls with its OK button
on screen. `scratchpad/recover.mjs` was rewritten (15 assertions) to cover the LOOKUP side only —
its old modal-body assertions died with the modal.

### Second run (`2026-10-08n`): "Nothing ticked", and she could not send me the screen

Her account is **`alohaheather@hotmail.com` · 10 showing · 12 removed · the app's own list knows
about 4.** Two more things were wrong and both are fixed:

1. **Every one of the 12 removed rows failed the tick test, so the button just said "Nothing
   ticked" and the screen offered no verdict at all.** That reads like the tool gave up. It now
   counts WHY each row was left off and leads with a sentence: either "N look like real clients to
   put back" or **"None of the N removed rows look like a real client"** followed by the breakdown
   (how many have no name, duplicate someone showing, nearly duplicate, or have nothing stored) and
   the thing that actually matters to Ashley: *nothing of theirs is sitting removed on the server.
   The clutter is the problem, not lost work.* A true "nothing to recover" is a good answer, but
   only when it is said out loud.
2. **The screen is longer than a phone can screenshot** — she told me twice she could not show it
   to me. There is now a **Copy this as text** button at the TOP (above the list, so it needs no
   scrolling), same escape hatch as the self-check. `_recoverText()` emits the provider, the counts,
   the NOT-LOST nesting, every removed row with `[x]`/`[ ]` and its reason, every showing row, the
   missing-from-roster count and the device delete-record count.

**Note the roster number: her app's own list knows about 4, while 10 rows are live on the server.**
That is a second, separate problem from the removals and it has not been chased yet.

**Verification:** `scratchpad/recover2.mjs` is now 43 assertions, including the verdict in both
directions (something to restore / nothing worth restoring) and that the copied text carries every
section with its tick marks and reasons.

### 2026-10-08, THE ANSWER (`2026-10-08q`). Ashley: "stop building tools I have to go into."

Fair, and she was right. Her pasted output answered it anyway. **Three findings, two code fixes,
and Heather has to do nothing.**

**1. "5 chart fields" on every single row was MY BUG, and it hid the whole picture.** The fill path
in `syncClientEvents` seeds a placeholder chart — skin/concerns/fitz `—`, allergies `None noted`,
treatment `New client`. `describe()` counted those as filled, so a COMPLETELY EMPTY skeleton scored
5 out of 5 and every row on her account looked like it held a chart. Placeholders are the app's
words, not hers, and no longer count. **Every "5 chart fields, nothing else" row on her account is
an empty shell, not a lost chart.**

**2. Nine nameless rows were labelled `<<dupe>>` — also mine.** `if(!c.name)` reads `' '` as a real
name, so nine blank rows matched each other on the empty string and were each told "the same name
is ALREADY showing". Trim first. The box stayed unticked either way, but a wrong REASON is how time
gets wasted here.

**3. HER APP HEALS ITSELF. Verified, not assumed.** `scratchpad/heal.mjs` seeds her exact state —
10 live on the server, roster knows 4, ids in the delete record — and `syncClientEvents`' fill path
brings the missing ones back on open: all four horses return, existing records keep their real
notes, removed clients stay removed, and the second "Sue" is routed into the first rather than
spawning a duplicate chart (9, not 10, and 9 is the right answer — the first version of that test
called it a failure). **So the fix for "my clients are missing" is: open the app and leave it open
a moment.**

**The cause, now fixed: blank shells were being PUSHED UP.** `_isBlankSkeleton()` + both sync
payload builders. `upsertClient` protects summaries, pendingForms and animals from being wiped, but
NOT the profile — so a placeholder profile overwrote the real one on the account, and that is also
where the nine nameless server rows came from. A record is a skeleton only if she has typed nothing
anywhere: a name, an email, a phone, notes, a summary, a form, a session count or **an `ownerId`
(a horse's link is real data — Heather's whole setup)** all make it hers and it still syncs.
`scratchpad/skel.mjs`, 21 assertions, most of them the must-still-sync direction.

**What her account actually holds:** 10 live rows, of which most are empty shells; real duplicates
(Sue twice, Dena and Ingatara removed as dupes of ones still showing, Rainer vs Reiner); four horses
correctly nested. **Nothing she typed is sitting deleted on the server.**

**STILL OPEN — the one thing not yet answered:** not a single client row carries a summary. The
provider's own summaries live in the kv store (`sc_session_summaries`), NOT in `clients.data`, so
their absence from the client rows proves nothing either way. The endpoint now counts the
per-client libraries (`libraries` in the GET: clients, entries and bytes per key, counts only) and
the screen and the copied text both show them, so the next look answers it. **Do not conclude the
summaries are lost until that number is seen.**

### 2026-10-08: "she had made notes, and she should have forms" — the forms answer (`2026-10-08r`)

**FORMS: found, and fixed.** `clients.data.forms` is built from the client's
`submittedForms`/`signedForms`, so it IS the record that an intake was completed. It was **not in
the protected-keys list**, and the app was pushing up placeholder charts it had invented itself —
each carrying `forms:[]` and `summaries:[]`. Summaries were protected; forms were not. So every
placeholder push wiped the stored forms and left the summaries alone, **which is exactly the shape
of her account: zero forms on every single row.** `forms`, `progressPhotos` and `pendingGuides`
have joined `summaries`/`pendingForms`/`animals` in BOTH branches of `upsertClient`. Asserted in
`scripts/test-clients-sql.mjs` (now 37, against real PostgreSQL), including that a GENUINE 2→1
form change still lands — a guard that cannot be emptied legitimately is its own bug (§0.8 the
other way round).

**NOTES: a different store, and worth knowing before anyone hunts for them.** A provider's chart
notes (`c.notes`, `c.conditions`) are **deliberately NOT in `clients.data`** — that blob is served
straight to the CLIENT by `api/client-data.js`, so putting her private clinical notes in it would
hand them to the client. Correct as it stands; do not "fix" it by adding them. The consequence is
that her chart notes exist in exactly two places: **her device, and the account's `sc_clients`
roster blob.** There is no third copy. Her roster blob holds 4 clients.

Session summaries are a third thing again: `sc_session_summaries` (per-client map in kv) for the
provider's copy, and `c.summaries` for the client-facing one. "Notes" from a provider could mean
any of the three, so **ask which screen she typed them on** rather than assuming.

**Durability gap, noted not acted on:** chart notes have no independent server backup the way
summaries and forms now do. Adding one means a provider-only store, not the client-visible blob.
Worth doing, too big to rush in the middle of an incident.

### 2026-10-08: "PHONE." THE ROOT CAUSE, found and fixed (`2026-10-08s`)

One word from Ashley finished it. **A record the APP INVENTED was beating a record the PROVIDER
TYPED, on timestamps, and taking her notes with it.**

The chain, every link verified:

1. On a phone the roster lives in **IndexedDB** (§2e, ≥24KB offloads). Hers went — eviction, a
   purge, an owner-stamp mismatch; it does not matter which.
2. Boot found nothing, so `syncClientEvents`' fill path rebuilt the WHOLE roster from the server's
   client list as placeholder charts: `skin/concerns/fitz` `—`, `allergies` `None noted`,
   `treatment` `New client`. **Carrying the real NAME**, because the fill path takes it from the
   server row.
3. `saveClients()` runs `_stampClientChanges()`, which stamps `_uAt = Date.now()` on **any record
   whose signature it has not seen before** — so every placeholder was stamped as the freshest copy
   in existence.
4. On the next pull `_mergeClients` compared `_uAt` and the placeholder won. `_unionClientForms`
   saved her forms and summaries. **Nothing saved her `notes`, `conditions`, `skin`, `concerns`,
   `allergies`, `fitz`, `treatment` or `sessions`.** The winner was then pushed back up.

**§2aj is now WRONG where it says a skeleton "carries no `_uAt` at all, so `lu` is 0 and the
account's real record wins".** That was true when it was written. `_stampClientChanges` makes it
false. **Do not trust that line.** Left in place above with this correction rather than edited out,
because the reasoning it encodes is exactly the trap.

**Fixed with two independent guards**, because one of them is the kind of thing that gets undone:

- **`_mergeClients` decides on CONTENT, not clocks.** `_isPlaceholderChart(c)` — nothing but a name
  and the app's own placeholder text — and where one side is a placeholder and the other is not,
  the real one wins outright whatever the timestamps say, with forms/handled-marks/owner-link still
  carried across both ways. **The name is deliberately ignored** in that test: the placeholder
  carries the real name, so judging by name lets it pass as hers. Two REAL records still resolve by
  timestamp, asserted, or ordinary editing would freeze.
- **The fill path seeds `_clientSigCache[id]`** so its placeholder is never stamped as an edit in
  the first place.

`_isBlankSkeleton` (the stricter, name-aware one) stays as the SYNC filter only: a record she has
NAMED still goes to the server even if otherwise empty, or adding a client would never get a link
token. Only nameless ones are held back — which is what the nine nameless rows were.

**Proof it is real, not a theory:** `scratchpad/ghostprobe.mjs` states the case in isolation and
runs on either build. On the build she is running: *her note LOST, skin `—`, treatment "New
client", sessions 0.* With the fix: *note KEPT, skin "sensitive", treatment "Equine laser",
sessions 4.* `scratchpad/ghostwin.mjs` is the full 22 assertions, including that a horse keeps its
owner link and its notes, that forms union from both sides, and that normal newest-wins editing is
untouched.

**Still unknown, and it decides the root cause — ASK HER (§1b.3):** whether the 2 missing clients are
the 2 that had horses, which device she is looking at now, and whether anything she did could read as
a delete. Do not pick whichever answer suits a theory.

## 2al. THE SAFETY NET: version history for every library (2026-10-08, `2026-10-08t`)

Ashley, after the fourth incident: *"this has happened several times where something happens and
it loses all my clients summaries, notes, things we have made as providers and you can't get them
back. I need you to build in a safeguard so this stops happening. it is ridiculous and embarassing
to have to tell my providers that we lost their hard work when they did nothing wrong."*

She is right, and the pattern is worth stating plainly: **every fix before this was reactive.**
Diana's summaries, Riquelle's forms, Heather's horse links, Heather's notes. Four different causes,
four correct fixes, and each one arrived after a provider had already lost work — because we only
ever learned which field was unprotected by watching someone lose it.

**This does not try to be another correct merge. It assumes the NEXT merge bug exists and has not
been found, and makes it undoable.**

### `lib/kv-history.js` + a snapshot in `api/store.js`

Before any save overwrites a tracked library, the OLD value is kept if the write would shrink it.

| reason | when | kept |
|---|---|---|
| `shrink` | the new value holds FEWER entries, or is >25% smaller at over 2KB | newest 8 per key |
| `daily` | the first write of a day, so there is always a yesterday | newest 14 per key |
| `before-restore` | written by a restore, so a restore is itself undoable | — |

`TRACKED` is the libraries she BUILDS (sc_clients first — chart notes live there and nowhere else),
not settings: a settings blob is one record and cheap to retype, and versioning it would be most of
the storage for none of the value. A write that grows or leaves a library the same size keeps
nothing, which is nearly all of them, so a quiet day costs one row per key.

**Two things that are deliberate and must not be "tidied":**
1. **The snapshot is wrapped in try/catch in `api/store.js` and a failure lets the save proceed.**
   A seatbelt that can stop the car is worse than none.
2. **`restoreVersion` keeps the CURRENT value before writing the old one back**, and ABORTS if it
   cannot. The only thing worse than losing data is a recovery tool that destroys the last copy.

Shown on the recovery screen as **Earlier copies**, newest first, each row saying how many items
that copy held — "Client roster — 47 items" against a live 9 makes the choice obvious — with a
Put back button per row. Read via `GET /api/admin/client-recover` (`history`), restored via
`POST {restoreVersionId}`. Founder-gated like the rest of that endpoint.

**Verified: `scripts/test-kv-history.mjs`, 24 assertions against a REAL PostgreSQL 16**, written as
the incidents themselves: Heather's 10 real clients replaced by placeholders (caught, restored,
**notes back**), Diana's same-client-count-but-summaries-emptied (caught by size, restored), a
growing write keeping nothing, pruning capped at 8 with the NEWEST kept, and the §0.1 isolation —
one provider cannot restore another's version, a listing never leaks another's rows, and the
listing carries metadata only, never the stored value.

### The second half: a device rescues its OWN copy before the merge runs (`2026-10-08v`)

Ashley: *"can you just assume she has a computer that may still hold it and see what you can do."*

The scenario, and it is a good one: a provider loses work on one device while another — a computer
closed for a week — still has the real thing on its disk. **The moment she opens it, it syncs, and
whatever the merge decides is final.** If the merge gets it wrong, the last copy in existence is
gone and nobody ever knew it was there.

`Cloud._rescueRicherLocal(data)` runs **inside `pull()`, before the key loop** — i.e. before any
merge touches anything. If this device holds more than the account does, it POSTs its copy to
`/api/store` as `{rescue:{...}}`, which `rescueDeviceCopy()` writes **only to `kv_history`, never
to `kv`**. It is not an opinion about who should win; it is a photograph taken before the argument
starts. The merge then runs exactly as it would have. `device-snapshot` rows are kept deepest
(10 per key) because they are the only copies that came off a DEVICE rather than out of the
account.

**Three rules that are load-bearing, with the reason each one exists:**

1. **The account must ALREADY hold the key.** Boot seeds stock courses, forms and protocols before
   the first pull, so without this every brand-new device would "rescue" its own starter content
   into an empty account's history. A rescue is for a copy that LOST content, not for a key the
   account never had. **This could not be gated on `Cloud._booting` instead** — `bootDone()` clears
   that before the boot batch flushes (§2ad, four fixes died on exactly that).
2. **Richer is measured by WEIGHT, not just entry count.** `_weigh()` counts top-level entries plus
   anything one level inside them, because the damage that hit Diana was six clients STILL THERE
   with every summary list emptied — identical count, everything gone. `contentWeight()` in
   `lib/kv-history.js` is the same function server-side and `snapshotReason` now uses it too;
   **keep the two in step.**
3. **Once per session, and never signed out.** A rescue is not a sync.

**Verified: `scratchpad/rescue.mjs`, 15 assertions** — that it fires on her exact shape and carries
the real notes and all ten clients, that it goes BEFORE any ordinary save, that an identical or
poorer device sends nothing, that a same-count-but-emptied account triggers it, that starter
content is not rescued while the real loss still is, once-per-session, and that a signed-out device
sends nothing at all.

### The third route, and the only one that reaches work already lost: the DATABASE'S OWN HISTORY

Ashley: *"if her notes were once in the server we should be able to figure out how to get them
back."* Then, which is what made it possible: **"they were never gone before today"**, corrected
to **"it was gone yesterday not today"** — so the loss is dated **7→8 October 2026**, inside Neon's
history retention window.

**Neon keeps a point-in-time history of the whole database** (the window length depends on the
plan: the FAQ numbers are 6 hours Free / 7 days Launch / 30 days Scale, which is worth checking in
the console rather than trusting). A **branch** created from a timestamp inside that window freezes
that state permanently, so it survives the window closing. **Making the branch is the only part of
any of this with a deadline.**

`api/admin/recover-import.js` + `RECOVER-LOST-WORK.md` (the runbook, written for Ashley to follow):

- `RECOVERY_DATABASE_URL` (an env var, never a request field) points at the branch.
- `GET ?email=` previews what the branch holds against what is live, per library, counts only.
- `POST` copies the worthwhile ones into `kv_history` as `from-backup` — **never into live `kv`**.
  They appear under "Earlier copies" and a human puts them back deliberately. An import that
  silently overwrote live data would be the same class of mistake that caused all of this.
- Surfaced at the TOP of the recovery screen as "The backup holds more than the account does",
  with a per-library backup-vs-live count, only when a branch is actually connected.
- The provider id is resolved on the LIVE database and then used to read the branch, so a stale
  branch can never decide whose history gets written. `from-backup` rows are kept deepest of all
  (20 per key): once the branch is gone there is no way to make another.

**This is per-provider, so it covers DIANA too** — Ashley asked, and the answer is yes, with one
caveat: her loss is older, so whether it is still inside the retention window is the open question,
and the branch creation screen answers it immediately (a date outside the window cannot be chosen).

**Verified: `scripts/test-recover-import.mjs`, 22 assertions against TWO REAL PostgreSQL
databases** — one standing in for the live account, one for the branch, with
`@neondatabase/serverless` stubbed to the second. It asserts the preview sees 10 in the backup
against 9 live, that **her notes are in what gets imported**, that **LIVE DATA IS NOT TOUCHED**,
that a second provider imports into her OWN history and leaves the first alone, that settings keys
and already-fine keys are ignored, that the preview carries no stored values, and that a bad
connection string is reported rather than swallowed.

**Also still true and independent of all of the above: `client_events` is append-only and is never
pruned** (only deleted with the client or the account). Form submissions are logged there with
their full answers (`logEvent(..., 'form', {title, formId, answers, flagged, signed, qs})`), so a
client's completed intake is reconstructible even when the chart copy was wiped — and the provider
GET already feeds a client-side self-heal off it. Summaries and chart notes are NOT in the event
log; do not go looking for them there.

**WHAT HEATHER OBSERVED, dated (ground truth, §1b — this is what the timestamp hangs on):** she
was part-way through **three** sets of notes on **7 October**. She finished **two**. The app then
reset (horses out of the owner profiles — the 2aj symptom) **before the third**, and **her notes
went at that moment**. She messaged Ashley at **1:41pm on 7 October**.

So the loss is before 1:41pm on the 7th, and a branch taken from the 6th — which is what the first
version of the runbook recommended — **would have missed the two sets she had just finished.**
That is the work she is most upset about. Corrected: as late as possible while still before the
loss, starting at 1:30pm on the 7th.

**`RECOVERY_DATABASE_URL` therefore takes a COMMA-SEPARATED LIST.** Picking the timestamp is
guesswork and making her redeploy once per guess during an incident is not a reasonable thing to
ask. Every branch is read, each labelled by its branch name from the host part of the string
(never the credential), one unreachable branch reports itself without stopping the others, and
they are listed richest first.

**Ranking them needed BYTES as well as weight, and this is worth keeping:** two branches taken
either side of her writing weigh exactly the same — 10 clients, 3 fields each — because the
damage was notes **emptied inside records that all still existed**. `contentWeight` counts
entries and cannot see it. Sorting on weight alone put the EMPTY branch first and would have
recommended the useless one. Weight decides, bytes break the tie, and `worthIt` gained the same
same-shape-but-more-text case.

### THE ANSWER, 2026-10-08: the history window is 6 HOURS. Heather's notes are not recoverable.

Ashley tried the branch and Neon said it plainly:

> **Date is beyond the history retention. The earliest available point is Oct 8, 2026 12:19 pm.**

She is on the **Free plan, whose history window is 6 hours and cannot be raised** — Neon's plans
page gives 6h Free / up to 7 days Launch / up to 30 days Scale, and scheduled backups are a paid
feature. The loss was **before 1:41pm on 7 October**, roughly a day outside it.

**So the point-in-time route is closed for Heather, and closed for Diana too** (hers is older
still). The `recover-import` tooling is built, tested and live, and it will work the next time
something happens inside the window — but it cannot reach this one. Do not spend more of her time
on it, and do not imply otherwise to a provider.

**The lever that actually matters now is the plan.** 6 hours means a loss noticed the next morning
is already unrecoverable by this route. Launch (7 days) would have saved Heather's notes. That is
Ashley's call and a money question, not a technical one — but it should be put to her as the
concrete trade it is.

**What makes it survivable anyway: today's safety net does NOT depend on Neon's window.**
`kv_history` is ordinary rows in her database — 8 shrink + 14 daily + 10 device-snapshot + 20
from-backup per key — so the 6-hour limit has no bearing on it. The hole that lost Heather's notes
is closed going forward regardless of the plan.

### Her FORMS come back on their own — verified, and I nearly shipped a duplicate of it

`client_events` is append-only and never pruned. I wrote a heal pass to re-attach form events
whose `evId` is missing from a chart, tested it, and then found **`_reconcileEventAttachments()`
already does exactly that** — and does it better: it adopts a locally-created sign-on-device form
rather than duplicating it, handles check-ins, and re-applies intake vitals, birthday and photo
consent. It runs on every `syncClientEvents`, and crucially it does NOT filter on `sc_seen_events`,
which is what makes it work for submissions marked seen weeks ago. **My version was removed.**

`scratchpad/formheal.mjs` (12 assertions) is kept because the FACT is worth being able to re-prove:
two clients with their forms wiped off their charts and every event already marked seen get them
back with their answers, signatures and real dates, a second sync adds no duplicates, an entry
already on the chart is left untouched, and non-form events and unknown clients are ignored.
It passes on the shipped build, which is how we know her forms return without anyone doing
anything.

### 2026-10-08, FOUND: Heather's session notes were never lost

After the character counter shipped, her own account answered it:

```
TYPED AND STILL ON THE SERVER: 565 characters
  chart Ingatara Perry: 0 notes, 33 conditions, 115 chart detail, 1 forms
  unfinished note Amber: 163 characters, 1 sections, 2026-10-06
  unfinished note Sue:   144 characters, 1 sections, 2026-10-06
  unfinished note Bear:   86 characters, 1 sections, 2026-10-06
```

**Three session notes, on three of her horses, dated 6 October, with her words in them.** She was
writing up the 6th's sessions on the 7th when the app reset, which is exactly what she described.
393 characters of session notes plus 148 of chart detail on Ingatara Perry. They were in
`sc_note_drafts` the whole time — a different key from the roster, which is why the thing that
emptied her charts never touched them. **Nobody had looked inside it, including me, for two days.**

**Why the search took so long, worth keeping:** every summary view rounded to KB, and "3 clients,
1KB" reads as empty. The answer only appeared once the tool counted CHARACTERS SHE TYPED and
excluded the app's own placeholder words. If a provider says work is missing, count the characters
before concluding anything.

**Checked, and she is safe to open them.** The note template is recomputed from
`selectedProfessions` on every load, and equine has no template of its own, so a draft can be read
back under a different one. `_noteSectionsFor()` already folds a foreign-template draft's text into
the current format's first field, in the preview AND the editor, and it survives a save.
`scratchpad/notesafe.mjs` proves all three: carried, visible on both screens, and still there after
`_wnSave`. **Her notes are not one screen-visit from being destroyed** — I thought they might be,
and they are not.

**A false alarm I talked myself out of, so nobody re-raises it:** ~40 call sites read
`localStorage.getItem('sc_*')` directly, which looks like the offload bug. It is not.
`localStorage.getItem` is PATCHED to read from memory for offloaded keys (line ~4112, "patching the
one read path keeps all ~155 existing call sites correct"). Only ENUMERATION is forbidden. That is
why `_exportAllData` was broken and these are fine.

### THE ACTUAL BUG, found by making her refresh: a DELETE THAT UNDOES ITSELF (`2026-10-09f`)

**What she OBSERVED after refreshing (ground truth, §1b):** Sue is there but **Kona is not under
her** and **Sue's photos are gone**; **Ingatara Perry is gone entirely**, and **Amber, Bear and
Reiner are all gone.**

The server lists every one of those as a LIVE client. So the refresh — the thing we had just told
her to do — **deleted them again.**

**Why.** `_mergeClients` drops any client whose id is in `_deletedClientIds`, on every pull. Four
of her live clients have their ids in that record. `sc_deleted_clients` is a TOMBSTONE SET: it
unions on pull and only ever grows, so clearing it on the account alone is useless (her device
pushes the ids back) and clearing it on her device alone is useless (the account pushes them
back). **There was no way, anywhere in the app, to undo a delete that was wrong.** Every refresh
re-applied it, forever.

**`sc_undeleted_clients` is the counterweight**, applied AFTER the union — the only thing that can
outrank an entry sitting on both sides. Honoured in `_goneClientIds`, in `_mergeClients`'s own
`del` set, and in `syncClientEvents`' fill path, so a resurrected client is not dropped again by
any of the three. Registered in `_TOMB_OBJ` so it is itself grow-only: once the owner says a
removal was a mistake, no device may quietly forget that.

The recovery screen computes `ghosts` — live rows whose id is in the delete record — and leads
with **"N clients are being deleted again every time they refresh"**, naming them, with one button
that writes both halves (clears the ids from `sc_deleted_clients` AND adds them to
`sc_undeleted_clients`) on the ACCOUNT.

**Tell the provider to CLOSE the app and reopen, not just pull to refresh**, so the counterweight
is read before the merge runs.

**Verified: `scratchpad/undel.mjs`, 10 assertions.** It reproduces her exact state — four live on
the server, three ids in the delete record on both sides — and asserts: without the counterweight
they stay gone (the bug she is living in); with it they come back, the owner record keeps its
notes, **the horses keep their `ownerId`**, Sue is untouched, **they survive three more refreshes**,
and a client she really DID delete still stays deleted. It fails on the previous build.

**A harness trap worth keeping:** `Cloud.pull()` writes `sc_clients` to disk; `CL` is only rebuilt
by `loadClients()`, which the real app runs via `_reloadAll` after every pull. The first version of
this test checked `CL` straight after `pull()` and reported six false failures.

**Her photos: still device-only, still gone.** Nothing here changes that.

**What none of this reaches:** session photos live on the provider's device, not the server.

---

## 2am. A button that threw on every tap, and the bug class behind it (2026-10-09, `2026-10-09i`)

Ashley: **"the toggle doesnt work in services"**. Observed on the running app. She was right.

The service row's Taxable / No tax button was rendered as:

```js
onclick="_svcSet(${i},'taxable',(sv.taxable===false));renderServiceMenu()"
```

`sv` is the `map` callback's local variable and it was **never interpolated** — it sat in the
onclick attribute as literal text. An inline handler evaluates in GLOBAL scope at click time, where
`sv` does not exist, so every tap threw `ReferenceError: sv is not defined` and did nothing. No
toast, no console she would look at, no change. Reproduced on the shipped build: `taxable=false`
before the tap, `taxable=false` after, one error.

**This is the bug class to remember:** inside a template-literal row, anything in an `on*=` handler
that is not wrapped in `${...}` is dead text evaluated later against `window`. It reads perfectly in
review — I had read this exact line earlier in the session and called the feature working. The fix
is a named helper that re-reads the array at click time (`_svcTaxToggle(i)`), which is also the
pattern the checkout rows already used (`_coItems[${i}]`, properly interpolated).

I swept every `on(click|input|change|focus|blur|keyup|keydown|submit|touchstart|touchend)=` attribute
in `slickchart.html` and `slickchart-client.html` for the same shape. **This was the only real
instance.** The other ten candidates are sentence-ending periods inside `confirmModal` prose
("…and all their sample data.") and genuine globals (`location.href`, `slickchart.app`). A CI check
for it would be 10/11 false positives, so there isn't one — the sweep script is the record.

### The other three things in the same path

1. **Products had no tax setting at all.** `renderAddAffiliate` had no control, `saveAffiliate`
   never wrote one, and `_coEnsureMenu` hardcoded `taxable:true` for every product. There was
   nothing to toggle. Added a Taxable / No tax button to the product editor, persisted in both the
   edit and the create branch, and checkout now reads `a.taxable!==false` so an untouched product
   behaves exactly as before. Square-synced products live in `affiliateLinks` too, so they get the
   control for free.
2. **Square's default was beating her own choice.** `_coEnsureMenu` concatenates `sq` FIRST, so the
   dedupe keeps the Square entry — a service she marked "No tax" in her own menu still billed as
   taxable. `_coApplyTaxChoices(list)` now lets an EXPLICIT local choice win by name, and runs on
   the 60s cache path too (otherwise a change she just made would not reach an invoice for up to a
   minute). `taxable == null` means she never chose, and Square's default stands.
3. **Neither `_svcSet` nor `saveAffiliate` stamped `_ts`.** Both `sc_service_menu` and
   `sc_affiliate_links` merge by id through `_mergeAuthoredById`, whose last tie-break is
   `if(!a&&!b&&!fromLocal) → take the SERVER copy`. With no timestamp on either side her change
   loses to the other device's older copy. Confirmed on the shipped build: her No-tax went in, the
   stale copy won, `taxable` came back `true`. This is CLAUDE.md's "stamp `_ts` on create AND on
   edit" and it was simply missing — it would have reverted a price or a renamed service the same
   way, not just the tax flag. Both now stamp on create and on edit.

So the one report covered a dead button, a missing feature, a precedence bug and a silent
cross-device revert, all in the same two screens.

Verified headless (37 checks): both rows toggle independently and persist to `sc_service_menu`,
survive a reload, mark the menu custom so it is never reseeded, the product saves/reopens/flips
back, a new product still defaults to taxable, checkout honours services and products, an untouched
product is unchanged, a one-invoice override still does not change the product, her stamped change
beats a stale copy, a stale copy does not revert a newer one, and a deleted service is not
resurrected. All six CI sweeps clean, demos rebuilt, CI green.

**Still open from this, deliberately:** a Square catalog item she has never added to her own service
menu or shop has no persistent tax setting — only the per-line toggle on the invoice. Its tax comes
from Square, which is where it is configured. If a provider asks for that, it needs a small
name-keyed override key, and that is a NEW synced key, so §0.6 and `check-merge-coverage` apply.

---

## 2an. ROOT CAUSE of "the two lists never merged": a queued write skipped the merge (2026-10-09, `2026-10-09j`)

**Ashley's fact, from the 2aj-2 diagnosis:** Heather's account held Ingatara Perry and not Sue; her
phone held Sue and not Ingatara Perry. Inverted, for days, through many pulls. `_mergeClients` is a
union, so the first sync should have ended it. **This is why it never ran.**

`Cloud.pull()` opens with the "never overwrite a key that still has a pending local write" guard,
which **`return`s**. That return sits above *every* merge in the function, not just above the plain
overwrite at the bottom. And `sc_clients` almost always HAS a pending write — `saveClients()`
persists and calls `_scheduleClientSyncDirty()` on every edit. So the roster merge was skipped on
essentially every pull: the account's clients never arrived, and the device kept pushing its own
list back up. Two complete-but-different rosters, neither absorbing the other.

**Skipping was never protecting anything.** Every save does `localStorage.setItem(...)` FIRST and
queues the network push after, and `this._queue[k]=v` holds that same value — so the `_lsGet(k)` the
merge reads already contains the pending edit. The merge keeps it *and* absorbs the account's data.
Only the plain overwrite (`setFromServer`, i.e. "take the server's copy") can actually lose it.

Reproduced on the shipped build: with a queued write, pulling an account that held Ingatara Perry
left the phone with `["Kona","Sue"]` and her notes never came across. Fixed build: all four arrive
and the unpushed edit is still there.

### Narrowed to sc_clients ON PURPOSE — do not widen without reading this

`sc_clients` is let through because its merge is a **true union** (per client, newer `_uAt` wins), so
it cannot drop the queued edit. The rest keep the skip, because **they are not all unions**:

- `_mergeStamped` (`sc_bizinfo`, `sc_brand_colors`, `sc_availability`, `sc_suggested_forms`) is
  last-writer-wins on ONE blob. An unpushed edit with no `_ts` loses to the server outright. That is
  §2n / §2u — "saved settings were being thrown away by the next pull" — and letting the merge run
  here would bring it straight back.
- `_mergeClientMap` keeps the **ACCOUNT's** copy where both sides hold a client (§0.7), so an
  unpushed change to an existing client's product plan would be discarded.

There is a regression test for both: an unpushed business name with no `_ts` and an unpushed
`sc_client_recs` entry each survive a pull whose server copy would otherwise win. **If you widen the
allow-list, prove the merge is a union first.**

### Two theories checked and KILLED on the way — do not re-chase

1. **A device-only delete record re-killing her clients.** `sc_deleted_clients` is in `_TOMB_OBJ` and
   `_saveDeletedClients` calls `_pushKeyNow`, so a phone tombstone DOES reach the account — and the
   server's list came back empty (the `ghosts` check). Second time this theory has failed. It is dead.
2. **An orphaned nest hiding her.** `_ownerIdOf()` already returns `''` for a dangling `ownerId`, and
   `renderClients` indents by `_ownerIdOf` rather than filtering by `_isAnimal`, so a horse whose
   owner is missing still renders at top level. I had started building a heal for this and checked the
   render first; there was nothing to heal. `_isAnimal(c)` is only `!!c.ownerId` — the invisibility
   this *looks* like does not exist.

### Where Heather stands

Ashley ran **"Add 6 to their list"** (repairRoster) on 2026-10-09, so the account's roster now holds
all 10 live clients with `ownerId`/`isAnimal` rebuilt from the `clients` table. With this build the
pull will actually merge, so her phone should absorb them on a close-and-reopen. **Her photos are
device-only and still gone.** Unconfirmed as of this writing: whether her screen now shows Ingatara
Perry and the three horses.

Note `repairRoster` does NOT write `sc_undeleted_clients`, and deliberately so — nothing in the app
ever REMOVES an id from that key (it is grow-only in `_TOMB_OBJ`, written only by `_recoverUnDelete`),
so stamping live clients into it would make them impossible to delete afterwards. It was not needed
here anyway, since there are no tombstones for them.

---

## 2ao. OPEN — DIANA: the client's Session Summary disappears after a while (2026-10-09)

**What Diana OBSERVED. Facts only, recorded before any theory (§1b, §1d).**

From her email, 2026-10-08 12:46 AM:

1. The client is **Jennifer Ashley**.
2. She **updated Jennifer's information in the morning**.
3. It **stayed visible past "the usual 20 minutes"** — so the normal behaviour she has been living
   with is that it vanishes within about 20 minutes. This is the second time she has given a
   TIMEFRAME and it is the strongest clue in the report.
4. **By that evening it had disappeared again.**
5. Her own read: *"It seems like the summary stays for a limited time and then automatically
   deletes itself after a certain period."*
6. **Everything else works: notes, guides and products are fine.** Only the summary goes.
7. **"Without the summary, she cannot view anything else."** A SECOND symptom, and possibly a
   second bug: the client's space gates the rest of its content behind the summary existing.

**Device, from the screenshots she attached (ask was §1b.3):** both are the CLIENT's phone —
Android Chrome on `slickchart.app/space`, the client PWA, timestamped 9:38 and 9:39 AM. NOT
Diana's provider app. At that moment the summary WAS showing:
- Home → *After Your Visit* → "Latest summary & aftercare — Jennifer summery · from Diana", full
  text rendering correctly.
- Session Summary screen → *Your aftercare guides* (Facial & extractions aftercare, "Jennifer
  Ashley car") and *Your homecare routine* (5 steps) all present.

So the content reaches the client's phone intact and then goes away later. It is not a write
that never happened.

**Not yet established.** Whether the provider-side copy survives (needs the §1d paste for Diana's
account), and whether the disappearance is an expiry, an overwrite by a later push, or a
client-side cache.

**Do not repeat yesterday's mistake:** no one tells Diana anything is lost until the recovery
screen's verdict line says so, with numbers (§4c).

### The timing is the whole answer, and it says the Oct 6 fix was NOT enough

Her email is 2026-10-08 00:46, and "this morning / this evening" in it means **2026-10-07**. The
empty-only guard (`df65af5`, "Stop any one device wiping a client's summaries") shipped
**2026-10-06 15:40**. So her report is from the day AFTER that fix. §1b.5: a fix that ships and
changes nothing means the reproduction was not her situation. It was not a miss — observation 23
("the time between deletions is LONGER") says it helped — but it was not the whole cause.

### FOUND IT (2026-10-09, `2026-10-09n`): empty was never the only way to lose them

The Oct 6 guard refused an incoming EMPTY array over a stored non-empty one, and its own note said
"a genuine shrink from 3 to 1 still lands. It stops the drop to zero." That is precisely the hole:
**a stale device replaying an OLDER, NON-EMPTY summaries list** sailed straight through it. The
client-facing summaries live only in `clients.data`, every device posts the whole roster, and the
posted list is just `CL[id].summaries` as that device happens to hold it — so the newest summary
was replaced by an older copy while notes, guides and products (all `kv`, all merging) stayed.

The server could not tell stale from fresh because **`_uAt` never reached it.** The app has
maintained a per-client stamp for the device-side merge since §2ai, and `_assembleClientData`
simply did not include it. It does now, and `upsertClient` refuses to let these keys be replaced
by a blob whose `_uAt` is older than the stored one — in BOTH branches.

Why not union the lists: §0.8. Deleting a summary has to stay possible, and a union would
resurrect deleted ones. A NEWER write with fewer entries still lands; only a demonstrably older
one is refused.

Asserted against real PostgreSQL (`test-clients-sql.mjs`): an older write cannot replace the
summaries and the newest stays newest; a newer write with fewer entries still lands so deleting
works; a newer empty write still cannot wipe to zero; two unstamped blobs behave exactly as
before; a non-numeric `_uAt` does not throw and fail the client's whole sync (the scalar-vs-array
lesson from the first version); and the same protection covers `forms` and `progressPhotos`.

**Also relevant, shipped the same night and BEFORE this was found:** `0671a22` (the pending-write
guard made `Cloud.pull()` skip the roster merge entirely) and `897988a` (the same for
`_CLIENT_MAP_LIST`). Those matter here because `_unionClientForms` — which unions `c.summaries`
across devices — runs INSIDE `_mergeClients`, so while the merge was being skipped Diana's device
never absorbed the account's summaries and kept posting its own. Those two plus this one are three
separate causes of the same symptom. **Unverified by Diana as of this writing.**

### HER SECOND SENTENCE WAS A SEPARATE BUG: "without the summary, she cannot view anything else"

Taken literally, and it was literally true. The client app's home card — "Latest summary &
aftercare" — is the ONLY route from home into the Session Summary screen, and that screen is where
a visit's **aftercare guides** and **homecare routine** are rendered. They are fields on the
summary entry (`s.guides`, `s.homecare`), not screens of their own.

That card was gated on `activeProvider().summaryNote`, and `summaryNote` is set to
`d.summaries[0].note` — the newest summary's NOTE TEXT only. So a summary carrying guides and a
routine but no written note hid the card completely, and the client could not reach either. The
content was on their phone the whole time with no way in. Journey is the only other route and it
lists the same summaries.

`_latestSummaryCard()` now gates on the entry carrying ANY content — note, guides or homecare — and
when there is no note it shows what is inside instead of a blank line ("Your aftercare guides and
homecare routine"). A summary with nothing in it still shows nothing, so a brand-new client does
not get an empty card.

Verified in a browser against both builds. On the SHIPPED build a summary with guides and a routine
but no note gives no card and no route; on this one it gives both, and the guide and the routine
render. A normal summary is unchanged, and an empty one still shows nothing.

Also deleted `_hasHadVisit()`. Nothing called it (§1c.3) and its comment claimed it hid the "After
your visit" area, which it did not — the inline `summaryNote` check did, and that was the bug. A
dead function whose comment describes behaviour the app does not have is worse than no comment; it
was read as documentation while hunting this.

**Two test mistakes worth remembering**, both of which made a broken build look fine: matching on
`document.body.innerHTML` picked up the page's own inline `<script>`, so the assertion passed on an
empty roster; and `nav('home')` while already on home is a no-op, so the DOM under test was stale
from the previous case. Assert on `innerText` and force a real re-render.

## 2ak. The virtual consult work (2026-10-08) — from the research in `reports/`

`reports/Virtual consult platform upgrades.md` is the research behind this. Read its "three requests"
section before touching the consult feature. The finding that orders the work: **the written
follow-up IS the product** — it is what the client was promised, the after-hours labour a feature can
displace, the carrier of her product revenue, and where scope-of-practice exposure lives.

**Ashley's standing decision, 2026-10-08: NO CAP on the number of products in a plan.** The research
argues for 3-5 (adherence, and a practitioner guide on overwhelming clients) and she has read that
and decided against it: "some people need more and I dont want a cap." Do not add a cap, and do not
add a nag either. This is settled — do not re-raise it.

### Shipped: her words, not ours (`2026-10-08a`)

Every client-facing consult message was a hardcoded sentence, identical for every provider on the
deployment, sparkle emoji included. A provider running a corrective practice could not change it.

- `sc_msg_templates`, an array of `{id,text,_ts}`, registered in `_LIB_TOMB` →
  `sc_deleted_msg_tmpls`, so it merges on pull through the existing `_mergeAuthoredById` path with
  **no new merge code** and a reset on one device is not undone by another. Loader is a
  `_reloadStep` ('message wording'). merge-coverage 83→84 keys, reload-coverage 78→79 loaders.
- `_MSG_DEFAULTS` holds the sentences that used to be hardcoded, so **an unedited template sends
  byte-identical text to what shipped before** (asserted). "Reset to default" DELETES the record
  rather than copying the default text in, so a reset copy cannot freeze and miss a later fix.
- Tokens (`{client} {me} {business} {consult} {fee}`) resolve from live app data at send time.
  Deliberately NOT a second store of constants: she renames her business once and every message she
  has written follows. An unknown token is left as typed, never blanked — `{colour}` is a typo, and
  silently deleting it from the message her client receives is the worse failure.
- Editor lives on the Virtual Consultations settings tab under the fee, not in Settings: that is
  where she already sets the fee and the consult types. Token chips insert at the cursor; the preview
  uses her REAL business name and first name with a stand-in client.
- `_msgRaw` already looks up a per-consult-type override (`vc_invite:<typeId>`) first, so adding that
  editor later needs no storage change. Nothing writes those ids yet.

`scratchpad/wording.mjs` (17 assertions, incl. the stale-device merge and that a re-save clears the
tombstone) and `scratchpad/wordingui.mjs` (8, drives the real buttons).

### 2026-10-08, SECOND ROUND: the primary sources were read, and ~27 claims did not survive

Ashley opened the network policy, so `reports/Virtual consult research verified.md` is the round that
actually read PubMed/PMC, the AAD, vendor help centres, GoHighLevel's own docs and (via the RSS
endpoints — Reddit's HTML and JSON are both 403) practitioner threads. **It supersedes the first
report wherever they disagree.** Read its §2 before quoting any number from the first one.

**The corrections that change what we build:**
- The adherence figures that justified a week-6 check-in trace to ONE pilot trial, **n=17, primary
  result null (p=0.67)**, and "48% at 3 months" is not in the cited paper at all. The check-in keeps
  its merit and loses its evidence: ship it as a date SHE sets, 12-week reassessment anchored to
  NICE NG198, and make the interim contact deliver CONTENT, not a nudge.
- The comprehension rule was **mapped backwards**. Named periods ("in the morning") 89%, clock times
  ("8 a.m.") 77% (Davis 2009, n=359). The plan builder must emit **periods, not clock times**.
- **IGA 0-4 is reversed and dead** as the severity primitive: remote global-grade inter-rater kappa
  0.3119, against r=0.871 for lesion counts; structured per-site beat global in the only lay-rater
  study. If an appearance record ever ships: per-region presence/absence, within-client only.
- The **North Carolina "intent of the service" ruling says the OPPOSITE** of what the first report
  inferred — it is permissive, pulling dermaplaning and microneedling INTO scope. Delete that
  rationale. The real constraint from the same document: no diagnosing, and calling a practice
  "Medical" or "Master" is fraudulent misrepresentation under N.C.G.S. §88B-24.
- **Purging has no trial support** and is contradicted (vehicle flared MORE than tretinoin in severe
  acne). Struck from any shipped copy.
- **Plan versioning is not a white space** — Practice Better and SimplePractice both document it. The
  defensible gap narrowed to the **client-visible diff**.
- **$15-$65** is the solo-practitioner consult price band in their own words; the first report's
  $150-$300 was brand and celebrity storefronts.
- **No practitioner in two rounds ever asked software for tone control**, and the register around
  AI-written client copy is open hostility. Editable wording (shipped) is justified by Ashley's
  provider asking for it and as a defensive precondition — never as market validation, never as a
  marketing line, and the no-AI-authored-client-message rejection is hardened.

**NEW #2, the best-evidenced item in the whole corpus: in-app capture coaching** with a
review-and-resubmit loop. Brief standardised instruction took diagnostic accuracy 79%→84% in a
360-patient randomised design; 10-40% of patient photos are low quality; 22 of 54 needed resubmission
in a trial. Nobody in the market does guided capture. **#3 escalation structure** also moved up:
10 of 12 clinicians called folliculitis "acne" and every clinician missed PCOS in a written-for-it
case, so "looks like acne" is the dangerous default, not the safe one. Treatment concordance
(38-45%) is far worse than diagnostic (79-87%) — the PLAN is the weak link, which is the argument
for revise-and-reissue over a one-shot verdict.

**ASCP insurance — Ashley to confirm with her own carrier, flagged to her 2026-10-08.** The five
conditions (client in a state where she is licensed; full intake for new clients; **must be able to
SEE the client**; **sessions live and not prerecorded**; within scope) exist verbatim at
`https://ascpskincare.com/node/2466`, verified by fetching it directly after two subagents disagreed.
They are explicitly "expanded emergency coverage... conditional based on the unique COVID-19
pandemic circumstances", and nothing has replaced them. ASCP's own guidance elsewhere recommends
"scheduled email exchanges" as a legitimate consult tier, which contradicts "live and not
prerecorded". So: coverage for an async photo consult is UNKNOWN and carrier-specific. Do not build
a guardrail that cites ASCP as requiring it, and do not state any of it as coverage advice.

**§2 of that report lists every figure BARRED from customer-facing use or a pitch** — the Houts
85%/14% pictograph figure, the +15-point demonstration lift, 86%→36%, "48% at 3 months", "79-94%
concordance", "21% wrongly reassured", the purging timeline, Perfect Corp's 95%, the 3-5 product
ceiling, the $150-$300 band, and any consult conversion rate. **Blog and marketing copy must not use
these.** This sits alongside the existing rule against stating a competitor's pricing from memory.

**Compliance is now law, not hygiene, in one place:** RCW 19.373.040(1)(c) gives a Washington client
the right to deletion "including from archived and backup systems". A union-by-id merge that
resurrects a deleted record is therefore a **compliance failure, not just a bug** — so every delete
path for client records, photos, plans and consent flags needs a tombstone that unions across
devices and propagates into the offloaded store. §0.8 and `_purgeOffloaded` are part of that story.

### Shipped: coach the camera, and let her ask again (`2026-10-08b`) — recommendation #2

Ashley's call on 2026-10-08: **skip the structured plan document (#1) entirely** and work the rest of
the list in order. Items 5, 7 and 12 in the revised table are pieces OF that document, so they are
parked rather than built — flag them when reached, do not build a container she declined.

The evidence: brief standardised instruction before capture moved diagnostic agreement **79%→84% in a
360-patient randomised design**, 10-40% of client-submitted photos are too poor to read, and 22 of 54
clients had to resubmit in one trial. **No platform in the research ships guided capture or a
resubmission state** — both halves are differentiators, not catch-up.

**Client side** (`slickchart-client.html`): `_vcTipsHTML()` puts six 3rd-grade lines above the photo
grid — daylight, flash off, clean skin, phone straight on, arm's length plus one closer, nothing in
the way — open the first time, collapsible, remembered per device in `sc_vc_tips_seen` (device-local
UI convenience, deliberately NOT synced). `_vcTileHint()` derives a per-shot hint from the
provider's OWN label, so a brow or hair consult gets the right hint with nothing to configure; the
distances are worded as "arm's length" and "a hand's width" because the only published patient
protocol's 50cm/15cm means nothing to someone holding a phone. `_vcCheckHTML()` appears only once a
photo exists. All of it is hidden for a photo-free consult. Flash is phrased as a plain instruction
because ISIC and CLOSE-UP actively contradict each other on it.

**Provider side**: "Can't read these" beside Send review → `vcAskForRetake(id)`. It reuses the
invite nonce rather than inventing state: the client app remembers which `invitedAt` it submitted for
(`sc_vc_submitted`), so a fresh `invitedAt` reopens the capture screen on her phone with the tips at
the top. **Her submission is kept** — photos, goals and routine all stay, so a second pair of shots
adds to the first set rather than replacing it. No new synced key, so no new merge decision.

The message is the third editable template (`vc_retake`), so it rides the §2ak wording system and she
can reword it. It no-ops if nothing has been submitted yet.

`scratchpad/capture.mjs` — 29 assertions across BOTH apps in one run (17 client, 12 provider),
including that the tips stay collapsed once dismissed, that a photo-free consult is never nagged,
that her edited wording is what goes out, and that the submission survives the ask.

### Shipped: the escalation path (`2026-10-08c`) — recommendation #3

Four documented misses, four questions. In the 2016 secret-shopper study a bacterial folliculitis was
called acne by **10 of 12** clinicians, **not one** clinician in a case written to show a hormonal
cause raised it, and **3 of 14** told a patient a nodular melanoma looked fine. The failure mode of
consumer skin consults was never misreading the photo — it was NOT ASKING.

**Client side**: `_vcFlagsHTML()` adds "Anything a doctor should see?" — four ticks (hurts/bleeds/not
healing · a spot or mole changed · came on fast or spreading · periods or body hair changed) plus an
optional note. Shown for photo-free consults too, because this is triage, not photo triage. A tick
alone now keeps the draft alive (`persistVcDraft` previously needed a photo, goals or a routine row)
and `loadVcDraft` restores it.

The referral rule is taken from **statute, not a blog list**: North Carolina's scope is written as
"improving the appearance of the skin", so pain, bleeding and non-healing are outside the licence by
the statute's own words.

**Provider side**: `_sanVcFlags()` whitelists and coerces (unknown keys dropped, note trimmed to 400),
and the flags ride the three ingest paths plus `_hydrateVcSubs` (which takes the whole blob, so
`sc_pro_vc_subs` needed no change — no new synced key, no new merge decision).
`_vcFlagBannerHTML()` puts an amber block at the top of the review listing what she ticked, quoting
her note, and offering `vcReferToDoctor(id)`.

**THE STRUCTURAL RULE, asserted in the test: there is no control anywhere in this flow that can say a
lesion is fine.** No "all clear", no "benign", no "nothing to worry about". The only dispositions are
a plan, a request for better photos, and a referral. That is the direct answer to the 3-of-14 finding
and it must stay true — `escalate.mjs` fails if any of those words appear on the review screen.

A referral is a recorded disposition (`referredAt` on the invite), not a message she has to remember
sending, and it does **not** close the consult: "see someone about that spot" and "here is your
routine" are not mutually exclusive, so Send review stays available and the screen shows the referral
date. The wording is the fourth editable template (`vc_refer`) and says plainly that she cannot
diagnose or treat it.

`scratchpad/escalate.mjs` — 32 assertions across both apps. Note for whoever runs it: the section
heading is `text-transform:uppercase` and Chrome's `innerText` returns the TRANSFORMED text, so those
two checks are case-insensitive on purpose.

### Shipped: note starters (`2026-10-08d`) — what is left of #5 without a plan builder

Ashley declined the structured plan document, so #5 reduces from "plan-builder templates" to
**reusable starting text for the consult notes box**, which needs no container and keeps most of the
value. #12 (the client-visible diff) is DEAD without issued plans. #7 (keep/change/stop) survives as
an insert into the notes and is next.

`sc_note_starters`, array of `{id,name,body,_ts}`, in `_LIB_TOMB` → `sc_deleted_starters`, so it
merges through `_mergeAuthoredById` with no new merge code. Loader is a `_reloadStep`.
merge-coverage 84→85, reload-coverage 79→80.

**Two shipped starters, corrective and holistic, and they are not filler.** Each one prompts the
three things the ONE client in the whole corpus who described receiving a paid written plan said
were missing: she wished the provider had explained *why she selected a certain routine and products
and why for me, and explained what I should see or expect*. So every starter has **"Why these, for
you"**, **"What you should see, and when"**, and a what-if line. Asserted in the test, so a future
edit cannot quietly drop them.

The holistic/corrective split is **sections, not tone**: the holistic one carries "Food, water and
sleep" and "Stress and your cycle"; the corrective one deliberately does not. That is the research
finding that holistic practice is a declared professional identity which changes what is IN the plan.

Wording follows the verified comprehension evidence: **named parts of the day, never clock times**
(89% vs 77%, Davis 2009 n=359), asserted by a regex in the test. **No product count anywhere**, per
Ashley's standing decision.

Defaults live in code and are never written to storage (fresh account still seeds 6 keys, 0 tombs).
An edited default is an override with the same id; a removed one is a tombstone, which is why
`_starterList()` reads the delete record via `_tombSet` rather than just the array.

Insert behaviour is the one real hazard and it is asserted: a starter **never overwrites text she has
already typed** — it fills an empty box, otherwise it drops in at the cursor. A starting point that
eats three paragraphs of real work is worse than no starting point.

`scratchpad/starters.mjs` — 23 assertions including the no-clock-times regex, that removing a shipped
starter survives a pull, and that one written on another device arrives.

### Shipped: follow-up date + a reminder that actually fires (`2026-10-08e`) — recommendation #6

Ashley asked for two things specifically: that the app remind HER on the date, and that the reminder
**actually work**. Both are built; the honest limit is stated below and must not be overstated to her.

**The date.** Chips on the review screen (2 / 6 / 12 weeks, or none) writing `followUpAt` onto the
invite. Intervals are hers to pick and the app does not insist: the week-6 schedule the first
research round justified traces to a 17-patient pilot whose primary result was null. 12 weeks is the
real guideline anchor (NICE NG198, 2021) and 6 weeks is the one asynchronous photo cadence that was
trialled (91% of patients preferred it to coming in).

**How the reminder fires.** `notifFeed` is rebuilt from its sources each session rather than
persisted, so `_vcSyncFollowUpNotifs()` GENERATES the reminder from the stored date on every reload
and on the existing 15s poll. Consequences, all deliberate: idempotent, survives a reinstall, fires
on whichever device she opens, and the id is stable per (client, date) so re-generating never
duplicates, dismissing sticks through `_notifCleared` (which unions across devices), and moving the
date re-arms it as a new reminder. It surfaces in three places so it cannot be missed — the
notification feed, the Home third tile (a due follow-up now outranks a document renewal, because it
is a promise to a client), and a "Follow-ups due" block at the top of the consult inbox with
**Check in now** / **Done**.

Guarded on `_rosterNotReadYet()` — a reminder generated before `CL` is read would silently skip every
client, which is the §2aj trap. Asserted.

**THE HONEST LIMIT, do not oversell it: this cannot reach her while the app is CLOSED.** Provider
push does not exist on this deployment — `push_subscriptions` is keyed by `client_id`, and
`providerSystemNotify` only fires a local browser notification while a tab is open and hidden. So it
is an in-app reminder plus a system notification if the app happens to be open in the background.
Real provider push is a separate build: a provider subscription table, VAPID keys for providers, and
a cron. Told to Ashley plainly on 2026-10-08.

**A data-safety fix came with it, and it was necessary rather than optional.**
`sc_pro_vc_invites` rode the PLAIN OVERWRITE (it was in check-merge-coverage's KNOWN list), so a
laptop holding an older copy could silently erase a follow-up date set on her phone — and a reminder
that can vanish is not a reminder. It is a per-client map, so it now merges by client with the
newest-stamped entry winning (`_CLIENT_MAP_KEYS` + `_CLIENT_MAP_OBJ: 'stamped'`). `_newerStamped`
compares `ts`, so `persistVcState()` stamps `ts` on any entry whose content changed, via a signature
cache (`_stampVcInvites`) rather than at each of the nine mutation sites — the tenth one somebody
adds would otherwise silently stop merging. `loadVcState` reseeds the signatures so reading the
account's copy is not treated as an edit. merge-coverage 85→86 keys, 22→21 known unmerged.

Also fixed in passing: `av()` rendered `${c.initials}` with no fallback, so a client record without
initials printed the literal text "undefined" in the roster. One-token guard.

`scratchpad/followup.mjs` — 35 assertions. It MOVES THE CLOCK rather than trusting the code: sets a
date in the past and proves the reminder appears, never duplicates across three generations, is
counted by the badge, shows on Home and in the inbox, that dismissal sticks through a regenerate,
that a new date re-arms it, that Check in now messages the client in her own wording and clears it,
that Done clears silently, that it is blocked before the roster is read and fires once it is, and
that the date survives a stale account copy in both directions.

### Shipped: keep / change / stop (`2026-10-08f`) — recommendation #7

The most repeated sentiment in the client half of the research is not wanting to be sold to: paid
skin consults "felt like sales pitches rather than professional services", and the one client who
described a written plan she paid for wanted to know WHY each thing was chosen for her. Telling
someone what to KEEP from the shelf they already own costs nothing, proves she looked, and is the
cheapest available counter to that complaint.

The data was already captured — she writes a note per product in the routine review — so this adds
a one-tap verdict (Keep / Change / Stop, tap again to clear) and a button that composes all three
groups into her notes, in her own words where she wrote them. **No new storage:** the verdict rides
the routine rows on the submission, `_sanRoutine` whitelists it to the three values, and it travels
to the client in `routineReview` alongside the feedback.

Client side shows it as a coloured chip, and **a Keep with no note still renders** — "keep using
this" is the whole point of the exercise, so filtering on `feedback` alone would have hidden exactly
the message worth sending. The composer is silent about products she did not judge and emits no
empty group headings.

The insert follows the note-starter rule: fills an empty box, otherwise drops in at the cursor, never
overwrites what she has typed.

Note for whoever runs the test: `routineReview` only ships once `vcInvites[id].reviewed` is true,
which is deliberate (a client must never see a half-finished audit), and the client-side screen is
`homecare`. Both tripped the first run of `scratchpad/keepstop.mjs` (20 assertions across both apps).

### Shipped: PROVIDER PUSH + a reminder system for anything (`2026-10-08g`)

Ashley asked for two things: make provider push actually work, and give her editable reminders for
anything she needs. Both are in. This is the thing §2 of the follow-up note said was "a separate
build" — it is now built.

**Server (new):**
- `provider_push_subscriptions` (id, provider_id, endpoint, sub, created_at) with a UNIQUE index on
  (provider_id, endpoint), so re-subscribing a device updates instead of accumulating dead endpoints
  that every reminder then fans out to. `lib/provider-push.js`; every read/write scoped by the
  provider id from a VERIFIED session (§0.1). The one cross-owner read is `listReminderOwners`,
  named so it is obvious, grouped per owner and never merged.
- `api/provider-push.js` — POST/DELETE/GET, Bearer session + `isSessionValid`, provider id NEVER
  from the body. The endpoint is run through `validPushEndpoint` before storage because we later
  POST to it (SSRF).
- `api/cron-provider-reminders.js`, registered in `vercel.json` at `*/15 * * * *`, auth fails CLOSED
  without `CRON_SECRET` like the client cron. Sends her own reminders AND consult follow-ups, each
  gated on her notification toggles.

**Two design decisions worth not undoing:**
1. **Repeats are DERIVED, never stored.** The cron never writes back to her kv rows — that would race
   her app's own sync, which is how merges lose data. `dueOccurrence()` computes the latest
   occurrence from the original time plus the interval, and the dedupe key carries that timestamp. So
   "every week" needs no stored next-fire date, cannot drift, and editing the time just produces
   different keys. **A real bug was found here:** stepping `setMonth()` repeatedly turns Jan 31 into
   Mar 3 and the drift compounds until the occurrence falls outside the live window and the reminder
   silently never fires again. Now computed from the original day-of-month, clamped to the target
   month's length, in UTC. `scratchpad/occ.mjs` has 21 assertions on this alone.
2. **Claim before send**, reusing `reminder_log` with the provider id in the client_id column under a
   `prov:` prefix so the namespaces cannot collide. If the send reaches zero devices the claim is
   released so the next tick retries. A 48h stale window stops enabling push from blasting every
   reminder whose date has ever passed — the cost is that an occurrence missed by >48h of downtime is
   skipped, which is the right trade.

**App:** `sc_reminders` (array of `{id,title,note,at,repeat,clientId,done,off,_ts}`) in `_LIB_TOMB` →
`sc_deleted_reminders`, so it merges and deletes stick. A Reminders screen (More → Reminders, with a
due count on the row), add/edit sheet with title, note, date, time, repeat and an optional client,
and a one-tap push enrolment card. `_syncReminderNotifs()` generates in-app reminders the same way
the consult follow-ups do (stable id, no duplicates, sticky dismissal, roster guard).
merge-coverage 86→87, reload-coverage 80→81.

**A repeating reminder is never marked "done"** — that would kill every future occurrence. Done rolls
it forward to the next occurrence instead. Asserted.

**TWO REAL BUGS the tests caught, both mine:**
1. `renderReminders()` re-rendered itself whenever `_pushDevices` was still null, and `_pushStatus()`
   returned early WITHOUT setting it on a missing token or a non-ok response — an **infinite
   render/fetch loop that hung the whole app** for any signed-out or failing status check. Every path
   out of `_pushStatus` now sets it, and `_pushAsked` caps it at one attempt per session.
2. The monthly drift above.

**Harness gotchas, recorded so the next session does not lose an hour to them:**
- `pkill -f <pattern>` matches THIS shell's own command line when the pattern appears in it, so it
  kills the command that issued it. Use `pkill -x chrome` (match the executable name).
- Orphaned Chromium processes accumulate from killed Playwright runs and then every new launch hangs.
  Check `ps aux | grep -c "[c]hrome"` first.
- `newContext({permissions:[...]})` and `addInitScript` both hang in this environment. Use
  `b.newPage()` and stub browser APIs INSIDE the evaluate.
- Playwright matches routes in REVERSE registration order — register the generic `**/api/**` FIRST.
- `innerText` returns CSS-TRANSFORMED text, so a `.sh h2` heading compares as title case.
- Files written to `/tmp` do not persist here; use the scratchpad directory.

**Still NOT done, and it is the honest limit of this build:** nothing has been verified against a
real push service or a real Vercel cron run. `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` and `CRON_SECRET`
must be set in the environment or the endpoint reports `push not configured` and the cron no-ops.
The public key in `slickchart.html` is the SAME one the client app embeds and must match the server's
env var. First live check: enable notifications on a device, set a reminder two minutes out, and hit
`/api/cron-provider-reminders?key=$CRON_SECRET`.

### 2026-10-08: the thread-16 pass. 21 unprotected keys down to 16, and 12 of those are correct.

Ashley asked for a deliberate pass rather than waiting for each key to cost a provider their data.
**merge-coverage: 87 → 92 keys merging; 21 → 16 known unmerged.**

The five that moved share a property worth naming: every one was a **record of something already
done**, so a plain overwrite did not merely lose data, it **UNDID AN ACTION**.

| key | was | now | what an overwrite did |
|---|---|---|---|
| `sc_deleted_sq` | overwrite | `_TOMB_ARR` | a Square product she deleted came back |
| `sc_imported_products` | overwrite | `_TOMB_ARR` | a re-import duplicated her whole catalogue |
| `sc_deposit_handled` | overwrite | `_TOMB_OBJ` | a client was prompted twice for the same deposit |
| `sc_summary_guide_optout` | overwrite | `_TOMB_OBJ` | guides she removed from a summary reappeared |
| `sc_service_menu` | overwrite | `_LIB_TOMB` (`sc_deleted_svc`) | a laptop with yesterday's menu reverted a price |

`sc_service_menu` needed its delete site taught to write the record (`_svcDelDo` now calls
`_libForget`), or the union would have resurrected a service she removed. Asserted.
`sc_summary_guide_optout`'s entries CAN be un-removed, so §0.8 forbids a blind entry union — the
shallow per-client union is deliberate: last write wins per CLIENT, not for the whole key.

**A trap worth remembering: `check-merge-coverage.cjs` parses these registries with `[^}]*`, so a
BRACE INSIDE A COMMENT truncates the capture and silently hides every key after it.** Two keys read
as unprotected until I took the braces out of my own comment. If a key you just registered still
shows as plain-overwrite, look for a `{` in the comment above it.

**The 16 that remain, honestly split.** Twelve are correct as last-write-wins — one record for the
account, where a merge would add risk without adding safety: `sc_amazon_assoc`, `sc_booking_page`,
`sc_calendar_feed` (derived from appointments, regenerated), `sc_captured_photos` (deliberate, §3),
`sc_checkin_cfg`, `sc_login_email`, `sc_notif_settings`, `sc_professions`, `sc_room_state_`
(device-local), `sc_square_catalog` (a cache, re-fetched), `sc_totp_enabled`, `sc_wsname`.

**Four were still genuinely at risk.** They SHIPPED the same day — see the next section. The note
that stood here ("doing any of these half-correctly is worse than leaving them") was right about the
shapes: no two of them wanted the same merge. `scratchpad/thread16.mjs` (12 assertions) covers the
five in the table above.

### 2026-10-08: the last four keys. Thread 16 is CLOSED. (`2026-10-08j`)

**merge-coverage: 92 → 97 keys merging; 16 → 12 known unmerged, and all twelve are the reviewed
last-write-wins list above.** Nothing accumulating rides the plain overwrite any more.

| key | shape | merge | why not an existing one |
|---|---|---|---|
| `sc_routines` | `{profKey:[{id,...}]}` | `_mergeAuthoredMap` + `sc_deleted_routines` | `_mergeAuthoredById` only reads a flat array |
| `sc_sent_routines` | `{profKey:{clientId:rec}}` | `_mergeSentRoutines` | per-client union one level IN, and the outer keys are NOT client ids |
| `sc_summary_drafts` | `{note:{cid:text},obs:{cid:text}}` | `_mergeSummaryDrafts` | two per-client maps in one compound key, needing a stamp PER CLIENT |
| `sc_suggested_forms` | a selection set | `_mergeStamped` | a union is actively WRONG here |

**Three things in there are worth not re-deriving:**

1. **`sc_suggested_forms` must NOT union.** It is the checkbox list of forms suggested on every
   client, where unticking is a real removal and an EMPTY list means "go back to automatic". A union
   would re-tick what she unticked and she could never clear the list — §0.8, read in the other
   direction. Stamped last-write-wins is what a checkbox screen should do. It is stored as
   `{list:[...],_ts}` now; a bare array is the legacy shape and is still read.
2. **`sc_summary_drafts` needed PER-CLIENT stamps, not one for the key.** One stamp would mean a
   draft typed for Jen on the phone clobbers one typed for Pat on the laptop. `persistSummaryDrafts`
   keeps a snapshot of what it last wrote and stamps **only the clients that changed** — stamping
   them all would make this device win conflicts over drafts it never touched, which is the bug
   wearing the fix's clothes. `loadSummaryDrafts` seeds that snapshot from what it READ, or the
   first save after a load restamps everything. Clearing a draft leaves an empty STRING rather than
   removing the key, so a union could never have resurrected deleted text — but presence alone also
   cannot order two copies, which is exactly why the stamp is required.
3. **`_compoundIds` read three of these WRONG, which is worse than not reading them.** `_idsOf` saw
   `sc_routines` as "every value is an array" and returned the PROFESSION NAMES as the ids — so
   losing every routine in a bucket read as no loss at all, because the bucket was still there. Same
   for `sc_sent_routines`, and `sc_summary_drafts` came back as `['note','obs']`. All three are now
   namespaced per field (`esty:rt123`, `note:cid`) inside `_compoundIds`, which `_dropBootShrinks`
   prefers over `_idsOf`. **If you add a compound blob, put it in `_compoundIds` — the shrink guard
   looking at the wrong level of a blob is silent.**

Also: `_MAP_LIB_TOMB` is a new registry (`_LIB_TOMB`'s shape one level in) and
`check-merge-coverage.cjs` had to be taught to read it, or the key reports unmerged while being
perfectly merged. `_libForget` consults both registries. Routine ids gained a random tail
(`rt<time><rand>`), same reason as client ids.

**Verification.** `scratchpad/last4.mjs` — 48 assertions on the merges and the real call sites.
`scratchpad/last4pull.mjs` — the four through the REAL `Cloud.pull()`: **it loses all four on the
previous build and keeps all four on this one.** `scratchpad/rtdel.mjs` — 5 assertions driving the
actual delete button, proving the delete record is written and the merge refuses to bring the
routine back while leaving the others alone.

**A trap this cost me, worth the line:** `Cloud.pull()` takes NO ARGUMENT, it fetches `/api/store`
itself. The first version of `last4pull.mjs` passed the account payload in as an argument, so pull
saw an empty account, changed nothing, and the test PASSED ON THE BROKEN BUILD. A merge test that
cannot fail is not a test. Serve the account copy from the ROUTE, and clear `Cloud._queue` first —
pull deliberately skips any key with a pending local write, which will also make it pass for the
wrong reason.

### Shipped: GOOGLE CALENDAR TWO-WAY (`2026-10-08i`) — recommendation #15, the last one

**Ashley chose FULL TWO-WAY on 2026-10-08**, from a question that showed her the permission
trade-off side by side. The recommendation in the report was busy-blocking only; she picked the
stronger option knowing the token is more powerful. Recorded because it is her decision, not a
default to quietly revisit.

**Scope is `calendar.events`, NOT full `calendar`.** It does everything two-way needs — read, create,
update, delete EVENTS — but cannot delete a whole calendar or change who she shared one with.
Narrower than what she was shown, identical in capability for this feature. Do not widen it without
a reason.

**§0 asset class.** `google_connections`, one row per provider, every read/write scoped by the
provider id from a verified session, and **no fallback of any kind** — no deployment calendar, no
"use the owner's". The OAuth `state` is a short-lived SIGNED token carrying the provider id, not the
id itself: otherwise anyone could hand the callback a state naming another account and attach their
own Google login to her calendar.

**Inbound** (`googleBusyMinutes`): reads `events.list` rather than freeBusy, because with this scope
we can see which events are OURS (tagged `slickchartApptId`) and skip them — reading back the
appointment we just wrote would otherwise look like a second commitment on the same slot. Wired into
`lib/booking.js` `busyRanges()` as source 3, following that file's own rule: **if she HAS a
connection and we cannot read it, return null** so the page takes a request instead of publishing a
slot list that does not know about her morning. An event she marks **Free** does not block, which is
Google's own meaning of the flag and is said in plain words on the settings screen because it WILL
be reported as a bug.

**Outbound** (`syncApptsToGoogle`): **a reschedule is a PATCH on the stored event id, never a
delete-and-recreate** — that is the exact failure the research found in GoHighLevel, where deleting
and remaking re-fires "booked" without firing "cancelled". The event id map lives in
`google_connections.event_map`. The app sends the WHOLE appointment list rather than a diff, because
a diff would have to survive an offline edit, a cross-device merge and a failed request; reconciling
the full list is simpler and self-healing. A 404/410 on PATCH means she deleted it in Google, so it
is recreated.

**The seven-day trap, which is the most-reported failure in this whole category:** a Google OAuth app
left in **"Testing" publishing status issues refresh tokens that expire after 7 DAYS**. That is
almost certainly the real story behind every "it worked for a week then stopped" complaint in the
research. Code cannot fix it — the app must be PUBLISHED in the Google console. What the code does is
record the failure on the row and surface **"Google needs reconnecting"** with the honest line that
her events are not blocking bookings right now, rather than silently returning no busy time.

Also: the token upsert COALESCEs `refresh_token`, because a refresh exchange returns none and nulling
it would turn a working connection into a dead one an hour later, silently. Asserted in
`scripts/test-clients-sql.mjs` (now 30 cases) against real PostgreSQL.

`scratchpad/gcal.mjs` — 21 assertions: the appointment conversion (including that **12:00 PM does not
become midnight** and midnight is not treated as falsy), no push when disconnected, three saves in a
burst pushing ONCE, all three screen states, and the render-loop guard.

**NOT verified here, and it needs doing before telling a provider it works:** no live OAuth round
trip, no real event written, no real busy block read. Needs `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` set, the redirect URI `<origin>/api/google-cal-callback` registered in the
Google console, and the consent screen **published** (see the seven-day trap). Until the env vars
exist the settings card says "Not switched on for this deployment yet" and the one-way subscribe link
keeps working.

### Still to do, in this order (SUPERSEDED — see the revised table in `reports/Virtual consult research verified.md` §4)

2. **The structured plan document.** The central recommendation. Today `sendVcReview` reads ONE
   textarea and `_doSendVcReview` pastes it into a chat bubble. Sections, required fields (amount as
   a physical referent, named slot, order, named days), slot as the organising key, delivered as a
   client-facing page at the magic link with the chat message reduced to a pointer. No product cap.
3. Reusable plan templates, holistic and corrective, shipped pre-written and editable.
4. Follow-up date on every plan + week-2 and week-6 check-ins (week 6 is the adherence cliff).
5. Compose the product-audit verdicts into the plan as keep / change / stop.
6. Language guardrails: no field that can call a lesion benign.
7-11. Photo nudge, intake additions, per-purpose photo consent, plan versioning, ghosted retake.
12. Google Calendar busy-time import (inbound only, per-provider OAuth in a `square_connections`
    -shaped table — §0 asset class). Large, last.

Rejected with reasons in the report: client-facing AI skin scores, AI that writes her message, a
workflow canvas, a platform storefront or default affiliate links, a fee-credit ledger, in-house
video, clinical photo apparatus, shipped ramp/purging timelines, spintax.

## 2ap. Google Calendar two-way is LIVE, and the "10am" that was never checked (2026-10-09, `2026-10-09t`)

### Google Calendar: setup finished, feature is real

Ashley completed the whole Google Cloud sequence on 2026-10-09 and connected her own calendar.
`GOOGLE-CALENDAR-SETUP.md` is now a walked-through document, not a plan. What is settled:

- Project `SlickChart` (id `slickchart-511121`), owner `ashley@slickchart.app`, **No organization**.
  The no-org parent is load-bearing: it means Google never offers the **Internal** user type, and
  Internal would have meant only she could ever connect a calendar. That trap is now impossible.
- **The verification review is the ordinary free one. Settled with evidence, do not re-open it.**
  Read off the console's own Data Access page for this project with the scope added: sensitive 1
  row (`calendar.events`), restricted 0 rows. No CASA, no fee. Section 9 of the setup doc has the
  table. It only stays true while the scope list stays at that one entry.
- Redirect URIs registered: `https://slickchart.app/api/google-cal-callback` AND the `www.` form,
  as insurance against `APP_ORIGIN` ever being unset.
- Still TODO: **publish the app** (step 9). Until then the connection is Testing-mode and dies
  every 7 days, and only emails on the test-user list can connect at all.

**Still unverified by her at the time of writing:** that appointments actually move in both
directions. The green card only proves the OAuth handshake. Direction 2 (a Google event blocking a
client booking) is the one that fails quietly and is the whole point of the feature.

### What she OBSERVED (§1b — facts, not conclusions)

1. On the Calendar screen, the month header showed a `SQUARE` badge and **nothing for Google**, so
   there was no way to tell a live sync from one that had silently stopped. (Fixed, below.)
2. Opening **Book in Square** for **10/10/2026**, the slot picker said *"Live availability isn't
   enabled for this account, enter a time"* and pre-filled **10:00 AM**.
3. **"10am tomorrow is not actually available."** The pre-filled time was wrong, and she was
   already booked then.

### Two bugs behind observation 2 and 3

**(a) The message asserted a cause it did not know.** `_sqLoadSlots`'s catch printed "Live
availability isn't enabled for this account" over *every* failure of
`POST /api/square/availability` — an expired token needing a reconnect, a service with no bookable
team member, a Square outage, a dropped connection. The endpoint returns a real reason and
`_sqFetch` carries it in `e.message`; the catch threw it away. It now prints Square's own message,
plus a reconnect hint when the code is `auth`/`nosquare`. **This is the diagnostic that will say
why her availability lookup is failing** — she had not reopened the sheet on the new build yet.

**(b) A hardcoded `value="10:00"` on the fallback time input.** With no slots to show, the box
arrived pre-filled with 10:00, which reads as *"SlickChart checked and 10am is open."* Nothing had
been checked. The input is now blank with an amber line saying the time is not checked against her
calendar and Square will refuse it if she is already booked. `_sqDoBook` already rejected a blank
time with "Pick a time", so nothing downstream changed.

The general rule, and the reason this is written down: **a suggested value is a claim.** Pre-filling
a time in the one code path where the app has no availability data is the UI equivalent of telling a
provider something is safe without checking — the same failure as §4c, in a different costume.

### Google connection state is now visible where she looks

`_gcalPillHTML` / `_fillGcalPill` / `_loadIntegGcalStatus` (near `_gcalStatus`).

| State | Calendar month header | Integrations card badge | Integrations subtitle |
|---|---|---|---|
| connected, healthy | `• GOOGLE` green | `Connected` green | Two-way with Google — and subscribe one-way on Apple |
| connected, refusing | `• RECONNECT` amber | `Reconnect` amber | Google stopped accepting the connection |
| not connected | *(blank)* | *(blank)* | One-way — your appointments show up there |

**Not connected deliberately prints nothing** rather than "Not connected": the one-way Apple/Google
ICS subscribe works regardless, so that wording would have claimed a working feature was off.

Both call sites fill an empty span after the answer lands rather than re-rendering, so neither can
loop the way the Reminders screen did, and a screen already navigated away from is skipped.

### Also this build

- Integrations: removed the "That's the whole list — there's no Shopify, Mailchimp, Zapier or
  Instagram" paragraph. The blue line at the top of the same screen already says it.
- **`Google & Apple Calendar` keeps its name.** Checked before touching it: the Apple path is real,
  not a badge for something unbuilt. `/api/calendar-url` issues the private feed, `/api/calendar`
  serves the `.ics`, and `renderConnectCalendar` carries subscribe steps for iPhone/iPad and Mac.
  What does NOT exist is two-way Apple (CalDAV).

### 2ap-2. The availability window was asking for the wrong day (`2026-10-09u`)

Found while chasing her "tomorrow should have both 2pm and 4pm, only 4pm shows". **It is NOT the
cause of that symptom** — 2pm Saturday was inside the old window too — but it is real and it was
silently costing her evening bookings.

Vercel runs in UTC. `api/square/availability.js` built its search window with
`new Date('2026-10-10T00:00:00')`, which parsed on the server means midnight **UTC**. Measured:

```
server asked Square for : 2026-10-10T00:00:00Z -> 2026-10-10T23:59:59Z
which in her time is    : Fri, Oct 9, 5:00 PM  -> Sat, Oct 10, 4:59 PM
```

So asking for Saturday asked for **Friday 5pm through Saturday 4:59pm**. Two consequences, both
silent: every Saturday slot from 5pm on was never searched, and a Friday evening slot could be
returned and rendered as one of Saturday's.

Now `zonedDayRange(date, tz)` in `lib/square.js` builds the window in the SHOP's timezone, read
from the Square location (`resolveLocationTz`). Unknown timezone keeps the old UTC behaviour rather
than guessing an offset. `zonedDateKey` additionally drops any slot that is not on the requested
day in her timezone, so a window that is slightly wrong can never surface as a wrong-day slot.

**The part that looked right and was not:** the first version sampled the offset once at noon and
applied it to both ends of the day. That is wrong on the two days a year the offset changes — it
made 2026-11-01 come out 24 hours instead of 25, and started 2026-03-08 an hour before midnight.
`zonedWallToUtc` now solves each end by iteration. Both DST days are asserted.

`scripts/check-square-daywindow.cjs` (CI) extracts the helpers from `lib/square.js` verbatim every
run — no hand-kept copy that can drift — and asserts local midnight to 23:59:59 across four
timezones, both DST days, the UTC fallback, and that an 8pm appointment is inside the window.
Confirmed to FAIL (exit 1) against the original implementation.

The response now also carries `tz`, `searched:{from,to}` and `returned`, so the next time a provider
says a time is missing, what was actually asked for is in the answer instead of being guessed at.

**RESOLVED, and there was no bug.** Ashley found it: her Square is set to refuse bookings less than
**24 hours** out. She was looking at 3:26pm Friday, so the earliest bookable time was 3:26pm
Saturday — 2pm Saturday fell inside the notice period and 4pm cleared it. Square returned exactly
one slot because exactly one was bookable. SlickChart showed what Square said, which is the whole
point of surfacing only Square's availability search.

Worth keeping for the pattern, not the bug: three plausible causes were in play (the timezone
window, the service's duration/buffers, Square's booking rules) and the one that was true was the
account setting nobody had asked about. The theory that got closest to shipping as an explanation
was the timezone window, which was a genuine bug found on the way and still had nothing to do with
the symptom. **A real bug found while investigating is not the answer to the thing you were
investigating.** Saying "this is real, and it is not your problem" is the honest move, and it is
what kept a wrong cause out of the conversation.

Nothing was built for this. A banner explaining the 24-hour rule was considered and not added: the
behaviour is correct, she understood it immediately once she saw it, and §5 says not to pile on.

### 2ap-3. Google Calendar two-way sync VERIFIED BOTH DIRECTIONS (2026-10-09)

Ashley ran both tests on her own account and both passed.

- **SlickChart to Google:** an appointment added in SlickChart appears on her Google Calendar.
- **Google to SlickChart:** an event on her Google Calendar stops that time being offered on her
  booking link.

The feature is real and may be described to providers as working. Two caveats that still hold:

1. **It is still in Testing mode, so the connection dies every 7 days until she publishes.** That
   is step 9 of `GOOGLE-CALENDAR-SETUP.md` and it has NOT been done as of this writing. When it
   breaks, the symptom is her own Google events quietly no longer blocking bookings — which the
   amber `RECONNECT` pill on the Calendar screen now makes visible (§2ap).
2. **Only the SlickChart booking link consults Google, never the Square booking page.** The
   blocking lives in `lib/booking.js`, used by `api/book-page.js`, `api/book-slots.js` and
   `api/book-request.js`. Square has no knowledge of her Google calendar and cannot have. Anyone
   testing this against the Square flow will see no blocking and wrongly conclude it is broken.

**How to test it without getting a false pass**, because two notice rules can hide a slot for the
wrong reason — Square's own minimum booking notice (hers is 24 hours) and SlickChart's `leadHours`
(default 12):

1. Pick a day two or more days out, clearing both.
2. Confirm on the booking link that the target time IS offered. **This step is the test.** Skipped,
   a time that was never offered is indistinguishable from one Google blocked.
3. Add a Google event at that time, left as Busy — "Free" is honoured deliberately.
4. Reload: the time is gone.

If the booking page stops offering slots at all and switches to taking a request, that is NOT a
pass. `busyRanges` returned null, meaning there is a Google connection it could not read, and it
refuses to publish a slot list it is unsure of rather than risk a double booking.

### 2ap-4. The Square booking sheet had no way out (`2026-10-09v`)

`openSquareBook` rendered a header with no close control. Tapping the backdrop worked but nothing
said so, and the local quick-add modal beside it has had a visible **Cancel** all along, so the
inconsistency was the giveaway. Added an X in the header: 36x44 tap target, inside the card at
390px, no horizontal overflow, modal removed on tap, header and LIVE badge unchanged.

### 2ap-5. The privacy switch was unreachable until after it mattered (`2026-10-09w`)

Ashley disconnected her calendar to record the OAuth demo video, went to turn on **Keep client
names out of Google** first, and could not find it. It was not a navigation problem. The row is
rendered by `_gcalPrivacyRowHTML()`, which only runs inside the CONNECTED branch of
`_gcalCardHTML()`. Disconnected, it does not exist.

Which means the only way to reach the privacy choice was to connect first — and the first sync had
already written client names and appointment notes into Google by then. `disconnectGoogle` DELETEs
the row, so connect-toggle-disconnect does not preserve the preference either. There was no order
of operations that got names out of Google before they went in.

The choice now appears on the not-connected card too, and travels with the grant:

- `_gcalPreConnectPrivacyHTML()` renders the row beside **Connect Google Calendar**.
- `_gcalSetPreConnectPrivacy()` re-fetches the status with `?private=1`, because the consent link
  is minted SERVER-side and the choice rides inside its signed state. Flipping the switch without
  re-minting would hand Google the old link and connect with the opposite setting, silently. It
  re-renders by calling `renderConnectCalendar()` directly rather than through `nav()`, which
  depends on `_navCur` pointing at this screen.
- `api/google-cal.js` reads `?private=1` — safe, that endpoint is behind `requireLogin` and only
  ever acts on the authenticated caller — and signs it into the state as `p`.
- `api/google-cal-callback.js` passes `{privateTitles: payload.p === 1}` to
  `saveGoogleConnection`, which applies it as the row is created.

**§0.1 note:** the flag is in the SIGNED state, never a raw query parameter at the callback. Tested:
a tampered state and a state signed with a different secret both fail to verify, so nobody can
force a setting onto another account's connection. Verified in the browser that the rendered
consent link itself changes with the switch, which is the thing that actually had to be true.

Default stays OFF, matching what connecting has always done. Flipping the product default to
private-by-default was deliberately NOT done unilaterally — it is Ashley's call and she was asked.

`saveGoogleConnection(providerId, tokens, opts)` applies the flag in a second UPDATE rather than in
the INSERT, so a reconnect that carries no explicit choice cannot quietly reset a preference she
already set.

## 2aq. "Needs your attention" kept asking for work the client had already done (2026-10-10, `2026-10-10a`)

### What Ashley OBSERVED (§1b — facts, before any theory)

1. She sends pre-visit check-ins for the NEXT DAY's clients.
2. The clients complete them.
3. "Needs your attention" still says their **pre-visit check-in** is not completed.
4. Same for the **first-visit package** — still says not done after the client has done it.

### Two different root causes, one shape

Both tiles were judging a BOOKKEEPING STAMP instead of the evidence the work was actually done.
This is the same failure as §4c in a different costume: asserting a state rather than checking it.

**(a) The check-in nudge never got to ask the right question.**

`_checkinDone(id, c, apptAt)` already carries a robust signal, added for exactly this symptom: a
`lastCheckin` whose own stated visit matches the appointment counts as done, even when
`checkinDoneFor` was never stamped — which happens routinely, because a Square appointment often
syncs onto the record AFTER the client's check-in arrives.

That signal is gated on `apptAt`. And `_needsCheckin()` called `_checkinDone(id, c)` with **no
appointment at all**, so it was skipped every time and the answer fell back to `checkinDoneFor` —
the one stamp known to go missing. The fix existed and was unreachable from the Home nudge.

`_hoursUntilVisit(c)` had already parsed `c.nextVisit` into a Date and thrown it away. That parse is
now `_visitDateOf(c)`, and `_checkinDone` derives the visit from the record when the caller passed
none. Purely additive: it can only turn "not done" into "done", and only via `_ciMatchesVisit`,
which compares the check-in's own stated visit DAY, so a returning client's month-old check-in still
cannot suppress tomorrow's nudge.

**(b) `_hasIntakeOnFile` matched on the form's TITLE.**

`names.some(n => /intake/i.test(n))`. An intake the provider renamed — "New client form", "Health
history", anything without the literal word — never counted as on file, so **"First-visit package
not done yet"** stayed up permanently after the client had completed it. Submissions carry `formId`
and the package sends `_ncIntakeFormId()`, so it now matches on the id first and keeps the title
check as a fallback.

**(c) The Home first-visit tile tested `!c.appInvited` and nothing else.** If that flag never landed
— sent from another device, or invited by some other route — the tile stayed up although the client
had already filled the intake in. A completed intake is proof the package is done, and now clears it.

### Verified headless (no page errors)

Check-in nudge, visit tomorrow in every case:

| Client | Before | After |
|---|---|---|
| completed, `checkinDoneFor` missing (HER CASE) | nudges | **cleared** |
| nothing completed | nudges | nudges |
| returning client, month-old check-in on file | nudges | nudges |
| `checkinDoneFor` stamped correctly | cleared | cleared |

First-visit tile: new client with nothing done → shows; **intake completed but `appInvited` unset →
cleared**; `appInvited` set → cleared; unrelated form only → shows; returning client → cleared.

Intake detection: renamed intake matched by `formId` ✓, legacy title match ✓, id ending `-intake` ✓,
an unrelated form correctly NOT an intake ✓, no forms correctly NOT an intake ✓.

### The rule worth carrying

**A nudge must key on the evidence, not the paperwork.** Every one of these asked "did we record
that we asked?" when the question is "has the client done it?". Any new attention tile should be
checked against a client who completed the thing on a device other than the one looking.

### 2aq-2. The check-in nudge, second pass: ask the LOG (2026-10-10, `2026-10-10h`)

**What Ashley OBSERVED (§1b):** on 2026-10-10 at 11:47, Home still showed *"Ashley hasn't done their
check-in"* and *"Trich hasn't done their check-in"*, both "New client · Saturday, Oct 10". **Both
had completed their check-ins the day before.** Build `2026-10-10a` was already live, so the first
fix was not enough.

Two holes, one of them in that first fix.

**(a) Mine.** The guard added in §2aq read
`if((!apptAt||isNaN(apptAt))&&c.lastCheckin&&c.lastCheckin.at&&...)`. The `.at` requirement is
wrong: `_ciMatchesVisit` judges on the check-in's own stated visit label FIRST and only falls back
to the timestamp, so it does not need one. And `at` is genuinely absent on some records — of the
three places that write `c.lastCheckin`, one stores `at: ci.at`, which is undefined on older
events. Every such record was thrown away before `_ciMatchesVisit` ever saw it.

**(b) The bigger one: `_checkinDone` never consulted the check-in log.** The global `checkins`
array is the authoritative record of what actually arrived from a client. `c.lastCheckin` is only a
convenience copy of the newest one, and `checkinDoneFor` is a stamp that routinely goes missing
(§2aq). The function asked the two derived signals and never the source. `_checkinLogMatches(id,
apptAt)` now scans the log, on BOTH the Home path and the appointment-card path.

Safe by construction: every log match still goes through `_ciMatchesVisit`, which compares the
check-in's own stated visit DAY against the appointment, and the log auto-clears as it ages. A
stale check-in cannot claim an upcoming visit.

Verified headless, with the visit placed inside the nudge window (a mistake worth remembering: the
first run put the visit at today noon, which was already hours past in the container's clock, so
the nudge never fired and every row trivially "passed"):

| Case | Result |
|---|---|
| lastCheckin with `at` | cleared |
| lastCheckin, `at` undefined ← hole (a) | cleared |
| only in the check-in log ← hole (b) | cleared |
| log entry with no timestamp | cleared |
| nothing at all | still nudges |
| month-old check-in only | still nudges |
| log entry for a DIFFERENT client | still nudges |

**NOT yet confirmed against her actual records.** Both holes are real and either would produce
exactly what she saw, but which one hit Ashley and Trich is unproven. If it persists after
`2026-10-10h`, the next step is to look at one of those two client records directly rather than
theorise a third cause.

**The rule, again:** ask the evidence, not the bookkeeping. Both passes of this bug came from
trusting a derived copy over the record of what arrived.

### 2aq-3. The check-in nudge, THIRD pass — the evidence, at last (2026-10-10, `2026-10-10j`)

Two fixes shipped on a theory and the card stayed up both times. The diagnosis added in
`2026-10-10i` finally produced facts, from her own device:

```
CHECK-IN NUDGES SHOWING: 1
check-in log holds 0 entries
-- Trich Overbo  (id sq_qr8azpt77k)
   nextVisit raw   : "Saturday, October 10 · 12:00 PM"
   parsed visit    : Sat Oct 10 2026 12:00:00 GMT-0700   (ok)
   hours until     : -0.897
   checkinDoneFor  : "Not scheduled"
   lastCheckin     : dateLabel="Friday, July 31"  at=Thu Oct 08 2026 15:29:56  -> matches? false
   log entries for this client: 0
   _checkinDone    : false
```

**Neither of my two theories was the cause.** `nextVisit` parses fine, the visit date is right, the
client id is fine. Three separate things are wrong, and none of them is the matcher:

1. **`checkinDoneFor` holds the literal string `"Not scheduled"`.** Both write sites did
   `c.checkinDoneFor=(c.nextVisit||'')` with no check that `nextVisit` is a DATE. A check-in
   arrived before her first appointment had synced onto the record, so the words "Not scheduled"
   were written in as the visit it was for. `_apptSig` returns '' for it, so it can never match
   anything — and on read it is indistinguishable from a real label. **FIXED in this build:** both
   sites now stamp only a label that parses, else blank. Blank is honest: a check-in happened,
   which visit is unknown.
2. **`lastCheckin` is corrupt.** Label says **Friday, July 31**; timestamp says **Oct 8**. Trich is
   a NEW client whose FIRST visit is Oct 10, so a July check-in cannot be hers. This is the
   documented "events sync re-adopts an old check-in and re-dates it to now" problem that
   `_ciIsForNextVisit` was written to defend against — the defence worked, the data is bad.
3. **The whole check-in log is EMPTY — 0 entries, all clients.** `sc_checkins` IS synced
   (`_pushKeyNow`, delete record `sc_ci_cleared`), so this is not one device missing it.

**NOT fixed, and deliberately not papered over:** the app holds no valid record that Trich checked
in. Making the matcher fall through to the timestamp when the label disagrees would have marked
this "done" — but the only timestamp available is Oct 8, which is when an event was re-adopted,
not necessarily when anyone checked in. **A false "done" means she walks into a treatment without
having read a check-in. That is worse than a nudge that will not go away**, so the conservative
behaviour stays until we know where the check-ins actually went.

Open question put to Ashley: WHERE did she see that Ashley and Trich completed theirs — the
check-in inbox, the client's own app, or an email? That decides whether this is a delivery bug
(never arrived) or a retention bug (arrived, then the log was emptied).

The diagnosis now also prints the `sc_ci_cleared` count, because a cleared check-in is REMOVED from
the log and that would explain an empty log on an account that definitely received some.

**The lesson, for the third time in one bug:** two fixes were written from reading code, and both
were wrong. The one that produced an answer was instrumentation. Reach for the paste sooner.
