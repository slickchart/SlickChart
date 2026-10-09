# SlickChart — working guidance

SlickChart is a **multi-tenant** SaaS: many independent providers (estheticians, etc.) share one
deployment and one database. Each provider's client list, photos, notes, messages, and Square data are
**private to that provider**. Their clients' contact info and health/skin notes are sensitive PII.

## 0. TOP PRIORITY — data isolation & privacy (non-negotiable)

A real incident already happened here: a **shared Square API token** let one provider's operations land
in another provider's Square directory, and cross-account copies of clients accumulated. Treat preventing
anything like this as the highest priority on every change. When a change touches data access, sync, auth,
tokens, or any query, **stop and verify isolation before shipping**. If you are unsure whether something
could leak across accounts, assume it can until you've proven otherwise.

Hard rules — never violate:

1. **Every data read/write is scoped to the authenticated caller.** Derive identity from the verified
   session token only (`providerFromReq` / `verifyToken` / `isSessionValid`). Never authorize using a
   `provider_id` / `owner` / `email` / `id` taken from the request body or query string — those are
   attacker-controlled. Every SQL query against `clients`, `kv`, `client_events`, `square_connections`,
   `providers`, etc. must have a `WHERE` that ties it to the authenticated owner.
2. **A logged-in provider NEVER falls back to a shared token.** `sqContext` (lib/square.js) resolves the
   provider's OWN Square OAuth connection or returns 401 `nosquare`. The legacy shared `SQUARE_ACCESS_TOKEN`
   is only for the original single-tenant, no-login owner path, gated behind `APP_SHARED_SECRET`. Do not
   add any code path where one authenticated account can reach another account's token or data.
3. **Client magic-link tokens expose only that client's own record** (and only their own provider's data).
   A guessed/mismatched token must never cross into another client or provider.
4. **Passwordless flows stay non-enumerable.** `client-link` and `client-code` always return a generic
   success, only ever email the address on file, and are rate-limited per email + per IP. Never reveal
   whether an email exists.
5. **Owner-only tools** (e.g. `api/admin/exposure.js`) are gated to `FOUNDER_EMAILS` via the verified
   token's email — never via a request field.
6. **Cloud sync MERGES, never clobbers, append-only data.** `Cloud.pull()` (in slickchart.html) plain-
   overwrites most `sc_*` keys with the server copy. For anything append-only or multi-device
   (`sc_clients`, `sc_msgstore`, `sc_threads`, `sc_seen_events`, tombstone keys) this causes **silent
   cross-device data loss** (a stale device wipes newer data). Those keys have dedicated merge functions
   (`_mergeClients`, `_mergeMsgStore`, `_mergeThreads`, `_mergeSeenEvents`, `_mergeTombstone`) that union
   and push the superset back. If you add a new synced key that accumulates data, give it a merge too —
   do not let it ride the default overwrite.
7. **A per-client map is a library too.** `{clientId: that client's stuff}` — `sc_client_recs` (the
   product plan), `sc_client_homecare`, `sc_session_summaries`, `sc_rec_reasons`, `sc_body_maps` —
   merges by client via `_mergeClientMap` (`_CLIENT_MAP_KEYS`). A device that had not read a client's
   entry yet used to write the map back without it and the account lost that client's plan, homecare
   list or summaries **entirely**. Union by client; the account's copy still wins where both sides
   have the client, so nothing inside an entry changes. **`sc_workspace` is the dangerous one:** it is
   a COMPOUND blob that carries copies of three of those maps, `loadWorkspace()` assigns them straight
   over the live objects, and `persistWorkspace()` pushes it immediately on every edit — so a stale
   copy of that one key clobbers the product plans even when the dedicated keys merge correctly. It
   has `_mergeWorkspace`. Anything new that bundles several libraries into one key needs the same.
8. **Union by client is NOT enough when the per-client value is itself a growing list.**
   `_mergeClientMap` keeps the ACCOUNT's copy where both sides hold a client. For
   `sc_session_summaries` that silently dropped a visit summary saved minutes earlier — the account
   held `[lastWeek]`, the phone held `[justSaved, lastWeek]`, and the pull kept `[lastWeek]`. Worse,
   it returned `changed:false`, so the device never pushed the superset back either, and the next
   logout (which purges the offloaded store) destroyed it. `_CLIENT_MAP_LIST` names the maps whose
   entries ACCUMULATE; those union by entry with the newest `_ts` winning. Do NOT add a key to it
   whose entries can legitimately be REMOVED (`sc_client_recs`, `sc_client_homecare`): unioning
   those resurrects a product she took off a plan. Ask of every merge: does the thing INSIDE grow?
   And remember a client's own record carries `c.summaries` — the client-facing copy lives only
   there, so `_unionClientForms` has to union it too.

