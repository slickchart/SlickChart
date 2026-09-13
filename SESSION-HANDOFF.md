# Session handoff — 2026-09-13

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

## 4. If the Build-Your-Own-App project lands in this repo

A folder exists on Ashley's Mac at `~/Desktop/Build-Your-Own-App/` with a `deploy-to-repo/` containing
`build/` (index, unlock, watch, css, images) and `api/build-unlock.js`, `api/build-webhook.js`.
**Read its own `START-HERE.md` and `PROMPTS.md` before assuming anything** — the notes below are only
the collisions to watch for if it deploys alongside SlickChart on the same Vercel project.

- **Stripe webhook secret.** `api/stripe-webhook.js` already exists for SlickChart subscriptions and
  reads `STRIPE_WEBHOOK_SECRET`. A second Stripe endpoint gets its **own** signing secret in the
  Stripe dashboard — it must be a different env var (e.g. `BUILD_STRIPE_WEBHOOK_SECRET`), or one of
  the two webhooks will reject every event.
- **`vercel.json`** has `cleanUrls: true` and 9 rewrites. A new `build/` directory serves at `/build/*`
  with `.html` stripped. `/build` → `build/index.html` works without a rewrite.
- **Unlock links are the same shape as the bug just fixed in §2.** Whatever token `build-unlock.js`
  issues: put it in the URL, never rely on browser storage to recover identity, and never fall back to
  a shared/demo state when it's missing. Say "open your link" instead.
- **`scripts/check-no-demo-data.cjs` scans every `.js`/`.html` under `api/` and `lib/`** for placeholder
  names and tokenless `/client` links. New endpoints are in scope. Keep sample data out of them.
- **`CLAUDE.md` §0 applies** to anything that touches the `kv` table, `clients`, or a provider token.
  Scope every query to the authenticated caller; never authorize from a request field.
- SlickChart's own deploy is `push to main` → Vercel. Same for anything added here.

---

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
