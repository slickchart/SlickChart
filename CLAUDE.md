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

## 0b. Ashley's paid sign-up alerts must never silently stop (her rule, 2026-10-21)

Her words: *"this has happened a few times over now where these notifications stop working and it is
never straight forward to bring them back. can you please make sure this stops happening and write a
rule to prevent us from having to do this a fifth time"* — specifically the **paid provider** push.
It broke four times. Each time the email arrived, the bell showed it, the phone stayed silent, and it
took a day of "push this, run the test, send a screenshot" to fix. These hold from now on:

1. **Every signed-in device of hers gets every founder alert.** Never pick one, never dedupe by
   device, never send only to the newest. Her words: *"If I am logged into slickchart on a device, I
   want the notifications there."* All founder alerts go through `pushFoundersReport` (lib/fcm.js),
   which resolves her accounts ONE way (`founderAccounts()`: FOUNDER_EMAILS -> providers.email plus
   `founder_accounts` seen by a verified founder session). Do not add a second lookup anywhere.
2. **A phone links itself, on every way in, with no tap from her:** cold launch signed in, signing in
   on the front door, coming back to the app (30 min throttle), every 6 h while open. An address Google
   refuses is checked on save (`validate_only`) and replaced by the phone itself. Sign-out unlinks.
   A client link opened in the app can never take a provider's address (`api/native-push.js`).
3. **Diagnose by READING, never by asking her.** `GET https://slickchart.app/api/admin/push-state`
   with `Authorization: Monitor <key from /mnt/project-files/feedback-monitor/monitor.key>` (she
   authorized this) shows her accounts, every linked phone, every device she has USED with whether it
   is on the alert list (from its own device report), a `problems` list in words, and the masked
   record of every recent alert. `POST ...?send=1` sends her a test. Read it FIRST. Never ask her to
   run the test button, send a screenshot, or push a diagnostic build to learn something it shows.
   The preview is behind Vercel login, so this only works on the live site.
