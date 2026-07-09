# Push notifications — setup (one-time)

Real notifications (a reminder or a new message that reaches a client's phone even when the
app is closed) are now built in. They need three environment variables set in Vercel and one
plan note. Once these are set and the app redeploys, it "just works" — nothing else to run.

## 1. Add these Environment Variables in Vercel

Vercel → your project → **Settings → Environment Variables**. Add each for **Production**
(and Preview if you test there):

| Name | Value |
|------|-------|
| `VAPID_PUBLIC_KEY` | `BI0MVqsF4ydcwZFAAoz1sOu3Cu7foQIAvnQ56SkbvMYAGZEs2XbyOvjPeT-YpMRpF0Z-wMJ5ITyCSl0g73mQ25M` |
| `VAPID_PRIVATE_KEY` | *(the private key — sent to you privately; paste it here, keep it secret)* |
| `CRON_SECRET` | *(make up a long random string, e.g. from a password generator)* |

Optional:

| Name | Value | Default |
|------|-------|---------|
| `VAPID_SUBJECT` | `mailto:you@youremail.com` | `mailto:hello@slickchart.app` |

> The **public** key is already embedded in the client app, so it must stay exactly the value
> above. If you ever rotate keys, regenerate both and update the `VAPID_PUBLIC_KEY` constant in
> `slickchart-client.html` too (then re-embed + redeploy).

After adding them, **redeploy** (Vercel → Deployments → ⋯ → Redeploy) so the new env vars and
the `web-push` dependency take effect.

## 2. Cron plan note

`vercel.json` schedules the reminder job hourly (`0 * * * *`). Hourly cron requires a Vercel
**Pro** plan. On the **Hobby** plan only one *daily* cron is allowed — if you're on Hobby,
change the schedule in `vercel.json` to a single daily time, e.g. `"0 15 * * *"` (that's 8am
Pacific). Real-time message pushes do **not** use the cron and work on any plan.

## 3. How it works (so you know what to expect)

- **New message → push.** When you message a client, they get a phone notification even with the
  app closed — as long as they turned notifications on and haven't muted "New message." Tapping it
  opens their chat.
- **Scheduled reminders (the cron).** Each client's app quietly reports its timezone and next
  appointment time. The hourly job then sends:
  - a **24-hour** appointment reminder,
  - a **morning-of** reminder (~8am their local time),
  - a **daily homecare nudge** (~8am, only if they have a routine).
  Each respects the client's individual toggles and quiet hours, and each fires at most once.
- A client only gets reminders after they've **opened their app at least once with notifications
  on** (that's when the subscription + their appointment time reach the server). New bookings sync
  the appointment time the next time they open the app.

## 4. Testing it

1. Set the env vars + redeploy (steps 1–2).
2. Open a client link on a phone, go to **Notifications**, tap **Turn on notifications**, Allow.
3. From your provider app, send that client a message → the phone should get a push.
4. To test the reminder cron immediately, visit (signed in as nobody needed — it's secret-gated):
   `https://<your-domain>/api/cron-reminders?key=<your CRON_SECRET>`
   It returns a small JSON summary (how many reminders it sent). It only sends reminders that are
   actually due *right now* per each client's local time, so for a guaranteed hit, have a test
   client with an appointment ~24h out.

## Notes / limits

- iOS requires the client to **install the app to their Home Screen** (Add to Home Screen) before
  web push works — that's an Apple platform rule, not a SlickChart limit. Android/desktop Chrome
  work from the browser.
- Provider→client photos in chat are delivered, but the push itself just says "📷 Photo" (the
  image shows when they open the thread).
- If push is *not* configured (env vars missing), everything else keeps working — pushes are simply
  skipped, no errors.
