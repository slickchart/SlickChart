# Getting a provider's lost work back out of the database

**Do step 1 today. It is the only step with a deadline.**

The database (Neon) keeps its own history of every change for a window of time. Inside that window
a provider's data from before a loss is still there and can be read. Once the window passes, it is
gone for good. Making a **branch** freezes that moment permanently, so it survives the window
closing.

So: make the branch first, work out what to do with it second.

---

## 1. Make the branch — do this before anything else

1. Go to **console.neon.tech** and open the SlickChart project.
2. Left menu: **Branches** → **New branch**.
3. Name it something you will recognise: `before-heather-loss`.
4. **Auto-delete: set this to Never.** It defaults to *After 1 day*, which would throw away the
   one frozen copy of her work tomorrow. This is the single easiest way to lose the thing you came
   here to save.
5. **Choose "Branch data and schema FROM A PAST POINT IN TIME".** The option selected by default
   is *Branch data and schema*, which means "up to this moment" — that copies today's already
   broken data and is of no use at all. The past-point-in-time option is the whole point.
6. Pick a time safely **before** the loss. Heather's work was there on **6 October** and gone by
   the **7th**, so **6 October, 11:00pm** is a safe choice. Going back a little further costs
   nothing: the only risk is missing work done in the hours just before the loss, and you can see
   that by comparing the counts before you put anything back.
7. Create it.

> Branches are instant and only use storage once you change them, so making **two** at different
> times — one just before the loss, one a day earlier — is cheap and gives you something to
> compare. If the earlier one holds more, use that.

That branch is now a permanent, read-only-if-you-leave-it-alone copy of the whole database as it
was at that moment. **Nothing about your live data changes.** Creating a branch is not a restore.

> **Check your retention window while you are there** — Settings → Storage (or the project's
> history retention setting). If it is only a few hours, a loss from yesterday may already be out
> of reach, and that is worth knowing straight away rather than after an hour of work. If it is
> short, raise it now so the NEXT incident has room.

**Also make a branch for Diana** if you want to try recovering her work too. Same steps, but pick a
time before HER loss. If that date is outside the retention window, the branch option will not let
you choose it, and that is your answer.

## 2. Point SlickChart at the branch

1. In Neon, open the new branch and copy its **connection string**.
2. Vercel → your project → **Settings → Environment Variables**.
3. Add `RECOVERY_DATABASE_URL` for **Production**, pasted exactly.
4. **Redeploy** (Deployments → the latest → Redeploy). Environment variables only reach the app on
   a new deploy.

## 3. Bring the work across

In SlickChart: **Account → Admin tools → "Get a provider's clients back"**, type the provider's
name, and the screen now has a **From the backup** section at the top when a recovery branch is
connected.

It shows, per library, what the backup holds against what is live:

```
Client roster        backup 10 clients   ·   live 9      worth bringing back
Session summaries    backup 31 entries   ·   live 0      worth bringing back
```

Tap **Bring these across**. That copies them in as **Earlier copies** — it does **not** change
anything live. Then scroll to Earlier copies, look at what arrived, and tap **Put back** on the
ones you want.

Two safety rules this follows on purpose:

- **Nothing live is overwritten by the import.** A human looks at it first.
- **Putting one back keeps a copy of what is there now**, so it can be undone.

## 4. Tell the provider to refresh

They need to open the app and pull down to refresh before it shows on their device.

## 5. Tidy up

1. Vercel → remove `RECOVERY_DATABASE_URL` → redeploy.
2. In Neon, delete the branch once you are sure you are done. A branch costs storage.

---

## If the window has already passed

Then the database genuinely does not have it any more and I will say so rather than pretend.
Two things are still worth trying:

- **A device that has not synced since the loss.** The app now photographs a device's own copy to
  the account's history the moment it opens, before anything can overwrite it. An untouched
  computer or tablet is a real chance.
- **Forms specifically.** Client form submissions are written to a separate append-only log that
  nothing overwrites, so a client's completed intake can be rebuilt even when the chart copy was
  wiped. That is independent of all of the above.

## What this cannot reach

Photos taken in a session are stored on the provider's own device, not on the server, so no
database recovery brings those back.
