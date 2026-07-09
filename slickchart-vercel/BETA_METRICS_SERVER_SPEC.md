# Beta metrics — server spec

The provider app now emits the signals below. The client side is done; the server needs to
(1) accept a new event endpoint, (2) store `kind:'pulse'` on feedback, and (3) return a few
aggregate fields from `/api/admin-stats`. Everything is aggregate, privacy-safe — no client
or note content is ever sent.

Covers beta metric **#2 (weekly active charting)** and the app-side of **#3 (feedback response
rate)** and **#4 (self-reported time saved)**. Metrics #1 (applications vs. cap), #5 (client
rebooking/retention), and #6 (founding-member churn) live outside the app — see "Not in the app".

---

## 1. New endpoint: `POST /api/beta-event`

Auth: `Authorization: Bearer <token>` (same provider token as `/api/store`). Reject anonymous.

Body (JSON), two event types:

```json
{ "type": "chart_saved", "isNew": true,  "at": 1720471200000 }
{ "type": "pulse_shown",                 "at": 1720471200000 }
```

- `chart_saved` — fired when a provider saves a treatment note. `isNew` = brand-new note vs
  an edit of an existing dated note. Fired on every save (including edits), so **dedupe/interpret
  server-side**: for "weekly active charting" count *distinct providers per ISO week*, not raw events.
- `pulse_shown` — fired when the recurring survey is shown (the denominator for response rate).

Store minimally. Suggested table `beta_events(provider_id, type, is_new, created_at)`. You do
**not** need to keep events forever — a rolling 60–90 days is plenty for beta dashboards.

Return `{ "ok": true }`. The client ignores the response (fire-and-forget, `keepalive`), so
failures are silent by design — just don't error loudly.

---

## 2. Extend `POST /api/feedback` to store `kind`

The recurring pulse survey posts to the existing feedback endpoint with extra fields:

```json
{ "kind": "pulse", "rating": 4, "timeSaved": "much_less", "at": 1720471200000 }
```

- `kind` is `"pulse"` for survey responses; absent/`"adhoc"` for the existing feedback button.
- `timeSaved` ∈ `much_less | less | same | more` (self-reported charting time vs. their old method).
- Keep the existing `rating` (1–5) and `message` behavior unchanged.

Store `kind` and `timeSaved` alongside the existing feedback row so the two can be separated.

---

## 3. Extend `GET /api/admin-stats` (owner-only) with two objects

The admin dashboard already renders these if present, and falls back to a "waiting for server"
note if absent — so nothing breaks before you ship this. Add:

```json
{
  "charting": {
    "activeProviders7": 12,   // distinct providers with >=1 chart_saved in last 7 days
    "charts7": 84,            // total chart_saved events, last 7 days
    "charts30": 310           // total chart_saved events, last 30 days
  },
  "pulse": {
    "shown": 40,              // pulse_shown events, window of your choice (e.g. 30d)
    "answered": 26,           // kind:'pulse' feedback rows, same window
    "avgRating": 4.1,         // mean rating over kind:'pulse' rows
    "fasterPct": 78           // % of pulse responses with timeSaved in {much_less, less}
  }
}
```

- `activeProviders7 / providers.total` gives the **weekly active charting rate** (metric #2) — the
  dashboard computes the % from these.
- `answered / shown` gives the **pulse response rate** (metric #3, in-app portion).
- `avgRating` + `fasterPct` summarize **self-reported time saved** (metric #4).

Keep the existing `providers`, `square`, and `waitlist` objects as-is.

---

## Privacy / footnote
All of the above is aggregate: counts, a rating average, and a percentage. No client names,
note content, or per-appointment data is sent or stored by these signals. The dashboard already
carries a line stating this — keep it accurate as you implement.

---

## Not in the app (track these elsewhere — the app can't honestly measure them)

- **#1 Applications vs. cohort cap** — from your application form / the existing waitlist
  (`/api/waitlist` count is already in admin-stats). Track the cap in your ops sheet.
- **#5 Client rebooking / retention** — the source of truth is Square (bookings), not SlickChart.
  Best pulled from Square's API or reporting against the founding cohort's client base. Computing
  it in-app would be unreliable (the app doesn't see the full booking history).
- **#6 Founding-member churn** — lives in Stripe (subscription cancels among the founding price
  tier). Track from the Stripe dashboard or a Stripe webhook, not the app.

A clean weekly beta review = app dashboard (charting + pulse) + waitlist count, next to a Stripe
churn number and a Square retention pull. The app owns the "are they actually using it" half.
