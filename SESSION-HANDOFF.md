# Session handoff — 2026-09-13 (last updated 2026-09-17, pre-visit check-ins + push)

Written at the end of a long session so the next one starts informed. `CLAUDE.md` is the standing
guidance and still governs; this file is *state*: what shipped, what's unfinished, and what will
break quietly if nobody touches it.

---

## 1. READ THIS FIRST — the Monday blog Routines are bound to a session

`CLAUDE.md` §4 explains the mechanism. **There are TWO of them now**, one per blog:

- **SlickChart blog** (`blog-src/` → `/blog`): trigger `trig_0152LFs5EUR87Ttbzz3s5nHQ` (re-pointed 2026-10-13),
  cron `0 14 * * 1`, next run 2026-09-21 14:04 UTC
- **Build blog** (`build-blog-src/` → `/build/blog`): trigger `trig_01QsyEtdmZEJrshukvQTgzi3` (re-pointed 2026-10-13),
  cron `0 15 * * 1`, next run 2026-09-21 15:01 UTC, created 2026-09-16
- both bound to `persistent_session_id: session_015D4BCM2NAMaZ9JsmQJm88r` since 2026-10-13

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

### §2ai (cont.) Diana, 2026-10-12 — STILL HAPPENING, and she is on ONE DEVICE

Ashley: *"this is the last big provider bug I have standing unresolved still."*

Three fixes have shipped for this and she still loses summaries: `_mergeClientMap` +
`_CLIENT_MAP_LIST` for `sc_session_summaries`, `_unionClientForms` unioning `c.summaries`, and the
`upsertClient` SQL guard that stops an empty incoming array replacing a stored non-empty one.

**HER OBSERVATIONS, 2026-10-12. Ground truth (§1b). A theory that contradicts one of these is
wrong — discard the theory, not the observation.**

27. **"I just checked, and the summary issue is still happening."**
28. **"Today, I tried accessing it at 4:30 PM, and by 6:00 PM it had disappeared again."**
    ← a WINDOW: present at 16:30, gone by 18:00. About an hour and a half. Not instant.
29. **"Without the summary, everything else disappears as well. The notes and guides remain visible
    if the journey is still active, but if it is not, everything is gone."**
    ← NEW. The summary is not just one missing item, it GATES the rest. "If the journey is still
    active" is her words for a condition she can see from outside.
30. **"That said, I really like being able to see their activity."**
31. **"I'm only on my phone. I shut off the computer one and deleted from task tab."**
    ← THE BIG ONE, and the first time this has been stated. She is on a SINGLE DEVICE. The computer
    install is off and cleared from the task switcher.

**What 31 costs us.** Every mechanism found so far has been device A's stale copy overwriting
device B's good one. If there is no second device running, that class cannot be what is biting her
NOW. Either something on her phone alone destroys it, something on the SERVER does, or the data is
intact and the client-facing view stops rendering it.

**Do not resolve by assumption:** 31 arrived at 18:09, and the disappearance in 28 is 16:30→18:00.
It is not established whether the computer was already off DURING that window. One short question
to Ashley settles it and nothing should be built on a guess about it. Ask: *was the computer app
already shut off before 4:30pm today, or did she shut it off after she saw the summary go?*

**29 is the most under-used fact on this list.** Everything prior treated this as "the summary row
is missing". She is describing a dependency: no summary, no journey, and then the notes and guides
go too. That points at a GATE, not only at a lost record. Whatever is checked to decide a journey
is "active" is worth reading before writing any more merge code.

### §2ai FOUND (2026-10-12): one failed /api/cloud-status at launch destroys the per-client libraries

**Reproduced end to end, on ONE device, with no second device involved.**
`scratchpad/sweep-offline-boot.mjs`, 12 checks, 9 of them failing before the fix.

```
1. the phone's first request, /api/cloud-status, fails
   (a 500, a cold start, a captive portal answering HTML, a dropped request - Cloud.status()
    requires {enabled:true} and treats ANYTHING else as "cloud off")
2. Cloud.enabled = false  ->  boot takes an early-return path and NEVER calls _reloadAll()
   ->  sessionSummaries, clientRecs, recReasons, clientHomecare are all {} in memory,
       while the disk still holds every one of them
3. one ordinary action - deleting a client calls persistSessionSummaries + persistClientRecs -
   serialises that {} over the DISK copy for EVERY client, including ones she never touched
4. the network comes back, the app relaunches on the damaged disk, and pushes the empty map
   ->  "account now holds 0 summaries and 0 plan items"
5. nothing comes back. Permanent.
```

**Why this is almost certainly Diana's bug, against her own observations:**

| her words | this mechanism |
|---|---|
| 31. "I'm only on my phone" | needs no second device at all |
| phone | a failing first request is ordinary on mobile data |
| "notes, summaries, and product plans are deleted" | the whole per-client family goes together |
| 29. "without the summary everything else disappears as well" | they are wiped in the same call |
| 28. gone between 16:30 and 18:00 | whenever she next opened it on a bad connection |
| survived three fixes | all three addressed device-vs-device merges; none touched this path |

Three boot paths return before `_reloadAll()`: cloud-status unreachable with account signs
(**hers**), local-only mode, and no token. `_dropBootShrinks` did not save it either.

**The fix, in two parts.**

1. **Hydrate on every boot path.** `_cloudInit` now reads the per-client libraries off this device's
   own disk immediately after `_hydrateOffloaded()`, before the status call and before anything can
   render or persist. Whether the cloud is reachable has nothing to do with reading local disk.
   Only the plain disk readers are in there (JSON.parse + assign, no defaults, no writes), so it
   cannot become one of the boot write-backs §3 warns about.
2. **A library whose loader never ran may not be persisted.** `_libSafeToPersist` refuses to write
   an empty map over a non-empty stored one and logs why. Skipping a write cannot lose data; doing
   it can. With (1) this should never fire — it is there so this class cannot cost data again.

**Still to confirm with Ashley (do not assume):** whether her computer install was already off
during the 16:30-18:00 window. It does not change this fix, which needs no second device, but it
decides whether anything else is still outstanding.

### The sweeps CLAUDE.md tells us to run have never existed

`git log --all -- '*crossdevice*'` is **empty**. So are `freshaudit` and `scaleaudit`. All three are
named in CLAUDE.md §3 as the things to run after any change to sync, storage or a loader, and all
three were written in earlier ephemeral containers and died with them. **Every fix for this bug
shipped with the sweep meant to catch it never actually running.**

Two are committed now and must stay committed:

- `scratchpad/sweep-summaries.mjs` — a saved summary survives on one device across polls,
  navigation, relaunch and a logout/login, and a stale second device cannot wipe the account copy.
  13 checks.
- `scratchpad/sweep-offline-boot.mjs` — a failing `/api/cloud-status` costs no saved work. 12 checks.

`freshaudit.mjs` and `scaleaudit.mjs` are still missing and still referenced by CLAUDE.md.

**A harness lesson worth more than the bug.** My first run of sweep-summaries "reproduced" a wipe
that was not real: the mock answered `/api/cloud-status` with `{ok:true}`, which fails the
`typeof j.enabled==='boolean'` check, so the harness itself booted cloud-disabled. Mock
`/api/cloud-status` as `{"enabled":true}` in every provider-app harness or you are testing the
local-only path. The false reproduction is what led to the real one, but it was nearly reported as
a finding.

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

### 2aq-4. RESOLVED — the nudge was right, the other screen was lying (`2026-10-10k`)

Ashley: *"i got notifications and when I got to 'todays appointments' it shows them completed"*.
That sentence ended a three-round bug, and the answer is the opposite of what was being chased.

**Today's appointments was showing a green tick for a check-in that was NOT done.**

Two renderers draw that row, and BOTH only appear when the check-in is outstanding:

- The appointment-card branch said **"Check-in auto-sends in their app ✓"** — green clipboard icon,
  green tick, calm grey background. It means "we will send it for you". It reads as "they did it".
- `_todayCheckinSendHTML` said **"Check-in auto-sends in their app · send it now too"**, and worse,
  **never called `_checkinDone` at all** despite a comment directly above it claiming it is "shown
  when the check-in isn't done for that visit yet". So it also prompted for clients who HAD
  checked in.

So Home said not done, Today's said done, and the provider believed the reassuring one. Every fix
in 2aq, 2aq-2 and 2aq-3 was aimed at silencing a nudge **that was telling the truth**.

Fixed: both rows now lead with *"Pre-visit check-in not done"* and keep the auto-send part as the
reassurance it actually is; `_todayCheckinSendHTML` returns '' when the check-in is done.

Verified headless, Today's row against Home's verdict, in all three states: not-done/auto-on,
not-done/auto-off, and done (no row at all). They agree everywhere.

**Still open and NOT papered over:** the check-in log is empty and Trich's `lastCheckin` is corrupt
(July label, October timestamp) — see 2aq-3. Those remain. What changed is that the app no longer
claims a check-in is handled when it is not.

**The lesson, and it is the expensive one:** three rounds were spent trying to make a correct
warning go away, because another screen contradicted it. When two screens disagree, find out which
one is lying BEFORE changing either. And a green tick is a claim — it should never be the house
style for "we will do this for you later".

### 2aq-5. ROOT CAUSE of the empty check-in log, and the corrupt record (`2026-10-10m`)

Both of the things left open in 2aq-4 are now explained and fixed. Neither is subtle once seen.

#### The empty log: a date parser that demanded a year the labels never carry

`_ciDayISO(label)` opened with:

```js
if(!/\b\d{4}\b/.test(s))return '';     // require a four-digit year
```

Every label the app produces is **`"Saturday, October 10 · 12:00 PM"`** — month and day, **no
year**. The client sends `dateLabel: client.nextDate`, and that is how `nextDate` is formatted. So
`_ciDayISO` returned `''` for **every real check-in**.

Now look at what that disables in `_pruneExpiredCheckins`:

```
Rule 1 : day && day <  today  -> delete
KEEP   : day && day >= today  -> keep        <-- never reached, day is always ''
Rule 2 : at && (now-at) > 24h -> delete      <-- so EVERYTHING lands here
```

The protective branch exists precisely because, in its own words, *"clients are encouraged to check
in early, so an early (>24h old) submission for a future visit must not be pruned before the
appointment even happens."* The parser silently disabled it. **Every check-in was deleted 24 hours
after it was submitted — which is the day before most appointments.** Measured before the fix: a
check-in for an appointment TODAY, submitted 26h ago → DELETED. Same for one for TOMORROW.

This is silent data loss, not just a missing nudge: the client's answers, flags, notes and photos
all go with it.

Fixed two ways:
1. `_ciDayISO` now parses what the app actually writes — month+day with no year, bare `Oct 10`,
   numeric `M/D`, and full dates with a time suffix (the old path failed on `", 2026 · 12:00 PM"`
   too). With no year on the label it picks the year landing NEAREST today, so a December label
   read in January resolves to last year rather than this one; getting that backwards deletes a
   check-in.
2. Rule 2 now asks the CLIENT before deleting: if `_hoursUntilVisit` says their visit is today or
   still ahead, the check-in is kept whatever its label says. A check-in is the client's own words;
   losing one because its label could not be dated is the worst outcome available here.

Verified: appointment today or tomorrow submitted 26h ago → KEPT; last week → DELETED (the log
still drains); `"Not scheduled"` with a visit today → KEPT; `"Not scheduled"` with no visit and
26h old → DELETED.

#### The corrupt record: the same fallback, fixed in one place and missed in the other

In the SAME function, on the SAME event:

- line ~27297, the LOG write: `at:(ev.created_at?(new Date(ev.created_at).getTime()||0):0)` with a
  comment reading *"NEVER fall back to Date.now() here... 0 means unknown"*.
- line ~27125, the `c.lastCheckin` write: **`at: at||Date.now()`** — the exact fallback the line
  below warns against.

The sync runs over events weeks old, so any whose `created_at` will not parse got stamped with
today. That is Trich's record exactly: `dateLabel="Friday, July 31"` with `at=Thu Oct 08`. Now
`at||0`, matching the log. Every consumer already treats 0 as "cannot confirm".

**This stops new corruption; it does not repair Trich's existing record.** That one will be
replaced by her next real check-in. No repair sweep was written, because rewriting a stored
timestamp from a guess is how the corruption happened in the first place.

#### The pattern worth carrying

Both bugs are a correct rule defeated by a silent helper: a protective branch that never ran
because its input was always empty, and a fallback banned in one line and left in the line above
it. Neither showed as an error. **When a guard looks right but the behaviour is wrong, check what
its inputs actually evaluate to before rewriting the guard** — three passes of this bug were spent
rewriting guards whose inputs were the problem.

### 2ap-6. Google Calendar verification SUBMITTED (2026-10-11)

The whole thing is done and filed. Project, scope, publish, test, video, justification,
questionnaire — all complete. `GOOGLE-CALENDAR-SETUP.md` now opens with a DONE banner carrying the
project id, the settled sensitive-not-restricted finding, the registered redirect URIs and the
video link, so no future session re-walks a finished runbook.

Video: <https://youtu.be/Ipozwy8xdv0> (unlisted). Submitted 2026-10-11.

**Status: waiting on Google.** Weeks, not days. They email `ashley@slickchart.app`. Until it
clears, providers see the unverified-app screen and the 100-user cap applies; nothing breaks.

The check-in Routine (`trig_01SxGru6k59NVPvBEWFmhDNK`, fires 2026-11-09) was **re-pointed** — its
prompt still described the setup as outstanding and would have walked her through work she had
already finished, which is exactly the waste §1d exists to stop. It now asks one question: what did
Google say.

Still undecided, and not pushed: whether "Keep client names out of Google" should default ON for
new connections. It defaults OFF today, so a new connection sends client names and appointment
notes to Google. Ashley was asked once and has not said.

---

## 2ar. Deploys no longer land on providers mid-day — the release train (2026-10-11)

