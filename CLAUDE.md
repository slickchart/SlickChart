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
- **DB:** Postgres (Neon) via `lib/db.js`. Tables: `clients`, `client_events`, `kv` (per-owner key/value
  sync store), `providers`, `square_connections`, plus small helpers. `@neondatabase/serverless` isn't
  installed in the scratch env, so `node --check` a file for syntax rather than importing it locally.

## 4. The weekly blog draft — RE-POINT THIS IN A NEW SESSION

A scheduled Routine writes one blog draft every Monday and reports it in the conversation for Ashley to
review. It never publishes: new posts carry `draft: true`, which produces no page and no sitemap entry,
so nothing reaches the live site until she says so.

**The Routine is BOUND TO ONE SESSION.** As of 2026-09-10 that is session
`session_01CZMvRH7xvPvUcct8SU5cbm`, trigger `trig_01B9Dy4ayviT2TCy6Tptd6oE`, cron `0 14 * * 1`.

**If you are a new session, check this early and fix it.** A Routine bound to a retired session delivers
nowhere, and the weekly post stops without any error Ashley would ever see. Run `list_triggers`; if
"Weekly SlickChart blog draft" is bound to a session that isn't this one, re-point it: delete it and
re-create it with the same prompt from here (`create_trigger` with NO `create_new_session_on_fire` and
NO `persistent_session_id` binds to the calling session). Update the ids above, and tell Ashley you
moved it.

**Do not "fix" this by making it spawn a fresh session per fire.** That was tried on 2026-09-10 and
failed silently — the spawned session had no repo checkout, so it produced no draft, no commit, and
reported SUCCEEDED anyway. Bound-to-a-live-session is the arrangement that works.

Ashley wants the report in the conversation, not as push or email, so the Routine stores no
notification channels. The blog's own docs — frontmatter, the draft/publish flow, the rule against
stating a competitor's pricing from memory, and the positioning to lead with — are in
`slickchart-vercel/blog-src/README.md`; the topic queue and the strategy behind it are in `TOPICS.md`.

## 5. Tone with the owner

The owner (Ashley, a solo esthetician) runs her real business on this and has been through a stressful data
scare. Lead with plain answers, own failures without defensiveness, don't pile on complexity, and don't
over-claim. One-time fix tools belong tucked out of the everyday UI once their job is done.