4. **CI guards the server paths** (`no-demo-data.yml`, "Founder sign-up alerts reach every one of
   her devices"). Any change to `lib/fcm.js`, `lib/push.js`, `api/native-push.js`,
   `api/stripe-webhook.js`, `api/signup.js`, `lib/build-sales.js`, `api/admin/test-push.js`,
   `api/admin/signups.js`, `lib/device-report.js` or the app's `_initNativeProvider` /
   `_flushNativePushTok` also runs the Chromium tests in `scratchpad/founder-push/ui-*.mjs`. Never
   loosen a guard to get green.
5. **The daily feedback brief checks it.** If push-state's `problems` is not empty, the brief says
   so plainly and the fix is prepared the same day, before the next sign-up is missed.
6. **When she reports a missed alert:** read push-state, then `recentAlerts` for that sign-up
   (`devices`/`sent`), then `SESSION-HANDOFF.md` §2k. Her observations (which phone, what she saw)
   are ground truth (§1b). Do not tell her it is her phone's settings unless push-state shows it.

## 1. Proactive fixes (standing preference from the owner)

When you notice a small bug, correctness issue, or clear optimization while working — especially anything
in the data-safety category above — **just fix it**, don't only mention it. Keep fixes tight and verified.

**Ship it, but through §1a.** Never leave verified work parked on a branch with a question attached —
Ashley has said repeatedly she always wants fixes shipped, and "shall I deploy?" is not a question she
wants to answer. But as of **2026-10-11 she no longer wants pushes landing on `main` mid-day**, because
an edit reached providers while they were working. §1a is the route. Follow it; don't go round it, and
don't go back to pushing `main` directly.

## 1a. How work reaches providers — the release train (her rule, 2026-10-11)

She asked for this after an edit disturbed providers who were using the app. **Do not push to `main`.**

1. **Develop on THE preview branch — one, always the same (her rule, 2026-10-17):** *"we should only
   ever have one branch preview so i dont need a new link every time."* All app work goes on the
   session's designated branch (currently `claude/friendly-dirac-n55456`), whose Vercel preview she
   keeps open: provider app
   `https://slick-chart-git-claude-friendly-dirac-n55456-slick-chart.vercel.app/slickchart.html`,
   client app `.../space?c=<client token>` on the same host. Never start a second branch for a
   change, and never give her a different preview link. (On 2026-10-16 the Esthetician Collection
   went to its own branch; she opened her usual link and reported "none of the forms are anywhere
   on the preview".) After a 2am promotion, keep building on that same branch.
   **The two preview links are ONE (2026-10-17):** she also keeps
   `https://slick-chart-git-claude-build-beauty-preview-slick-chart.vercel.app/build` open, and on
   2026-10-17 it still showed the "Do the math" section removed a day earlier, because that branch
   was never updated. Her words: *"this should be the only link we ever use."* So
   `claude/build-beauty-preview` and `claude/friendly-dirac-n55456` now point at the SAME commit:
   **every push goes to both** (`git push origin HEAD:claude/friendly-dirac-n55456
   HEAD:claude/build-beauty-preview`). Whichever link she has open is then current; never let them
   drift.
2. **Verify it yourself first** (§2, plus the sweeps in §3 if you touched sync, storage or a loader).
   The gate below is hers, not a substitute for yours.
3. **Push the branch** and give her its Vercel preview URL so she can click it. CI runs on every
   branch push, so the sweeps have reported before she looks.
4. **She says ship it.** Then fast-forward `release` to that commit and push `release`.
5. **`.github/workflows/deploy-at-2am.yml`** promotes `release` to `main` overnight and Vercel deploys.
   **Since 2026-10-19 that means as soon as the date turns over in Pacific time** (Ashley: "whenever
   the date shifts to the next day, e.g. 12:00am"). The file keeps its old name; "2am" anywhere in
   these notes now means "overnight, after midnight Pacific". GitHub runs scheduled jobs hours late
   and sometimes not at all, so it is scheduled hourly 07:07-12:07 UTC and a scheduled run only ships
   between 12:00am and 5:59am Pacific; the first one in that window promotes, the rest do nothing. It is fast-forward only, it refuses a commit whose
   checks are not green, and it does nothing at all when `release` and `main` already match.
   `workflow_dispatch` on that workflow is the "ship it now" button.
   **Since 2026-10-30 a Claude scheduled task also starts it at 12:15am Pacific every night** (Ashley
   chose this after GitHub started the scheduled run after 6am five nights running, so nothing she
   approved shipped). It is "Overnight update start" (`trig_01KogRim1WbHZEXV9qHmejpQ`), bound to the
   feedback-monitor session; it dispatches only when `release` differs from `main`, and the workflow's
   own green-check and fast-forward gates still decide. That nightly start is HER standing choice;
   it is still never a reason to dispatch by hand during the day.

**`release` IS her approval.** Nothing may be pushed to it that she has not said yes to. That is the
whole mechanism — treat a push to `release` exactly as seriously as a push to `main` used to be.

**NO EARLY PUSHES unless she says so, for THAT change (her rule, 2026-10-14):** *"make sure we are
building all of today's edit on the preview branch and not pushing out each edit live. the whole point
of that is to not glitch anyones app as they are currently working during the day. they should all
stay on the preview branch until a 2am deployment, or unless i say push it live early. make this a
rule please."*

- Every app edit during the day lands on the branch and its preview. **Never run `deploy-at-2am.yml`
  by hand** and never push `main` for an app change, not even for a bug she reported, unless she
  says "push it live early" (or plainly the same) **about that change, in that message**.
- An earlier "push it right away" covers only the change it was said about. It is NOT standing
  permission. On 2026-10-13/14 one such yes was treated as standing and several edits were
  dispatched live mid-day; that is what this rule stops.
- When the day's work is verified, tell her it is on the preview and will go out at 2am. Pushing
  `release` so the overnight run carries it is what her "until a 2am deployment" asks for; still
  never `workflow_dispatch` it.
- Content and marketing (below) are unchanged: they never touch the app a provider is using.

**Content and marketing go STRAIGHT TO `main`, no train, no asking** (her rule, 2026-10-12: *"for
these blog/posts you can always go ahead and commit to main since it is not interfering with the
actual app"*). A blog post, a marketing page or a doc cannot disturb a provider mid-appointment,
because none of it is the app she is working in. So commit it to `main` and let Vercel deploy. Say
what went live.

The test is **"does this change the app a provider is using?"**, and it is answered by the file list,
not by how the change feels:

- **Straight to `main`:** `blog-src/`, `build-blog-src/`, `blog/`, `build-blog/`, `switch-src/`,
  `switch/`, `gbp-posts/`, `sitemap.xml`, any `.md` (this file and `SESSION-HANDOFF.md` included),
  and the hand-written marketing pages `index.html`, `build.html`, `free.html`.
- **Through the train, always:** `slickchart.html`, `slickchart-client.html`, `api/`, `lib/`,
  `scripts/`, `vercel.json`, `.github/`, anything native. `scripts/` is on this side because a build
  script regenerates pages a provider loads, and `vercel.json` routes them.
- **A diff that touches both sides is an APP change.** Split it, or run the whole thing through the
  train. Do not wave a marketing file past the gate because most of the commit was content.

**After a content push to `main`, fast-forward `release` to `main`** when `release` is behind it
(`git merge-base --is-ancestor origin/release origin/main` then `git push origin origin/main:release`).
Everything on `main` is already live, so this approves nothing new, and it keeps the 2am run from
reading "main moved on its own" as a divergence: on 2026-10-18 it failed and emailed Ashley a false
alarm after a landing-page push. (The workflow itself now treats "main ahead of release" as nothing
waiting, from the preview commit `27324dc` once it ships.)

**Before ANY push to `main`, prove the outgoing diff is content only** (2026-10-19: a docs commit forgot
to `cd` into its worktree, so `git push origin HEAD:main` pushed the whole preview branch live mid-day).
Use `git -C <worktree>` for every command instead of relying on `cd`, and run
`git -C <worktree> diff --name-only origin/main HEAD` right before the push: every path must be on the
content list above, or the push does not happen.

Still run `node scripts/check-generated.cjs` first: a content commit that forgets the generated page
or the sitemap is exactly what that check exists for.

Still check in before anything destructive or irreversible (deleting data, dropping a column,
cancelling a live integration) — the train does not make those safe.

### What a preview URL can and cannot test

- **A preview uses the REAL database and the REAL env vars.** There is no staging database. Anything
  done on a preview is live data. Never tell her a preview is a safe place to try deleting something.
- **Square and Google OAuth cannot be completed on a preview.** `SQUARE_REDIRECT_URI`
  (`lib/square.js`) and `APP_ORIGIN` (`api/google-cal.js`) are pinned to the live origin on purpose,
  so Connect bounces her back to `slickchart.app` to finish. Those two flows are only testable after
  promotion.
- **Crons do not run on previews** (Vercel runs `vercel.json` crons on production only), so a preview
  cannot double-send reminders or check-ins.

### The compatibility that actually matters here (not SQL)

Generic advice says "make migrations backward-compatible". That is already true and is not the risk:
there is no migrations folder, every schema change is `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF
NOT EXISTS` inside the lib that needs it, and there is no `DROP`, `RENAME` or `TRUNCATE` anywhere in
`lib/` or `api/`. Keep it that way — add columns, never rename or drop one the live code reads, and
make a removal a separate change she approves on its own.

The real exposure is that **the app's JavaScript is served live, so a provider who has the app open
keeps running the OLD code against the NEW server until she next launches it** (the build check in
`_checkForNewBuild` runs once at boot and is latched, so a deploy never reloads a page out from under
her — a provider picks up new code at her next launch, not mid-note). So:

- **An API response shape must stay readable by the previous build.** Add fields; never rename,
  repurpose or remove one the shipped build reads.
- **A synced `sc_*` key's shape must stay readable by the previous build**, and the new build must
  still read the old shape — for at least one release, in practice longer, because a provider's
  second device may not have launched in weeks. Keep reading both. This is why the homecare lines
  added on 2026-10-10 stayed plain strings instead of becoming objects.
- Changing either of those is exactly the case for the overnight run, never the carve-out.

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
2b. **"Does the feature exist" and "did THIS provider's data survive" are different questions, and
   grepping only answers the first.** Heather's notes were on the server AND the diagnosis saying so
   was already in the conversation, and a loss sentence still got drafted. For a specific provider,
   the only acceptable evidence is the founder recovery screen's own numbers — typed characters per
   client, library sizes, `Earlier copies`, and the photo counts. Read them, quote them, then speak.
   If those numbers are not in front of you, the answer is "I need to check", never "it is gone".
3. **A recovery tool flagged "NO — nothing calls it" is a bug**, not a spare part. `_openPhotoRecovery`
   sat unreachable for weeks — working code, no button — while a provider was told her work was gone.
   Wire it up or delete it.
4. Regenerate it when you add an endpoint, a synced key, or a recovery path. `check-generated.cjs`
   runs it and fails the build if the committed copy is stale, so this is enforced, not remembered.

Being wrong about what the product does is worse than not knowing, because Ashley acts on it: she
tells a provider their work is gone. "I'll check" is always available and costs one command.

## 1d. A provider reported a problem — the intake, in this order

The 2026-10-09 session cost Ashley hours it did not need to, and almost none of that was the bug.
It was asking her to run the same screen FOUR times because each round added a diagnostic that
should have been there already, plus three wrong theories chased in between. Heather's notes and
photos were on the server the whole time. Do it in this order instead.

**1. Write down what the provider OBSERVED, before any theory.** §1b. Which device, what they did,
what they saw. Into `SESSION-HANDOFF.md` under the bug. A later theory that contradicts an item on
that list is wrong — discard the theory, not the observation.

**2. Ask Ashley for ONE paste, once.** Admin → Recover clients → the provider's email → **Copy**.
That paste is deliberately complete, so do not ask for a second run unless the data genuinely
changed. It contains:

- `>>> ` **the verdict** — whether their work is on the server, in words. Read this FIRST.
- what they typed, per client, in characters, including unfinished note drafts
- every client: showing / removed / re-nested under another client
- their saved libraries and sizes, and which are missing server-side
- what their app's OWN list holds vs what the server has — the two can be inverted
- photos: on the server, named by the index, recoverable orphans, index entries with no bytes
- Earlier copies kept automatically, which is what can be put back
- their device's delete record

**3. Read the verdict line before writing a single word to anyone.** §4c. If it says the work is on
the server, it is not lost, and no email may say otherwise.

**4. Only then form a theory,** and check it against the observation list from step 1 before acting.

**5. Check `FEATURES.md` before concluding a capability is missing.** §1c. Twice in one day a
feature that existed was reported as absent.

If something is missing from that paste, ADD IT TO THE PASTE in the same change as the fix, so the
next provider costs one round trip. That is the whole point of it being one screen.

## 1e. How every form looks, and how a new form collection goes in (her rules, 2026-10-17)

**Every form defaults to Luxe with the provider's own branding** (*"can we have all forms across the
app default to luxe style + providers branding + logo? make that a rule"*). In BOTH apps a form is
drawn as a `.scf` paper form: Luxe unless the provider picked Neutral or Blush in the Library (her
pick, `bizInfo.formStyle`, always wins), her logo (`brandColors.logoDataUrl`, sent to clients as
`brand`) in the header corner, her business name there when she has no logo, and her brand color on
the accents only when it reads at 4.5:1 on white (`_scfAccentStyle`). `_scfStyle`, `_scfAccentStyle`
and `_scfLogoHTML` exist in both HTML files and must stay the same. A new form screen uses
`_scfOpen`/`_scfClose` (provider) or `_scfPaperOpen` (client); never a second look. That
includes the pre-visit check-in (wizard, the one-page "Before your visit" package, and the provider's
check-in Preview), which moved onto the paper form in `2026-10-17m` (`test-checkin-paper`).

**A new collection upload (Ashley's PDFs) follows the Esthetician Collection's rules, all of them**
(*"be sure to follow all the other rules we discussed from the first esty collection upload"*).
The Esthetician (`ec-*`), Lash & Brow (`lb-*`), Hair Stylist (`hs-*`), PMU (`pm-*`), Nail Artist
(`na-*`), Massage Therapist (`mt-*`), Head Spa (`hd-*`) and Tattoo Artist (`tt-*`) Collections are the worked examples (generators: `scratchpad/lb/gen-lb.cjs`,
`scratchpad/hs/gen-hs.cjs`, `scratchpad/pm/gen-pm.cjs`, `scratchpad/na/gen-na.cjs`, `scratchpad/mt/gen-mt.cjs`, `scratchpad/hd/gen-hd.cjs`, `scratchpad/tt/gen-tt.cjs`; `scratchpad/wire-collection.cjs` puts a generated one into the app):

1. **Transcribe, do not invent.** Every question, consent line and guide tip comes from her PDF.
   No `[bracket]` placeholder survives (the generator exits on one; the test checks again). Her
   business name, phone and email are `{business}` / `{phone}` / `{email}` tokens (`_bizFill`).
2. **Bundled, never stored unedited.** `XX_FORMS` merges into `formTmpls` only where absent;
   `persistForms()` stores only her changes; a send snapshots the form. Fully editable like any form.
3. **Its own section, shown to the right professions** (`_FORM_DEFS_BY_PROF.<x>coll` via
   `_collectionSections`, excluded from `_workKinds`). Never take a collection away from a provider
   who already uses it (`_ecInUse` keeps the Esthetician Collection for a lash/brow pro who edited,
   bundled, connected or sent one). Guides go into `guideTemplatesByProf` by profession, deduped,
   ADDED to the stock ones, never replacing them.
4. **No card-on-file question** (SlickChart cannot store a card). **A virtual consult uses the
   in-app Photo consult**, never "email photos". Artist-only office boxes stay on the printable.
5. **Provider controls mirror the client's**: Yes/No and single select are pick-one buttons,
   multiple choice and contraindications are tick boxes (`input.ci-tick`), and a ticked
   contraindication is flagged on both sides. "Check", not "tick", in client wording.
6. **The Library**: split each style's PDF per document (`scratchpad/ec-split-docs.py`,
   `lb-split-docs.py`, `hs-split-docs.py`, `pm-split-docs.py`, `na-split-docs.py`, `mt-split-docs.py`, `hd-split-docs.py`, `tt-split-docs.py`, page map asserting every page used once) into a NEW unguessable
   `assets/<x>-<random hex>/` folder with the `vercel.json` noindex header; the addresses come only
   from `/api/collection-pdf` (allow-listed ids, session + subscription gate). The Library shows
   only the collections that match her professions, one "Get all N pages" per collection.
7. **Test it the same way**: a provider test (`test-esthetician-collection`,
   `test-lash-brow-collection`, `test-hair-stylist-collection`, `test-pmu-collection`, `test-nail-artist-collection`, `test-massage-collection`, `test-head-spa-collection`, `test-tattoo-collection`), every form filled
   and signed in the real client page (`test-ec-client-form`, `test-lb-client-form`, `test-hs-client-form`,
   `test-pm-client-form`, `test-na-client-form`, `test-mt-client-form`, `test-hd-client-form`, `test-tt-client-form`), and `sweep-all-forms`, `sweep-form-mirror`,
   `test-contra-ticks`, `test-client-form-branding` in BOTH Chrome and Safari (`run-in-safari.sh`).
8. **Release train as always**: the one preview branch, out at 2am unless she says "push it live
   early" for that change.

## 2. Verify before claiming "fixed"

Never tell the owner something is fixed without proof. For JS/UI changes, drive the app headless with the
pre-installed Chromium and confirm the actual behavior:
`import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const {chromium}=pw;`
executablePath `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Note: `CL` and `Cloud` are `const`
bindings — mutate in place (`Object.keys(CL).forEach(k=>delete CL[k])`), don't reassign `window.CL`.
Top-level `function` declarations ARE overridable window props (handy for stubbing `_sqFetch` in tests).
The proxy blocks live `slickchart.app`, so test against the local file with routed/mocked `/api/**`.

**Test in Safari's engine too, not only Chrome (2026-10-17).** Every iPhone runs WebKit, and Chromium
behaves differently in ways that matter here: `localStorage.setItem = fn` silently did nothing in
Safari, so the entire storage layer (offload to IndexedDB, mirroring saves to the account, the
guards) never ran on any iPhone, while every Chromium test passed. WebKit is installed for Playwright
(see `scratchpad/run-in-safari.sh`); `bash scratchpad/run-in-safari.sh scratchpad/<test>.mjs` runs any
existing test in it unchanged (it also blocks the service worker, which in WebKit answers `/api/**`
itself). Run anything touching storage, sync, boot or the native app in BOTH engines.
`scratchpad/test-safari-storage-hook.mjs` is the regression test for the hook itself.

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
- **Deploy-time split (2026-10-15):** `vercel.json` runs `scripts/build-app-split.cjs` as the build
  command. ON VERCEL ONLY (`VERCEL=1`) it moves the big inline `<script>` of `slickchart.html` into
  `assets/app-<hash>.js` (served `immutable`), because phones code-cache external scripts but recompile
  3 MB of inline JS on every launch (measured: repeat-launch Home 1.1-2.6s -> 0.5-0.6s). The repo file
  is never changed, so keep editing `slickchart.html` and testing it as one file. Any error in the
  script leaves the deploy unsplit. `sw.js` serves `assets/app-*` cache-first and opens the page from
  the saved copy after 3s on a weak signal, but only if that copy's code file is also saved. To test
  the split locally: copy the folder, run `VERCEL=1 node scripts/build-app-split.cjs` in the copy, serve
  it with `scratchpad/vercel-like-server.mjs <dir> <port>`; `scratchpad/test-sw-shell.mjs` covers the
  service worker, `scratchpad/perf-boot.mjs` the timings.
- **Deploy:** Vercel auto-deploys from `main`, but **you do not push `main`** — §1a does, overnight,
  from `release`. JS runs live from the server, so JS fixes reach the native app without an app-store
  resubmit; native *plugin* changes need a rebuild. Because the JS is live, the previous build stays
  in use on any device that has not relaunched — see §1a on shape compatibility.
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
- **Scale harnesses** (`scratchpad/`, run by hand): `freshaudit.mjs` and `scaleaudit.mjs` (§2ae) were
  never committed and are gone. What exists: `test-busy-courses-boot.mjs` boots a busy practice (800
  clients, 60 of her own courses) in four boot conditions plus a forced save of the starter list while
  the account is still loading, and fails if any upload shrinks her courses or adds a starter one.
  `CONTROL=1` switches off `_dropBootShrinks` and `_holdUploads` and MUST fail (60 became 3), which
  proves the test can see the bug. `test-iphone-account-scale.mjs` covers big summaries and the logo.
  Run them after any change to sync, storage or a loader, in both engines. The §2ae "5 stock courses
  over her 60" loss is CLOSED: re-measured 2026-10-21 on build `2026-10-21d`, 16/16 in Chromium AND
  WebKit (SESSION-HANDOFF, 2026-10-21 entry).
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
| SlickChart (solo estheticians) | `blog-src/` | `/blog` | "Weekly SlickChart blog draft" `trig_0152LFs5EUR87Ttbzz3s5nHQ` | `0 14 * * 1` |
| Build Your Own App | `build-blog-src/` | `/build/blog` | "Weekly Build blog draft" `trig_01QsyEtdmZEJrshukvQTgzi3` | `0 15 * * 1` |

**Both Routines are BOUND TO ONE SESSION.** As of 2026-10-13 that is
`session_015D4BCM2NAMaZ9JsmQJm88r` for both (re-pointed from `session_01A4GwJis96cYnvN4yMbpBtt`,
whose ids were `trig_01Kpq3HtFnWqgea1bUozHbbM` / `trig_01JeGumaZUvUoy6aBCSxJS38`, now deleted).
The two one-shot reminders moved with them: Google Calendar review `trig_014SLMEWSaQD8PHh8WSdSBji`
(2026-11-09) and Square-owns-services `trig_019TAeznU5wedybsvaoPovUY` (2026-11-12).
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
- **NEVER write that data is lost, gone, or may not come back, unless a CHECK PROVED IT — in this
  conversation, with numbers.** This rule exists because it was broken twice in one day. A draft to
  Heather said "the notes you were part way through may not come back" when the diagnosis, pasted
  into this very conversation an hour earlier, showed her notes ON THE SERVER: 565 characters across
  Amber, Sue and Bear plus Ingatara Perry's chart detail. The same day, she was told Heather's
  photos were device-only and gone; 38 of them were on the server and recoverable.
  Grepping is not enough — the photo claim was checked and still wrong, because one comment about
  the EXPORT was read as a statement about backup. The bar is a NUMBER from the recovery diagnosis
  (§1c), not a reading of the code.
  - Default to "we are checking," never to "it is gone."
  - If a check has not been run, the sentence does not go in the email. Ask Ashley to run it.
  - Say precisely WHAT was checked and what was not. "The two sets you finished are safe, I am
    unsure about the third" is honest. "Your notes may be lost" was not.
  - Telling a provider their work is gone when it is not is the single most damaging thing that can
    be done here: Ashley has to send it, and then unsend it.
- **Be honest about what might not be recoverable.** Never promise data is coming back either — once
  a check shows something genuinely absent, say so plainly rather than leaving hope open.
- Reading level around 3rd grade, short sentences, **no em dashes**, fewer words is better.

The long technical version belongs in this conversation and in SESSION-HANDOFF.md, not in the email.

## 4d. Make it easy and automated for her — ALWAYS (her rule, 2026-10-13)

Her words: *"make that a rule. i want everything to be as easy as possible and automated for me
always."* It came after a recovery that made her tap, screenshot and come back six times; she said
*"you are making me do way too much work here"* and *"im getting really tired of going back and forth"*.

- **Do the work; don't hand her a procedure.** If a fix needs more than one or two taps from her,
  build the button that does the rest, then give her that one button.
- **One tap, one result.** A tool must finish the whole job in one run (every affected client, every
  name), not one item per tap, and report everything it did and did not do in that one message.
- **Never make her diagnose.** If a result needs explaining, the tool explains it in its own result.
  Don't ask for a screenshot to learn something the tool could have printed.
- **Get it right before giving it to her.** Test against a reproduction of HER numbers (her
  screenshot, her counts) so the second run is not needed. Each extra round trip is a cost to her.
- **Plain steps only, and as few as possible.** If she must act, at most 2–3 short numbered steps,
  named exactly as the screen names them. No branching instructions.
- Safety rules (§0, §4c, soft deletes, backups first) still apply — automate inside them, never around them.
- **The same goes for PROVIDERS who report bugs — even more so (her rule, 2026-10-17):** *"I want to ask
  her to do as least as possible since she is helping so much. this should be rule just like for me
  wanting everything to be automated as much as possible."* Never draft a message asking a provider to
  run a check, copy a report, tap through Settings or take screenshots when the app could have sent
  that itself. Collect it automatically instead: each device already sends a counts-only health report
  on its own (`_sendDeviceReport` → `/api/device-report`, shown under **Their devices** on the founder
  Recover clients screen with the account's signed-in devices and any other account on the same
  network). If what you need is not in that report, ADD IT to the report rather than asking the
  provider. Ask a provider only for what no device can know (what they saw, what they expected), and
  in one short question.

## 5. Tone with the owner

The owner (Ashley, a solo esthetician) runs her real business on this and has been through a stressful data
scare. Lead with plain answers, own failures without defensiveness, don't pile on complexity, and don't
over-claim. One-time fix tools belong tucked out of the everyday UI once their job is done.