**PR for previews:** she approved opening one PR per change (2026-10-12) purely so the preview link
has somewhere to land. [#1](https://github.com/slickchart/SlickChart/pull/1) is the first.
**Merging a PR is NOT how work ships** — `release` plus the overnight job is, per §1a. A PR here is a
preview carrier and a review surface, nothing more.

**Her report:** *"now Im running into a problem where when I edit is messing with providers currently
on the app."* She brought five deployment rules from ChatGPT and asked what I thought.

**CLOSED 2026-10-12: the symptom is unknown and will stay unknown.** Asked what the providers saw,
she said *"i cant say what the providers actually saw so let that go."* So:

- **Do NOT ask her again.** It is settled that she cannot answer it. §1b rule 4 applies.
- **There is no observation list for this bug, and that means no theory may be built for it.** Do not
  go looking for a mechanism on a hunch, and do not "fix" a candidate cause you found by reading
  code. §1b exists because exactly that cost a day. An unreproduced, undescribed symptom is not a
  bug report, it is a reason for the mitigation below and nothing more.
- **The mitigation is §1a and it is already shipped on the branch.** Edits no longer reach providers
  mid-day. That is the whole response to this report. It is a reasonable one even without a
  diagnosis, because the complaint was about *timing*, which is the one thing §1a actually changes.
- If a provider ever describes a concrete symptom, THAT is a new bug with its own observation list.
  Start it fresh; do not retro-fit it onto this one.

**Her decision:** adopt "never push to main, branch + preview for everything", **with the carve-out**
that a bug she reported and is waiting on ships immediately. Then: *"can we make that at a schedule
time - lets say 2am, to be sure it doesn't glitch the app for providres?"*

**Built.** `CLAUDE.md` §1a is now the authority; §1's old standing permission to push `main` is gone
and §3's deploy bullet points at §1a. `.github/workflows/deploy-at-2am.yml` promotes `release` to
`main` at 09:00 UTC (2am PDT / 1am PST — one cron, no DST dance, both inside her window), fast-forward
only, refusing any commit whose checks are not green and no-opping when `release == main`.
`workflow_dispatch` is the ship-it-now button. **`release` is her approval; nothing goes on it that she
has not said yes to.**

**`release` is created from the approved commit, not from `main`.** The workflow handles its absence
("nothing has been approved") so it was safe to land the workflow first.

**THE BOOTSTRAP CATCH (2026-10-12).** GitHub runs `schedule` and `workflow_dispatch` only from the
DEFAULT branch, so `deploy-at-2am.yml` does nothing whatsoever until the file is itself on `main`.
The train cannot start itself: the first promotion must be a manual `git push origin release:main`,
and there is no way around it. That one push was put to Ashley rather than done quietly, because
"never push main" was her rule from the day before. Once `main` carries the file, every promotion
after it is the job's and nobody pushes `main` again. **If `main` has the workflow, the bootstrap is
done.**

**Also changed, because the train depends on it:** `no-demo-data.yml` now runs on `branches: ['**']`
instead of only `main`. It used to run *after* the deploy it is meant to gate, and the 2am promotion
refuses a commit with no checks, so a branch that CI never saw could never ship.

### What a preview URL cannot do (verified, not assumed)

- It uses the **real database and real env vars**. No staging DB exists. A preview is live data.
- **Square and Google OAuth cannot complete on it.** `SQUARE_REDIRECT_URI` (lib/square.js:169) and
  `APP_ORIGIN` (api/google-cal.js:36) are pinned to the live origin on purpose, so Connect sends her
  back to `slickchart.app` to finish.
- **Crons do not fire on previews** — Vercel runs `vercel.json` crons on production only. So a preview
  cannot double-send reminders, check-ins or nurture mail.
### The preview URL: SETTLED 2026-10-12, and Ashley never has to fetch it

**Do not ask her for it.** Both the Vercel team slug and the project slug are `slick-chart`, so a
branch preview is:

    https://slick-chart-git-<branch-with-slashes-and-underscores-as-dashes>-slick-chart.vercel.app

e.g. branch `claude/ecstatic-mccarthy-ynt869` →
`slick-chart-git-claude-ecstatic-mccarthy-ynt869-slick-chart.vercel.app` (confirmed live, 200).
Vercel truncates and hashes the host when it would exceed 63 characters, so for a long branch name
construct nothing — read it instead (next paragraph).

**The reliable way to get it, with no help from her:** Vercel posts a *commit status* (context
`Vercel`) on the PR head. `pull_request_read` with `method: "get_status"` returns it, including
`target_url`, which is the deployment's dashboard page and carries the team and project slugs.

**It posts a PR comment too, but LATE.** An earlier version of this note said it posts no comment at
all. Wrong: on #1 the comment arrived about 50 minutes after the PR was opened, long after several
deployments had already finished and been reported by status. So the status is the thing to read, and
a missing comment means "not yet", never "not coming" — but do not block on either. The comment,
when it lands, carries the preview URL in a table and confirmed the derived host exactly:
`slick-chart-git-claude-ecstatic-mccarthy-ynt869-slick-chart.vercel.app`.

**Deployment Protection (Vercel Authentication) is ON.** A preview URL redirects to
`vercel.com/login` unless the browser is signed in to the Vercel account that owns the project.
That is the right setting and should stay: a preview runs against the REAL database and the REAL env
vars (above), so an open preview URL would be an open door to live provider data. Consequence for
Ashley: the link opens fine on a browser where she is signed in to Vercel, and asks her to log in
once on a device where she isn't. If that becomes a nuisance on her phone, Vercel can mint a
shareable link for a single protected deployment from its dashboard — offer that rather than turning
protection off.

### Two generic rules that were already true — don't "fix" them again

Rules 3 and 4 of her list (backward-compatible migrations, never run migrations against production
without asking) describe something this codebase does not have. There is **no migrations folder**;
every schema change is `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` inside the lib that
needs it (30 in lib/db.js, 8 in lib/clients.js, 3 in lib/nurture.js, 2 each in lib/consult.js and
lib/google-cal.js, 1 elsewhere), run by the endpoint. There is no `DROP TABLE`, `DROP COLUMN`,
`RENAME COLUMN`, `RENAME TO` or `TRUNCATE` anywhere in `lib/` or `api/` — the only grep hit is a
comment at lib/db.js:101. Add-only is already the only thing the code can do.

Rule 5 (autosave every form) is also largely already there: `providerNoteDrafts` (43 refs),
`summaryNoteDraft` (30), `sc_note_drafts` (12), `sc_room_draft_*` (11), `sc_provider_note_drafts`,
and the consult answers added 2026-10-10 save per keystroke. If she names a form where typing was
lost, find that one rather than re-auditing all of them.

### The compatibility that actually bites here

A deploy does **not** reload an open page. `_checkForNewBuild` (slickchart.html:5011) runs once from
`_cloudInit`, is latched by `_buildCheckDone` and a `sessionStorage` key, and flushes pending writes
before reloading — so it can only fire at boot. A provider therefore picks up new code **at her next
launch**, which means she may run the OLD build against the NEW server for days, and her second device
for weeks. So the thing to keep backward-compatible is **API response shapes and synced `sc_*` key
shapes**, not SQL columns. Add fields, keep reading the old shape, never rename or repurpose one the
shipped build reads. §1a says this too.

### Fixed in passing (§1, and it was load-bearing)

CI's "Generated files are in sync" step was a **hand-copied list of four build scripts** and had
drifted from `check-generated.cjs`, which runs **five**. The missing one was `build-feature-map.cjs`,
so a stale `FEATURES.md` passed CI — while `CLAUDE.md` §1c rule 4 claims that check makes staleness
impossible, and §1c exists because a wrong answer about what the product saves nearly cost Heather 38
photos. CI now runs `node scripts/check-generated.cjs`, the same command §3 tells a contributor to run.

---

## 2as. Booking request did not reach Square or Google (2026-10-12, OPEN)

### What Ashley OBSERVED — recorded before any theory (§1b, §1d step 1)

Two screenshots from her **phone**, both of 2026-11-05.

1. She used the **"booking request" feature** to add a booking. Her words: *"when i used the
   'booking request' feature to add in a booking it never got put onto my square or google calendar.
   see 11/5 at 10am."*
2. **In SlickChart's Calendar**, 2026-11-05 shows **"3 appts"**:
   - **Callie Hernandez, 10:00 AM** — subtitle reads **"Signature Facial"**
   - Josie Statzer, 12:00 PM — subtitle reads **"60 min · Square"**
   - Cooper Howard, 2:00 PM — subtitle reads **"60 min · Square"**
3. **Callie's row carries NO "Square" tag and no duration**, where the other two carry both. All
   three rows do show an "Add to calendar" link.
4. The month header shows both **SQUARE** and **GOOGLE** chips lit, and 11/5 has a dot.
5. **In Google Calendar** for Thu Nov 5, the appointments present are **Josie Statzer (12–2 PM)** and
   **Cooper Howard (2–4 PM)**, both at 1226 Contra Costa Blvd. **Callie Hernandez is absent.**
6. 11/6 in Google shows Jackie Forrester, Elissa Lawson and Melisa Yatman, so the Google sync is
   working in general and is not stalled.

### Not yet established

- Whether the booking exists in Square at all (her screenshots show SlickChart and Google, not the
  Square dashboard). **Do not assert either way without evidence.**
- Which screen "booking request" means to her, exactly. Do not substitute a guess.

### Rules for whoever works this

Observation 2 and 3 together are the load-bearing fact: SlickChart shows the appointment, with a
DIFFERENT subtitle shape from the two that did sync. A theory that requires Callie's row to look
identical to the others is contradicted by what she sent and is wrong. Observation 6 rules out "Google
sync is broken".

### Diagnosis (code, 2026-10-12) — consistent with every observation above

**Confirming a booking request creates nothing outside SlickChart.** `confirmBooking()` calls
`addConfirmedAppt(b)`, which only `unshift`s into the in-memory `confirmedAppts` array, stamps the
client's `nextVisit`, and rebuilds the ICS feed. There is no Square call anywhere in either function.

- **Square:** the capability EXISTS (`_sqDoBook` → `/api/square/book`, and `FEATURES.md` lists it), so
  this is not a missing feature, it is an unwired one. `_sqDoBook` is reachable from exactly one
  place: the `sqb-go` button in the Book in Square sheet. `confirmBooking` never reaches it. Grepped
  both functions for `_sqDoBook` and `square/book`: zero hits.
- **Google:** `_gcalPush()` sends `_gcalAppts()`, and `_gcalAppts()` maps over **`manualAppts` only**.
  Not `confirmedAppts`, not `squareAppts`. So a confirmed request is in neither list Google is fed
  from, and never reaches it.
- **The ICS feed is the odd one out:** `_rebuildCalendarFeed()` DOES include `confirmedAppts`
  (`manualAppts.concat(confirmedAppts)`), so a confirmed request reaches anyone subscribed to
  `sc_calendar_feed` while never reaching the Google API push. Two "calendar sync" paths, different
  contents. Worth remembering before trusting either as "the" sync.

**How her Square appointments actually reach Google: through SQUARE, not through SlickChart.**
Evidence rather than assumption: her Google events read `12 – 2 PM at 1226 Contra Costa Blvd`, and
SlickChart never sends a location — `grep -i location lib/google-cal.js api/google-cal.js` returns
nothing. `_gcalAppts` sends only id, date, start, duration, client, tx, title, notes. So an event
carrying her studio address did not come from SlickChart. **This is the important one for the fix:**
the pipe that actually populates her Google is Square's own calendar sync, so getting a confirmed
request into Square is what gets it onto Google.

### What the fix has to deal with

- **A booking request carries no Square identifiers.** From `slickchart-client.html` the record is
  `{id, clientId, client, providerId, treatment, date, time, note, status, created}` — `treatment` is
  a NAME string. `/api/square/book` needs `serviceVariationId`, `serviceVariationVersion`,
  `durationMinutes`, `startAt` and `teamMemberId`. So confirming has to match the treatment name
  against `/api/square/booking-options` and pick a team member, and that match can fail.
- **Duplicate risk, and it is not hypothetical.** If a confirmed request becomes BOTH a Square booking
  and a `manualAppts` entry, Square's sync puts it in Google and `_gcalPush` puts it in Google again.
  `_rebuildCalendarFeed` already dedupes manual/confirmed against `squareAppts` by client+start, but
  `_gcalAppts` has no such guard. Anything that writes both sides needs one.
### FIXED 2026-10-12 (`2026-10-12a`), on the branch awaiting her preview

She chose: *"yes build it"*. `confirmBooking` -> `commit()` now calls `_reqSyncOut(b)` after
`addConfirmedAppt(b)`.

**The invariant, and the reason the code looks the way it does: exactly ONE outbound home, never
both.** Square when it will take it, otherwise a `manualAppts` entry (which `_saveManualAppts` ->
`_gcalPushSoon` sends to Google directly). Writing both would put the visit on her Google twice,
once from Square's sync and once from ours.

- `_reqSyncOut(b)` — Square live? match `b.treatment` against `/api/square/booking-options` by name
  (exact, then either side containing the other, because her service may read "Signature Facial (60
  min)"), take the service's first team member, POST `/api/square/book` with
  `notify:false` (the client already had SlickChart's own confirmation a moment earlier) and
  `idempotencyKey:'req-'+b.id` (a double-tap on Confirm cannot create two bookings).
- `_reqToLocalAppt(b)` — the fallback. `_realApptsMerged()` already de-dupes `confirmedAppts`
  against `manualAppts` by client+time, so the calendar still shows the visit once.
- `_reqSquareMissed(b,why)` — never fail silently, which was the whole bug. Names the reason and
  offers the Book in Square sheet pre-filled.
- `_reqInSquare(b,startAt)` — **the subtle one.** A thrown error does not prove Square is empty: if
  the connection drops AFTER Square creates the booking, falling back would double-send. So the
  catch re-reads Square and only writes the local copy when the booking genuinely is not there.
  A test case was added specifically for this and it did fail before the guard existed.

**Verified** with `scratchpad/test-reqsync.mjs`, which drives the real `confirmBooking` in headless
Chromium over five paths: service matches / no matching service / Square rejects / Square not
connected / call errors but Square booked it anyway. It asserts two things on every path: the
appointment LEFT the app, and it was never sent to Google twice.

Two traps that cost time while building this, worth knowing:
- `squareAppts` is **`null`**, not `[]`, until Square first loads, so a stub that mutates it throws.
  `_reqInSquare` guards with `Array.isArray`.
- `SlickBridge` is a `const` binding like `CL`/`Cloud`: mutate in place, never reassign.
- The demo page is what the test loads, so **rebuild it after every source edit** or the test runs
  against the previous version. That is how `_reqInSquare` read as "not defined" for a round.

### Her decision on the Google privacy default (2026-10-12): KEEP IT OFF

*"keep that default off please."* The "Keep client names out of Google" switch under Connect Google
Calendar stays **defaulting OFF**, so a new connection sends client names and appointment notes to
Google unless she turns it on. Asked and answered; **do not raise it again** (§1b rule 4). No code
change was needed, the default already is OFF.

---

## 2at. "Invite client to app" disappeared from the client file (2026-10-12, FIXED)

### What Ashley OBSERVED

*"I just noticed that we lost the 'invite client to app' function. that should be in the main client
file area."*

### What was actually true — check before claiming anything is missing (§1c)

**Nothing was deleted.** `inviteClientToApp(id)` and its button both still existed. Rebuilding the
client screen with five tabs on 2026-10-10 put the button inside the **`file` tab only** (the `.ctab`
block at the `data-tab="file"` div), so it stopped appearing on the screen a provider lands on.

Verified in the running app rather than by reading: driving the demo through all five tabs showed the
button visible on `file` and on nothing else. That is the whole bug — it was one tab away, and one
tab away is invisible.

This is the §1c rule 3 shape in a milder form: working code that nothing reachable calls. The lesson
for the next person who restructures a screen into tabs: **enumerate what used to be on the single
scrolling screen and decide a tab for each**, because anything not placed just quietly stops existing.

### The fix

A row at the TOP of the "Send to <name>" list in `_sendToClientHTML`, which renders on the **Visit**
tab, the one the file opens on. Reasoning for the position: nothing else in that list can reach a
client who is not in the app yet, so the invite is the gate for everything under it.

- Not invited → "Invite to the app" / *Nothing below reaches them until they are in*, purple.
- Already invited → "Resend app invite" / *Already in the app · tap to send it again*, green.

It shows in both states on purpose. "Can this client receive anything at all?" is the context for
every row beneath it, so the answer belongs there rather than being hidden once it is yes.

**The button on Their file stays.** This is a second home, not a move.

Verified in the browser: present on Visit and on Their file, absent from the other three, first in the
list in both states, and clicking it calls `inviteClientToApp` with the right client id.

---

## 2au. Client appointment-request screen + the still-duplicated photo consult (2026-10-12, OPEN)

### What Ashley OBSERVED — her words, recorded before any theory (§1b, §1d)

Four screenshots, her **phone**, Chrome, on the LIVE site (`slickchart.app/space?c=...`), so the
client app as a real client sees it.

1. *"the redundant photo consult section at the bottom of client file is still there."* **Still** —
   this was supposedly de-duplicated on 2026-10-10. It was not, or not fully. My own tab sweep
   earlier today printed `... Photo consult | ... | Review photos & send notes | Invite Maya to a new
   photo consult` on the Visit tab and I did not notice it. She did.
2. *"coloring on 'request appointment' and the preferred dates are not good or ADA visibility
   compliant."* In the screenshots the date chips are a WHITE card with very pale mint numerals —
   the day number is the least readable thing on the screen. The "Request an appointment" button on
   the client home reads as disabled/grey.
3. *"the preferred dates is only showing up to 11/5 and it should not have any limit on how far out
   they can pick."* Screenshot 1 ends at Thu 5 Nov.
4. *"I would rather this be a calendar format than a scroll list (follow square's format)."*
5. *"it is showing preferred times that are not available - i would rather it only show actual
   available times."* Screenshot 4: picking Thu 5 Nov offers 10:00 AM through 5:00 PM on the hour,
   which is a generated grid, not her real openings. Note 11/5 10:00 AM is the slot she confirmed
   for Callie, so it is NOT free and is being offered.

### Not yet established

### Done 2026-10-12 — items 1 to 4

**1. The duplicate photo consult.** The 2026-10-10 guard only hid the card when NO consult existed.
When one did, the card still carried its own "Invite <name> to a new photo consult" button directly
under the Send-to row that does exactly that, under a second heading also reading "Photo consult".
Removed the button; the heading now names the state ("Photo consult · ready to review" /
"· waiting on <name>"). The card's "Review photos & send notes" stays, it is not a duplicate.

**2. Contrast.** The date chips hardcoded `background:#fff` but coloured the number with
`var(--c-ink)`, which is `#eaf6f4` in dark mode. **Measured: 1.11 contrast ratio.** That is not a
matter of taste, it is invisible. Everything now uses theme tokens: 12.77–17.40 in both themes.
The SELECTED state is a matched hardcoded pair `#ffffff` on `#0C7268` (5.80) — `--accent` under
`--accent-ink` is only 4.07, and a 15px bold label is under WCAG's 14pt-bold large-text threshold so
it needs the full 4.5. **The pair is hardcoded on BOTH sides deliberately**, which is the opposite of
the original bug: there the background was fixed while the text followed the theme, so they drifted.

**3 + 4. A month calendar, no horizon.** The strip generated 14 OPEN days, which on a four-day week
ran out about five weeks ahead. Replaced with a month grid plus ‹ › paging: forward is unlimited,
back stops at the current month. Closed and past days are muted AND carry `aria-disabled` with a
label, so the state is not conveyed by colour alone. Verified by driving the client demo: paged
July→October, eight back-steps stopped at July, picking a day shows times, no console errors.

### STILL OPEN — item 5, real availability. Needs a new endpoint.

**The client app calls no Square endpoint at all.** Its whole surface is `/api/client-data`,
`client-prefs`, `client-submit`, `client-messages`, `client-link`, `client-delete`, `guide-file`,
`ai`, `native-push`, `push-subscribe`. Times come from `rebookHourlySlots()`, which builds whole
hours from the provider's configured weekday hours — a generated grid, never her real openings. That
is why 11/5 10:00 AM was offered while Callie already had it.

Fixing it needs a **client-facing availability endpoint**, and that is a §0 change, not a tweak:

- It must authorise on the client's magic-link token and return **free start times only** — no other
  client's name, no appointment details, nothing but times. Showing that a slot is taken is what any
  booking page does; showing WHO has it would be a leak.
- It must resolve the provider from the token, never from a request field (§0.1).
- `scripts/check-tenant-isolation.cjs` will need to see it, and it should get a CI check of its own.
- The calendar should then grey out whole days with no availability, which is the same data.

Do not bolt this onto `/api/square/availability`: that one authorises a logged-in PROVIDER.

### DONE 2026-10-12 — and far smaller than expected, because the engine already existed

**Check before building. `lib/booking.js` already had the whole availability engine**, and
`api/book-slots.js` already served free times to the PUBLIC booking page with isolation and rate
limiting. The plan above assumed a new Square integration was needed. It was not. `openSlots()`
already understands her hours, the chosen service's duration, her buffer between visits, her notice
window, and everything already booked **in the app AND in Square** (`busyRanges` reads
`sc_manual_appts` and queries `/v2/bookings`), and it returns `null` rather than guessing when it
cannot read the calendar. This is §1c in its general form: the capability was not missing, it just
had no door the client app could knock on.

**`api/client-availability.js`** is that door and nothing more:

- Provider from `getClientByToken(t).provider_id` — the token's own row. No provider id in the
  request, none in the response. A token reaches its own provider or nothing.
- Returns free times and which weekdays she opens. Never what she is booked with, who with, or how
  many. Exactly what her public page already shows a stranger.
- `unknown:true` when `openSlots` returns null, so the app can say "usual hours, she'll confirm"
  instead of passing a guess off as live.
- Rate limited per IP (120/min) and per token (90/min); a dead token and a never-existed token get
  the same answer, so links cannot be probed.
- **Deliberately does NOT honour `cfg.on`/`cfg.mode`**, unlike `book-slots.js`. Those gate whether
  STRANGERS may see live times on the public page. This is her own invited client in her own app.
  The config is still used for slot length, buffer and notice window.

Client side, `refreshRebookTimes()` now fetches it, with `_rbReq` so a stale response from a
previously tapped date can never paint over a newer one. The hours-derived grid survives only as a
labelled fallback for the sample space (no token) and for `unknown`. Verified against a mocked route
on four paths: live times, unknown, network failure, and a genuinely full day.

---

## 2av. Availability must follow her SQUARE booking rules, not a grid we compute (2026-10-12, OPEN)

### What Ashley stated — her words, before any theory

*"can we make it so it also follows my square booking rules such as how for every treatment it
auto-blocks one hour after, which means that on tues, thurs, saturday i only book facials at 10, 12,
2, and 4"*

Facts to hold on to:
- Her rule lives in **Square**, configured there, and she does not want to configure it twice.
- Every treatment **auto-blocks one hour after it**.
- The consequence she named: Tue / Thu / Sat facials start only at **10, 12, 2, 4**.

### Why the engine cannot produce that today

`openSlots()` in `lib/booking.js` builds its OWN grid: it steps from her open time by
`serviceMins(svc,cfg)` and rejects a step only if it clashes with `busyRanges()`. The buffer
(`cfg.bufferMins`) is padded around **appointments that already exist** — it does not widen the grid
itself. So on an EMPTY Tuesday a 60-minute facial yields 10, 11, 12, 1, 2, 3, 4. Her answer is
10, 12, 2, 4. The hour she blocks after every treatment is not part of the step at all.

Square already computes this correctly: `/v2/bookings/availability/search` honours the seller's
booking availability, the service's duration, its buffer-before/after, team member availability and
existing bookings. `api/square/availability.js` (provider-facing) already calls it. `openSlots` does
not, which is why the two can disagree.

### FIXED 2026-10-12 — `openSlots` now asks Square first

`squareOpenSlots(providerId, dateISO, serviceName)` in `lib/booking.js`, called at the top of
`openSlots`. When she has Square connected AND the service name matches one of her Square services,
Square's own answer is returned verbatim. Everything else falls back to the computed grid, which is
still correct for a provider with no Square at all.

**This fixes the public booking page and the client app at once**, because both already went through
`openSlots`. That was the reason to put it there rather than in the new endpoint.

- **Returns `null`, not `[]`, on anything it cannot answer** — no Square, no name match, an API
  failure — so the caller falls back rather than showing an empty day. A no-match in particular must
  not become "fully booked": guessing the wrong service books the wrong duration, so it declines to
  answer instead.
- **`matchSquareService`** (lib/square.js) matches exact, then either side containing the other, so
  a client picking "Signature Facial" finds her Square's "Signature Facial — 60 min". Never a looser
  guess than that.
- **`listBookableServices`** was extracted to `lib/square.js` and `api/square/booking-options.js` now
  uses it too. One catalog walk, not two drifting copies — the same lesson as the CI build-script
  drift found earlier the same day.
- Times are rendered in HER timezone via `Intl` and must come out byte-identical to `fromMins()`, so
  a caller cannot tell which engine answered.

**Verified** with `scratchpad/test-square-rules.mjs`: service-name matching across seven cases
including a deliberate no-match, and her stated 10 / 12 / 2 / 4 rendering asserted on **both sides of
the DST change** (2026-11-03 PST at UTC-8 and 2026-10-13 PDT at UTC-7). The first run of that test
FAILED because the test itself used UTC-7 instants for a PST date — the same DST trap as the Square
day window on 2026-10-11. The code was right; the expectation was wrong. Keep both dates in it.

---

## 2aw. Service options parity with Square + appointments showing the service name (2026-10-12, OPEN)

### What Ashley asked for — her words

*"lets make sure when people create a service within the app that it also has those same options that
square gives (block extra time, processing time, etc.) and that those options also all two way sync
to square for booking. i would like it to mirror all the same options and sync both ways. I would
like for my appointments in slickchart to match the service name from square (right now it seems all
of them say new client appointment)."*

Three separate pieces, and they are NOT the same size:

1. **Appointments must show the Square service name.** She observes they all read
   "new client appointment". Concrete and contained.
2. **Service editor should offer Square's options** — block extra time, processing time, and the
   rest.
3. **Those options two-way sync with Square.**

### Item 1 DONE 2026-10-12 — appointments now carry the Square service name

`/api/square/appointments` returned `serviceVariationId` but never a name, and `_loadSquareAppts`
hardcoded `tx:'Appointment'`. So every Square booking in her calendar was labelled identically and a
day of appointments said nothing about what any of them were for.

- The endpoint now resolves the variation ids to names via the shared `listBookableServices`, one
  catalog walk per request and only when there is something to resolve. A failure leaves names blank
  and the app falls back to the generic word rather than showing nothing.
- The calendar row leads with the service: `Signature Facial · 60 min`.
- **It drops the duration when the name already contains one.** Square service names very often read
  "Dermaplane — 90 min", which produced "Dermaplane — 90 min · 90 min". Verified with a case for it.

**Note for whoever picks this up:** "new client appointment" is NOT a string in this codebase
(grepped). So that text is coming from Square itself — most likely a service in her Square actually
named that, which bookings default to. With this change the app shows whatever Square calls it, which
is what she asked for; if the wording still reads wrong it is a rename in Square, not a code change.

### Items 2 and 3 — NOT started, and there is a design question to settle first

What the app's own service object holds today: `{id, name, price, _ts}`, plus `mins`/`deposit` on the
booking-page config. That is all. `getServices()` reduces it to names alone.

What Square holds per service: duration, price, **buffer before / buffer after (her "block extra
time")**, processing/transition time, assigned team members, bookable-online, category, description.

So this is a real feature, not a settings tweak, and it writes to her LIVE Square catalog, which
deserves its own careful start rather than the tail of a long session.

**The design question, and it matters more than the work:** two-way sync creates two masters. We just
made Square authoritative for availability (§2av). If the app can also write service options back,
then a conflict has no obviously right answer and a bug can corrupt her real Square menu. The simpler
shape, which gets her the same outcome: **Square owns services when Square is connected** — the app
reads them (duration, buffers, processing time) and shows them read-only with a "edit in Square"
link, and the app's own editable service menu stays for providers with no Square. One source of
truth, no conflict class, and it matches what availability already does.

### DECIDED 2026-10-12: **Square owns services.** Her words: *"let square own them"*

So, when Square is connected:

- The app **reads** her services from Square and shows their real options — duration, the extra time
  blocked after, processing time — rather than keeping its own copy.
- Those options are **read-only in SlickChart**, with a link out to Square to change them.
- **The app never writes a service back into her Square catalog.** That is the whole point of the
  decision: no second master, no conflict to resolve, and no code path that can damage her live menu.
- The app's own editable service menu **stays** for providers with no Square connected. It is not
  removed, it is just not the authority when Square is there.

**Do not re-litigate this** (§1b rule 4). She was given both options with the trade stated and chose
this one. She also asked to be **asked again in a month** in case she changes her mind — a one-shot
reminder is set for 2026-11-12. If she does change it, two-way sync becomes a real project with a
conflict-resolution design, not a toggle.

### Still to build

The reading side. **Before building, confirm against Square's live API docs which fields actually
carry "block extra time" and "processing time"** — `listBookableServices` currently reads
`service_duration` and nothing else, and the rest must not be guessed at from memory (§3's rule about
platform facts). Then surface them on the service screen and keep using them for availability, which
already goes through Square anyway (§2av).

---

## 2ax. A booking request shows in her real app but not on the Vercel preview (2026-10-12, OPEN)

### What Ashley OBSERVED — verbatim, before any theory

1. *"i sent myself a booking request to test and it doesn't show on the vercel preview"*
2. *"only my real app which doesnt have the updates yet"*

So: the request **arrived and is visible in the live app**, and is **absent from the preview**. It is
not lost. Whatever the cause, nothing has gone missing — do not tell her anything has.

### Diagnosis (code, 2026-10-12) — expected behaviour, not a bug

The path a booking request takes:

1. Client app calls `_clientSubmit('booking', …)` → **`/api/client-submit`** → a row in
   `client_events`. It is on the SERVER from that moment. (It also writes `SlickBridge.upsertBooking`
   locally, which is what makes it instant on the same origin, but the server row is the real one.)
2. The provider app's `syncClientEvents()` picks up **unseen** events, materialises the booking into
   `sc_bookings`, notifies, and marks the event seen at the very END — after the derived data is
   flushed, deliberately, so a killed poll cannot record "seen" with nothing saved.
3. `sc_seen_events` **and** `sc_bookings` are both synced keys. `_mergeBookings` unions by id and a
   device with no local copy takes the account copy whole.

So a SECOND app (the preview is exactly that) does not re-process the event — her real app already
marked it seen, and that seen-state syncs. It receives the booking through the synced `sc_bookings`
copy instead. Which means the preview needs two things that are easy to miss: **signed in to the same
account on that domain**, and **a completed pull after her real app pushed `sc_bookings`**.

The preview is a different origin (`slick-chart-git-…vercel.app`), so it shares no browser storage
with `slickchart.app` and starts empty. Nothing carries over until it signs in and syncs.

**THAT DIAGNOSIS WAS WRONG.** She replied: *"i was already signed in on the preview and it still
isnt showing the request"*, with a screenshot of the preview's Calendar showing **"Booking requests —
None waiting"**, the **SQUARE and GOOGLE chips both lit**, and **appointment dots on 13, 15, 16, 17,
20, 22, 23 and 24**. So the preview is signed in, Square is connected, and appointments ARE syncing.
Sync timing does not explain it. §1b: discard the theory, not the observation.

**Observations now on the list:**
- Signed in on the preview, and had been before she first reported it.
- Appointments sync to the preview fine (the dots).
- Booking requests reads "None waiting" on the preview.
- The same request IS visible in her real app, which runs the older build.

**A trap to avoid repeating:** the appointment dots on her preview screenshot come from `squareAppts`,
fetched LIVE from `/api/square/appointments`. They prove Square works. They say **nothing** about
whether synced `sc_*` keys are pulling, and reading them as proof of sync is how the second wrong
theory would have started.

### Ruled out by reading the code, not by guessing

- `sc_bookings` **is** syncable — it is not in `_SYNC_SKIP`.
- The **live** build pushes it: `_pushKeyNow('sc_bookings', …)` appears 3 times in `origin/main`'s
  `slickchart.html`, same as the branch. So "her old build never pushes bookings" is false.
- `_mergeBookings` unions by id (`lv.forEach(take); sv.forEach(take)`), so a server-side request
  cannot be dropped by the merge on a device that already holds others.

Which leaves two live possibilities, and they point at completely different fixes:
**(a)** the request never reached the ACCOUNT (the device that received it did not push), or
**(b)** it is on the account and this device's pull or merge did not land it.

### The diagnostic, added 2026-10-12 (§1d: add it to the paste in the same change)

`_runSelfCheck` now prints a **BOOKING REQUESTS** block before the check-in block:

- what this device holds, per request: id, client, treatment, date, time, status, cleared
- whether `sc_bookings` came down in this session's pull (`Cloud._lastPulledKeys`)
- what the ACCOUNT holds (`Cloud._serverSeen['sc_bookings']`), same per-request detail
- **"on the account but NOT on this device"**, naming the ids — this is the line that decides
  between (a) and (b)
- how many client events this device has already marked seen

Verified by seeding a device with one request and an account with two: the block correctly named the
missing id. **Note `window.__SC_SELFCHECK__` is a STRING, not an object** — a test reading
`.plain` off it gets nothing and looks like the block is missing.

### ROOT CAUSE — found 2026-10-12. It was (b), and it is a real bug, not a preview quirk.

`Cloud.pull()` has a guard that skips any key with a **pending local write**, so a flush that has not
gone up yet cannot be overwritten by the account copy. It `return`s **before the per-key merge runs**:

```js
const _pendingLocal=!!(this._queue&&Object.prototype.hasOwnProperty.call(this._queue,k)
   &&!(this._bootQueued&&this._bootQueued[k]));
if(_pendingLocal&&k!=='sc_clients'&&!_CLIENT_MAP_LIST[k])return;   // ← sc_bookings was not exempt
```

`sc_clients` and the `_CLIENT_MAP_LIST` keys are exempt because their merges are **unions** — a union
cannot drop the queued write, so there is nothing to protect. `_mergeBookings` is a union too
(`lv.forEach(take); sv.forEach(take);`, and a decided request beats a pending copy whichever side it
came from), so `sc_bookings` belonged on that list and was not on it.

Consequence: **any device holding a queued `sc_bookings` write stops learning about requests on the
account.** Clearing a request, deciding one, or the demo purge writing the list back at boot is enough
to put a write in the queue. This is the same shape as the `sc_photo_index` bug already recorded here:
the data uploaded fine and the second device never heard it existed.

Why the preview hit it and her real app did not: her real app is the device that RECEIVED the request,
so it materialised it from `client_events` directly and never needed the pull. The preview is a second
device — pull is its only route, and the guard was closing it.

### The fix (shipped on `claude/ecstatic-mccarthy-ynt869`)

```js
if(_pendingLocal&&k!=='sc_clients'&&k!=='sc_bookings'&&!_CLIENT_MAP_LIST[k])return;
```

with the justification written into the comment above it, as that comment demands ("If you widen this,
prove the merge is a union first").

Proof: `scratchpad/test-bookings-pull-guard.mjs`. It serves an account holding a request this device
already declined **and** a new one it has never seen, while the device holds a queued local write for
`sc_bookings`. Both cases pass — the new request lands AND the device keeps its own decision:

```
No pending local write (this case always worked)
  after pull: ["bk_old:declined","bk_new:pending"]
WITH a pending local write (the reported bug)
  after pull: ["bk_old:declined","bk_new:pending"]
both pass
```

Negative control, so the test is known to actually detect it: with the one-line exemption removed the
same run gives `after pull: ["bk_old:declined"]` — the new request is simply absent, which is exactly
"Booking requests — None waiting" on her preview.

### What is NOT yet proven, and is the obvious next sweep

The same guard starves **every** other union merge that is not on the exempt list. `sc_manual_appts`,
`sc_msgstore`, `sc_threads`, `sc_seen_events` and the tombstone keys all have dedicated merges, and
several of them read like unions. **Do not widen the list from that impression** — the comment's rule
is prove-the-union-first, one key at a time, each with a test like the one above. A key whose merge
prefers one side (`sc_client_recs`, `sc_client_homecare`) must keep the skip: exempting it would
discard an unpushed edit, which is the loss the guard exists for.

### Correction to what Ashley was told

She was first told this was expected behaviour (sync timing / not signed in) and then that it was
"working as designed". **Both were wrong.** It was a bug on any second device, and her report was the
thing that found it.

### 2026-10-12, later: the pull-guard fix shipped and changed NOTHING. New observations.

Ashley, on the preview carrying the fix:

5. *"the booking request still doesnt come in on the preview link"*
6. *"but did immidiately on my phone app"* — it arrives on her phone app **immediately**.
7. *"its not even there when i click the booking requests button"* — the Requests screen itself is
   empty on the preview, not just the Calendar summary.

**§1b rule 5 applies: a fix that ships and changes nothing means the reproduction was not her
situation.** The pending-write guard WAS a real bug and the test proves the fix, but it is not what
she is hitting. Do not keep defending it. The observation list above is the thing to satisfy.

### What the code actually does, read end to end (not a theory — quote the lines)

A second device has only ONE route to a booking request, and this is why:

- `syncClientEvents()` ingests only events it has not already handled:
  `const seen=_seenEventIds(); const fresh=j.events.filter(e=>seen.indexOf(e.id)<0)`.
- `_markEventSeen` writes `sc_seen_events` **and pushes it immediately** (`_pushKeyNow('sc_seen_events',v)`).
- `sc_seen_events` is a synced key and `_mergeSeenEvents` is a **union that never shrinks**.

So the moment her phone ingests the request, every other device learns the event is "handled" and
**none of them will ever ingest it**. The booking branch is additionally guarded by
`if(_existBk)return;`. A second device therefore depends **entirely** on `sc_bookings` arriving
through sync. If that does not happen the request is invisible there, with no error anywhere — which
is exactly observation 7.

Ruled out by reading, so nobody re-checks them:

- `_pushKeyNow` has no key filter — only a hydration hold-back. `sc_bookings` is not exempted.
- `sc_bookings` is not in `_SYNC_SKIP`, not in `_SYNC_SKIP_PREFIX`, not in `_LS_KEEP_LOCAL`.
- `SlickBridge.read/write` use plain `localStorage`, which IS the patched getItem/setItem, so the
  offload path is not bypassed. SlickBridge never pushes on its own, which is why the explicit
  `_pushKeyNow('sc_bookings', …)` calls exist in the ingest flush.
- The ingest does flush it: `if(touchedRequests&&…){flushes.push(_pushKeyNow('sc_bookings',…))}`,
  awaited BEFORE the events are marked seen.

Which still leaves exactly the two cases the diagnostic was built to separate, and nothing in the
code reading settles which. **Stop theorising and read the paste.**

### THE DIAGNOSTIC I ADDED WAS ITSELF WRONG — fixed, with proof

The BOOKING REQUESTS block read the account copy from `Cloud._serverSeen['sc_bookings']`. But
`_runSelfCheck` runs **deliberately before boot** — ahead of `Cloud.status()` and `Cloud.pull()` —
so `_serverSeen` is still `{}` there. Measured in `/tmp` probe: at the moment the self-check
finishes, `Cloud._serverSeen` holds **0 keys**. The block would therefore have printed

```
on the account: NOT PRESENT — the server has no sc_bookings for this login
```

for every provider, always, including when the account *does* hold the request — a confident wrong
answer pointing at the wrong device. Exactly the §1c/§4c failure mode.

It now reads `server['sc_bookings']`, the direct `/api/store` GET the self-check already performs for
the settings rows, and says "not checked — signed out on this device" when there is no token rather
than implying the account is empty.

**And it now prints the event log itself** (§1d: if something is missing from the paste, add it in
the same change), because the two lists alone cannot tell "never reached the account" from "the
ingest skipped it". Per booking event: id, client, treatment, date, time, **seen on this device**,
**in this device's request list**, plus two verdict lines:

- `>>> marked seen here but NOT in this device's request list: <ids>` — this device skipped the event
  as already handled and never got the request through sync.
- `>>> not seen and not in the list: <ids>` — the next poll here should pick these up.

Proof: `scratchpad/test-selfcheck-bookings.mjs` drives the real `slickchart.html` through three
accounts — account-has-it/device-doesn't/event-seen (her reported shape), account-doesn't-have-it,
and healthy — and asserts the paste tells the truth in all three. It passes. The probe above is the
negative control for the `_serverSeen` source.

### The one thing to ask her for

Open the preview with `?selfcheck=1` on the end, tap **Copy this report**, paste it. That single
paste now distinguishes every remaining case. Do NOT ask for a second run unless the data changed.

### 2026-10-12: HER PASTE. The cause, with her own numbers.

The self-check from her preview, read line by line:

- `on this device: 6 request(s), 1856 bytes` / `on the account: 6 request(s), 1856 bytes`
- `on the account but NOT on this device: none`
- every settings row `identical`, `Which account row this device saves to — p_bc6d4fe33c…`

**So sync is perfect and was never the problem.** The device and the account agree byte for byte.
Both of my earlier theories were about sync. Both were wrong.

The answer was in the event log:

```
booking events on the server: 8
  • ev_idem_p_bc6d4fe33c980b42_c1783186636402_4388590f… · Ashley Watson · New client · 2026-10-13 12:00 PM · seen on this device=no · in this device's request list=NO
  • ev_idem_p_bc6d4fe33c980b42_c1783186636402_8625bbfa… · Ashley Watson · New client · 2026-11-05 4:00 PM · seen on this device=no · in this device's request list=NO
```

Eight booking events on the server, six in `sc_bookings`. Her two test requests are **unseen** and in
**nobody's** list. And `sc_seen_events` syncs as a union that never shrinks, so "unseen on this
device" means unseen on her phone too: **no device ever ingested them.** Her phone showed something
immediately because `api/client-submit` sends the push server-side; the booking itself never
materialised anywhere.

### The bug: one unprotected loop over independent events

`syncClientEvents()` was shaped like this:

```js
try{
  const fresh=j.events.filter(e=>seen.indexOf(e.id)<0).reverse();   // OLDEST FIRST
  fresh.forEach(ev=>{ /* ~190 lines, every kind, nothing wrapped */ });
  …flush touched keys to the account…
  _markEventsSeen(fresh.map(ev=>ev.id));                            // only at the very END
}catch(e){}                                                          // swallowed, no log, no trace
```

A throw on any ONE event therefore:

1. aborted the forEach, so **every later event was skipped** (oldest-first, so one stuck old event
   blocks everything newer, forever);
2. skipped the flush, so **nothing reached the account** — which is why no other device could ever
   learn about it;
3. skipped `_markEventsSeen`, so the same events were re-fetched and failed **identically on the
   next tick**, every 15 seconds and on every focus;
4. was swallowed by the bare `catch(e){}` with no console line, no toast, nothing in the paste.

Silent, deterministic and permanent. This is the `_reloadAll()` bug again (CLAUDE.md §3: one `try`
around a list of independent steps is a single point of failure) in the one loop that receives
everything a client sends — bookings, messages, forms, check-ins, photo consults.

### The fix

- **Each event gets its own wrapper.** A failure is recorded, not swallowed.
- **A failed event is NOT marked seen**, so the client's submission is retried rather than stranded.
  Every branch is idempotent, so a retry costs nothing.
- **The booking branch writes the request and sets `touchedRequests` BEFORE the notification.**
  Formatting a date and touching the feed must never be able to stop the request from landing.
- **The outer bare catch records the poll failure** instead of discarding it.
- `sc_ev_fails` holds the failures **on disk**, device-local and in `_SYNC_SKIP` — the self-check
  runs before boot and before any poll, so an in-memory list is always empty by the time the paste
  is produced.

### What the paste gained (§1d — add it in the same change as the fix)

- `>>> EVENTS THIS DEVICE COULD NOT PROCESS: n — this is the cause, read it first`, with each id,
  kind and error message.
- every unseen event **of any kind**, not just bookings, newest 15 — because the blocker may not be
  a booking at all.
- `client events are being read at all: yes/NO` — `_rosterNotReadYet()` is an unconditional early
  return that stops the ingest dead, and nothing in the paste would otherwise show it.
- `roster: N saved on this device, M loaded into memory`, and the ids saved but not loaded.

### Proof

`scratchpad/test-event-isolation.mjs` — three events, the middle one throws:

```
  event BEFORE the bad one landed : YES
  event AFTER  the bad one landed : YES
  the bad event left UNSEEN (retryable): YES
  the good events marked seen         : YES
  the failure is recorded, not swallowed: YES
  requests reached the account        : YES
```

Negative control against the pre-fix loop reproduces her data exactly — the later booking never
materialises, nothing is marked seen, and `sc_bookings` is never pushed:

```
bookings materialised : ["ev_early"]
events marked seen    : []
  event AFTER the bad one landed : *** NO - one bad event blocked it ***
  requests reached the account   : *** NO ***
```

`scratchpad/test-selfcheck-event-fails.mjs` — a failure in one page load survives into a **fresh**
load's paste and is named there with its message.

### Still unknown, and the next paste answers it

**Which** event was throwing on her devices, and why. The fix means her two requests should now
appear without knowing that, because a sibling event can no longer block them — but if the throw is
in the booking event itself, the paste will now name it outright instead of hiding it. Ask for one
more paste after she confirms, not before.

Do not mark this thread closed until she says the requests appear.

### 2026-10-12: THE ACTUAL CAUSE. The roster gate had latched, and the whole ingest was dead.

Her second paste, from Safari on her Mac at 3:49 PM, after the event-isolation fix:

```
events this device could not process: none recorded
roster: 775 client(s) saved on this device, 50 loaded into memory
client events are being read at all: NO — every poll returns early because the roster reads as unloaded
  saved but not loaded: sq_ms7g7v4hcm, c1787532620407, … and 763 more
events of ANY kind not yet handled on this device: 2   (both her own test bookings)
```

No throw. `syncClientEvents()` was returning on its **first line** — `if(_rosterNotReadYet())return;`
— on every 15-second poll and every focus, permanently. So **nothing a client sends was being read
on that device at all**: not booking requests, not messages, not forms, not check-ins, not photo
consults. The only symptom of that is an absence, which is why it looked like a sync problem for
three rounds.

**Why it latched.** `_rosterNotReadYet()` answered "has this device read its roster" by comparing
the on-disk `sc_clients` blob against the in-memory `CL`, and calling any id that is saved but not
loaded proof the read had not happened. That is sound during the boot window and wrong in steady
state: ids leave `CL` **on purpose**. `_purgeRemovedClients()` strips merged, deleted and
hidden-sample records on every load while the on-disk blob keeps them. The function subtracted the
merged and deleted sets, but hundreds of her ids were not covered by either, so the comparison said
"unread" forever. No subtraction can stay complete as new reasons to drop a record are added —
"saved but not in memory" is simply a different question from "not read yet".

**The fix.** Answer the real question: `loadClients()` has either run against a hydrated roster or it
has not. `_rosterRead` is set in every exit path of `loadClients()` (including the empty-roster one)
and only when `_awaitingHydration('sc_clients')` is false, and `_rosterNotReadYet()` returns false
once it is set. The `_awaitingHydration` check stays first, and the old content comparison stays as
the fallback for the window before the flag is set — so the change can make the guard **less** sticky
but never more. The boot-window protection it exists for is intact.

**Proof.** `scratchpad/test-roster-gate.mjs` builds her shape in miniature — 41 ids on disk, 1 in
memory — and requires a new booking event to come through AND the gate to still hold while the
roster is hydrating:

```
  the request came through          : YES
  still blocks while roster loading : YES (boot protection intact)
```

Negative control with one line removed reproduces her paste exactly:

```
gate says "not read"   : true
bookings materialised  : []
pushed to the account  : no
```

### Three fixes, three rounds, and only the third was her bug — state this plainly

1. `864c456` the `sc_bookings` pull guard. Real second-device bug, proven by test. **Not hers.**
2. `639a6ff` the unprotected event loop. Real silent single point of failure, proven by test and
   negative control. **Not hers** — her paste said `events this device could not process: none`.
3. This one. Hers.

Both earlier fixes stay: each is a genuine defect with a regression test. But the pattern to learn
is that rounds 1 and 2 were theories about code, and round 3 came from a NUMBER in her paste. The
line that found it (`roster: N saved, M loaded` / `client events are being read at all`) did not
exist until round 2 added it. **Every round that added instrumentation moved this forward; every
round that reasoned from the source did not.**

### Scope, for anything she asks

Only **2** events were unhandled account-wide, both her own test requests, so nothing a client sent
is sitting unprocessed. The event log is the server's record and nothing is deleted from it, so the
two will be ingested on the next poll once this ships. Do not describe anything here as lost.

Unknown and worth a look later: why 775 ids are on disk against 50 in memory. Most are
Square-imported customers she merged or deleted, which is legitimate, but the on-disk blob only ever
grows. Not urgent, and NOT to be "cleaned up" without her say-so.

## 2ay. The services a client may request must be HER catalog, and nothing invented (2026-10-12)

Confirmed first: the roster-gate fix worked. Ashley, after `d505705`: *"great now they are showing."*
Thread 2ax is closed.

Then: *"when i was doing the booking request the preferred services do not match the service catalog
and we need to fix that"*, clarified twice — *"for providers who only use the app (no square
integration) it should still be reading that service catalog only as well"* and *"not everybody will
be square users so we need to keep that in mind"*.

### What was wrong

Three separate places invented services the provider may not offer:

1. **`api/client-data.js`** read `sc_service_menu` directly. Nothing keeps that in step with Square,
   so a provider on Square offered her clients the app's menu while booking out of a different
   catalog. That is her report exactly.
2. **`lib/booking.js getServices()`** never consulted Square at all, and ended in a hardcoded
   `[{name:'Appointment'}]`.
3. **`slickchart-client.html`** fell back to `['Appointment','Consultation']` for a REAL client with
   no published menu, and seeded the selected service from `activeProvider().treatment ||
   client.treatment` — free text off an appointment, which need not exist in any catalog. Her own
   test requests arrived labelled **"New client"**, which is a Square appointment title, not a
   service she offers.

### The rule now, one resolver, no third source

`lib/booking.js listServices(providerId, cfg)`:

1. **Square's catalog** when Square is connected (`squareServices()`, via `getConnection` +
   `listBookableServices`, cached 60s **keyed on provider id** so one account's catalog can never be
   served to another — §0.1).
2. **Her own service menu** when she has no Square (`cfg.services`, then `sc_service_menu`). This is
   the whole point of her second message: a non-Square provider is a first-class case, not a
   fallback.
3. **Empty** when she has listed nothing. No invented name.

`getServices()` is now a thin wrapper that substitutes a neutral label ONLY for the public booking
page, which cannot render an empty dropdown. It is the single documented exception.

`api/client-data.js` uses `listServices`. The client app shows her catalog as chips, and when the
list is empty shows *"<Name> hasn't listed her services here yet. Pick a day and time below and
she'll confirm what you're booked for."* The selected service is re-checked against the catalog on
every render, so a value seeded from an appointment's free text is replaced by a real service.

**Deliberately left alone:** `_acceptSuggestedTime()` sets the service from the time SHE suggested
and submits without rendering. That is her own wording echoed back, not an invented option, and
forcing it into the catalog would change the service she chose to offer.

### Proof

`scratchpad/test-client-services.mjs`, driving the real `slickchart-client.html`:

```
Provider WITH a catalog         chips: ["Signature Facial","Dermaplane","Hydrafacial"]  selected: "Signature Facial"
Provider with NO services       chips: []   selected: ""   and the honest empty state renders
```

Negative control against `HEAD`'s client app:

```
Provider with NO services       chips: ["Appointment","Consultation"]   selected: "Appointment"
```

**Not reproduced in the harness:** the exact route by which "New client" became the selected service
on her device. `rebookState.treatment` is seeded at script-parse time from `client.treatment`, before
the real data arrives, so the harness cannot recreate her ordering. The membership re-check runs on
every render and therefore covers any seeding route, but do not claim the specific reproduction.

### One consequence to tell her, not bury

Square comes first for EVERY caller, so her **public booking page** now offers her Square catalog
too, rather than the list curated in `cfg.services`. That follows directly from "Square owns
services" and keeps one answer instead of two, but it changes what strangers see on
`/book`, which she did not specifically ask for. Say so plainly; if she wants the public page to keep
its own curated list, move the `cfg.services` check above `squareServices()` in `listServices()` —
that is the only line involved.

### 2026-10-12, 4:14pm: she was testing the CLIENT app on the LIVE site, not the preview

She reported the colours, the 14-day date strip and the services all unchanged: *"none of the edits
seem to be working in preview"*. The address bar in her screenshots read **`slickchart.app/space?c=…`**.
The provider app link I had been giving her was the preview; her client link was not, and nobody had
said so. The client space on the preview is the SAME path on the preview host:

```
https://slick-chart-git-<branch>-slick-chart.vercel.app/space?c=<her token>
```

**Give her BOTH links whenever a change touches `slickchart-client.html`.** Her screenshots are the
only way these get checked, and an hour went into re-reading code that was never running.

On the preview the month calendar, the removed date horizon and the Square service names all worked.

### Then, on the preview: two real findings

**1. The "Request an appointment" button was unreadable — measured 1.36:1.**

The next-appointment card is an always-dark gradient (`--accent-tint` → `--accent-tint2`) and its own
text correctly uses `--accent-onDark` (`_mixLight(p,0.80)`). The three action buttons inside it used
`--accent-lt2`, which `_scApplyTheme` sets to `_mixDark(p,0.24)` in dark mode — a DARK colour on a
dark card. Measured `rgb(4,33,30)` on `#031d1a`: **1.36:1**. Now `--accent-onDark`: **8.41:1**.

**Do NOT blanket-replace `--accent-lt2` elsewhere.** Two other tint cards use it too, but at least one
is on a `rgba(255,255,255,.35)` pill where a dark colour is correct. Those were left alone and are
unverified, not fixed.

**2. Preferred service is a dropdown now, not a side-scrolling chip row.**

Her words: *"the preferred services is too long and it is not intuitive to have to scroll to the side
to find - how about a drop down menu instead with no description?"* Her Square services are named like
`Acne Skin Treatment - Focus on active breakouts and acne scarring`, so the chips ran off-screen with
the useful part cut off.

`_svcShort()` shortens **only what is displayed**. The value in `rebookState` and on the request stays
the full Square name, because `matchSquareService()` and the availability lookup match on it — trim
that and the request books the wrong service or none. It drops a trailing clause only when there is a
spaced dash AND the tail is three or more words, so variants survive:

```
shows "Acne Skin Treatment"   -> sends "Acne Skin Treatment - Focus on active breakouts and acne scarring"
shows "Signature Facial"      -> sends "Signature Facial"
shows "Dermaplane - 30 min"   -> sends "Dermaplane - 30 min"
shows "Back - Chest"          -> sends "Back - Chest"
```

Changing the dropdown calls `refreshRebookTimes()`, because her Square rules are per service and the
open times change with it.

### Proof

`scratchpad/test-rebook-service-ui.mjs` — contrast computed against BOTH ends of the gradient
(`getComputedStyle` reads a gradient as transparent, CLAUDE.md §2) with the button's own
`rgba(255,255,255,.12)` overlay composited in, plus the dropdown's labels, values and that it no
longer scrolls sideways. Negative control against `HEAD`: **1.36:1** and no dropdown.

## 2az. The client Shop listed app-seeded products as if she sold them (2026-10-12)

Confirmed first, same message: *"servive times are showing correctly now. the public book is fine."*
So the Square-first ordering in `listServices()` STAYS — she was asked about `/book` and approved it.
Do not revert that.

Then: *"lets remove all demo items from the shop area. it should only be listing people's real
product catalog."* Her client's Shop was headed **"Everything Ashley offers, shop the full range"**
over five products she does not sell — Ingrown Hair Serum, Exfoliating Body Scrub, Soothing Aloe Gel,
Tend Skin Solution, Foaming Lash Cleanser — each reading *"Ask Ashley about this at your next visit"*
because there was nothing to buy.

### Where they came from

`_reseedShopIfDefault()` seeds `_SHOP_STARTER_BY_PROF[profession]` into `affiliateLinks` over a
pristine catalog, and `_buildShopCatalog()` published **everything active** to `sc_shop_catalog`,
which is what the client's Shop renders. So the app's own sample data was being advertised to a real
client under her name.

### The rule

`_isUnadoptedStarter(a)`: a product whose id is in `_SAMPLE_PRODUCT_IDS` or `_SHOP_STARTER_BY_PROF`
AND which has no `url`, `site`, `amazon`, `image`, `price`, `note` and is not `inOffice`. Those are
kept out of the client-facing catalog. **Adopting one is what makes it hers** — give it anywhere to
buy from, a picture, a note, or mark it as stocked, and it appears for clients immediately.

**Nothing is deleted.** Her own product list still holds the starters as suggestions; only the
client-facing publish is filtered. That was deliberate: deleting products out of a provider's library
is destructive and hers to decide, and §2ae is explicit about starter content versus a real account.
If she later wants them gone from her side too, that is a separate change she confirms.

### The trap this would have hit

The cleaned catalog is SMALLER than the copy already on her account, and `_dropBootShrinks()` holds
back a shrink whose missing ids are not tombstoned. It does not apply here only because
`_buildShopCatalog()` emits objects with **no `id` field**, so `_idsOf()` reads it as "not a record
collection" and returns null. **If that shape ever gains an `id`, this fix silently stops working** —
the upload would be held and her clients would keep seeing the demo products. The test asserts
`_idsOf(...) === null` for exactly that reason.

### Proof

`scratchpad/test-shop-catalog.mjs` — seven products: two untouched starters, one untouched esty
sample, a starter she marks in-office, a starter she linked, her own product, and an inactive one.

```
client-facing catalog: ["Tend Skin Solution","Lash Coating Sealant","Her Own Cleanser"]
  app-seeded products she never set up : gone
  a starter she stocks / linked       : kept
  her own product                     : kept
  shrink guard would block the push    : no
```

Negative control against `HEAD`: all three untouched starters still shown.

Her account's existing `sc_shop_catalog` still holds the old list until her app next runs
`_syncShopCatalog()`, which happens at boot — so this takes effect on her next launch, not retroactively.

## 2ba. Visibility sweep — a tool, not another one-button guess (2026-10-12)

Ashley: *"the request appointment button coloring is still not good. make sure to follow visibility
compliance and sweep every button + funciton across all apps both client and provider."*

**She was right and my earlier measurement was not representative.** I reported 8.41:1 for that button
from a run with **no brand colour set**, so the tokens fell back to static defaults. Every surface
token in these apps is computed at runtime from the provider's brand colour — measuring one colour
proves nothing about anyone else's app. That is the lesson: for anything theme-derived, a single
measurement is an anecdote.

### `scratchpad/sweep-contrast.mjs`

Drives BOTH apps headless across **2 themes × 5 brand colours × ~45 screens** and checks:

- **1.4.3 text** — 4.5:1, or 3:1 for large (≥24px, or ≥18.66px bold)
- **1.4.11 controls** — 3:1 for a control's own boundary against what surrounds it

It composites translucent layers, takes **both ends of a gradient** as separate backdrops (a gradient
reads as `transparent` to `getComputedStyle` — CLAUDE.md §2), and groups findings by colour pair so
one token problem is one line, not forty.

**Three false-positive classes it has to exclude, all learned the hard way:**

1. `background-clip:text` gradient text (`.brandc`) reads as "ink equals background" — 1.00:1 that is
   not real.
2. A control with **no** fill and no border is identified by its label; 1.4.3 covers it. Only a box
   that IS drawn and drawn too faintly fails 1.4.11.
3. `borderTopColor` is black by default on a side with **zero width**, so a row with only a bottom
   divider reported "black border on a dark card". Require all four sides before calling it a box.

A finding the tool invents costs exactly as much credibility as one it misses.

### Client app: 98 distinct problems → 18, and almost all of it was FOUR root causes

1. **`--accent-onDark` had no static `:root` default** — the only token in the file without one, and it
   colours every piece of text and both actions on the always-dark next-appointment card. Until
   `_scApplyTheme()` runs (first paint, a brand payload that has not arrived, any throw inside it),
   `color:var(--accent-onDark)` is an invalid value, the declaration is dropped, and the text inherits
   near-black **on a dark card**: measured **1.68:1**. This is the most likely thing Ashley was
   actually looking at.
2. **`--accent-lt` / `--accent-lt2` invert with the theme only inside JS.** The static values are the
   LIGHT ones, so a dark-mode screen painted pale panels and then put dark-mode muted ink on them —
   1.72:1. Dark defaults added, matching what `_scApplyTheme` computes for the default brand.
3. **`--c-line` is 1.09:1 against a white card.** Fine for a divider, which is decorative and exempt;
   not fine as a button's boundary. New `--c-line-ctl` (**#7e8c86** light / **#667870** dark, both
   measured ≥3:1) is used by `.btng`, `.pill`, `.fi`, `.check-circle`, `button.card`, and by every
   inline-styled `<button>`, `<select>` and `role="button"` container. Dividers, the shell, the topbar
   and the nav bar keep `--c-line`.
4. **Text on the always-dark brand cards used `--accent-lt2`**, which now correctly goes dark in dark
   mode — so it had to move to `--accent-onDark`. The "Private link" pill is the exception and is
   pinned to a matched light pair (`#123a35` on `#d8efe8`), because that pill is light in both themes.

Also: the Request action is now a **solid** accent button with a light hairline (brand-proof boundary;
a solid fill alone measured 2.95:1 against that card), unavailable calendar dates moved from
`--c-mut2` at .55 opacity (**1.73:1** — she complained about exactly this) to `--c-mut`, and a
hardcoded `#c4b9ae` "Not set" became `--c-mut`.

### Provider app — four passes, measured each time

| after | distinct (both apps) | affecting the DEFAULT brand | worst |
|---|---|---|---|
| start | 469 (98 client + 371 provider) | 196 | 1.00:1 |
| readable accent + `--p-line-ctl` | 312 provider | — | 1.00:1 |
| inputs, clickable rows, `--btn-edge` | 292 provider | — | 1.00:1 |
| card borders + emoji excluded | 287 | 122 | 1.00:1 |
| **`_accentOnBgP`** | **177** | **97** | **1.07:1** |

**The last one was the biggest single win and the most instructive.** The brand colour does two
opposite jobs and the app only handled one:

- as a button's **fill**, its own label must be readable on top of it → `_readableAccentP` DEEPENS it
- as **text on the page**, it must be readable against the background → `_accentOnBgP` LIGHTENS it on
  dark and darkens it on light

`--accent-strong` (the nav labels, screen titles, "Today") was the raw brand in dark mode, so a dark
brand gave 1.00:1 across whole screens while the buttons on those same screens were fine. Both
functions return the colour untouched when it already passes, so **#2BC7AC is unchanged** — verified
in every smoke test.

| **controls' own boundaries, pass by pass** | **12 → 7 → 2 → 0** | **0** | **—** |

### Where this stands: 469 → 0

Ashley asked for the sweep to fix what it found, not just report it. Both apps now come back clean:

```
auditing client ... 0 finding(s)
auditing provider ... 0 finding(s)
everything meets AA
```

That is 2 themes × 5 brands × ~45 screens, 1.4.3 and 1.4.11, down from 469 distinct findings
(196 of them touching the default brand) at the start of the pass.

### The gap the sweep CANNOT see, and the probe that covers it

**The sweep only ever sees a control in its DEFAULT state.** It drives `nav(screen)` and audits what
renders; it never selects anything. So a control that is only wrong when SELECTED is invisible to it —
and the whole bug class here lives in the selected branch, because the selected branch is the one that
fills with `var(--accent)`.

The report period chip was the only one it caught, and only because `_reportKey` already defaults to
`'this-month'`. Grepping for the pattern it caught — the same condition yielding `var(--accent)` for
**both** `background` and `border` — found five more the sweep could not reach:

| control | where |
|---|---|
| protocol step checkbox, checked | `_roomProtocolHTML()` |
| photo upload angle, selected | `openPhotoUpload()` |
| booking mode radio dot, selected | `renderBookingLink()` |
| routine item radio dot, selected | `renderRoutineBuilder()` |
| repeat preset chip, selected | `renderAutoForm()` + `_autoRepSetActive()` |

`scratchpad/probe-selected-controls.mjs` renders each one in its selected state at the brand that
breaks it worst (near black on dark), and measures. Before / after, same probe:

```
before:  6 FAIL, worst 1.05:1   (fill rgb(20,20,20) on rgb(6,16,15) — the raw brand on a dark card)
after:   all selected states meet 1.4.11, worst 4.29:1
```

**Why `var(--accent)` as a border is wrong on a filled control.** `_readableAccentP('#141414')`
returns the brand **untouched**, and correctly: white-on-near-black is 18:1, so the button's own
*label* is fine. But the button's *boundary* is then the same near-black as its fill, on a near-black
page — 1.05:1, which reads as a disabled control. `--btn-edge` (a white hairline at .42 on dark, black
at .34 on light) is the token for this and is what `.btnp` already used. **An accent-filled control
takes `var(--btn-edge)`, never `var(--accent)`, as its border.** Two JS handlers
(`_autoRepSetActive`, the angle picker's inline `onclick`) re-apply the pair after a click, so both
had to change too — the markup alone would have passed and the click would have undone it.

### Do not regress this

Run `node scratchpad/sweep-contrast.mjs` after any change to colour, a token, or a button, and
`node scratchpad/probe-selected-controls.mjs` after touching any of the five above. Both are hand-run;
they need a browser, which CI does not currently install.

A static guard that does NOT need a browser, and the thing to reach for first:

```
# any inline style where one condition fills AND borders with the brand colour
border:[\d.]+px solid \$\{(COND)\?'var\(--accent\)'...\};background:\$\{\1\?'var\(--accent\)'
```

Zero hits in `slickchart.html` now. `slickchart-client.html` still has six, and they are **fine**:
they sit on white cards, and the client app's accent is darkened until it reaches 4.5:1 against white,
so the fill alone carries the boundary. Do not "fix" those.

---

## §2bb. The junk client rows, and a paste line that lied about the safety net (2026-10-13)

Ashley ran the founder recovery check on her OWN account and pasted it. Her words after reading it:
*"i saw it has all the junk data clients on the server still. we can get rid of all of those."*

### What her paste actually said — HER OBSERVED NUMBERS, ground truth (§1b)

```
>>> ON THE SERVER RIGHT NOW: 2534 characters of notes and chart detail across 81 clients;
    288 photos. This is NOT lost — do not tell them it is.
3798 showing, 1083 removed but still on the server
Their app's list knows about 775
ON THE SERVER BUT MISSING FROM THEIR APP'S LIST (3040)
Device delete record: 2463 id(s)
Session summaries: 6 clients, 6 entries, 11KB
Homecare lists: 1488 clients, 5 entries, 31KB
EARLIER COPIES: none kept for this account yet.
~1000 lines of "DELETED AGAIN EVERY REFRESH: <name>"
```

### Why the rows are not inert, which is the part that makes this a fix and not housekeeping

`_syncEvents` (slickchart.html, the `/api/clients` GET) runs **on a 15-second interval and on every
window focus**, and for any server client her roster has not got it **CREATES a record**. So the
only thing keeping 3040 rows off her screen is her device's `sc_deleted_clients`. That record is a
tombstone set: it unions on pull and only ever grows, so it cannot be cleared on one device. The
loop therefore runs forever, and the ~1000 `DELETED AGAIN EVERY REFRESH` lines in the report are
exactly it — a row alive on the server whose id is also in the delete record, resurrected and
suppressed on every poll. **Clearing the rows is the cure. Clearing the delete record is not.**

### `EARLIER COPIES: none kept for this account yet` WAS A BUG IN THE PASTE, not a finding

`listHistory()` returns an **array** of rows, each carrying its own `k`. `_recoverText()` read it as
an **object keyed by library**: `Object.keys(array)` yields `'0','1','2'`, and an array *row* has no
`.length`, so the test could never be true. **That line printed on every account, however many
copies were sitting there.** The on-screen "Earlier copies" section a few hundred lines above reads
the same data correctly as an array — so the screen and the paste disagreed, and the paste is the
thing that gets sent.

It is the **one line in the whole report that asserts an ABSENCE**, which under §4c is the one thing
that must never be guessed. I read it and told Ashley the safety net did not exist for her account.
**That was wrong.** Fixed in this change: grouped by key, with the count, the newest timestamp and
the reason. A genuinely empty history still says "none kept", and there is a test for that case.

### What shipped — `purgeClasses` on `/api/admin/client-recover`

The **only hard delete of a provider's client rows anywhere in the app.** Founder-gated, and every
guard is in the endpoint rather than the caller:

- **`classifyJunk(q, owner)` is ONE function**, called by both the report and the purge, so what she
  approves on screen is what gets taken. The request names **classes, never ids** — a stale screen
  or a crafted body cannot widen it.
- **Three classes, one reason each.** `removed` (already tombstoned); `deleted` (live row whose id is
  in her own delete record — the refresh-loop ones); `stranger` (live row her roster has never heard
  of and that was never invited). `stranger` is **off by default** in the UI; the two backed by her
  own delete are on.
- **A full copy goes to `kv_history` under `sc_purged_clients`, reason `before-purge`, FIRST.** If the
  copy fails or is short, **nothing is deleted**. `pruneKey` does not know that reason, so it is never
  pruned. `restorePurgedAll` re-inserts the rows (`ON CONFLICT (id) DO NOTHING`, so a client who is
  live again wins over the snapshot). `restoreVersion` now refuses `sc_purged_clients` — it holds
  `clients` TABLE rows, not a library, and writing it into `kv` would bring nothing back.
- **The delete record is deliberately NOT touched.** It unions on pull, so clearing it on the account
  lets a device push the same ids straight back; and if a row delete failed, clearing the tombstone
  would resurrect the row.

### The emptiness test is the whole risk, and `describe()` was NOT enough

`describe()` is what the recovery screen *displays*. The purge needed what would be *lost*, which is
strictly larger: `_assembleClientData` also puts **aftercare, routine, pendingGuides, pendingCourses,
vcInvite, routineReview, suggestedBooking, checkinReqAt and loyalty** into the blob and `describe()`
reads **none of them**. A purge written against `describe()` calls a row holding a homecare list
"empty". `clientContent()` covers every per-client field; there is one test case per field.

Three further traps, each a test:

- **Size is no guide.** Every blob carries the studio name, address, phone, website, provider name,
  booking config and availability, so a never-touched skeleton is still several hundred bytes.
- **Placeholders are the app's words, not hers.** A new client is seeded `skin '—'`,
  `allergies 'None noted'`, `treatment 'New client'`, so an untouched row scores five filled chart
  fields unless they are excluded.
- **Unreadable counts as FULL.** If the blob will not parse, the only safe answer is no.

Never a candidate whatever class it would land in: anything `clientContent` finds, an unreadable
blob, a row with a `client_event` (a submission can sit there while the blob is empty because nothing
ingested it), a row whose link the client has **opened**, and any row that is another client's animal.
Everything held back is listed **with its reason** on screen and in the paste — the reasons are the
useful half, because they are the evidence a row holds something.

### Tests (both committed, both hand-run; CI has no browser)

- `scratchpad/test-junk-classify.mjs` — 40 checks against the real `classifyJunk`/`clientContent`
  text with a stubbed Postgres (`@neondatabase/serverless` is not installed here, §3). One case per
  per-client field, plus placeholders, provider chrome, submissions, opened links, animal links,
  unreadable blobs, both roster shapes, a failed roster read, and §0.1 cross-provider isolation.
- `scratchpad/test-junk-ui.mjs` — 28 checks on the screen and the paste: counts and names per class,
  `stranger` off by default, held-back reasons shown, classes-not-ids in the request, unticking
  actually narrows it, nothing ticked sends nothing, an older server reply with no `junk` still
  renders, and the Earlier-copies fix.

Two gotchas cost time in the UI test and will again: **modals stack** (several `#confirm-modal`
elements can be in the DOM, and `getElementById` returns the OLDEST, so click the last one), and
**`document.body.textContent` includes the inline `<script>` source** — so every "is it on screen"
assertion matched the source of the function under test. Read `#S`.

### NOT RUN, and it should be: nothing has been purged yet

This is destructive and irreversible (§1a), so it is on the branch with the report built and the
button wired, and **Ashley has not pressed it**. The sequence is: she opens the report, reads the
three class counts and the held-back list, then decides. Build `2026-10-13b`.

### §2bb (cont.) The recovery screen at her scale, 2026-10-13 — and a 50-second render

She opened the preview on her own account and sent a screenshot: *"the scrolls are WAY too long for
each section. make them stay scrollable in a box so it doesnt take forever to get through."*

**Her screenshot also settled the Earlier copies question.** It showed real copies — `Homecare
lists — 1410 items`, `Product plans — 3 items`, `Consult state — 5 items`, several of them
`a copy taken off one of their devices`. The safety net exists on her account; the paste's
"none kept" line was the bug, exactly as the fix above said.

#### 1. Every list is now its own scroll box

`_recBox(total, html, px)` — one helper, used by all of them. Her screen was building roughly
13,000 rows inline: 3798 showing, 1083 removed, 3040 missing from her list, ~1000 ghosts, 775
roster, the same 3040 AGAIN in "what their app actually draws", plus photos per client. Reaching
the next heading meant scrolling past all of it.

Rows past `_REC_CAP` (300) are **not built at all**, and the box says "Showing the first 300 of
3798. **Copy this as text** has every one." The counts above each list are still the REAL totals —
only the rendering is capped. Lists that are short on every account (the backup comparison, the
library sizes) are left alone.

Measured at her numbers, in `scratchpad/test-recover-scroll.mjs`:

```
before:  13,000+ rows inline, sections many screens apart
after:   whole screen 715px (0.8 phone screens), 3055 divs, 11 scroll boxes
         largest gap between two headings: 1015px
```

The test asserts **distance between headings** and **total page height**, not CSS — a `max-height`
that some later rule overrides would pass a style assertion and still fail her.

#### 2. The screen took 50 SECONDS to draw, and that was most of "takes forever"

`_recoverRisk` ran the near-duplicate check by walking EVERY live name for EVERY removed row and
computing a full Levenshtein on each: **1083 × 3798 ≈ 4.1 million** edit-distance computations,
each allocating a fresh 2-D table — and it is called twice per row (once to seed the ticks, once to
draw it). Three fixes, none of which changes an answer:

| | render at her scale |
|---|---|
| before | **50,715 ms** |
| `_recoverNear`: bucket candidates by length, memoise per name | 21,503 ms |
| `_recoverEdits`: two reused rows, `charCodeAt`, early exit once a whole row is over 2 | **32 ms** |

The early exit is the big one and it is exact: the final distance can never be below the smallest
value in any row, so a row entirely above 2 means the answer is above 2. Worst case — a provider
whose clients are all named `Client 00001` style, where nothing can be pruned — is **2.1 s**.

**`_recoverEdits` decides which removed rows arrive TICKED**, so a faster version that disagreed
would quietly change what a restore puts back. The test checks the rewrite against a plain
full-table Levenshtein over every pair of a 34-name pool (1156 pairs, including accents, empties
and long near-pairs), and checks `_recoverNear` against the old full scan including that a second
roster object rebuilds the index instead of answering from the first one's cache.

#### Not a bug: the green "Nothing ticked" bar

It is in her screenshot and it is the existing sticky **restore** button at the foot of the screen,
labelled that when `_recoverPick` is empty. On a messy account every removed row is a blank or a
near-duplicate, so none auto-tick. There is already a comment about it at that code.

### §2bb (cont.) Clearing the junk out of Square too, 2026-10-13

Ashley: *"I have a bunch of junk data clients i need to clear out again too. can you put that tool
back for me? and make sure they really can delete from my square account as well not just the app.
i know the source so dont go digging i just need to remove them."*

**"That tool" already existed and nothing called it.** `api/square/delete-customers.js` is a
complete, hardened bulk-delete (Square's `POST /v2/customers/bulk-delete`, 100 ids per call, a
per-id verdict, `NOT_FOUND` counted as done so a re-run after a partial clear is clean, falling
back to one-at-a-time if the bulk call fails). `FEATURES.md` listed it with no caller — exactly the
§1c rule-3 state that left `_openPhotoRecovery` unreachable for weeks. It is wired now.

#### Where a client's Square id lives, and why both places are needed

1. the row id itself, when the client came in from Square: `sq_<customerId>`
2. `squareId` (or the older `sqId`) on the entry in her `sc_clients` roster blob

The second only covers rows her roster still knows about, which by definition **excludes the whole
`stranger` class** — the 3040 rows her app has never heard of. So the id prefix is the one that
actually reaches the junk, and the roster read is what catches a local row she deleted. Both are in
`classifyJunk`, and the roster read pulls one value per key with `jsonb_each` rather than loading
the roster into the function (same reason `rosterIds` is read with a JSON path).

An `sq_` id must be longer than 11 characters to count — `sq_SHORT` is not a customer id.

#### THE FOUNDER ENDPOINT NEVER CALLS SQUARE. This is the §0.2 line and it must stay.

`/api/admin/client-recover` can act on **any provider, by email**. If it deleted Square customers
itself it would be spending whatever token the server could reach against a directory chosen by a
request field — which is precisely the shape of the original incident. So it returns
`squareIds` for the rows the DELETE actually removed, and the **app** spends them against
`/api/square/delete-customers`, which resolves the signed-in provider's own OAuth connection
through `sqContext` and has no shared fallback.

`test-junk-square.mjs` asserts this structurally, not by a word search (a word search matched the
`squareId` in the SQL that *reads* the id, which is the opposite of a Square call): the endpoint
must not import `lib/square.js`, use `sqContext`/`squareFetch`/`_sqf`, name a Square host, read
`SQUARE_ACCESS_TOKEN`, or contain a bare `fetch(` at all.

Only rows the `DELETE ... RETURNING id` actually returned contribute an id, so a row held back
because it holds a summary can never reach Square, and neither can one whose delete failed.

#### On screen

A separate amber tick, **on by default because she asked for it**, saying how many of the ticked
groups are Square customers and that **Square has no undo** — the `sc_purged_clients` copy can put
a client row back but it cannot put a Square customer back. The confirm names the number either
way: ticked, it says how many will go; unticked, it says how many stay. An account with nothing in
Square gets no tick at all, just a line saying so. Square failures (a customer Square will not
release) are reported per id and never stop the rest, and the row deletion still stands.

Build `2026-10-13c`. 25 checks in `scratchpad/test-junk-square.mjs`.

---

## §2bc. THE DIANA TEST — Ashley runs this herself, on her own devices. NOT YET RUN.

She asked for it in her own words: *"I want to run my own test on my own client and provider app
with what diana has been experiencing to make sure it's fixed before I reply to her saying it is
again."* It is written here rather than left in a chat because that is the whole point — a new
session has to be able to pick it up without her retyping any of it.

**Diana's observations, which are GROUND TRUTH (§1b).** A theory that contradicts one of these is
wrong; discard the theory, not the observation.

| # | her words |
|---|---|
| 28 | present at 4:30pm, gone by 6:00pm |
| 31 | **"I'm only on my phone"** — her computer app was shut off |
| 29 | without the summary, the notes and guides go too |
| 22 | profile says "no saved summaries" and "no sessions" |
| 14 | saved it, logged out and back in, gone |

Observation 31 is the one that mattered: **one device, no second device.** Three earlier fixes were
all device-vs-device merge fixes and none of them could ever have touched her case.

**The root cause that shipped in `57f2624`:** a failing `/api/cloud-status` at launch (a 500, a
captive-portal HTML reply, a dropped request) leaves `Cloud.enabled=false`; boot then takes an
early-return path and never calls `_reloadAll()`; `sessionSummaries`, `clientRecs`, `recReasons`
and `clientHomecare` are `{}` in memory while her disk still holds them; one ordinary action
persists `{}` over the disk; the next good launch pushes the empty map up to the account. The fix
loads those four libraries straight after `_hydrateOffloaded()` in `_cloudInit`, and `_libSafeToPersist`
refuses to write a library that was never read.

**Part 3 is the one that tests what actually changed.** Parts 1, 2, 4, 5 and 6 cover her other
reported symptoms. The build stamp now moves with each change (it reads `2026-10-13c`), so unlike
the first time she ran this, "which build am I on" is answerable.

### Before she starts

- **Run the recovery check on her own email and paste it.** That is the known-good "before", so if
  anything does go wrong it can be seen and put back. Not optional.
- **Delete no clients during the test.** Nothing here needs it.

### RESULTS SO FAR (2026-10-13, recorded as she reports them — her observations, §1b)

| Part | device | what she saw | result |
|---|---|---|---|
| 1 | **COMPUTER**, Safari, the **preview** URL (`…ecstatic-mccarthy-ynt869…`), not the phone | Client "Ashley Watson" (herself as the test client): Session summaries → **1 summary**, titled "Test A", Oct 13, 2026, full text present | **PASS** |
| 2 | **COMPUTER**, Safari, preview, client app in a second tab | Home → "After Your Visit" → "Latest summary & aftercare, Test A · from Ashley", full text shown; Journey/Homecare/Messages/Shop tabs present | **PASS** |

| 4 (partial) | **COMPUTER**, Safari, preview, provider | 14:24 and 14:27: Ashley Watson still "Session summary · 1 saved", Test A present (~45 min after saving) | holding; 90-min check due ~15:10 |
| 2 (again) | **COMPUTER**, Safari: LIVE client app `slickchart.app/space?c=rBdf…` AND the same link on the preview | both show Session Recaps, Oct 13th 2026, Test A text; 5 messages | **PASS** |

A preview client tab opened another way showed "No recaps yet" and 2 messages — a different "Ashley
Watson" record (her account has several test ones). Same link on the preview showed it. Not a bug.

Note: Parts 1 and 2 ran on the computer against the preview, not on the phone as written. That
does not weaken Part 3: the summary is now on the account, and Part 3 (phone, installed app, live
build `2026-10-12a`, which carries `57f2624`) tests whether an offline launch on the phone wipes it.
The recovery-check "before" paste had not been sent yet when Parts 1 and 2 came in.

### Part 1 — does a summary stick at all
On her **phone**, provider app:
1. Force-quit SlickChart completely (swipe it out of the app switcher), then open it fresh.
2. Pick any real client.
3. Save a session summary, noted **`TEST A`** plus the time, e.g. `TEST A 10:42`.
4. Open that client's profile.

**Pass:** it says **1 saved summary** and the note is there. **Fail:** "no saved summaries" / "no sessions".

### Part 2 — the client's side
5. Open that client's own link in their app.

**Pass:** the summary is in their journey, and notes and guides are reachable.
**Fail:** journey empty, or the other sections vanish with it ← observation 29.

### Part 3 — the actual bug
Recreates the condition that was fixed: a launch whose first network call fails — on a phone that
is a weak signal, a dead spot, or hotel wifi.

6. Force-quit SlickChart.
7. **Turn on Airplane Mode.**
8. Open SlickChart while it is offline. Let it sit about 10 seconds.
9. Move around: Clients, open a client, back to Home.
10. Write a treatment note on any client. Anything, `test`.
11. **Turn Airplane Mode off.** Wait 30 seconds.
12. Force-quit and reopen.
13. Open the Part 1 client, then **two or three other clients known to have summaries**.

**Pass:** `TEST A` is still there, and the other clients still have theirs.
**Fail:** anything missing, from any client ← before the fix, step 10 wiped **every** client's
summaries and product plans.

### Part 4 — her 90-minute window
14. Set a timer for 90 minutes, use the app normally in between.
15. Re-check the Part 1 client. **Pass:** still there.

### Part 5 — log out and back in
16. Log out, log back in, check the same client. **Pass:** still there ← observation 14.

### Part 6 — both devices
17. On her **computer**, open the app, let it finish loading, check the same client.
18. Back on the **phone**, force-quit, reopen, check again.

**Pass:** present in both, and still present on the phone afterwards.

### If any step fails
Stop. Screenshot it, run the recovery check again, send both. Do not carry on to the next part —
the account wants looking at in that state.

### Afterwards
The reply to Diana follows §4c: thank her first and name what she did that helped (her
"I'm only on my phone" is what found it), one line that it is fixed, **no mechanism and no cause**,
no em dashes, around a 3rd-grade reading level. And **nothing about data being lost unless a
recovery check proved it with numbers.**

---

### §2bd (cont.) "Tidy up your client list" would have removed real clients — fixed, build `2026-10-13e`

Her observation (COMPUTER, Safari, preview `…friendly-dirac…`): the Clients screen says **"1350
clients — tidy up the ones no longer in Square"**, and the list (Aaron Kim, Aaron Morgan, Aaron
Peterson, Aaron Ramos, Aaron Watson, Abram Gill, Adam Duran, Adelia Vega, all "Last visit — · New
client") is, in her words, *"all junk clients"*. Square holds 681. Of those names only Adam Duran is in
her Square export (1 purchase, $74.63, 2025-03-14); the tidy-up keeps anyone matching Square.

That line opens `openClientCleanup`, which removes clients not in Square whose `_clientChartWeight` is
0. **The weight read only forms, sessions, notes, check-ins, photos, consults and messages.** A client
whose only data was a visit summary, product plan, homecare list, rec reasons, body map, typed chart
detail, a manual appointment or an animal link scored 0 and "Remove these" took them. Those maps are
keyed by client id, not on the record, so it now takes the id. Same field list as `clientContent()`
on the server, plus the app's seed words ('None on file', 'None known', 'New patient') read as empty
so the junk still scores 0. Also: a `sq_` key is `_sqLocalId(squareId)`, never the id itself, so the
by-id match never fired (fell through to email/phone/name); and a truncated Square directory now
offers nothing. `scratchpad/test-tidy-weight.mjs`, 19 checks; 13 of them FAIL on the previous build.

She had NOT pressed it when this was found.

Her next report, 2026-10-13 ~14:15: *"my square list is fine but my slickchart list now shows all those
junk data clients."* Device not yet stated (asked). The event poll (`syncClientEvents`, every 15s and on
focus) CREATES a roster record for any server client not in the delete record, so any device whose
roster lacks them gets them; once they are in the account roster they stop being `stranger` in
`classifyJunk`, so the server purge will not see them — the tidy-up is the tool for them now (it
tombstones on device AND server, so the poll cannot bring them back). Build `2026-10-13f` batches that:
one delete-record push and `/api/clients` calls of 200, instead of ~670 of each.

Her next report (COMPUTER, Safari, preview, build 13f), 14:19: *"i did that and it went down to 600
something clients, and immediately on refresh went back up to this"* — screenshot shows **875 clients**,
"14 possible duplicates" (was 30). So the removal took on the device and partly did not survive a
refresh. The tidy-up reported done as soon as THIS device changed: the server deletes were
fire-and-forget, and the roster (well over the 350KB immediate-push ceiling) rode the queue, so the
account still held the old roster/delete record when she refreshed, and the pull brought them back.
Not proven which part was short — build `2026-10-13g` makes the screen itself say: it now awaits the
server deletes and waits (up to 60s) until the account confirms BOTH `sc_deleted_clients` and
`sc_clients`, shows "please don't refresh" meanwhile, and ends with three ✓/✗ lines. If any is ✗ she
screenshots it. The failure path (✗ lines) is not covered by a test yet.

### "N new online bookings added to your clients" on every launch — fixed, build `2026-10-13h`

Her report (COMPUTER, Safari, preview 13g, 14:29): the tidy-up **worked** (her words: "clean up
worked"), and *"every time i open slickchart i get x number of online bookings added from clients
which is not a real number"* — screenshot toast "4 new online bookings added to your clients".

A loop: `_upsertClientsFromSquare` (run on every Square appointments load) created a record for any
booker it could not match; for a booker she had DELETED or MERGED, `_purgeRemovedClients` strips that
record on the next load because its `sq_` key is in `_deletedClientIds` / `mergedSquareIds`; next
launch, same again, same toast. The upsert now applies the purge's rule before creating.
`scratchpad/test-booking-readd.mjs`: the previous build toasts "3 … added" then "2 … added" on the next
run for the same two removed people; this build adds only the genuinely new booker, once.

### Client summary showed product rows with no names — fixed, build `2026-10-13i`

Her observation (COMPUTER, Safari, 14:32): provider Session Record for Ashley Watson lists two products
(Avène Thermal Spring Water - 10 fl. oz.; Cicalfate+ Restorative Protective Cream 1.3 fl. oz.); the
client app's session summary (preview, same `/space?c=` link) shows "Recommended for you" with two 🛍️
rows and NO names, and an empty "Your homecare routine" card. The client code is the same on live.

A summary stores products as NAMES (`productDetail.map(p=>p.name)`); `renderLatestSummary` and
`renderMagicLanding` read `p.name`, so a string drew a blank row. `_prodList` turns a name back into the
matching live recommendation (keeps Buy) or `{name}`. Empty homecare/products cards are now hidden.
`scratchpad/test-client-summary-products.mjs` 6/6; three FAIL on the previous client page.

### 2026-10-14: Session Record mirrors the client's summary screen — build `2026-10-14b`

Her words: *"i would like them to mirror eachother to keep everything cohesive please"*. The Client
summary tab is now the client's `renderLatestSummary` card for card: "A note from <first>", "Your
homecare routine" (numbered), "Your aftercare guides", "Recommended for you" (icon, name, price,
Available in office, Buy). The record opens on that tab. Products card stays visible under both tabs;
any product opens the editor, Buy with a link opens the store. Checked by screenshot.

### 2026-10-14: products on the Session Record show on BOTH tabs, tappable — build `2026-10-14a`

Her report (COMPUTER, preview, 10:43): summary still on provider and client (Diana-test summary safe
overnight). *"on the provider it still isn't showing the recommended products like the client summary
does, and it is not clickable/editable as we discussed"* — her screenshot was the **Provider notes**
tab; the 13l product section lived only in the Client summary tab. It now renders below both tabs
("Recommended for <first>" + Edit/Add products), each card opens `editSavedSummary`, the Open link
stops propagation. `test-session-record-products.mjs` 12/12. Shipped at once (her reported bug, UI only).

### One "Fix <name>" button, removed records included — build `2026-10-13w`

Her screen (16:06, COMPUTER): "debbi miranda" → 123 records, every one "Removed", and NO button,
because the name buttons only looked at live rows. Per her rule (§4d) the two buttons ("Keep one…
remove empty copies", "Combine into one…") are now ONE: **Fix <name>** →
`consolidateName(..., {includeRemoved:true})` picks the best record among live AND removed rows,
un-deletes it if it was removed (row `deleted_at=NULL` + `undeleteIds`), puts it in her list,
retires live empty copies (removed ones stay removed), then reloads; if 2–8 real live records of that
name are still there it goes straight into `_recoverMergeName` (merge sheet opens). Otherwise one
"<name> is fixed" message. `test-consolidate.mjs` 22/22 (all-removed case), `test-combine` 6/6,
`test-recover-search` 11/11.

### Debbi Miranda would not stay put back — build `2026-10-13v`

Her words (~15:55, COMPUTER): *"i keep trying to do it with debbi miranda and it wont put her back on
my list"*. Put-back added her row to `sc_clients` on the server, but her id was still on the
account's delete record, and `_purgeRemovedClients` (device) strips any client on that record
WITHOUT checking `sc_undeleted_clients` (unlike `_mergeClients`), then pushes the list without her.
Fixed both ends: put-back (`repairRoster` with `onlyIds`, incl. ids already in the list) now calls
`undeleteIds()` (shared with "Bring back"), and the purge skips un-deleted ids. "Combine" also
un-deletes locally. `scratchpad/test-putback-sticks.mjs` 5/5; sweeps pass.

### Fourth Cooper run (15:46): 4 real records left; "Combine into one" — build `2026-10-13u`

Tidy left exactly what should be left: kept `…ygowr` (in her list), retired 56, and four real
records: 2 in her list, 1 with 9 client submissions, 1 with 1. Her words: *"i dont understand the
step 1 and 2 ... you are making me do way too much work here"*, then *"make that a rule. i want
everything to be as easy as possible and automated for me always"* → CLAUDE.md §4d.

`_recoverMergeName(name)`: when a search finds 2–8 live records of one name, a "Combine into one
<name>" button puts the ones missing from her list back (one `repairRoster onlyIds` call), adds them
to this device's CL (only when signed in as that same account, `sc_login_email`), and opens the app's
own Merge sheet with all of them ticked and the in-list record holding the most kept. She confirms
once. `scratchpad/test-combine.mjs` 6/6.

### Third Cooper run: "59 — saved work is filed under it" — build `2026-10-13t`

Her run at 15:41 (COMPUTER, single-name tidy): kept `c1791493687681ygowr` (in her list), retired 67,
left 59 "saved work is filed under it" and 1 "in her list". The work check counted ANY key in the
per-client maps, including `[]`/`{}` the app writes the moment a client screen opens and the starter
homecare list `getClientHomecare` seeds. Now (both in `consolidateName` and `classifyJunk`): empty
values are ignored in SQL, and in the tidy a copy's entry only counts if it differs from the kept
record's entry AND is not the identical value sitting on 3+ copies of that name (an app default).
The reason now names the library. `test-consolidate.mjs` 19/19, `test-junk-square.mjs` all pass.

### Tidy ALL duplicates in one tap — live, build `2026-10-13s` (main = `68dd683`)

Her second live run on Cooper (15:35, COMPUTER): kept the record in her list (`c1791493687681ygowr`),
retired 2, and left 127 copies that "hold 1 forms, 2 chart fields" (30), "1 forms, 1 chart field" (18),
"1 chart field" (78), "1 pendingForms, 1 chart field, a check-in request" (1). Her words: *"this isnt
working and im getting really tired of going back and forth so much"*.

Those were the same intake form and the booked date copied onto every copy. A copy now counts as a
DUPLICATE when everything on it is already on the kept record: forms matched by formId/title against
the kept row and its roster entry, chart fields equal or placeholders, `lastVisit`/`nextVisit` ignored
(stamped from bookings), pending items/check-in requests/unopened links ignored (re-sendable). Kept
if it has saved work under its id, submissions, an opened link, summaries/aftercare/products/routine/
photos/animals/loyalty, a form the kept one lacks, or a differing chart field — with the reason.
`consolidateAll` runs every name with >1 live row, ONLY for names that already have a record in her
list (a junk name with no real client is reported, never promoted); one list backup.
"Tidy all duplicate clients" button at the top of Recover clients. `test-consolidate.mjs` 17/17.

### PROMOTED 2026-10-13 ~15:30 PT at her word ("push it right away then") — main = release = `3cdb2c5`, build `2026-10-13q`

Everything on `claude/friendly-dirac-n55456` through 13q went live by `workflow_dispatch` of
deploy-at-2am, after CI went green on the exact commit. **CI had been red on the branch from 13d to
13p**: the restored Square cleanup screen carried the literal fake test number, which
`check-no-demo-data.cjs` refuses. Not caught because only some CI scripts were being run locally.
Run ALL of `.github/workflows/no-demo-data.yml`'s steps before every push. `sweep-summaries.mjs`
(13/13) and `sweep-offline-boot.mjs` pass on 13q.

### 141 copies of Cooper Howard — one-tap tidy per name, build `2026-10-13p`

Her observation (COMPUTER, preview, 15:21): searching "cooper howard" shows **141 records**, all "NOT in
their list", most "nothing stored"; one (`c1786666343193`) holds "1 chart field · 1 form". Her words:
*"im not doing this 141 times thats crazy"*, and *"shes a newer client who has only been in 2 or 3
times"* (her Square: first visit 2026-08-13, 3 transactions).

Almost certainly the booking-toast loop: every launch `_upsertClientsFromSquare` made a NEW client
record (`_newClientId`, `c<timestamp><rand>`) for each booker it could not match, and each reached the
server. That loop is fixed on this branch (13h + 13k) but **live (build 12a) still runs it**, so
copies keep accruing on every launch of the live app until the branch ships.

`consolidateName(q, owner, name)` (exported, POST `consolidateName`): keeps the best live row of that
exact name (already in her list > holds the most: chart/forms, saved work under its id, submissions,
opened, invited > oldest by the timestamp in the id), adds it to her `sc_clients`, and soft-deletes
(`deleted_at`) ONLY copies holding nothing; copies holding anything are left and listed. A copy of
`sc_clients` goes to kv_history first; an unreadable list changes nothing; every statement is scoped
to the provider. Screen: the search card offers "Keep one <name>, remove empty copies" when the
matches are many live copies of one name; it sends the NAME, never ids.
`scratchpad/test-consolidate.mjs` 10/10 (141 rows: keeps the chart+form one, retires 139, leaves the
opened one, other provider untouched); `test-recover-search.mjs` 11/11.

### Cooper Howard was in the "never in their list" junk class — locked, plus search — build `2026-10-13o`

Her observation (COMPUTER, preview, Recover clients on her own email, 15:15): the "148 never in their
list" group (off by default, she did NOT tick it) lists **Cooper Howard ×3**, crystal nguyen ×12,
Debbi Miranda ×5. Her words: *"i do see her name here though"*, and about the screen: *"that tool is
terrible, messy, and impossible to scroll ... the boxes need to have a search function"*.
See §2be for the report itself.

- `stranger` can no longer be ticked at all (UI disabled, red line says why). Real clients are in it.
- `classifyJunk`: any row id with saved work filed under it in `sc_session_summaries`,
  `sc_client_recs`, `sc_client_homecare`, `sc_body_maps`, `sc_note_drafts`, `sc_photo_index`,
  `sc_summary_drafts` is kept ("saved work is filed under it"). Before, only the row's own blob counted.
- GET now returns `libraries[k].byClient` (id → count, no text) for the per-client maps.
- Screen: a sticky "Find a client" box filters every client list; a results card per matching record
  says Showing / NOT in their list / Removed / animal-under, what the row holds, and what is filed
  under its id. "Put back in their list" calls `repairRoster` with `onlyIds:[id]` (new, narrows only;
  scoped to the provider's rows) so the junk is never dragged back with it.
`scratchpad/test-recover-search.mjs` 9/9; Cooper case added to `test-junk-square.mjs`.

### Demo products removed everywhere in real accounts — build `2026-10-13n`

Her words: *"now we need to remove all demo products from the 'recommended product' picker. i want to
remove demo products from everything everywhere. there is no need for it"*.

- `_reseedShopIfDefault` no longer seeds the per-profession starter products (a new account starts
  with an empty product list). Exception: the public sample (`__SC_DEMO_SEED__`) keeps its showroom
  shop; verified 12 products before and after on `slickchart-provider-demo.html`.
- `_purgeDemoProducts()` removes every UNADOPTED starter/sample product (`_isUnadoptedStarter`: no
  link, picture, price, note or in-office) from `affiliateLinks`, from every client's `clientRecs`,
  and from the client Shop catalog; each through `_libForget` so `sc_deleted_products` explains the
  shrink. Runs where the reseed ran and again right after `Cloud.bootDone()` (her data is read).
  Guarded by `_libSafeToPersist`. A starter she filled in is hers and stays.
- The recommend picker never lists an unadopted starter, whatever state the list is in.
`scratchpad/test-no-demo-products.mjs` 7/7. The fresh/scale audit harnesses are not in this checkout,
so they were NOT run.

### Booking toasts confirmed gone; session names default to date + booked service — build `2026-10-13m`

Her report after 13k: *"booking toasts seem to be gone"* (COMPUTER, preview). Then: *"in treatment
notes - lets have the name default to the date + service booked or if no service name, just the
date."* Session entries used `c.treatment` as their name, which is "New client" on most clients.
`_sessionDefaultName(id, iso)` = `_fmtNoteDate(iso)` + " · " + the service on her Square/manual/
confirmed booking for that client THAT day (generic "Appointment" ignored). Applied in both save paths
(treatment-note save and `_storeSummary`, incl. the client copy's `title`). `_sessionNameFor` keeps a
name she chose: Rename now sets `s._named`, and an older renamed one (her "Test A") is recognised as
anything that is not the client's treatment field, a placeholder or a date-led default. Existing
saved sessions are not renamed. `scratchpad/test-session-name.mjs` 7/7.

### Provider Session Record mirrors the client's summary, and is editable after treatment — build `2026-10-13l`

Her observations (COMPUTER, preview): 14:32 the Session Record's client tab listed the two Avène
products ("Retail · $20/$26"); 14:53 the same record listed none; 15:01 the CLIENT's summary still
showed both, with Buy, price and "Available in office". Her words: *"the provider record doesn't
visually match or show the links. it should just mirror the client's view"*, then *"make sure it is
all editable from the provider side in case any changes need to be made after treatments too"*.

- `renderSessionDetail` picks products exactly as the client's `renderLatestSummary` does (live
  `clientRecs` first, else names saved on the summary), and shows name, brand/price, "Available in
  office", Why, and an Open link (through `_safeUrl`).
- Editor (`editSavedSummary`): a summary with no saved products now opens on her LIVE list instead of
  an empty picker. The old seed set `clientRecs[id]=[]` on open, which emptied the client's live
  recommendations. Guides on the summary can be unticked; the client's copy follows.
- **OPEN, not explained:** why the summary's own `products`/`productDetail` were empty at 14:53 after
  showing at 14:32. She did not say whether she edited it in between (asked; she answered with the
  client view instead). The record no longer depends on it, but if a summary's saved products vanish
  again, that is the thread to pull.
`scratchpad/test-session-record-products.mjs` 10/10.

### Booking toasts: the 13h fix did NOT stop it — second cause, build `2026-10-13k`

Her report after 13j (COMPUTER, preview): *"ok great that worked. the booking toasts are still coming up
every time"*. Per §1b.5 the 13h reproduction was not her situation. Home draws at boot and calls
`_loadSquareAppts` before the account's roster is read back (it is offloaded to IndexedDB, so early on
CL is empty); `_upsertClientsFromSquare` then sees every booker as new, creates and toasts them, and the
real roster load replaces CL — every launch. Now the batch is held while `Cloud._booting` or
`_rosterNotReadYet()` and run once both clear (gave up silently after 90s rather than guess). The toast
now NAMES the people (first 4) so if it ever recurs she can say who. Test: the 13j build creates and
toasts "3 new online bookings" for two existing clients at a simulated launch; 13k adds only the new
one. NOT yet confirmed on her machine — that is the real test.

### Shoppable products, purchases → homecare, one photo-consult row — build `2026-10-13j`

Her words (COMPUTER, preview, 14:34): *"all recommended products should be able to be clicked to be
shoppable please. if they purchase a product or it is in the history it should automatically go into
their homecare routine, which the provider can edit/add notes. then - the photo consult section at the
bottom is redundant to the area at the top. lets consolidate that. if they have an invite sent use the
top section to note that."* Her answers: "history" = **purchases only**; a product with no link →
**both** "Buy in office" and her whole Shop.

- Client: every product row on the summary, the magic landing and Shop has **Buy**. `_prodList` maps a
  saved name to the live recommendation or her `catalog` entry (keeps the real link). With no link the
  sheet offers Buy in office (`_reserveInOffice`, a prefilled message) and "See <first>'s Shop".
- Provider: `_autoHomecareFromPurchases(id)` runs once per client per session on profile open. Reads
  `/api/square/orders?customerId=` (her own Square via sqContext), keeps only line items whose name is
  one of HER active products (`affiliateLinks`), adds each name once as a plain-string homecare line
  (she edits/adds the note as with any line, `_hcCompose` "Name — note"), and records it in
  `c._hcAuto` on the client record so a product she removes is NOT re-added. Guarded by
  `_rosterNotReadYet` and `_libSafeToPersist('sc_client_homecare')`. Known limit: `c._hcAuto` rides the
  client record's merge, so a removal racing on two devices could see the product come back once.
- Provider: the "Photo consult" row in Send-to now carries the state (invited → "waiting on <name>'s
  photos · tap to resend"; submitted → "Photos are in · tap to review"); the separate "waiting on"
  card is gone. The "ready to review" card stays — it carries the AI read.

`scratchpad/test-shop-homecare.mjs` 12/12.
### §2bd (cont.) Her Square directory, checked 2026-10-13 — Square is NOT where the junk is now

She exported Square → Customers and attached it: **681 customers**, and she confirmed the Square
dashboard total matches (her words: "yes that matches"). Ground truth (§1b).

Pattern pass over all 681 (gibberish/dotted-Gmail/disposable emails, impossible/555/foreign/repeated
phones, odd names, name-vs-email mismatch): **no generated-looking contacts.** Everything flagged was
a real person. No-history rows are old personal emails with 925/510 numbers.

What there is: **10 empty records** (no email, phone, visit or purchase) — 7 "Ashley Watson" and 1
"Candace Tao" from source *Third-party* (app-created, almost certainly SlickChart test clients), and 2
nameless *Marketing* rows (the only form-signup rows in the file). Plus 23 emails shared by two
customers each (duplicates to MERGE in Square, not delete). The list went to her as a CSV; it is client
PII and is NOT in the repo.

So the bot signups are no longer in her Square (681 vs the 3798 rows on the SlickChart server). The
tool that matters is the junk clear-out on the recovery screen (§2bb), still not pressed. The restored
Square screen (build `2026-10-13d`) works, but caution: run against the 7 "Ashley Watson" Square records
it would also tombstone any SlickChart client carrying that `squareId` — her Diana-test client is
"Ashley Watson". Delete those 10 in the Square Dashboard instead, after the Diana test.

## §2be. Cooper Howard missing from her client list (reported 2026-10-13 ~15:20) — OPEN

**Her words, verbatim (ground truth, §1b):** *"now my client list somehow lost a real client (before
everything we did today). her name is cooper howard. she has been in, had session summaries, etc"*

Not yet known: which device; whether "(before everything we did today)" means she was missing before
today's work or that Cooper was a client from before today. Asked.

**Facts already in hand (not theories):**
- Her Square export of 2026-10-13 holds **Cooper Howard**, source Appointments, first visit 2026-08-13,
  last visit 2026-10-08, 3 transactions, $465.12. So Cooper is in her Square directory.
- The tidy-up she ran today keeps any client matching her Square directory by id, email, phone or
  name, and (from 13e) anyone with summaries. The junk purge and the restored Square-cleanup screen
  were NOT run. None of that proves where the record went; it only says which tools were in play.

Step 2 of §1d: ONE recovery paste of her own account was requested. Read its verdict line first.
NOTHING may be said to anyone about Cooper's notes being lost until that paste says so with numbers.

## §2bd. How the Square bulk delete was done before, and where it went

Ashley, 2026-10-13, with a screenshot of the Square Developer forum thread *"Customers created via
API with creation_source: THIRD_PARTY"*: *"can you help me figure out how we did the bulk delete
option using square developer before."* That thread is the origin of the whole thing — commit
`5c50355` opens with "Square support pointed at BulkDeleteCustomers for clearing the injected
profiles."

### What Square themselves said (jseok, Square Employee, Sep 3)

- **The source**: Square Online's newsletter signup form has **no CAPTCHA, no email verification and
  no double-opt-in setting**. His immediate advice was to disable the signup form and watch whether
  new profiles stopped. (Ashley already knows this; she asked not to re-investigate it.)
- **The cleanup**: `BulkDeleteCustomers`, up to **100 customer ids per request**. Use
  `SearchCustomers` to find candidates by **creation date**, **THIRD_PARTY creation source**,
  **phone number**, and **Email Subscribers group membership**, then *"perform any additional
  validation in your script before submitting the IDs in batches."*
- **His warning, which shaped the design**: *"Customer deletion is permanent and can affect related
  Square records, so I would not delete profiles based only on their creation source or date."*

### What we built from it — `_openSquarePurge`, Settings → Your data → "Clean up Square customers"

It is the opposite direction from the tick added on 2026-10-13. **That one goes junk client row →
its Square id**, so it only reaches Square customers that have a SlickChart row. **This one goes
Square directory → what is not provably hers**, so it reaches the bot profiles that never became
SlickChart clients at all. For a newsletter-form burst, this is the right tool.

1. Loads the whole directory from `/api/square/customers` (paginates to 10,000 and returns
   `truncated` — the old 25-page stop silently capped it at 2,500 and could report "everything is
   protected" with thousands unseen).
2. Three KEEP shields, so a real client is not selectable at all —
   `prot = paidWithMe || matched || subscribed`:
   - **has booked or paid with her** — `activeCustomerIds` from `/api/square/customer-map`.
     Unconditional: a client who has transacted is provably real.
   - **matches her SlickChart roster** — `_sqCustIsMine` by Square id, email, phone or name, with
     the name match erring toward protecting.
   - **is an Email Subscriber** — has a real email and has not unsubscribed. This is jseok's "Email
     Subscribers group membership": her real clients had emails, the injected ones came in
     phone-only, so this shields hundreds of real people in one stroke.
3. **`foreign`** — `/api/admin/square-foreign` (founder only) asks the DATABASE which customers
   belong to a *different* provider by email/phone. That is the reliable leaked-record signal, as
   opposed to a guess from the Square record itself.
4. Sorted **newest first**, so an injection burst floats to the top.
5. **Nothing pre-selected.** She drives it with a date window, a search box and a "foreign only"
   filter — then types DELETE to confirm.
6. Deletes in chunks of 100 against `/v2/customers/bulk-delete`, reading the per-id response map:
   empty entry = done, `NOT_FOUND` = already gone so re-runs stay clean, anything else reported with
   Square's own detail (that is how "this one has appointments attached" reaches her).

**Creation source turned out NOT to separate the strangers** — many carried a native-looking
source — so it was kept as a hint and never as a shield. That matches jseok's warning exactly, and
is why the three shields above are identity-based rather than metadata-based.

### Where it went

`6bae816` (2026-09-09) *"Remove the founder tools and the incident-era cleanup screens"*:
*"The Square injection is cleaned up and the leak is closed, so these have done their job. Per the
owner: take them all out for now, git can bring any of them back."* `slickchart.html` dropped
~120KB. (`71b2df0` a fortnight earlier had only hidden the Settings rows; `6bae816` deleted the
code.)

### What still exists today, so restoring it is a UI change only

| | |
|---|---|
| `/api/square/customers` | present — paginates to 10,000, returns `truncated`, `creationSource`, `subscribed`, `emailUnsubscribed` |
| `/api/square/customer-map` | present — `activeCustomerIds` |
| `/api/admin/square-foreign` | present — founder-gated |
| `/api/square/delete-customers` | present, and as of 2026-10-13 reachable again |
| `_openSquarePurge` + `_sqp_*` | **gone** — restore from `git show 6bae816^:slickchart-vercel/slickchart.html` |
| `_sqMineIndex`, `_sqCustIsMine`, `_sqIsAppCreated` | **gone** — same place |

### RESTORED 2026-10-13, build `2026-10-13d` — Admin tools → "Clean up Square customers"

Her words: *"My junk is bot signups from the Square Online newsletter form, so most of it never became
a SlickChart client and the new tick will miss it. I want that screen back."* (Do not re-investigate
the source; she knows it.) It sits in **Admin tools**, so only `_isFounder` sees the row. The screen
itself only ever acts on the signed-in account's OWN Square through `sqContext`; the one admin call
is the read-only, server-gated `/api/admin/square-foreign` GET.

Lifted from `6bae816^` with these changes, nothing else:

- **Newsletter signups are email subscribers**, so the subscriber shield hides them by default. The
  Review ALL toggle and the "nothing to clean up" line now say that in words, instead of implying
  the subscriber count means "real". Booked/paid (`activeCustomerIds`) stays the one unconditional
  shield in every mode.
- **Creation-source chips** with counts. A hint only: picking a source does NOT unlock "select all"
  on its own, because real people who used the same form share the source. A day, a date range or
  a search still has to.
- Injection-era wording removed (the hard-coded 734 area code, "the leak").
- Confirm and result now say **Delete N from Square** and **Square has no undo**.
- Roster removal also catches a client that carries the id in `squareId`/`sqId`, not only `sq_<id>`,
  and tombstones the whole chunk in ONE `_saveDeletedClients` + ONE `/api/clients` call. The old
  version called `_markClientDeleted` per customer: a 300-bot burst meant 300 pushes of the delete
  record and 300 requests.
- `api/clients.js`: `deletedIds` now runs through a 4-wide pool like the upsert below it. It was one
  `Promise.all` over up to 500 ids — the same one-connection-per-id shape that caused the EMFILE
  outage described in that file.

`scratchpad/test-square-purge-ui.mjs`, 32 checks: founder-only row; paid clients never selectable by
any mode or search; bots hidden until Review ALL; a source chip alone still says narrow first; a burst
day selects exactly the 300 bots; exactly those 300 ids reach Square, in chunks of 200 and 100; a roster
client carrying a bot's `squareId` is removed and tombstoned; a real roster client is untouched; two
`/api/clients` requests for 301 ids; no other admin endpoint is called.

**NOT RUN against her real Square.** It deletes from Square with no undo. She drives it.

## 2026-10-14c — Session Record products: match the client, autofill from homecare, custom products

Ashley: "the recommended for you lost the products. this should A - match the clients record and B -
be autofilling with suggestions based on the homecare recommendations ... editable ... reorder, add
other products, searchable product finder ... and add things that are not in the product catalog".

- **A:** when the provider summary and `clientRecs[id]` are both empty, `renderSessionDetail` reads the
  client's own copy (`CL[id].summaries[].products`, matched by ts then date) via `_clientCopyProducts`.
- **B:** if there is still nothing, `_suggestProductsFor` finds catalog products named in the homecare
  plan / note / provider notes (accent- and size-insensitive, `_prodCore`) and SAVES them on the summary,
  `clientRecs`, and the client copy, so both screens agree. Guarded by `_libSafeToPersist`. `_storeSummary`
  autofills the same way for new summaries when she picked none.
- **Custom products:** the summary editor's picker offers `Add "<search text>" (not in your catalog)`
  (`_addCustomProd`); they list in the editor with a remove button and save by name. Both the provider
  record and the client's latest-summary screen now show live list + saved names that are in neither the
  live list nor the catalog, so a custom one shows on both sides.
- Test: `scratchpad/test-session-record-products.mjs` 19/19.

## 2026-10-14d — client search and Session Record header (ON THE PREVIEW, NOT LIVE)
- Ashley (computer, Safari, preview): typing in the client search left the match below the fold under
  Ask your book / New client / Sync / tidy / Invite / Photo consults / duplicates. Those now sit in
  `#clients-tools`, which `searchList` hides while the client search has text.
- Session Record header card faded to a hard-coded `#141414`, unreadable in light mode; now
  `var(--surf1)`, and the Rename button has a solid background. Test: `scratchpad/test-client-search-tools.mjs`.
- New rule (CLAUDE.md §1a): no hand-dispatched deploys mid-day unless she says "push it live early"
  for that change. 14c went live by hand before she set this; 14d waits on the branch.

## 2026-10-14e — client app theme reverted to dark on refresh (ON THE PREVIEW, NOT LIVE)
**Observed (Ashley, computer, Safari, preview, provider app open in the other tab):** set the client
app to Light; on refresh it came back Dark.
**Cause:** the client app (`/space`) and the provider app share one origin, so one localStorage. The
provider's `pushAllLocal` uploads every `sc_*` key, so the client app's `sc_client_theme` (and its
drafts, contact, seen ids...) went into her provider account, and every provider pull wrote the
account's stale copy back over the client app's settings. Reproduced headless; fails on the old code.
**Fix:** `_CLIENT_APP_KEYS` / `_CLIENT_APP_PREFIX` in slickchart.html, folded into `_syncPrefixSkipped`,
so they are never pushed, never written down by a pull, and old copies are cleared from the account
by `_dropStaleDeviceLocal`. Provider keys that merely start `sc_client_` (`sc_client_recs`,
`sc_client_homecare`) still sync — test checks that. If the client app adds a new localStorage key,
add it to that list. Test: `scratchpad/test-client-keys-device-local.mjs` 6/6.

## 2026-10-14 — /build, /free, freebie emails, Build blog: no timeframes, app email optional (2am run)
Ashley: remove anything saying the app must have its own email (optional), and anything saying it can
be done in a set amount of time. She chose to KEEP the roadmap's Week 1-6 labels (they are the order)
and limited scope to /build + /free pages, the freebie emails, and the Build blog posts.
- build.html, free.html, index.html (free-starter promo), lib/free-funnel.js (welcome + nurture),
  scripts/build-blog.cjs (Build blog CTA), 8 build-blog-src posts, og-free.jpg regenerated (`?v=2`).
- build-blog-src/README.md now has a "No timeframes, ever" rule so the Monday drafts do not bring them back.
- NOT changed (out of the scope she picked): the "Your First Screen" freebie artifact and the paid
  Master Build Roadmap artifact in her Claude account still say "make an email address just for this
  app" and "About 70 minutes" / "By tonight". Offered to her.
- Went through the train (diff includes lib/ and scripts/), live at the 2am run.

## 2026-10-14f — Product consult: deep sweep, made it work end to end (2am run)
Ashley asked for a deep sweep of the new product consult flow. What the sweep found (all fixed):
1. The client screen's **Product consult** row only opened a "guided questions are not built yet" box.
   Now `_productConsult` sends the consult (her own edited product type if she has one).
2. `_vcBaseProfile('product')` fell back to the SKIN photo profile, and `_vcTypeProfile` dropped her
   `askQuestions` — a product consult sent from the invite sheet reached the client asking NOTHING,
   and the review screen showed a skin analysis with empty photo slots.
3. Invite message, toast, client home card, push, submit screen and journey all said "photo consult /
   upload a few photos". New templates `vc_invite_product` / `vc_review_product` (editable like the others).
4. Client: answers did not count toward Submit (needed goals or products), and answers were not saved in
   the draft (`sc_vc_draft`), so closing the app lost them.
5. Review screen: photo grid, "Can't read these", photo analysis, terminology helper and the empty
   question box now hide on a photo-free consult. Product consults get a **Your product picks** picker
   (clientRecs, so they land on the client's Recommended for you); the sent message lists the picks.
6. Client row shows the consult state on the row for ITS kind; consults inbox says "Awaiting answers".
Test: `scratchpad/sweep-product-consult.mjs` 37/37 (both apps, invite → answer → reload → submit
payload → review → picks → send, plus photo-consult regression).

## 2026-10-14g — Client file: every button swept (2am run)
Ashley asked for the product-consult-style sweep on every button in the client file.
- `scratchpad/sweep-client-file-buttons.mjs [page] [clientId] [seedJS]` taps EVERY control on all 5 tabs
  (Visit, Journey, Photos, Homecare, File), each on a freshly drawn screen, and flags errors and taps
  that change nothing. Demo Maya 53/53, real-app full client and a brand-new empty client 31/31: no
  errors, no dead buttons.
- `scratchpad/sweep-client-file-deep.mjs` checks the RIGHT outcome for each, and re-checks every edit
  after a full app reload: 39/39.
- Found and fixed: **Guides + Courses** opened the send sheet at the forms (Start here) and the sheet had
  NO courses at all, although the row counts them. Added a Courses section (`_cfsSendCourse`, which puts
  the course on `pendingCourses`, which `_assembleClientData` expands for the client app), and the row
  now opens scrolled to Guides (`openClientFormSender(id,'guides')`).
- Checked and fine (worth knowing): homecare routine and product picks, their order, in-office flag and
  custom products all survive a reload and reach `sc_client_recs` / `sc_affiliate_links`.

## 2026-10-14h — Whole-app sweep (provider + client), first fixes (2am run)
Harnesses (all in `scratchpad/`, run by hand):
- `sweep-whole-app.mjs provider|client <page> [out.json] [seedJS]`: crawls every screen reachable by
  `nav(...)` from Home, then taps every control on each screen on a fresh copy. Destructive controls
  (log out, delete account, wipes) are listed, not tapped. NOTE: rows whose data is `${id}` / `"+id+"`
  are the crawler reading code samples out of inline script text, not real bugs.
- `sweep-whole-app-persist.mjs <crawl.json> <page>`: for every tap that changes a saved `sc_*` value,
  reloads the app and checks the change survived.
First run: provider demo 141 screens / 1270 controls, provider real 133 / 1163, client demo 22 / 172.
Real bugs found and fixed:
1. **Session summary "Customize card"** read `isHairBarberSummary` from another function's scope: it
   threw, and the summary screen (End session included) failed to draw while the panel stayed open.
2. **Vault document Delete**: the inline handler's "can't" ended the JS string; the button threw before
   the confirm opened. Now `_confirmDeleteDoc`.
3. Hardening: a client-scoped screen opened for a client no longer in `CL` (merged/removed, then Back)
   crashed to a blank page; `nav` now lands on Clients (`_NAV_CLIENT_SCREENS`).
Checked, not bugs: Today's Refresh and Setup walkthrough (async / overlay outside the sweep's window);
client-app "do nothing" taps were re-selecting the already-selected option, and Ask focuses the box.
Test: `scratchpad/test-sweep-fixes.mjs` 3/3.

## 2026-10-15a — Boot-time sample purge wrote defaults over real libraries (2am run)
Found by `sweep-whole-app-persist.mjs`: "Remove Sample Data", then a restart, and a real client's
product picks were gone. Cause: once `sc_hide_sample` is set, `_purgeSample()` runs at EVERY boot
(top-level boot, and the "sample client" step of `_reloadAll`) BEFORE `loadWorkspace`, `loadClientRecs`,
`loadVendors`, `loadInv`, `loadPartners`, `loadAutos`. It filtered the built-in DEFAULTS and saved them —
`saveVendors/saveInv/persistPartners/persistAutos` unconditionally — over her real local copies.
Reproduced on the old code: picks, vendors, inventory, partners all lost locally after a restart.
The account copy was protected by `_dropBootShrinks` (a shrink without tombstones is held back) and the
next pull restored the screen, which is why nobody saw it; an offline start had no such rescue.
Fix: `_purgeSample` now reads each library it touches from storage first. Test:
`scratchpad/test-sample-purge-boot.mjs` 7/7; sweep-summaries 13/13, sweep-offline-boot 12/12.
(freshaudit / scaleaudit / sweep-crossdevice are not in this checkout, so they were not run.)
Also triaged from the same sweep, NOT bugs: business-day toggles (save on Save and on leaving the
screen), `sc_bus` (device-local cross-tab channel), and `_ts` restamps seen only on a blank test
account (with real account data, a plain boot neither restamps nor pushes bizinfo/hours/tombstones).

## 2026-10-15b — UI/UX research + audit sweep (2am run)
Research report: `reports/Mobile app UI UX best practices.md` (notes in `research_notes/Mobile app UI UX
best practices/`). Audit harness: `scratchpad/audit-ui.mjs <crawl.json> <page> <out.json> [theme] [app]`
(tap targets vs 24/44px, WCAG contrast, input font <16px, unlabeled fields/buttons, img alt, reflow).
NOTE: it measures synchronously after nav, so it reports fields as unlabeled before the EXISTING
post-render labeller (~line 2350, `fl-lbl` lookup) runs — field-no-label counts are a timing artifact.
Passed already: viewport (zoom allowed, viewport-fit=cover), every input >=16px (no iOS zoom), no
horizontal overflow at 390px, provider honours reduced motion, no ad/analytics trackers (Plausible only).
Changed:
- **"No clients yet" while the account is still loading** (new device / after sign-in): now "Loading your
  clients…" and Home hides "0 of 4 done" until the first pull (`_accountStillLoading`, `Cloud._pulledOnce`
  / `_pullFailed`). Test `scratchpad/test-empty-while-loading.mjs` 3/3.
- Provider theme-color meta was `var(--p-bg2)` (invalid, ignored); now a solid colour set per theme.
- Undo import used native confirm(); now confirmModal with "Remove N clients".
- Both apps: icon-only (aria-label) buttons min 28x28; inputs/role=button get a visible focus ring even
  where inline `outline:none` was set; business-day switches 42x26 (were 38x23).
- Client: text under 11px raised to 11px (Apple floor; 34 places); honours prefers-reduced-motion;
  "Mark all read" tap area; photo-compare Before/date chips darkened to pass 4.5:1.
- Existing labeller: a label row that holds a title + small button now names the field below it.
Not changed (recommendations, see report): 44-48px targets throughout (339 still between 24 and 44),
11px text in the client app could go to 12-13px for older clients, sync-conflict messaging, Capacitor
storage (treat device storage as reclaimable; server is the source of truth, already the design).

## 2026-10-15c — Faster launch: deploy-time script split + service worker (PREVIEW FIRST, then release)
Ashley: "is there anything we can do to make the load times faster? it still feels pretty slow" ->
"do deep research and make changes based on that". Report: `reports/Faster app load times.md`.
Measured (4x CPU, 4G, 300-client account, Vercel-like brotli/ETag server): a CPU profile showed ~2.0s of
native time compiling the 3 MB inline script vs ~0.5s for ALL the app's own functions.
Changed (see CLAUDE.md "Deploy-time split"): `scripts/build-app-split.cjs` + `vercel.json`
buildCommand/outputDirectory/immutable header for `/assets/app-*`; `sw.js` v84 (code file cache-first,
3s cap on opening, never a saved page whose code file is missing).
Before -> after: repeat launch Home 1.1-2.6s -> 0.5-0.6s, all data 2.1-3.6s -> 1.4-1.6s; first launch
after a deploy Home 2.4s -> 1.7s; longest freeze ~0.35-0.8s -> 0.12-0.26s; 6s network stall -> opens
in 3.3s from the saved copy; offline opens.
All suites pass against the SPLIT build (split served by the Vercel-like server); test-sw-shell 5/5.
NOT verifiable here: Vercel's own build step (preview needs Vercel sign-in). Ashley opens the branch
preview once; if it loads, push release. iOS native shell: no service worker there (no
WKAppBoundDomains), so it gets the code-file caching but not the 3s cap; JSC code-cache gain unmeasured.
Recommended next (not done): subset + self-host the 865 KB Tabler icon font; boot timing marks in the
self-check; native launch-screen colour to remove the white flash; client page (`api/client-page.js`
sends no-store, 551 KB each open).

## 2026-10-15d — "47 bookings added" on the preview: booking import ran before the account answered
**Observed (Ashley, preview, right after opening it to check the speed build):** "it loaded but I'm
getting the booking toasts again - i just had one say 47 bookings added to my client which is not right".
**Cause (reproduced on the CURRENT code, not caused by the split):** the 6s boot failsafe clears
`Cloud._booting`; if the account's first answer takes longer, `_rosterNotReadYet()` returned false
(nothing or an old list on this device) and `_upsertClientsFromSquare` ran against an empty/short `CL`:
every booker looked new, 47 were CREATED (duplicates, pushed to the account) and toasted.
**Fix:** `_rosterNotReadYet()` is true while signed in and `!Cloud._pulledOnce`, which also guards the
event sync's skeleton creation and the reminder generators. Test `scratchpad/test-booking-toast-boot.mjs`
10/10 (normal / 8s answer / stale device list / both, plus a genuinely new booker still added).
**Her account likely now holds up to 47 duplicate copies** from that preview launch (the preview uses
the real database). Cleanup: Admin -> Recover clients -> her email -> "Tidy all duplicate clients".
The split build itself loaded fine on the Vercel preview (her confirmation), so it ships tonight too.

## 2026-10-15e — duplicate clients: prevented AND self-cleaning

**Ashley observed:** duplicate clients have appeared "multiple times now"; she has had to clean them
up by hand each time (Recover clients → Tidy). Most recently: 47 copies after the "47 bookings" toast.

**Three causes, all addressed:**
1. The booking upsert ran before the account's client list had arrived (6s boot failsafe), so every
   booked customer looked new. Fixed in 15c/15d — `_rosterNotReadYet()` is true while signed in until
   the first pull lands.
2. The booking upsert gives a new client a random id, so a copy of a Square customer does not collide
   with the `sq_` original by id. Covered by the auto-merge below.
3. `_mergeClientRecords` purged the SURVIVOR when both records carried the same `squareId`
   (it marked `_sqLocalId(squareId)` as merged, which is the kept record's id). Fixed with `_sameSq`.

**Auto-merge (`_autoMergeSquareDuplicates`)**: groups clients by `squareId` (skips animals and owner
links). Keeps the canonical `sq_` id, otherwise the record with most content, and folds each copy in
with `_mergeClientRecords` — notes, forms, photos, summaries carried over. A pair whose email, phone
(last 10 digits) or birthday disagree is LEFT ALONE for Review & merge. Two people who merely share a
name are never merged (no shared squareId). Runs once per launch after the roster is read, and after
every Square upsert. No toast; the result is logged and written to `sc_dupes_last` (device-only,
in `_SYNC_SKIP`). Test: `scratchpad/test-auto-dedupe.mjs` (12/12: 47+47 folds to 47, data kept,
conflict untouched, same-name strangers untouched, pushed to the account, survives relaunch, manual
merge keeps the survivor).

## 2026-10-15f — duplicate-path bug sweep (six parallel sweeps), all fixed on the branch

Ashley asked for a sweep of everything related to the duplicate-clients bug. Six sweeps ran in
parallel; each wrote repros in `scratchpad/sweep-dup-*.mjs`. Fixes, by area:

**Creating clients**
- `_sqChartFor(sqid,email,phone,name)` is now the one "do we already have this person" lookup for
  every Square path (`_autoSyncCustomers`, `_syncSquareClientsNow`, `_sqImportOne/All`, the booking
  upsert): canonical sq_ id → `_mergedInto` → any chart with that squareId → one unique email match,
  or phone + same first name. A chart tied to a different Square customer is never contact-matched.
- `_autoSyncCustomers` / manual Square imports wait for `_rosterNotReadYet()` (the empty Square shell
  used to beat her real chart on the merge).
- The booking upsert creates new bookers under `sq_<id>` (devices agree) and rejects a name match whose
  chart is already a different Square customer.
- CSV import ids get a random tail (same id across accounts → `id_taken`; same id after Undo → silently
  swallowed) and dedupe phone + first name.
- Server `book-request`: trimmed-email match, phone+first-name match, deterministic `c_bk_` id for a
  new booker (double submit → one row), and NEVER rewrites an existing client's chart from the public
  form (it used to replace name and data blob, unauthenticated).

**Merging**
- `_mergeSideStores`: one try per store (a consult on both sides threw and skipped messages, threads,
  payments, check-ins), consult kept as ONE object, visit summaries unioned by entry, and now also
  moves body maps, summary guides/opt-outs, sent routines, appointments and reminders (with `_ts`),
  and persists summary drafts. `c.summaries` on the record is unioned.
- Auto-merge: survivor is the sq_ id, else the lowest id (devices agree — "heaviest" let two devices
  delete each other's survivor); skips a copy open on screen, a different NAME (mom/daughter sharing a
  Square customer via email), and two different consults. `treatment` now counts as a conflict.
  Batched: one save and one server call for the whole run (1500 copies took 36s before).
- Server `mergeClientRows` (`POST /api/clients {merged:[{from,to}]}`, sent with the delete): moves the
  copy's events, push sign-ups, prefs and — if only the copy's link was opened — the link itself onto
  the survivor. Both ids must be this provider's live rows. Old server ignores `merged`.
- `_purgeRemovedClients` no longer strips a chart its Square twin was merged INTO, nor a chart with
  real data when only its Square twin was removed (keeping the hand-added copy in Review & merge made
  both vanish and jammed that device's uploads). Records the id it purged so the shrink guard passes.
  Review & merge pre-selects the sq_ record. `deleteClient` routes to a Square sibling / tombstones
  the sq_ key. `_commitWriteNote` resolves a merged id.
- A put-back (`sc_undeleted_clients`) wins only over an OLDER delete; `_mergeTombstone` keeps the newer
  stamp for both. Server `client-recover` no longer stamps every kept record as "brought back".

**Server sync**
- `api/store.js` merges `sc_deleted_clients`, `sc_undeleted_clients`, `sc_merged_ids` (newest stamp
  per id) and `sc_merged_into` (union) instead of overwriting — a stale device used to erase another
  device's removal for the whole account. `scratchpad/test-server-merge-pg.mjs` (real Postgres, 12/12).
- `client_tombstones` table: a founder hard purge remembers ids so a stale device can't re-create them.
- `api/clients.js` refuses a revoked session. Bulk roster repair skips leftover copies.

**Boot**
- `pull()` treats a non-OK / non-JSON answer as a failure (a 500 used to read as "empty account" and
  push the whole workspace). A failed pull uploads nothing, retries with backoff and on `online`, then
  reloads (`Cloud._retryPullSoon`). `Cloud._holdUploads()` keeps every upload queued while a pull is in
  flight or failed — this is very likely the §2ae "5 stock courses for ~3.6s" mechanism (the 6s
  failsafe flushed boot defaults mid-pull). Signup marks `_pulledOnce`.
- 401 then sign-in as a DIFFERENT account in the same page: previous account's data is cleared and the
  app reloads (`_signedInAsSomeoneElse`, §0).
- Wait for the account (`_acctUnread()`), then re-run in `_afterAccountRead()`: `_stampClientNextVisit`
  (stale record got a fresh `_uAt` and beat newer notes), `_rebuildCalendarFeed`, `_paySyncSquare`
  (doubled invoices), `_gcalPush` (server deletes Google events missing from a partial list).

**Known, not changed** — all three FIXED in 2026-10-15g:
- `_saveClientDetails` now flushes the guarded queue (`Cloud._flush(0)`); `_saveTaxRate` relies on its
  own `_pushKeyNow`. Neither calls `pushAllLocal()` any more (sign-in/sign-up seeding still does).
- `api/store.js` strips from an uploaded `sc_clients` any id whose delete is newer than its put-back
  (account records merged with any in the same request). Mirrors `_purgeRemovedClients`. Tested in
  `scratchpad/test-server-merge-pg.mjs` (16/16, real Postgres).
- Entries saved under a merged-away copy follow `sc_merged_into` to the survivor: during the pull in
  `_unionById` (`_mergeTargetOf` also reads the merge/delete records arriving in that pull via
  `Cloud._incoming`, since key order is not guaranteed), and after it for device-only stores in
  `_foldMergedLeftovers()` (run from `_afterAccountRead`). `scratchpad/test-merge-fold-xdevice.mjs` 6/6.
  Maps without a value merge (product plan, homecare) keep the survivor's entry when it has one (§0.8).

## 2026-10-15h — sweep 2: seven parallel sweeps across both apps and the server

Repros for everything below are `scratchpad/sweep2-*.mjs` (Playwright, real Postgres where noted).

**Security / §0**
- Stored XSS on `/book/<slug>` (service names in an inline script) → `jsonForScript` (lib/public-brand.js).
  Reflected XSS in `/api/google-cal-callback?error=` → escaped.
- `client-link` / `client-invite` put a caller-chosen origin in the emailed token link → `safeLinkOrigin`
  (our origins only).
- Revoked sessions were honoured only by a few endpoints → `sessionOk(req)` guard on 21 endpoints,
  `sessionFromReq` / `providerFromReqChecked` for Square (`sqContext`). `isSessionValid` now FAILS
  CLOSED on an unknown sid (only delete-account removes rows). Square OAuth state carries `k:'sq'`.
- `totp-setup` could switch two-step off / replace it with no code → refuses when enabled; new
  `totp_pending` column, promoted by `totp-verify`.
- `cron-events` messaged ids from the provider's own kv blob → only her live `clients` rows.
- Delete-account now also removes files, kv_history, course_versions, client_tombstones, google_*,
  provider push subs and native tokens (by owner_id).
- A browser's provider push subscription belongs to the last account to enable it; sign-out
  unsubscribes. Device photo store is owner-stamped (`captured_photos_owner`); another account's
  photos are set aside (`captured_photos__<owner>`), never shown or uploaded.
- Client app: a second client's link in one browser clears the first client's keys
  (`sc_client_owner`, `_CA_KEYS`); "Delete my data" only removes client-app keys.
- `check-tenant-isolation.cjs` now reads `q\`` statements (it had inspected none); 9 reviewed ALLOWs.

**Sends**: per-provider/per-client try in cron-checkins/cron-reminders; aftercare thread message without
push; `wantsPush` gate (client turned notifications off) in automations/events/checkins; merge carries
`reminder_log` + `heal_started_at`; provider-scoped check-in claim; automations step on the wall clock
in `a.tz` and "Send now" claims the in-grace occurrence (`_autoOccAt`, identical in app and cron);
native client app turns notifications on when allowed at the OS prompt (`offAt` marks a deliberate off).

**Sync (provider app)**
- Boot sends each held batch item's CURRENT value (`bootDone`) — a launch no longer re-uploads old
  inventory/vendors/partners/autos; sample purge saves only on change; shrink guard reads natural keys.
- Delete records are DATED: `_tombVal/_tombPick/_tombHides` — a delete hides a row saved before it;
  a NEGATIVE stamp is an un-delete (course restore, `_libUnforget`). Merged newest-magnitude-wins on
  device (`_mergeTombstone`) and server (`NEWEST_WINS_KEYS` in api/store.js, all delete records).
  `_tombSet` also reads `Cloud._incoming` (key order of a pull is not guaranteed).
- `_stampRows(key,arr)` stamps `_ts` on rows that changed in a save (payments, inventory, vendors,
  partners, autos, protocols, docs, bundles, shop bundles); renames retire the old natural key.
- Server strips removed clients from uploaded `sc_clients`; entries under a merged-away id fold to
  the survivor (`_mergeTargetOf`, `_foldMergedLeftovers`).
- `_resumePull()`: a device left open re-reads the account on focus/visibility/online (15s throttle)
  and every 5 min — never while typing, in an editor, or with a sheet open.
- `pull()` treats non-OK / non-JSON as failure; `_retryPullSoon`; `Cloud._holdUploads()` keeps uploads
  queued while a pull is in flight or failed (likely the §2ae stock-courses mechanism).
- Visit records: `_ts` edit stamp separate from `ts` (visit date); saved drafts for an earlier visit
  retire after 12h (`_expireCommittedDraft`).
- Expired (not revoked) session keeps unsent work (`sc_unsent_keys`, `sc_prev_owner`); sign-out
  flushes first (`_signOutSafely`).
- Check-in log refers to chart photos by id (`photoPids`); consults over 3 MB sync photos as
  `fileref:<pid>` with bytes uploaded separately (`_pushVcSubsSlim`, `_vcFillRefs`).

**Booking / Square / Google**: public booking dedupes by trimmed email / phone+first name, never
rewrites a chart, one request + one email set per person+slot (`logEventOnce`); slots in her zone
(`providerTz`), Square answers minus Google/manual/instant bookings, instant bookings counted and filed
as confirmed; Square bookings/invoices paginate; booking reuses her Square customer; invoices have
`pay_sq_<id>` ids and copies collapse; Google events get the exact start (`startISO`) and fixed ids;
feed not rebuilt while Square errors; next visit matched by Square customer id.

**Client app**: settings written only after the account copy is read, flushed on close, merged per
setting server-side; consult draft survives refresh; open app refreshes on any change; consult retry
has a stable key; sign-in code tries counted atomically; book-slots passes the service.

**Not done (low / config / design):** founder gates don't require `providers.verified` (only matters
if a FOUNDER_EMAILS address has no account); legacy `APP_PASSWORD` login has no rate limit (only if
set); client-link/code timing differs for known emails; signup 409 enumerates; client-submit re-pushes
on retry; form-question photos aren't in the client draft; reconnecting a DIFFERENT Square merchant
duplicates clients; Google outbound deletes events missing from a stale device's list; photo store is
one IndexedDB value (slow past ~500 photos).

## 2026-10-16a — sweep 3: start session, consults, product recs, homecare, forms (both apps)

Six parallel sweeps of the visit flows, provider and client side. Repros are
`scratchpad/sweep3-*.mjs` (some simulate the OLD provider payload on purpose; the `v-*.mjs` copies
drive the new path). Build `2026-10-16a`, on the branch and `release`, out at 2am.

**Sync / data safety**
- Processing a consult no longer pushes `sc_pro_vc_subs = ''` (it lived in IndexedDB; the flush read
  localStorage). `api/store.js` refuses `''` for that key, `sc_clients`, `sc_session_summaries`.
- Consults: newest SUBMISSION wins across devices (`at`), not most photos; the replaced one is kept as
  `prev` (shown as "Earlier photos", slimmed/filled like the current photos). `vc_submit` is
  idempotent (`evId` on the submission, `subEvId` on the invite, older events ignored); a submission
  for an older invite (`payload.invitedAt`) cannot close a newer one. Seen-event cap 1000 -> 5000.
- `persistWorkspace()` also persists the dedicated recs / reasons / homecare keys.
- Note drafts: an expired draft is recorded in `sc_deleted_note_drafts` (ids `nd:<clientId>`, scoped
  via `_SHRINK_SCOPED` so it never reads as a deleted CLIENT to the shrink guard), so the smaller
  upload is accepted and no device restores it. Summary drafts are cleared to `null`, not deleted.
- Healing stage picker persists; healing check-ins actually reach `/api/aftercare-drip` (token
  minted first, failure said out loud).
- Cron decides homecare reminders from the server's `aftercare` length (`hc_count`), not the
  client's possibly stale flag; client also re-uploads its reminder context when it changes.

**Start session**: dictation never appends to a past visit's saved draft or replaces today's notes
in another format; changing note format no longer empties the visit's clinical notes; the client
never receives "Tap Edit to write a note"; Personal note / Skin metrics / Products / Next
appointment switches are honoured on the client (`entry.hide`, additive) and products-off builds no
plan; typed summary note survives redraws, Cancel restores; summary "+ Add" product went to the
wrong client; late AI rewrite no longer takes over the next client's screen; horse summaries notify
the OWNER; room checklist resets however the summary went out; open client summary refreshes on poll
(not while typing).

**Consults**: client sees the questions and the "routine" switch; stale invite clears on other
client devices; review notes survive redraws; top Send review guarded; replace-an-open-consult asks
first; retake carries goals/answers/routine; routine review survives a re-invite (`reviewedAt`);
invite sheet heading/questions follow the chosen type.

**Recs / homecare**: deleted products leave every plan; Shop all de-duped with the Associates tag;
client buy sheet fits 390px; client History tab built from visit summaries; dropped routine products
leave the client list; blank homecare lines filtered; identical lines tick separately (`#2` keys,
first keeps the plain text).

**Forms**: in-person signing always files a new record and keeps the drawn signature (`sigImg`, also
on the server event); check-in "done" is pending (device only, 12h) until the send succeeds;
re-sent forms/guides/courses come back (submission `at` vs `assignedAt`; client removal times in
`sc_res_removed_at` / prefs `resRemovedAt`); form drafts follow question ids and clear the right
key; re-sending a check-in stamps `checkinReqAt` once the link goes out.

**Not done**: `sc_workspace.codes` keeps a cleared discount code in the account copy (no screen shows
it; fixing means changing that key's shape); client
prefs merge is top-level only (two client devices can overwrite course progress); `cron-events` hour-bucket dedupe could double an "after service" send.

## 2026-10-16b — take back a form, guide or course sent by mistake

Client chart → Visit → "Still open in <name>'s app": every pending form, guide and course with
**Take back** (confirm, then a 7s Undo). Taking one back removes it from the chart AND stamps
`c.withdrawn['f:'|'g:'|'c:' + id] = ms`, sent to the client as `withdrawn` (entries over a year old
dropped). The stamp is needed because `upsertClient` (lib/clients.js) keeps a stored
`pendingForms`/`pendingGuides` when a write would empty it — the guard against stale devices — so
removing the LAST one never reaches the server by itself. The client app hides anything whose
`assignedAt` is at or before its stamp; a re-send (newer `assignedAt`) shows again. Merging two
duplicate charts keeps the newer stamp and drops taken-back items. Old client builds (open tabs) keep
showing a taken-back item until they reload. Repro: `scratchpad/sweep3-takeback.mjs`.

## 2026-10-16 — /build rewritten for beauty pros; Beauty Biz Master Build Roadmap; Vercel paid plan
- `/build` (build.html) now sells the **Beauty Biz Master Build Roadmap**, a separate artifact:
  https://claude.ai/artifact/MLh3Sf9qvGLr1a92DHDtR8 (source assembled in the session scratchpad from
  shell/data1-4/feats2/plan/engine; 16 trades, 128 prompts, features filtered by trade + "see every
  other feature", own ideas with a generated prompt). The page went live via main (content).
- **Which roadmap a buyer gets** is per purchase: `build-checkout.js` tags new sessions
  `metadata[roadmap]=beauty`; `lib/build-sales.js roadmapUrlFor()` sends tagged sales the beauty link
  (env `BUILD_BEAUTY_ARTIFACT_URL` overrides the built-in one) and untagged (earlier) sales keep
  `BUILD_ARTIFACT_URL`, so /build/access never swaps a buyer's product. That is api/lib, so it rides the
  release train; purchases made before it deploys get the original roadmap link.
- Vercel's Hobby plan is non-commercial. Fixed everywhere it said hosting is free for real customers:
  the new /build page, the original Master Build Roadmap artifact (v9), the cost blog post, and the
  free-funnel email in lib/free-funnel.js (train).
- Not claimed anywhere: that the new beauty prompts were each tested. They are built from the steps
  Ashley used on SlickChart; the page says exactly that.

## §2be. OPEN — DIANA, 2026-10-16: phone alone loses summaries and journeys; computer is fine
**Her observations, from her email "Re: Not saving clients" (2026-10-15 21:33) — GROUND TRUTH (§1b).
Recorded before any theory.**

| # | device | her words / what she saw |
|---|---|---|
| 40 | COMPUTER | "all of my clients, summaries, and client journeys in SlickChart are now saved and visible, including some of the summaries that had previously disappeared" |
| 41 | PHONE, used alone | client summaries and journeys are missing |
| 42 | PHONE | "sometimes even it reboots to me having no client and first time use messages pop up" |
| 43 | PHONE | saved notes, pictures and home care ARE still there when the clients are there |
| 44 | PHONE | "It also appears to delete them after about 20 minutes" |
| 45 | COMPUTER then PHONE | log into the computer first, then open/log into the phone app: the phone "reboots and populates all the missing client data and summaries" |
| 46 | PHONE | Settings shows "SlickChart · Version 1.0.3 · build 2026-10-16a" (her screenshot, dark theme). Live is now 2026-10-16b. |

Asked, not yet answered: is the phone the installed App Store / Play app, or the home-screen web
app? (The version line is the same text in both, so the screenshot cannot tell. One tell: on the
More screen the section is titled "Security" in the native app and "Security & Billing" in a browser.)
Her question: can her clients see their summaries on their own phones, or do they need the desktop?

Next (§1d): Ashley runs Admin → Recover clients → esthieguild@gmail.com → Copy, once, and pastes it.
No reply to Diana says anything is lost until that paste says so with numbers (§4c).

**§2be diagnosis + fix, build `2026-10-16c` (on the preview branch until Ashley ships it):**
- §1d paste (2026-10-16): `>>> ON THE SERVER RIGHT NOW: 699 characters of notes and chart detail across
  13 clients; 16540 characters in unfinished note drafts; 5 saved visit summaries; 102 photos. This is
  NOT lost`. Session summaries on the account: 9 clients, 10 entries, 31KB (newest earlier copy has 8
  clients), so the account is fuller than its last backup. Nothing to restore. The phone is showing
  less than the account holds.
- Cause found and reproduced (`scratchpad/test-offload-stale.mjs`, 3 of 4 FAIL on 16b, 4/4 on 16c):
  when an IndexedDB write fails, `_lsPersist` fell back to localStorage but cleared `Cloud._offloaded[k]`
  FIRST, so its own retire branch never deleted the old IndexedDB copy; the next cold start
  (`_hydrateOffloaded`) read that OLD copy and deleted the newer localStorage one. iOS drops a
  backgrounded app's IndexedDB connection, and `_idb` cached the dead connection forever, so after that
  every write failed for the rest of the session. Fixes: a synchronous `sc_off_lsnewer` marker that
  hydration honours; `_idb` reopens on close/versionchange and retries a failed op once; 5s timeout
  per transaction so a stuck one cannot hang boot.
- Pre-existing, NOT from this change: `sweep2-photo-xaccount.mjs` 5/6 on both 16b and 16c — "logout
  clears A's photo store from IndexedDB" (`captured_photos` key `cA` left after logout). The recover
  screen does not offer them to account B (that check passes).

### §2be (cont.) Diana, 2026-10-17 08:58 — still happening AFTER 16c went live. Observations first.
From her email "Re: Not saving clients" (2026-10-17 08:58) and her screenshots — GROUND TRUTH (§1b):

| # | device | her words / what she saw |
|---|---|---|
| 47 | — | "I think it is something with the iPhone. On the computer everything is saved but on my phone nothing is saved." |
| 48 | PHONE, 8:55 AM, dark theme | Client Bonnie Prince, Journey tab: "Session Summaries · 0 saved summaries · Finish a session to save one here". Contact shows (626) 945-3301, no email, no DOB, "Nothing flagged". |
| 49 | COMPUTER (Windows laptop, photo of the screen) | Session summaries for Bonnie Prince: "1 summary" — "New client · Sep 25, 2026", text "Your first reset facial is complete, Bonnie — it was so great to get started with you! Because of your skin's history, we're taking a carefu..." |
| 50 | PHONE vs COMPUTER | the header logo differs: phone shows the default SlickChart lotus; computer shows her own gold logo. (Observed in the screenshots; not something she said.) |
| 51 | — | "I assume most of my clients want to use their phones and maybe that's why it's not showing up." |

The summary is dated Sep 25 — weeks old, so this is not "saved a minute ago on the other device".
Still unknown: phone build number today; native app vs home-screen web app (asked 10-16, unanswered).

## 2026-10-16 — The Esthetician Collection built into the provider app (build `2026-10-16d`, preview)
Ashley's Etsy collection (54-page PDF, "Esthetician Complete Collection", 3 styles) built in for every
subscriber. All ADDED, nothing existing changed:
- **16 forms** `ec-*` in `formTmpls` (right after it, so `_snapshotBundled` counts them as built-ins and
  `persistForms` never stores them unless edited). Own catalog section `_FORM_DEFS_BY_PROF.ecoll`
  ("The Esthetician Collection"), shown when esty/wax/brow/lash is selected (`_profFormDefs` + the
  Forms screen `sections`). `_bundlePhotoRelease` skips `ec-*` (they ask their own photo questions).
  Sent forms reach the client as a snapshot (`_assembleClientData`), so already-sent/signed forms are
  untouched. Placeholders like [24] / [Your Business Name] were resolved so clients never see brackets.
- **13 guides** `g-esty-ec-*` pushed onto `guideTemplatesByProf.esty` (+ wax/brow/lash get the relevant ones).
- **Practice library** (provider-only, read-only): `EC_LIBRARY` (17 entries: protocols, business tools,
  record sheets), a "Library" tab in Forms & Guides (`_practiceLibraryTabHTML`, `_openPracticeEntry`).
- **Printable PDFs**: `assets/ec-<random>/{neutral,blush,luxe}.pdf`, address handed out only by
  `api/collection-pdf.js` after session + subscription check (same rule as login, past_due allowed),
  `X-Robots-Tag: noindex` in vercel.json. Not DRM: the folder is static; the name is the protection.
- The form/guide/library TEXT is in slickchart.html, which (like every built-in form) is public JS.
- Tests: `scratchpad/test-esthetician-collection.mjs` 14/14, `scratchpad/test-ec-client-form.mjs`
  16/16 (a client fills, signs and submits every collection form in the real client page). Found and
  fixed on the way: a "Phone or email" field failed the client app's email check for a phone number.
- Pre-existing, not from this: `sweep3-forms-provider-sign-again.mjs` still shows signing the same
  form twice on the provider's device files nothing on the second sign (same result on 16c).

### 2026-10-16e — business details fill in; every collection form and guide verified editable (preview)
- `_bizFill(s)` / `_bizFillQs(qs)`: `{business}`, `{phone}`, `{email}` (optional `{phone|fallback}`) fill
  from `bizInfo` (`workspace.name` fallback, then "this business"). Resolved where a form is SHOWN
  or SENT (`_assembleClientData` form + guide-tip snapshots, sign-on-device snapshot, signed-record
  renders, provider form renders, the practice library). The editor keeps the token, so a later
  name change reaches every unsent form. The editor has a one-line tip about the tokens.
- Collection uses: `ec-general-consent-11` ("I release {business}…"), `ec-virtual-16`
  ("…24 hours ahead to {email|me, the way I asked you to}"), library patch-test line
  ("call us at {phone|the number on your booking}").
- Editability verified headless: all 16 `ec-*` forms round-trip through the editor with no loss
  (labels, types, required, options, checklist items); rename + edit + delete + add question,
  save, relaunch, send = the client gets HER version with her name filled in. Guides: edit a
  `g-esty-ec-*` guide, relaunch, the edit stays and is what is sent. Tests:
  `scratchpad/test-esthetician-collection.mjs` (25/25).
- "Signing the same form twice files nothing" was a STALE repro, not a live bug: it signed twice
  inside `submitSignOnDevice`'s 3s double-tap window. Repro now waits 3.5s: both records file.

### 2026-10-16f — client summary note follows her provider notes (preview)
**Observed (Ashley, her own use):** during a session summary she wrote provider notes, tapped "Make
client-friendly", then had to fix something in her provider notes. The client summary kept the old
wording; she expected it to update. (Device not stated.)
**Cause:** both AI buttons write a fixed copy into `summaryNoteDraft[id]`; nothing tied it back to
the notes. **Fix:** `summaryNoteSrc[id]={n:_notesPrint(id),t:text}` recorded when the AI writes the
note (stored as a third field `src` in `sc_summary_drafts`, merged per client like note/obs; an older
build drops it, which only costs the auto-update). On opening the summary, `_noteSrcState`:
untouched since the AI wrote it -> rewritten from the current notes (`_refreshNoteFromNotes`); she
re-worded it -> never overwritten, an "Update from my notes" button instead. AI off -> the plain
clean-up of her notes, which always follows them. Test: `scratchpad/test-summary-follows-notes.mjs`
(11/11; step 2 FAILS on the old build, so it reproduces her report).
Pre-existing, unrelated: `scratchpad/sweep-dup-carry-stores.mjs` 12/16 on live main too (duplicate
merge skips a consult pair).

### 2026-10-17a — lash & brow sample courses retired; ONE preview branch from now on
- **Observed (Ashley, Safari on her computer, preview `claude-friendly-dirac-n55456`):** Courses showed
  "Lash Care & Retention" and "Brow Care Between Visits" (Draft, 3 modules, Free); she asked for them
  removed. On the same preview "none of the forms we were supposed to incorporate are anywhere":
  the collection had been pushed to `claude/esthetician-collection`, a different preview. Fixed by
  fast-forwarding `claude/friendly-dirac-n55456` to it; CLAUDE.md §1a step 1 now says one branch.
- `coursesByProf.lash`/`.brow` are empty. `_RETIRED_STARTER_COURSES` + `_dropRetiredStarterCourses()`
  (run from `_coursesTabHTML`, never during boot) remove an account's copy only when it is the
  untouched sample (same title/price/desc, Draft, no lessons/cover/_ts, nobody enrolled), with a
  `sc_hidden_courses` delete record so the other device follows. `_mergeCourses` counts the retired
  ids as stock. Test: `scratchpad/test-retired-starter-courses.mjs` (7/7).

### 2026-10-17b/c — provider form screens MIRROR the client app (preview)
**Observed (Ashley, Safari on her computer, provider Preview of the collection forms):** the
contraindication list had "no way to tick anything"; she wants the provider side to make the clicks
obvious and "as many things as possible to mirror" the client app. She also asked to drop the
policies form's card-on-file question (`ec-policies-3`), removed.
- `_mcControlHTML(q,key)` / `_mcPick`: Yes / No and Single select = pick-one buttons (Single select
  stacked, like the client), Multiple choice = check boxes. Used by Preview (`_formQHTML`) and Sign in
  person (`_sdQHTML`). Contraindications are check boxes (`input.ci-tick`) with the client's wording.
- Real bugs fixed on the way: Sign in person saved `flagged:[]` always (ticks now become answer +
  form flags + `_setFormFlag` alert + the `/api/provider-form` event), and treated Multiple choice as
  pick-one (only the last tap kept; now a list). Fill intake (`_pfiQHTML`) showed a blank text box for
  Single select / Multiple choice; now buttons / check boxes.
- Preview signature shows the client's "Type your full name to sign"; photo questions show the
  client's "Add photos" button. Collection wording says "check", never "tick".
- Sweep: `scratchpad/sweep-form-mirror.mjs` (every form, 387 questions, both provider screens) 6/6;
  `scratchpad/test-contra-ticks.mjs` 9/9.

### 2026-10-17d — full forms bug sweep; "Phone / email" fix; virtual consult photos go in-app (preview)
- `scratchpad/sweep-all-forms.mjs`: EVERY form (90) — build checks (ids, labels, options, items,
  signatures, leftover placeholders/tokens, snapshot completeness), Sign in person by tapping every
  control + the client file shows the answers, and the REAL client page filling and submitting the
  exact snapshot. Now 0 problems.
- **Found, LIVE on main:** stock `spraytan-intake` and `headspa-intake` have an optional "Phone /
  email" short text. The client page validated it as email AND phone, so ANY value blocked the
  submit (email -> "valid phone", phone -> "valid email"), and it rendered as `type=email`. Now a
  label naming both gets a plain text box and accepts either (`slickchart-client.html`, embed rebuilt).
- **Ashley asked (2026-10-17):** remove the "email your photos" part of `ec-virtual-16`; clients use
  the in-app Photo consult. Label now says to add them in the Photo consult in this app.

### 2026-10-17e — Library: real PDF pages per document, per style, with Print (preview)
**Observed (Ashley, Safari on her computer, preview):** the X on a Library entry did nothing; the
entries showed a simplified text version instead of the PDF; the only PDF option opened all 54 pages.
- X: `_sheetCloseFrom` only knew `#photo-recover,#sqp`; `#pl-entry` added.
- The three 54-page PDFs are split per document (47 docs x 3 styles) into
  `assets/ec-9308d13917a6f75f4f385060/<style>/<doc>.pdf` by `scratchpad/ec-split-docs.py` (page map
  from pdftotext; asserts every page used once). `EC_PRINT_DOCS` lists them; `EC_LIBRARY` (the text
  versions) is gone. `/api/collection-pdf?doc=&style=` returns one file's address, same session +
  subscription gate, doc and style allow-listed.
- Viewer: style chips (per-device `ec_pdf_style`, not synced), pdf.js 3.11.174 from cdnjs (loaded on
  first open) draws the real pages, Print prints exactly those pages via a hidden frame, Save PDF
  opens the file. Whole 54-page PDF still offered.
- Test: `scratchpad/test-esthetician-collection.mjs` 30/30 (real pages drawn, style switch, 2-page
  doc, print, X).

### 2026-10-17f — app forms in the look of the PDFs ("paper forms"), provider + client (preview)
**Ashley asked:** the app's forms look basic next to the luxe PDFs; make them match, in both apps.
- Shared stylesheet `.scf*` (same block in both HTML files; source copy `scratchpad/scf.css`), with
  Cormorant Garamond + DM Sans (the PDFs' fonts, Google Fonts, Georgia/system fallback). Header band +
  spaced kicker (`_scfKicker` from the title) + serif title + her business name in the dashed "logo"
  box; underline answer lines, square check boxes, panels, uppercase "HEADING. text" labels split into
  a small heading (`_scfSplit`); footer with business · phone · website.
- Three palettes = the PDF styles. One choice: Library > Style now sets `bizInfo.formStyle` (synced,
  pushed, `_scheduleClientSync`), sent to clients as `formStyle` (additive field; client reads it in
  `applyActiveProvider` via `p.formStyle`). Older builds ignore it.
- Client: `renderFillForm` + `_fillFormFieldHTML` rewritten with classes; every id/handler kept;
  `_ffSetChoice` toggles `.on`/aria-pressed. Provider: `_formQHTML`, `_sdQHTML`, `_mcControlHTML`,
  Preview and Sign in person (signature pad on the paper).
- The Google Fonts `<link>` sits BEFORE the first `<style>`: `build-demo.cjs` needs `</style></head><body>`.
- Verified: sweep-all-forms 90 forms 0 problems, mirror 6/6, contra 9/9, ec client 16/16,
  collection 30/30, client small-screen/layout sweeps clean. (`sweep3-forms-client-resend.mjs` shows 2
  on live main too; its verified successor `v-forms-client-resend.mjs` passes.)

### §2be (cont.) 2026-10-17g — self-check now compares the libraries (preview)
`_runSelfCheck` adds: kind of app (installed / home-screen / browser), signed-in email, an IndexedDB
write/read probe, which keys are offloaded, and device vs account for session summaries (clients +
entries), logo set or not, homecare, saved client list, plus summaries open in memory. Diana runs it
once on the PHONE and once on the COMPUTER (Settings → tap the version line 5 times → Copy this report).
Compare "Which account row" and "Signed in as" first: a different row = two accounts (obs 42/45/50 fit
that); same row + device 0 vs account 1 = the phone is not reading the account in (IndexedDB line says
whether storage works). `scratchpad/test-selfcheck-libraries.mjs` 6/6.

### §2be (cont.) 2026-10-17h — devices report themselves; no more asking Diana to run checks
**Ashley (2026-10-17):** do not make Diana run the self-check; she is helping, ask her for as little as
possible — and make that a rule (CLAUDE.md §4d, providers bullet).
- `_sendDeviceReport()` (8s after boot, and on return to the front, at most every 20 min) POSTs a
  counts-only report to `/api/device-report` (`lib/device-report.js`, table `device_reports`, one row
  per provider per device key `scdev_key` — not an `sc_` key, never synced). Whitelisted fields only
  (`cleanReport`): build, kind, platform, idbWorks, summary/homecare/client counts, logo yes/no,
  offloaded keys, reload failures; the account email is added server-side from the token.
- `/api/admin/client-recover` GET adds `devices`, `sessions` (device, location, signed in, last seen,
  signed out; no IP) and `sameNetwork` (other accounts with sessions from the same IPs in 60 days).
  The screen shows them as **Their devices** right under the verdict, and the Copy paste includes them.
- For Diana: once her phone opens build 17h or later, Recover clients → esthieguild@gmail.com shows
  whether the phone is a second account (sameNetwork / Signed in as), or the same account showing
  fewer summaries than the account (and whether its IndexedDB works). Nothing for her to do.
- `scratchpad/test-device-report.mjs` 10/10.
- **LIVE 2026-10-17 (Ashley: "push it live early")**: ONLY the 17g self-check + 17h device report went
  out, applied onto main (`3fb2af6`, build `2026-10-17h`), release fast-forwarded, deploy dispatched,
  slickchart.app/api/build-id = 2026-10-17h. The rest of the preview (collection, paper forms, summary
  follows notes, mirror, Library PDFs) did NOT go out and still waits for her OK. Preview branch merged
  main back in and is now `2026-10-17i`.

### §2be (cont.) 2026-10-17j — ROOT CAUSE FOR IPHONES: the storage layer never ran in Safari
Found by running the tests in WebKit (installed at Ashley's request; `scratchpad/run-in-safari.sh`).
`localStorage.setItem = fn` (and getItem/removeItem) does NOT replace the method in WebKit: Storage
has a named-property setter, so Safari stores ITEMS called "setItem"/"getItem"/"removeItem" holding
the functions' source, and every call still reaches the built-in. Chromium honours the assignment,
so every test passed. On every iPhone/iPad/Mac Safari, therefore, since this layer was written:
- saves were NOT mirrored to the account by the setItem patch (only call sites that also call
  `_pushKeyNow` reached it) — fits obs 47 "on my phone nothing is saved";
- big lists were never offloaded to IndexedDB, so the 5MB box filled;
- the `null` guard and the boot-hydration guard never ran;
- offloaded keys were not readable through getItem (moot, since nothing was offloaded).
Fix: methods installed on `Storage.prototype`, acting only when `this===localStorage`; the public
demo's plain-object shim keeps the old assignment; the junk items are removed at boot.
Proof: `test-safari-storage-hook.mjs` — live code in WebKit 2/6 (4 FAIL), live in Chromium 6/6, fixed
6/6 in both. Upgrade path `test-safari-upgrade.mjs` (old build's data on the phone, fixed build opens
offline): 5/5, nothing lost, junk gone, next save offloads. Both engines: storage hook 6/6, offload
stale 4/4, device report 10/10, self-check 6/6, summary follows notes 11/11, collection 30/30,
contra 9/9, mirror 6/6, retired courses 7/7, draft resurrect 7/7 + 4/4, all 90 forms 0 problems.
This is the most likely explanation of Diana's whole thread (§2ai, §2ao, §2be): the computer is fine
because Chrome/Edge on her Windows laptop always ran the layer.
- **LIVE 2026-10-17 (Ashley: "push it live early")**: the Safari storage fix alone, applied onto main
  (`0c3b8ad`, build `2026-10-17j`), release fast-forwarded, deploy dispatched, live build-id
  confirmed. Tested on that exact code in Chrome AND WebKit (storage hook 6/6, upgrade-from-live 5/5,
  offload stale, device report, self-check, draft resurrect). Preview merged it back: `2026-10-17k`.

### 2026-10-17 — WHOLE PREVIEW SHIPPED (Ashley: "go ahead and push out the whole update")
release fast-forwarded to `12b12a9` (CI green), deploy dispatched, live build-id `2026-10-17k`.
Live now: Esthetician Collection (16 forms, 13 guides, Library with per-document PDFs in 3 styles +
Print), paper-form look in both apps, business details fill in, contraindication ticks + flags,
provider screens mirror the client app, Phone/email fix, summary follows provider notes, retired
lash/brow sample courses, device reports + self-check, the Safari storage fix. Diana reply drafted.

### 2026-10-17 — build `2026-10-17l` (PREVIEW ONLY): Lash & Brow Collection + Luxe/branding default
Ashley: "ok i have new ones for lash and brow professions now" (3 PDFs, 38 pages each), then "can we
have all forms across the app default to luxe style + providers branding + logo?" and "make that a
rule and be sure to follow all the other rules we discussed from the first esty collection upload".
Rule written as CLAUDE.md §1e.
- **13 forms `lb-*`, 8 guides `g-lb-*`**, generated from her PDFs by `scratchpad/lb/gen-lb.cjs` ->
  `lb-data.js` (fails on any `[bracket]` left; `{business}`/`{phone}` tokens; no card-on-file; artist
  office boxes left to the printable). Bundled like `EC_FORMS` (never stored unedited).
- **Who sees what** (`_collectionSections`): lash/brow -> `lbcoll` "The Lash & Brow Collection".
  `ecoll` is now esty/wax, PLUS a lash/brow pro who already uses an `ec-*` form (`_ecInUse`: found in
  `sc_forms`, `sc_bundles`, `sc_clients` or `sc_checkin_cfg`), so nobody loses a form she relies on.
  Guides by `profs` (lash: ext, lift, removal, retention, prep; brow: lam, tint, shape, prep). The
  `g-esty-ec-tint` guide was LEFT on lash/brow on purpose: removing a template hides her edits to it.
- **Library**: `LB_PRINT_DOCS` (34 docs, ids `lb-…`), split by `scratchpad/lb-split-docs.py` into
  `assets/lb-a5025eda48748f3494bcacd7/<style>/<doc>.pdf` + the 3 full PDFs; noindex header in
  vercel.json; `/api/collection-pdf` allow-lists the `lb-` ids and takes `?collection=lb` for the
  whole file. The tab shows only the collections that match her professions, one "Get all N pages"
  each.
- **Every form Luxe + her branding** (both apps): default `luxe` in `_scfStyle`/`_plStyle`/client
  `_st` (her pick still wins); her logo on a white tile in the header (`_scfLogoHTML`, name when no
  logo); her brand color on accents only at 4.5:1 on white (`_scfAccentStyle`). New kickers "Design
  approval" and "Client record".
- Tests: `test-lash-brow-collection` 25/25, `test-lb-client-form` 13/13 (every form signed in the
  real client page), `test-client-form-branding` 5/5, `test-esthetician-collection` 30/30 (now
  expects Luxe by default), contra 9/9, mirror 6/6, all forms swept; both engines (see commit).

### 2026-10-17 — build `2026-10-17m` (PREVIEW ONLY): the check-in matches the forms
Ashley: "yes make it match please" (the pre-visit check-in was the one client screen not on the paper
form). Client: `_renderCheckinStep` draws each step as a Luxe paper (`_scfPaperOpen`, kicker
"Pre-visit check-in", her logo + brand color); every question is a `.scf-q` row; Yes/No, levels and
the drink/music/covering grids are `.scf-opt` buttons with `aria-pressed`; photo tiles `.scf-tile`;
"What you flagged" is a `.scf-panel`. The one-page "Before your visit" package now draws the intake
AND the check-in as two papers (the intake fields there had the paper classes with no paper around
them). With nothing booked the subline no longer says "For your Not scheduled appointment"
(`_ciSubline`). Provider: `renderCheckinPreview` is the same paper with every step on one page.
Handlers, ids and payloads unchanged. `test-checkin-paper` 12/12 in Chrome and Safari (look, every
control records, submit carries flags + picks, package, provider preview). Pre-existing, NOT from
this change (same on the previous build): `sweep3-forms-checkin-resend` 2/2 and
`v-forms-checkin-resend` 1/2; the latter's client half needs the provider-side bug its own part 1
now reports SOUND, so it is a stale repro.
- **LIVE 2026-10-17 (Ashley: "yes push it")**: the roadmap sale alert wording alone (server only, no
  build bump), `2e23cab` on release, CI green, deploy dispatched, main = `2e23cab`. Preview merged it
  back (both preview branches). The rest of `2026-10-17n` still waits for 2am.

### 2026-10-17 — build `2026-10-17o` (PREVIEW ONLY): the Hair Stylist Collection
Ashley: "now we have hair stylist forms to add also" (3 PDFs, 37 pages each). Done by the CLAUDE.md
§1e rules, same as Lash & Brow: 12 forms `hs-*` (204 questions) and 8 guides `g-hs-*` from
`scratchpad/hs/gen-hs.cjs` (fails on any `[bracket]` or card-on-file text); `hscoll` "The Hair
Stylist Collection" shown to `hair` only (not barber); guides added to `hair`, stock hair forms
untouched. Library: `HS_PRINT_DOCS` (33 docs, ids `hs-…`), split by `scratchpad/hs-split-docs.py`
into `assets/hs-cd08c7917b34626fe2a21967/`, noindex in vercel.json, `/api/collection-pdf` allow-lists
the `hs-` ids and takes `?collection=hs`. Bracketed defaults resolved to the PDF's own numbers ($50 or
25% deposit, 48 hours, 7 days, 7 years); `[product name]` -> "the product named in your record".
Stylist-only result boxes (test readings, office use) stay on the printable. New header labels:
"Consultation" (service plan) and "Client record" (allergy alert / strand test).
Tests: `test-hair-stylist-collection` 17/17, `test-hs-client-form` (every form signed in the client
app), plus the form suites, in Chrome and Safari.

### §2be (cont.) 2026-10-17p — iPhone sweep + research (PREVIEW ONLY). Three fixes, each reproduced first
Ashley: "try any other sweeps on diana's issue ... make sure we have this fixed for iphones ... do deep
research". Diana's observations (47–51) unchanged: phone shows 0 summaries for Bonnie Prince and the
default logo; the computer shows the summary (Sep 25) and her logo. Both are LARGE values.
**Research** (WebKit bugs/blog, Capacitor docs/issues; full report in the session): home-screen web
app, Safari tab and the Capacitor app are THREE separate storage containers on one iPhone (WebKit bug
181849); iOS kills IndexedDB's backing process for backgrounded apps ("Connection to Indexed Database
server lost", bugs 197050/235579/273827); keepalive/sendBeacon are capped at 64KB in flight;
`navigator.storage.persist()` usually answers false on Safari 17 (bug 271401); Capacitor reloads the
page silently when iOS kills the web process; beforeunload does not fire on iOS.
**New harness** `scratchpad/test-iphone-account-scale.mjs [small|heavy]` — Chromium AND WebKit, one
context per device (IndexedDB survives relaunch), service workers blocked (Playwright cannot see a
SW-controlled page's requests in WebKit — that produced a false alarm first). Diana-shaped account.
**Found and fixed:**
1. `_lsEvictForSpace` dropped the biggest pulled key (usually `sc_clients`) from the 5MB box WITHOUT
   keeping it in `Cloud._mem`, so on a full device the client list read as empty for the session.
   Repro: heavy + IndexedDB broken, "clients: 0" with 400 on the account, both engines. Now kept in memory.
2. One failed `indexedDB.open` set `_bad` for the whole session; now only three in a row (iOS reports
   transient "connection lost" after a resume).
3. THE OUTBOX (`sc_outbox`, device-local, owner-stamped, 24h): keys with an edit the account has not
   confirmed. `_restoreOutbox()` runs after hydration, before the pull, so the pull keeps them and boot
   sends them. Repro (test G): edit check-in questions (`sc_checkin_cfg`, plain-overwrite), upload cut
   off, app closed -> OLD CODE lost the edit on the next open in all 4 runs (both engines, IDB ok/broken);
   new code keeps it and it reaches the account. Test H: another account's outbox is dropped, never sent.
   Stamped keys (brand, bizinfo) were already safe by `_ts`; union-merged maps heal by merge.
   `flushBeacon` now sends keepalive chunks under 60KB (one big value used to sink the whole beacon).
Also: `navigator.storage.persist()` requested at boot (harmless); device report gains `unsent` and
`memOnly` ("phone storage FULL") lines on the founder Recover screen.
**Residual, not fixed:** IndexedDB broken AND summaries alone over the 5MB box (heavy, WebKit): a save
lives only in memory until the upload lands, so closing the app within ~150ms of saving can lose it.
**Still the first thing to look at for Diana:** Recover clients -> esthieguild@gmail.com -> Their
devices: her phone's kind (home-screen / app / Safari), build, IndexedDB works, summaries on the device
vs the account, logo yes/no. A home-screen app and the Safari tab do not share storage or sign-in.
Pre-existing (identical on the previous build): sweep-dup-boot-pullfail 3/4 (its 26 uploads happen
AFTER the retried pull succeeds, so they seed absent keys, not overwrite), sweep-dup-boot-401-switch
2/3, sweep-dup-edge-boot 9/10, sweep2-client-settings-persist 1 confirmed. No sweep differs by engine.

### 2026-10-18 — WHOLE PREVIEW LIVE (Ashley: "push everything now"), build `2026-10-17p`
release fast-forwarded to `de69d34` (CI green on that commit), deploy dispatched, main = `de69d34`.
Live now: Lash & Brow Collection, Hair Stylist Collection, every form Luxe + her logo/brand color,
check-in on the paper form, the three iPhone storage fixes (evicted values kept, IndexedDB retry,
outbox), roadmap alert wording. **Lesson:** on 10-17 the work was reported as "goes out at 2am" but
`release` was never fast-forwarded, so the 2am run had nothing to promote and nothing went out.
When a day's work is verified, push `release` to the preview commit (CLAUDE.md §1a) — that IS the
2am delivery; saying it is not.

## 2026-10-19 — iPhone / Safari sweep (builds 2026-10-18c … 2026-10-19c, LIVE)

Four parallel sweeps: web research (52-item checklist, now `scratchpad/ios-safari-checklist.md`, with
grep patterns and fixes), a static audit of both apps against it, every screen of both apps in WebKit at
iPhone 13 and SE (156 provider + 23 client routes), and the whole 197-test suite rerun in WebKit.

Fixed (all verified in WebKit AND Chromium):
- `_icsStamp` parsed "YYYY-MM-DD 10:00 AM" (Invalid Date in Safari): manual/confirmed appointments
  dropped out of the synced calendar feed whenever an iPhone rebuilt it. `sweep-dup-boot-calfeed` 3/3.
- Safari fires no blur/change on a focused field that is removed: `nav()` now blurs it first
  (`sweep3-hc-edit-noblur` 2/2). Homecare lines, session/private notes were exposed.
- Rescue copy and client prefs used `keepalive` on bodies > 64KB: refused outright in every browser.
- `navigator.serviceWorker.ready` hangs forever if sw.js never registered: `_swReady()` (4s). The
  client's "Delete my data" used to hang after deleting on the server.
- Boot guard in both apps: blank screen on a too-old iOS now says "update your phone"; a failed script
  download says "check your connection" + Try again.
- Progress Photos sideways scroll (WebKit), clipped grids on iPhone SE (minmax(0,1fr) everywhere),
  aftercare Ask button off screen, install banner over the bottom nav.
- Delete-account fallback enumerated localStorage directly (missed offloaded keys).
- Client "Apple Calendar" opens iOS's Add to Calendar (data: URL) instead of a dead download.
- Add client / Fill intake keep unsaved typing across leave-and-return; offline + storage-full now says
  so on screen; course autosave also flushes on visibilitychange; misc (100vh fallback, -webkit-
  backdrop-filter, iOS copy fallback, password autocomplete, signature ink colour).
- iOS app: `NSSpeechRecognitionUsageDescription` added to Info.plist (ships with the next native build).

Not fixed / for later: file downloads and hidden-iframe printing inside the Capacitor app are likely
no-ops (needs `@capacitor/share` + filesystem and a device to test); some in-page tap targets under 32px;
`_formAtMs` "Jul 15, 2026 2026" is Invalid in WebKit but its retry recovers (harmless).
`run-in-safari.sh` now copies every sibling .mjs (harness imports used to fail).

**Incident:** these went live mid-day without Ashley's yes. A docs-to-main command forgot to `cd` into
the worktree, so `git push origin HEAD:main` pushed the PREVIEW branch. She chose to leave it live. The
rule added to CLAUDE.md §1a (verify the outgoing diff is content-only) exists because of this.
