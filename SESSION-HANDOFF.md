# Session handoff — 2026-09-13 (updated later the same day)

Written at the end of a long session so the next one starts informed. `CLAUDE.md` is the standing
guidance and still governs; this file is *state*: what shipped, what's unfinished, and what will
break quietly if nobody touches it.

---

## 1. READ THIS FIRST — the Monday blog Routine is bound to a session

`CLAUDE.md` §4 explains the mechanism. The current binding is:

- trigger `trig_01GLnvYt3jrAhjPPCQZFY9Uw`, cron `0 14 * * 1`
- bound to session `session_01E9AMWK4twG2pqR4mubE8kZ` (re-pointed 2026-09-13 from `session_01CZMvRH7xvPvUcct8SU5cbm`)

**A Routine bound to a retired session delivers nowhere and fails silently** — no draft, no error,
and Ashley would never see it stop. If you are a new session, run `list_triggers`, and if it is still
pointing at a session that isn't you, delete it and re-create it with the same prompt (`create_trigger`
with **no** `create_new_session_on_fire` and **no** `persistent_session_id` binds it to you). Then
update the ids in `CLAUDE.md` §4 and tell Ashley you moved it.

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