When you add or change any endpoint, ask: *Could a different account, or an unauthenticated caller, use
this to read or write data that isn't theirs?* If yes, it's not done.

## 1. Proactive fixes (standing preference from the owner)

When you notice a small bug, correctness issue, or clear optimization while working — especially anything
in the data-safety category above — **just fix it**, don't only mention it. Keep fixes tight and verified.

**Ship it too.** When the owner brings you a bug or a fix request, you have standing permission to merge
to `main` and let Vercel deploy — don't stop to ask. Verify it first (section 2), then push. Say what you
deployed. This covers ordinary fixes; still check in before anything destructive or irreversible
(deleting data, schema drops, cancelling a live integration).

This holds even when a session is set up to work on a feature branch. A branch is fine to develop on,
but don't finish by parking the work there and asking permission to deploy — the owner has confirmed she
always wants it shipped. Merge to `main` and push once it's verified. (Re-run section 2's checks against
the merged result if `main` moved while you worked; the demos need rebuilding then too.)

## 1b. What Ashley reports is GROUND TRUTH — write it down, never re-derive it

She is looking at the running app on her own devices. You are looking at source code. When the two
disagree, **she is right and your reading is wrong.** This is not politeness, it is accuracy: every
time an inference from the code has contradicted something she stated, the inference has been wrong.

A day was lost on one bug because she said, in her first message and several times after, *"I made it
on my phone and it isn't showing on my computer."* Later a self-check was read as implying the
opposite, that was believed over her account of it, and the next fix was aimed at the wrong machine.
The direction had been established from the start.

So, before writing any code for a reported problem:

1. **Keep a running list of what she has OBSERVED** — which device, what she did, what she saw. In
   `SESSION-HANDOFF.md` under the bug. Facts she reported, not conclusions drawn from them.
2. **A new theory that contradicts an item on that list is wrong.** Discard the theory, not the
   observation. If it seems to genuinely conflict, ask one short clarifying question — do not resolve
   it by picking whichever suits the theory.
3. **Ask which device** any screenshot, report or symptom came from, and record it. The same
   self-check means opposite things from a phone and from a computer.
4. **Never re-litigate a fact she has already given.** If it is on the list, it is settled.
5. A fix that ships and changes nothing means **the reproduction was not her situation.** Go back to
   her observations, not to a fresh theory.

## 1c. NEVER say a feature doesn't exist without checking `FEATURES.md` first

This cost a day and nearly cost a provider 38 photos. Asked why photos weren't saved to the server,
a session answered that they were device-only and told Ashley Heather's were gone. **They had been
uploaded, one at a time, to the server for three weeks.** The claim came from reading a single
comment in `_exportAllData` — "Session photos are not included, they stay on this device" — which is
true of the EXPORT and says nothing about backup. `_backupPhotosToServer` was three functions away.
Nothing was missing but a grep.

`FEATURES.md` at the repo root is generated from the source by `scripts/build-feature-map.cjs` and
checked by `check-generated.cjs`, so it cannot drift. It holds:

- **What leaves the device** — every client→server call with the function that reaches it, following
  helper chains up to 3 hops. **This is the answer to "is X saved anywhere."** It over-reports on
  purpose: a spurious row costs a moment, a missing one cost a day.
- Every endpoint with its methods, auth gate and purpose; every server table; every synced `sc_*`
  key and exactly how it merges; and every recovery/repair path **with whether anything can reach
  it**.

The rules:

1. **Read it before answering any "does SlickChart do X" or "is X saved / recoverable" question.**
   An absence there is evidence; your memory of the code is not.
2. **Never tell Ashley a capability is missing, or that data is unrecoverable, from inference.**
   Grep first. Every single time an inference has contradicted the code, the inference was wrong.
3. **A recovery tool flagged "NO — nothing calls it" is a bug**, not a spare part. `_openPhotoRecovery`
   sat unreachable for weeks — working code, no button — while a provider was told her work was gone.
   Wire it up or delete it.
4. Regenerate it when you add an endpoint, a synced key, or a recovery path. `check-generated.cjs`
   runs it and fails the build if the committed copy is stale, so this is enforced, not remembered.

Being wrong about what the product does is worse than not knowing, because Ashley acts on it: she
tells a provider their work is gone. "I'll check" is always available and costs one command.

