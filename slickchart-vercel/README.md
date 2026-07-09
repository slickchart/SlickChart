# SlickChart + Square

SlickChart is served as two static pages (a **provider app** and a **client view**),
plus a few small serverless functions that let the provider app pull your real
**clients** and **upcoming appointments** from your own Square account.

The functions hold your Square token **server-side** so it never reaches the
browser. The app talks only to its own `/api/...` endpoints — never to Square
directly — which is why this needs to run on Vercel (or any host with serverless
functions), not as a file opened on your computer.

```
.
├── index.html              ← landing page (choose Provider app / Client view)
├── slickchart.html         ← Provider app  (served at /slickchart)
├── slickchart-client.html  ← Client view   (served at /client)
├── api/
│   ├── health.js                  → GET /api/health            (setup check, no key)
│   └── square/
│       ├── customers.js           → GET /api/square/customers
│       └── appointments.js        → GET /api/square/appointments?days=14
├── lib/square.js           ← shared Square helpers (not a public endpoint)
├── package.json
├── vercel.json
└── .env.example            ← copy to .env for local testing
```

---

## What you'll need

- A **GitHub** account (free) — where the code lives.
- A **Vercel** account (free) — where it runs. Sign in with GitHub to keep it simple.
- A **Square** account, and a Square **Developer application** (free) to get an access token.

> **Start in Square's Sandbox.** It uses fake data and fake clients, so you can
> get everything working before pointing it at your real account.

---

## Step 1 — Get your Square credentials

1. Go to the **Square Developer Dashboard** (developer.squareup.com) and create an
   application (any name).
2. Open the app. You'll see two sets of credentials: **Sandbox** and **Production**.
3. Copy the **Sandbox Access token** for now. (You'll switch to Production later.)
4. If you use **Square Appointments** and want the upcoming-appointments feature,
   make sure your app has the **Appointments (read)** permission. Customers import
   works without it.

## Step 2 — Put the code on GitHub

1. Create a new **empty** repository on GitHub (e.g. `slickchart`).
2. Upload this whole folder to it. Easiest way without the command line: on the
   new repo page, click **uploading an existing file** and drag everything in.
   (If you use the command line: `git init`, `git add .`, `git commit -m "init"`,
   then push to your repo.)

## Step 3 — Deploy to Vercel

1. Go to **vercel.com**, sign in with GitHub.
2. Click **Add New → Project**, pick your `slickchart` repo, and click **Deploy**.
   No build settings to change — it's a static site with functions.
3. When it finishes you'll get a URL like `https://slickchart-xxxx.vercel.app`.

## Step 4 — Add your environment variables

In Vercel: **your project → Settings → Environment Variables.** Add these:

| Name | Value |
|---|---|
| `SQUARE_ACCESS_TOKEN` | your Square **Sandbox** access token (from Step 1) |
| `SQUARE_ENV` | `sandbox` |
| `APP_SHARED_SECRET` | a long random passphrase you invent (you'll type it into the app) |

Optional:

| Name | Value |
|---|---|
| `SQUARE_LOCATION_ID` | pin a specific location; leave unset to use your first active one |
| `SQUARE_VERSION` | pin a Square API version (e.g. `2025-01-23`); leave unset for the default |

After adding them, **redeploy** (Vercel → Deployments → ⋯ → Redeploy) so the new
values take effect.

## Step 5 — Test it

1. Open your Vercel URL and visit **`/api/health`**. You should see
   `"hasToken": true` and `"hasAccessKey": true`. If either is false, fix the
   matching variable in Step 4 and redeploy.
2. Open the **Provider app** → **Account → Integrations → Square → Open**.
3. The status line should show your environment with green **Token** and
   **Access key** badges.
4. Click **Import clients**. The first time, it asks for your access key — type the
   `APP_SHARED_SECRET` you chose. Your Square customers load; import them
   individually or **Import all**.
5. Click **Upcoming** to see the next 14 days of appointments (if you use Square
   Appointments).

## Step 6 — Go live

When the sandbox run looks good:

1. In Vercel, change `SQUARE_ACCESS_TOKEN` to your **Production** token and set
   `SQUARE_ENV` to `production`.
2. Redeploy. Now it's reading your real Square account.

---

## Running locally (optional)

You don't need this, but if you want to test on your own machine:

```bash
npm i -g vercel        # one-time
cp .env.example .env   # then fill in the values
vercel dev             # opens http://localhost:3000
```

Opening the `.html` files directly (double-clicking) will **not** make the Square
features work — there's no server in that case. Use `vercel dev` or the deployed URL.

---

## Honest limitations (please read before real clients)

- **The access key is a single shared passphrase, not real per-user login.** It
  keeps the endpoints from being wide open, which is fine for a private beta, but
  it isn't proper authentication. Don't treat it as bank-grade security.
- **Your charts, intake forms, and photos still live in the browser** (local
  storage), not in a database. They are **not** backed up, **not** synced between
  your phone and laptop, and can be lost if the browser's data is cleared. Square
  sync pulls clients *in*; it does not store your SlickChart records anywhere
  durable. Adding a real database + login is the next step (see below).
- **The Square link is read-only and one-way** here: it pulls clients and
  appointments into SlickChart. It does not push anything back to Square.
- **Appointments need Square Appointments** enabled and the *Appointments (read)*
  permission on your token. Without it, that button returns a Square permission
  error; clients import still works.

## Where this goes next

To make SlickChart hold real client records safely (durable, synced, with a real
login), the next step is adding a Postgres database — on Vercel this is **Neon**,
installed from the Vercel Marketplace (the old "Vercel Postgres" was retired and
moved to Neon). That's a larger build: a database schema, a data layer, and login.
This repo is structured so that step slots in without starting over.
