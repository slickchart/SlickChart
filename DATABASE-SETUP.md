# Turn On Cloud Saving — Simple Step-by-Step

Right now SlickChart saves to your browser. These steps add a real **database** so
your charts, forms, and clients are saved permanently and follow you across devices —
behind a **login** so only you can see them.

Important: **until you finish these steps, nothing changes** — the app keeps working
exactly as it does now. Cloud saving only switches on once all three settings below
are in place. So there's no rush and nothing to break.

Total time: about **15 minutes**.

> Keep your "SlickDrive Keys" note handy — you'll add two new secrets to it.

---

## Step 1 — Put the new code on GitHub (5 min)

I gave you an updated set of files (the `slickchart-vercel` zip). It contains new
files in the `api` and `lib` folders plus an updated `package.json` — those are what
make the database work.

- [ ] Unzip it. Open the `slickchart-vercel` folder.
- [ ] On GitHub, open your repo → click into the **`slickchart-vercel`** folder.
- [ ] Click **Add file → Upload files**.
- [ ] Drag in **everything from the unzipped folder** (all files and the `api` and
      `lib` folders). It's fine to re-upload everything — GitHub overwrites the old
      versions with the same names.
- [ ] Scroll down, **Commit changes**.
- [ ] Vercel will start redeploying on its own.

---

## Step 2 — Add a database (5 min)

- [ ] Go to **vercel.com** → open your **slick-chart** project.
- [ ] Click the **Storage** tab at the top.
- [ ] Click **Create Database** → choose **Neon** (Postgres). (If asked, accept the
      free plan — it's plenty to start.)
- [ ] Give it any name, create it, and when asked, **connect it to your slick-chart
      project.** Leave the defaults.
- [ ] That's it — Vercel automatically adds the database connection to your project.
      You don't need to copy anything.

---

## Step 3 — Set your password (3 min)

- [ ] In Vercel: your project → **Settings → Environment Variables.**
- [ ] Add these **two**:

      | Name | Value |
      |---|---|
      | `APP_PASSWORD` | the password you want to log into SlickChart with — pick a strong one |
      | `SESSION_SECRET` | a long random string (mash the keyboard for 40+ characters) |

- [ ] Write both into your private note.
- [ ] Redeploy so everything takes effect: **Deployments → ⋯ → Redeploy.**

---

## Step 4 — Log in and confirm it's saving (2 min)

- [ ] Wait for the redeploy to finish, then open your site and go to the **Provider app.**
- [ ] You should now see a **Log in** screen. Enter your `APP_PASSWORD`.
- [ ] You're in. From now on, everything you save goes to your database.
- [ ] **Quick proof it's working:** change something small (e.g., your business name in
      Account → Business info → Save). Then open the same site on your **phone**, log in
      with the same password — you should see that change. That's cross-device sync. 🎉

---

## How it behaves (good to know)

- **First login carries your current data up.** Whatever you've already set in this
  browser gets uploaded to the database the first time you log in, so you don't lose it.
- **Other devices pull it down.** Log in on your phone or another computer with the same
  password and your data appears.
- **It still works offline-ish.** If the internet hiccups, the app keeps using what's on
  your device and re-syncs when it can.
- **Log out** any time from **Account → Log out**. Your data stays safe in the database;
  logging back in brings it right back.

## Honest notes

- This is a **single login** for you (and anyone you share the password with). It's real,
  password-protected, encrypted-session access — but it's not separate accounts for
  multiple staff. If you grow to a team, that's a later step.
- The **client app** (what your clients see) still uses their own device storage — clients
  reach their info by your magic links, not by logging in. The database is for *your*
  provider records.
- Keep `APP_PASSWORD` and `SESSION_SECRET` private — same as your Square token. Note and
  Vercel only.

If anything looks off at Step 4 — tell me exactly what the screen says and I'll get you
sorted, same as launch day.