## 2. Verify before claiming "fixed"

Never tell the owner something is fixed without proof. For JS/UI changes, drive the app headless with the
pre-installed Chromium and confirm the actual behavior:
`import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const {chromium}=pw;`
executablePath `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Note: `CL` and `Cloud` are `const`
bindings — mutate in place (`Object.keys(CL).forEach(k=>delete CL[k])`), don't reassign `window.CL`.
Top-level `function` declarations ARE overridable window props (handy for stubbing `_sqFetch` in tests).
The proxy blocks live `slickchart.app`, so test against the local file with routed/mocked `/api/**`.

## 3. Architecture & build

- **Single-file apps:** `slickchart.html` (provider app, ~2MB+), `slickchart-client.html` (client PWA),
  `index.html` (landing), `get.html` / `mylink.html` (redirect / self-serve link pages).
- **The client HTML is embedded** into `api/client-page.js` as `RAW_HTML`. If you edit
  `slickchart-client.html`, regenerate that embed (`node scripts/build-client-page.cjs`).
- **Demos** are generated from the source HTML: run `node scripts/build-demo.cjs` **from
  `slickchart-vercel/`** after editing `slickchart.html` / `slickchart-client.html`, and commit the
  regenerated `*-demo.html`.
- **Marketing pages are generated too.** `node scripts/build-switch.cjs` builds `/switch` from
  `switch-src/`; `node scripts/build-blog.cjs` builds `/blog` from `blog-src/` **and owns
  `sitemap.xml`** (it includes the switch pages, so run it last). Both share
  `scripts/lib/site-chrome.cjs` + `md.cjs`. A `/switch/from-<platform>` page only publishes when it
  has hand-written copy AND `import-profiles.json` marks that platform `verified: true` — meaning a
  person actually followed its export path in the live product. Never set that flag from docs, a
  search, or memory, and never generate those pages by swapping a name into a template (scaled
  content abuse). See `switch-src/README.md`.
- **Deploy:** Vercel auto-deploys from `main`. Push to `main`. JS runs live from the server, so JS fixes
  reach the native app without an app-store resubmit; native *plugin* changes need a rebuild.
- **Git:** run git from the repo root `/home/user/SlickChart` (not the `slickchart-vercel/` subdir, or
  pathspecs won't match).
- **Device storage:** localStorage is a hard 5MB in Safari and does not grow, so it holds settings and
  small lists only. Any value ≥ 24KB is written to IndexedDB instead (`_lsPersist` → `_offloadEligible`),
  mirrored in memory, and hydrated back by `_hydrateOffloaded()` at the top of `_cloudInit`. `getItem`,
  `setItem` and `removeItem` are all patched, so ordinary call sites need no change — but **never
  enumerate `localStorage` directly**: use `_lsAllKeys()` (localStorage ∪ offloaded) and `_lsGet(k)`,
  or you will silently skip the client list. `sc_room_draft_*` and `sc_captured_photos` are excluded on
  purpose (they exist as the backup *outside* IndexedDB) and must stay excluded. Signing out must clear
  the offloaded store too — `_doLogout` awaits `_purgeOffloaded()`, and the store is stamped with its
  owner so another account's cache is thrown away rather than read. See SESSION-HANDOFF §2e.
- **One `try{}catch{}` around a list of loaders is a silent single point of failure.** `_reloadAll()`
  was ~30 bare statements in one try. A throw in statement 6 meant `loadForms()` (statement 14) and
  every loader after it never ran — so her forms, clients, messages and Square all silently stopped
  reloading after a sync, with no error anywhere. It cost eleven builds. Independent loaders each get
  their own wrapper (`_reloadStep`), failures are recorded, and the self-check prints them. See
  SESSION-HANDOFF §2ac.
- **Sweeps that run in CI** (`.github/workflows/no-demo-data.yml`) — all three exist because a real
  bug got past everything else:
  - `check-reload-coverage.cjs`: every loader that reads a synced `sc_*` key must be a step in
    `_reloadAll()`. If it isn't, a change made on one device lands on another device's disk and
    never reaches its screen. A sweep found **26** loaders in that state.
  - `check-merge-coverage.cjs`: a NEW synced key that accumulates data may not join the plain
    -overwrite path (§0.6) without a recorded decision.
  - `scratchpad/sweep-crossdevice.mjs` (run by hand): makes a real item in ten libraries on one
    device and requires it on the other. Run it after ANY change to sync, storage or a loader.
- **A merge needs a delete record.** Union-by-id without one resurrects everything the provider
  deleted. `_mergeAuthoredById(server, local, hiddenKey)` is the shared implementation; the delete
  key goes in `_TOMB_OBJ` so cancellations union across devices too. Appointments use
  `sc_deleted_appts`, forms `sc_hidden_forms`, courses `sc_hidden_courses`, guides
  `sc_hidden_guides`. Stamp `_ts` on create AND on edit, or the newer version cannot win.
- **Boot's own write-backs are not edits — in BOTH paths.** During boot the in-memory libraries hold
  the DEFAULTS, because the account's data has not been read in yet, so anything that persists or
  queues during boot is writing defaults over real data. This bit twice:
  1. *The queue.* Loaders normalise and re-seed on open, queuing a write of the defaults.
     `Cloud.pull()` skips keys with a pending local write, so it skipped the account's real data and
     then pushed the defaults up over it. `Cloud._bootQueued` marks those so the guard ignores them.
  2. *Navigation.* `_savePersistenceSweep()` persists everything on every `nav()`, and boot
     navigates (Home draws before the network answers). A nav landing between the pull storing the
     account copy and `_reloadAll()` reading it back wrote the defaults over it — racy, so it failed
     about one run in three. It now returns immediately while `Cloud._booting`.
  **Anything new that writes on a timer, a nav, or an unload needs the same guard.** See
  SESSION-HANDOFF §2ad.
  **But do NOT gate a new guard on `Cloud._booting`:** `bootDone()` clears it BEFORE flushing the
  boot batch, so a boot-time upload reads as post-boot. Four fixes failed on exactly that.
- **`_idsOf` has to RECOGNISE the shape or the shrink guard silently skips the key.** It returns
  null for anything it does not read as a record collection, and `_dropBootShrinks` then does
  nothing at all for that key — no warning, no trace. It missed two whole shapes: a map whose
  values are LISTS (`{clientId:['p1','p2']}` — the product plans) and a compound blob whose values
  are mixed (`sc_workspace`, handled separately by `_compoundIds`). Both are now covered. Keep the
  rule narrow in the other direction though: an object of SCALARS is a settings blob, clearing a
  field there is legitimate, and an earlier version of this guard read that as data loss and blocked
  the save. There is a regression test for exactly that.
- **An upload may only shrink a library if the missing ids were DELETED.** `_dropBootShrinks()` runs
  on every upload path and compares against `Cloud._serverSeen`; dropped ids must appear in one of
  the `_TOMB_OBJ`/`_TOMB_ARR` delete lists or the key is held back. This is what stops a device
  putting its starter content over a real account (§2ae).
- **`scripts/check-tenant-isolation.cjs` (CI)** reads every endpoint for §0.1: identity from a
  request field, and SQL on a per-provider table with no owner in it. Its ALLOW list holds three
  reviewed exceptions — re-read those files if they change rather than trusting the entry.
- **Scale harnesses** (`scratchpad/`, run by hand): `freshaudit.mjs` boots a BRAND-NEW account and
  reports every key it stores and byte it uploads — none of it is her data, so anything it finds is
  the app seeding itself into her account (a fresh profile is 7.8KB; it was 82KB before slim forms).
  `scaleaudit.mjs` seeds a busy practice (~3MB) and reports boot timing, every upload with its
  largest keys, per-screen render time and DOM nodes, and device storage by key. Run both after any
  change to sync, storage or a loader. **Open, serious, unfixed: on a busy account boot uploads 5
  stock courses over her 60 and the account holds only those for ~3.6s until a second pull merges
  them back — SESSION-HANDOFF §2ae has the evidence and what is already ruled out.**
- **Compare sync values by MEANING, not bytes** (`_sameSyncValue`). Loaders normalise as they read,
  so identical data comes back with its keys reordered and an exact string compare calls it an edit.
- **Before every commit: `node scripts/check-generated.cjs`** (from `slickchart-vercel/`). It runs all
  five build scripts (the four page builders plus `build-feature-map.cjs`, see §1c) and fails if anything generated changed — the same thing CI checks. A commit
  once carried a demo page 17 lines behind `slickchart.html` because the demo was built and then the
  source was edited again; the build went red and sent an alarming email on a day full of real
  fixes. Nothing a provider uses was affected (the demos are the public sample), but one command
  makes it impossible. NOTE: GitHub emails the failure and not the recovery, so when a red build
  turns up, check whether a LATER run went green before treating it as live.
- **DB:** Postgres (Neon) via `lib/db.js`. Tables: `clients`, `client_events`, `kv` (per-owner key/value
  sync store), `providers`, `square_connections`, plus small helpers. `@neondatabase/serverless` isn't
  installed in the scratch env, so `node --check` a file for syntax rather than importing it locally.

## 4. The weekly blog drafts — RE-POINT THESE IN A NEW SESSION

**There are TWO blogs and TWO Routines.** Each writes one draft every Monday and reports it in the
conversation for Ashley to review. Neither publishes: new posts carry `draft: true`, which produces no
page and no sitemap entry, so nothing reaches the live site until she says so.

| Blog | Source | Served at | Routine | Cron |
|---|---|---|---|---|
| SlickChart (solo estheticians) | `blog-src/` | `/blog` | "Weekly SlickChart blog draft" `trig_01Kpq3HtFnWqgea1bUozHbbM` | `0 14 * * 1` |
| Build Your Own App | `build-blog-src/` | `/build/blog` | "Weekly Build blog draft" `trig_01JeGumaZUvUoy6aBCSxJS38` | `0 15 * * 1` |

**Both Routines are BOUND TO ONE SESSION.** As of 2026-09-16 that is
`session_01A4GwJis96cYnvN4yMbpBtt` for both.
(The SlickChart one was re-pointed 2026-09-15 from `trig_01GLnvYt3jrAhjPPCQZFY9Uw` /
`cse_014uZePRTjnrVD5MwGzq6Tde`, which fired on 2026-09-14 into a session Ashley was not reading. That
old trigger is deleted. The Build one was created 2026-09-16.)

**If you are a new session, check this early and fix it — for BOTH.** A Routine bound to a retired
session delivers nowhere, and the weekly post stops without any error Ashley would ever see. Run
`list_triggers`; if either Routine is bound to a session that isn't this one, re-point it: delete it and
re-create it with the same prompt (`create_trigger` with NO `create_new_session_on_fire` and
NO `persistent_session_id` binds to the calling session). Update the ids above, and tell Ashley you
moved them.

**Do not "fix" this by making it spawn a fresh session per fire.** That was tried on 2026-09-10 and
failed silently — the spawned session had no repo checkout, so it produced no draft, no commit, and
reported SUCCEEDED anyway. Bound-to-a-live-session is the arrangement that works.

Ashley wants the report in the conversation, not as push or email, so neither Routine stores
notification channels. Each blog's own docs — frontmatter, the draft/publish flow, the writing rules,
and the positioning to lead with — are in its own `README.md`, and its topic queue in its own
`TOPICS.md`: `slickchart-vercel/blog-src/` for SlickChart (where the rule against stating a
competitor's pricing from memory lives) and `slickchart-vercel/build-blog-src/` for Build (where the
**no income claims, ever** rule lives — that one is FTC exposure, not style).

**One script builds both blogs.** `node scripts/build-blog.cjs` reads both source folders and owns
`sitemap.xml`. Don't split it: a second generator writing its own sitemap would silently clobber the
first one's entries.

## 4b. Where the last session left off

`SESSION-HANDOFF.md` at the repo root records what shipped recently, what's still open or waiting on
Ashley, and the collision points for anything new added to this deployment. Read it early — it's state,
not rules, and it's where the "this is already done" and "this will fail silently" notes live.

## 4c. Drafting replies to PROVIDERS (standing rule from Ashley)

When Ashley asks for a reply to a provider who reported a bug, these are emails to a busy
esthetician, not a status report.

- **Do NOT explain what went wrong.** No mechanism, no cause, no "here is why it happened". She has
  said plainly that providers do not need it and probably do not want it. One short line that it is
  fixed is enough.
- **Lead with thank you.** Name the specific thing they did that helped, if there was one (Diana's
  navigate-away-and-back workaround was the whole diagnosis). People who report bugs well are worth
  keeping.
- **Ask for whatever is still unknown**, and say plainly what would help. This is usually the real
  job of the email.
- **Say what they should do**, if anything, in a numbered or bolded step.
- **Be honest about what might not be recoverable.** Never promise data is coming back.
- Reading level around 3rd grade, short sentences, **no em dashes**, fewer words is better.

The long technical version belongs in this conversation and in SESSION-HANDOFF.md, not in the email.

## 5. Tone with the owner

The owner (Ashley, a solo esthetician) runs her real business on this and has been through a stressful data
scare. Lead with plain answers, own failures without defensiveness, don't pile on complexity, and don't
over-claim. One-time fix tools belong tucked out of the everyday UI once their job is done.
