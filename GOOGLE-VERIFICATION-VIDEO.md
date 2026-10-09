# Google verification: the demo video and the scope justification

Two fields are missing on **Verification Center → Prepare for verification**: *scope justification*
and *demo video*. The justification is written for you below, ready to paste. The video you have to
record yourself, because Google requires your real consent screen and your real Google account
granting access.

Requirements below are from Google's own page, not from a blog:
<https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification>

---

## Before you record: one setting, or the video gets rejected

Google requires **the OAuth client ID to be visible in the browser address bar** while the consent
screen is showing.

**Safari hides it.** Your address bar reads `accounts.google.com` and nothing else. A video recorded
like that fails the check.

Fix it first:

**Safari → Settings → Advanced → tick "Show full website address".**

Then the bar shows the whole thing, client ID included. Chrome shows it by default if you would
rather use Chrome.

Check before you hit record: the bar must contain
`client_id=824470007431-gbdtfro6b9dkf1att1g9j8rns56a8168.apps.googleusercontent.com`.

## Also before you record

- **The app must be Published.** Google requires published branding status before it will take a
  verification submission. Audience → **Publish app**.
- **Disconnect your calendar first.** Settings → Sync Calendar → **Disconnect**. The video has to
  show the grant happening. You cannot film a connection you already made.
- **Lock the scopes.** If the scope list changes after recording, the video is invalid and you
  record again. See the note at the bottom.

---

## Paste this into "Scope justification"

> SlickChart is practice-management software for independent estheticians and similar solo
> appointment-based providers. The single requested scope,
> `https://www.googleapis.com/auth/calendar.events`, powers one feature: two-way calendar sync
> between the provider's SlickChart appointment book and their own Google Calendar.
>
> The feature does two things, and it needs both read and write to do them.
>
> Write: when a provider books, reschedules or cancels an appointment in SlickChart, that
> appointment is created, updated or removed on their Google Calendar, so their phone's calendar
> shows their real working day. SlickChart writes only to the authenticated provider's own primary
> calendar. It stores the Google event id of every event it creates, and it only ever updates or
> deletes events whose ids are in that map, which are events SlickChart itself created. It never
> modifies or deletes an event created by anyone else.
>
> Read: the provider publishes a booking link that clients use to pick a time. SlickChart reads the
> events already on the provider's primary calendar and removes those times from what clients are
> offered. Without this, a provider with a dentist appointment in Google would be offered to clients
> at that hour and double booked. Events the provider has marked "Free" in Google are correctly
> treated as not busy.
>
> Why a narrower scope is not sufficient:
>
> - `calendar.events.readonly` and `calendar.events.owned.readonly` cannot write, so appointments
>   booked in SlickChart would never reach the provider's calendar. That is half the feature.
> - `calendar.events.freebusy` is also read-only, and additionally cannot distinguish SlickChart's
>   own events from the provider's. SlickChart tags the events it writes and skips them when
>   computing busy time, so that an appointment it just wrote is not read back as a second,
>   separate commitment on the same slot. Free/busy data does not carry that distinction.
> - The full `calendar` scope is deliberately NOT requested. SlickChart has no need to create or
>   delete calendars, or to change who a calendar is shared with, and does not ask for the ability.
>
> No calendar data is sold, shared with third parties, or used for advertising or model training.
> Each provider's Google connection is stored against their own account and is reachable only by
> that authenticated account. Appointment data is used solely to render that provider's own
> schedule and booking availability.

If Google asks you to add the video link separately, the field is right under this one.

---

## Record the video

Length: aim for 3 to 5 minutes. Narration is not required, but **it must be in English** if you do
narrate, and Google explicitly requires the grant process to be shown in English.

**Recording on a Mac, no software to install:**

QuickTime Player → File → **New Screen Recording** → record the whole screen → Stop from the menu
bar → File → Save.

(`Shift + Command + 5` opens the same thing.)

### The shot list, in order

**1. Who you are (about 20 seconds)**
Open `https://slickchart.app`. Say or caption: *"This is SlickChart, practice management software
for independent estheticians. I am going to show the Google Calendar connection and how the
calendar.events scope is used."*

**2. Where the connection starts (about 15 seconds)**
Sign in. Go to **Account → Sync Calendar**. Show the **Connect Google Calendar** button before you
tap it.

**3. The consent screen — THE REQUIRED SHOT (about 45 seconds)**
Tap Connect. Then, slowly:

- Let the full address bar be clearly readable. **Pause on it for a good 3 seconds.** This is the
  shot that proves the client ID. Do not scroll past it.
- Show the **"Google hasn't verified this app"** screen and click through it. This is expected and
  reviewers know it.
- Show the consent screen itself: the app name **SlickChart** and the single permission line,
  *"View and edit events on all your calendars"*.
- Click **Allow**.
- Show the **Calendar connected** page.

**4. How the scope is used, direction one — write (about 60 seconds)**
In SlickChart, add an appointment. Then switch to Google Calendar and show it has appeared.
Say: *"The appointment booked in SlickChart was written to my Google Calendar using
calendar.events."*

Optional and worth it: change the appointment's time in SlickChart, show Google updating. Then
cancel it in SlickChart and show it disappearing from Google. That demonstrates the create, update
and delete you are asking for, which is exactly what the reviewer is checking.

**5. How the scope is used, direction two — read (about 60 seconds)**
This is the half people forget, and it is the half that justifies reading.

- Open your public booking link the way a client would. Show a time being offered. Say the time out
  loud.
- Go to Google Calendar and create an ordinary personal event at that time.
- Reload the booking link. Show that the time is **gone**.
- Say: *"SlickChart read my existing Google Calendar events and removed that time from what clients
  can book, so I cannot be double booked."*

**6. Close (about 10 seconds)**
Say: *"That is the only use of the calendar.events scope. SlickChart does not create or delete
calendars and does not change calendar sharing."*

### Mistakes that cause a re-record

- Address bar truncated, so no client ID. The single most common rejection.
- The grant not shown, because you were already connected.
- Only the write direction shown, so nothing justifies reading.
- A different app name on screen than on the submission. It must read **SlickChart** in both.
- Private client names on screen. Use a fake client for the recording, or turn on **Keep client
  names out of Google** first. A reviewer should not see a real person's name and health notes.

---

## Upload it

Google requires YouTube specifically.

1. <https://studio.youtube.com> → **Create → Upload videos**.
2. Title it something like `SlickChart — Google Calendar OAuth demo`.
3. **Visibility: Unlisted.** Not Private — Private means the reviewer cannot open it and the
   submission stalls. Not Public either; Unlisted is what Google asks for.
4. Copy the link into the **Video link** field in Verification Center.

---

## One decision worth making before you record

SlickChart asks for `calendar.events`, which covers all of the provider's calendars. In practice the
code only ever touches `calendars/primary/events` — the provider's own primary calendar.

There is a narrower scope, `calendar.events.owned`, limited to calendars the user owns. A reviewer
may notice the gap and ask you to switch, which would mean redoing Data Access and **recording the
video again**.

**Recommendation: keep `calendar.events` and submit the justification above.** The reason is not
convenience. It is that a provider's primary calendar also carries events other people organised and
invited them to — the dentist appointment, the school thing — and it is not clearly documented
whether `.owned` can read those. If it cannot, the blocking half of the feature develops a silent
hole in exactly the case it exists for, and a silent hole is worse than a rejection.

If Google comes back and asks for `.owned`, switch then, and test that invited-to events still block
bookings before trusting it.
