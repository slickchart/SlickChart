# Getting a provider's lost work back out of the database

**Read this first, because it is the thing people are right to worry about.**

> ## Nothing here rolls your database back.
>
> Making a branch takes a **photograph** of a moment in the past. It does not touch your live
> data, your providers' data, or anything you changed today. Your live database carries on
> exactly as it is.
>
> Bringing a branch's contents into SlickChart adds them as **Earlier copies** to look at. Still
> nothing live changes. Only when you tap **Put back** does anything change, and that affects
> **one library for one provider**, and keeps a copy of what was there so you can undo it.
>
> **The one button that WOULD roll everything back is Neon's "Restore".** Do not use it. It
> overwrites your live database and every provider loses everything since that moment. You never
> need it. You want **Branches → New branch**, which is a different thing entirely.

---

## 1. Make the branch (2 minutes, and the only step with a deadline)

The database keeps its own history for a limited window. Inside that window the data from before
a loss is still readable. A branch freezes that moment permanently so it survives the window
closing. That is why this step is worth doing even before you decide what to do next.

1. **console.neon.tech** → the SlickChart project → **Branches** → **New branch**.
2. Name it: `heather-1330`.
3. **Auto-delete: Never.** It defaults to *After 1 day*, which would throw away the copy tomorrow.
4. **Choose "Branch data and schema FROM A PAST POINT IN TIME."** The default option means "up to
   this moment", which copies the already-broken data and is no use.
5. Pick the time: **7 October, 1:30pm.** Heather finished two of three sets of notes that morning
   and messaged at 1:41pm, so just before that is as close as you can get while still being safe.
   **If the picker is showing UTC rather than your own time, use 20:30 instead.**
6. Create.

Branches are instant and cost nothing until you change them, so if you want a fallback make a
second one at **11:00am** the same day. You can check both at once.

## 2. Copy its connection string

Open the new branch in Neon and copy the connection string. That is all you need from Neon.

## 3. Paste it into SlickChart

**Account → Admin tools → "Get a provider's clients back"** → type the provider's name →
**"Use a backup branch"** → paste.

No environment variables. No redeploy. The string is used to read the backup and is not saved
anywhere. Several can be pasted at once, separated by commas.

You will see something like:

```
The backup holds more than the account does.
Client roster       backup 10, live 9
Session summaries   backup 31, live 0
```

## 4. Bring it across, then look before you put anything back

**Bring these across** copies them in as **Earlier copies**. Nothing live has changed yet.

Scroll to Earlier copies, see what arrived and how much each holds, and tap **Put back** on what
you want. That one keeps a copy of the current version first, so it can be undone.

## 5. Tell the provider

They open the app and pull down to refresh.

## 6. Afterwards

Delete the branch in Neon once you are sure you are finished. It costs storage while it exists.

---

## If the window has already passed

Then the database genuinely does not have it any more, and I would rather say so than keep you
hoping. Two things are still worth trying:

- **A device that has not synced since the loss.** The app now photographs a device's own copy to
  the account's history the moment it opens, before anything can overwrite it. An untouched
  computer or tablet is a real chance.
- **Forms.** Client form submissions are written to a separate append-only log that nothing
  overwrites, so a completed intake can be rebuilt even when the chart copy was wiped. That works
  regardless of the window.

## What no recovery reaches

Session photos are stored on the provider's own device, not on the server.
