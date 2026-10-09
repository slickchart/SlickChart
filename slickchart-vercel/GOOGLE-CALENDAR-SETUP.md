# Google Calendar two-way sync — setup (one-time)

The app code is finished and live. What is left is giving Google permission, which happens on
Google's website, not in the code. It takes about 30 minutes.

**Read step 0 first.** There is one decision in here that cannot be undone later.

---

## 0. The decision to make before you start

Google treats calendar access as "sensitive". That means Google wants to review SlickChart before
it will let the whole world connect. Until that review is done, you have two choices, and they are
both imperfect:

| | **Testing** mode | **In production** mode (not yet reviewed) |
|---|---|---|
| Who can connect | Only emails you type into a list, up to 100 | Anyone with a Google account |
| How long it lasts | **Breaks after 7 days, every time** | Keeps working |
| What the provider sees | A warning screen | A warning screen |
| Limit | 100 test users | **100 providers, ever, for this project** |

Two things matter here:

1. **Testing mode is not usable for real providers.** The connection dies after 7 days and the
   provider just sees their calendar stop working. Use it only to prove the setup works, with your
   own email, then move on.
2. **The 100 limit in production is for the lifetime of the Google project and cannot be reset or
   raised.** Once 100 providers have connected, provider 101 cannot, until Google finishes its
   review. So submit for review early, not when you hit the limit.

**Recommended:** do steps 1 to 6, test it on your own account, then publish (step 7) and submit for
review (step 8) the same day. The review takes weeks, so starting it early is the whole trick.

---

## 1. Make a Google Cloud project

1. Go to **console.cloud.google.com** and sign in with the Google account you want to own this.
2. Top left, click the project dropdown, then **New Project**.
3. Name it `SlickChart`. Create.
4. Make sure the project dropdown now says **SlickChart** before you carry on. Everything below
   applies to whichever project is selected.

## 2. Turn on the Calendar API

1. Left menu: **APIs & Services → Library**.
2. Search `Google Calendar API`.
3. Open it and click **Enable**.

## 3. Fill in the consent screen

This is the screen a provider sees when they connect. Left menu: **APIs & Services → OAuth consent
screen** (in some versions of the console this lives under **Google Auth Platform**).

1. User type: **External**. Create.
2. App name: `SlickChart`.
3. User support email: your email.
4. App logo: upload the SlickChart logo. Optional, but it makes the screen look like you.
5. Application home page: `https://slickchart.app`
6. Privacy policy link: `https://slickchart.app/privacy`
7. Terms of service link: `https://slickchart.app/terms`
8. Authorized domain: `slickchart.app`
9. Developer contact email: your email. Save and continue.

## 4. Add the one permission

On the **Scopes** step:

1. Click **Add or remove scopes**.
2. In the filter box paste exactly:

   ```
   https://www.googleapis.com/auth/calendar.events
   ```

3. Tick it. Update. Save and continue.

**Add nothing else.** This single permission is what the app actually asks for. If the list here and
the app disagree, every provider gets the scary warning screen even after the review passes. It lets
SlickChart add and change events. It does **not** let it delete calendars or change who a calendar is
shared with.

## 5. Add yourself as a test user

On the **Test users** step, add your own Google email. Save and continue.

## 6. Create the credentials

1. Left menu: **APIs & Services → Credentials**.
2. **Create credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Name: `SlickChart web`.
5. Under **Authorized redirect URIs**, click **Add URI** and paste exactly:

   ```
   https://slickchart.app/api/google-cal-callback
   ```

   One character wrong here and connecting fails with `redirect_uri_mismatch`. If you ever need to
   check what the app is actually asking for, open SlickChart, go to **More → Settings**, scroll to
   the bottom and tap the **SlickChart · Version** line five times. The self-check now prints the
   exact address to use.

6. Create. Google shows a **Client ID** and a **Client secret**. Keep that tab open.

## 7. Put the two values in Vercel

Vercel → your project → **Settings → Environment Variables**. Add both for **Production**:

| Name | Value |
|------|-------|
| `GOOGLE_CLIENT_ID` | the Client ID from step 6 |
| `GOOGLE_CLIENT_SECRET` | the Client secret from step 6 |

Also check that `APP_ORIGIN` is set to `https://slickchart.app`. If it is, there is only ever one
address to register with Google. If it is not set, the app uses whatever address the provider
reached it on, and you would have to register every one of them.

Then **redeploy** (Vercel → Deployments → the latest one → Redeploy). Environment variables only
reach the app on a new deploy.

## 8. Test it on your own account

1. Open SlickChart, go to **Sync Calendar**.
2. You should now see **Two-way sync with Google** with a **Connect Google Calendar** button. If it
   still says "not switched on for this deployment", the redeploy has not finished or a variable
   name is misspelled.
3. Tap Connect. Google will show the warning screen because the review has not happened yet. Click
   through it (**Advanced → Go to SlickChart**).
4. Allow.
5. You should land on a page saying **Calendar connected**.
6. Now prove both directions:
   - Add an appointment in SlickChart. It should appear on your Google Calendar within a few
     seconds.
   - Put something on your Google Calendar, then open your own booking link. That time should not
     be offered.

If both work, the feature is real. Only then tell a provider it exists.

## 9. Publish, then submit for review

**Publish:** on the consent screen page, click **Publish app**. This is what stops the 7-day
breakage. Do it before any provider uses it.

**Submit for review:** on the same page, submit for verification. Google will ask for:

- A justification for the permission. Something like: *SlickChart writes the provider's own
  appointments to their Google Calendar, and reads only the start and end times of their existing
  events so clients cannot book a time the provider is already busy.*
- A link to the privacy policy. `https://slickchart.app/privacy` already has a Google Calendar
  section written for this, including the Limited Use wording Google looks for, and it documents
  the **Keep client names out of Google** setting — a reviewer asking "why does this app need to
  write a person's name to a calendar" can see the provider is able to turn that off and still get
  the feature.
- Proof you own `slickchart.app` (Google Search Console).
- A short screen recording showing a provider connecting the calendar and the sync working.

Expect weeks, not days.

---

## A setting worth knowing about before you offer this to providers

**Sync Calendar → Keep client names out of Google.** Off by default, which is the behaviour any
existing connection already has. With it on, a Google event carries the service name and the time
only, with no client name and no booking note, and the slot is still blocked. Turning it on rewrites
events already on the calendar rather than only applying to new ones.

It is stored on the provider's connection row on the server, not on her device, so a phone running
older code cannot push a name after she has turned it off. Worth mentioning to any provider who
shares a calendar with staff or family, or whose phone shows calendar titles on the lock screen.

## What providers will see while the review is pending

A screen saying Google has not verified the app, with the real option hidden behind **Advanced**.
Most people will not click through that on their own. It is worth telling a provider in advance that
the warning is expected and that they can click through it, or simply not offering calendar sync
widely until the review passes.

## If it stops working

The Sync Calendar screen shows **Google needs reconnecting** when Google refuses the saved
permission. The two usual reasons:

1. **The app is still in Testing mode.** The permission expires 7 days after it was granted, every
   time. The fix is step 9.
2. **The provider removed SlickChart** in their Google account settings.

Reconnecting from that screen fixes both.
