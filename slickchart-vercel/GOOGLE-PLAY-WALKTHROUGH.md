# SlickChart → Google Play: dead-simple Android walkthrough

Everything below is Android-only (iOS is a separate day). Do the parts in order. The **build** happens
on your Mac; the **listing** happens in the Play Console browser tab you already have open. Budget
~1–2 hours the first time, most of it waiting on downloads.

Your locked identity (already set everywhere — don't change it):
- **App name:** SlickChart
- **Package / App ID:** `com.slickchart.app`  ← permanent, never changes

---

## ⚠️ Read this ONE thing first (it's the only thing that can get you rejected)

Google requires **digital subscriptions sold inside the app** to use Google Play Billing. SlickChart's
subscription is billed through Stripe/your website. So for the store build, the app must **not let a
new person subscribe/pay inside the app** — it should only let **existing subscribers log in**. Selling
physical services/retail through Square is fine (that's exempt).

If your login screen currently has a "Start subscription / pay" button, tell me and I'll gate it so the
store build just says "Sign in" (existing accounts) — this keeps review happy. **Ask me before you
submit if you're unsure.**

---

# PART 1 — Build the signed app file (AAB) on your Mac

### 1a. Install the two tools (once)
- **Node.js** — https://nodejs.org → click the big **LTS** button → open the `.pkg` → Continue/Agree/Install.
- **Android Studio** — https://developer.android.com/studio → Download → open the `.dmg` → drag to
  Applications. Open it once and let it finish "downloading components" (this includes the Android SDK).

### 1b. Get the code and build the native project
Open **Terminal** (Cmd+Space → type `Terminal` → Enter). Paste these **one at a time**, waiting for each:

```bash
git clone https://github.com/slickchart/slickchart.git
cd slickchart/slickchart-vercel
```
You're in the right folder when this prints a filename:
```bash
ls capacitor.config.json
```
Now install and generate the Android project:
```bash
npm install
npm install @capacitor/android
npm run cap:add:android      # skip if it says android already exists
npm run cap:android          # syncs, then opens Android Studio
```
Android Studio opens on the `android` project. Let the bottom status bar finish "**Gradle sync**"
(a few minutes the first time — it downloads build tools). When it says *Gradle sync finished*, continue.

### 1c. Make the signed AAB (this is the file you upload)
1. Top menu: **Build → Generate Signed App Bundle or APK…**
2. Choose **Android App Bundle** → **Next**.
3. Under "Key store path" click **Create new…**:
   - **Key store path:** click the folder icon, save it as `slickchart-upload.jks` somewhere you'll
     remember (e.g. your Documents).
   - **Password** (key store) + **Password** (key): make a strong one and **write both down**.
   - **Alias:** `upload`
   - **Validity (years):** `30`
   - Fill **First and Last Name** + **Organization** (anything reasonable) → **OK**.
4. Back on the dialog: **Next**.
5. Build variant: choose **release** → **Create** (or Finish).
6. When it's done, a little popup links to the file. It lives at:
   ```
   android/app/release/app-release.aab
   ```
   That `.aab` is what you upload to Play.

### 🔐 BACK UP YOUR KEYSTORE NOW — this is critical
Copy **`slickchart-upload.jks`** and the passwords to a safe place (password manager + a cloud backup).
**If you lose this file you can never push an update to the app again.** Do this before you keep going.

*(Good news: web changes you deploy to Vercel show up in the app automatically — you only rebuild the
AAB when native plugins/config change. So you'll rarely touch this. But keep the keystore forever.)*

---

# PART 2 — Create the app in Play Console

Back in your **play.google.com/console** tab (the "Create your first app" screen):

1. Click **Create app**.
2. **App name:** `SlickChart`
3. **Default language:** English (United States)
4. **App or game:** App
5. **Free or paid:** **Free** *(subscription is billed outside the store — see the warning up top)*
6. Check the two **Declarations** boxes → **Create app**.

You'll land on the app **Dashboard** with a setup checklist. Work top to bottom. The next parts map to it.

---

# PART 3 — Store listing (the public page)

Left sidebar: **Grow → Store presence → Main store listing.** Paste these:

**App name**
```
SlickChart
```

**Short description** (80 char max)
```
Charts, photos, forms, and booking sync for solo beauty & wellness pros.
```

**Full description** (paste all of this)
```
SlickChart is the client record built to do the two things every other app forgets: protect your business and help you make more money. It's made for solo beauty and wellness professionals — estheticians, tattoo artists, brow & PMU specialists, lash and massage pros, hair and barbers, and more.

PROTECT YOUR BUSINESS
• Digital consent & intake forms, signed by every client and stored for you — your proof if a service is ever questioned.
• A timestamped before/after photo vault with side-by-side compare — documented results, not memory.
• A provider document vault for your license, insurance, and certifications, with renewal reminders so you're never caught lapsed.
• Flagged contraindications surface before the visit, and every note, form, and message stays on record.

MAKE MORE MONEY
• Sell your retail, protocol bundles, and homecare right from the client's chart.
• Add affiliate links to the products you already recommend and earn on them.
• Build and sell your own courses or paid guides to your clients.
• SlickChart never takes a cut of your sales.

TURN-KEY FOR YOUR PROFESSION
Every consent, intake, and note format comes pre-built for your specialty — esthetics, tattoo, lash & brow, nails, massage, hair, nutrition, and more. Nothing to build, nothing to configure: log in and you're ready to chart your first client.

ONE CLIENT RECORD
Notes, photos, forms, products, and full history — always with you. Pre-visit check-ins so you walk in prepared, plus session summaries and homecare you send straight to your client.

WORKS WITH SQUARE
Connect your existing Square account and SlickChart keeps in sync — bookings, catalog, inventory, retail purchase history, cards on file, loyalty, refunds, and gift-card balances. No double entry.

A PRIVATE EXPERIENCE YOUR CLIENTS WILL ACTUALLY OPEN
Each client gets a private link to their own view — next appointment, aftercare and homecare, session summaries, recommended products, and secure messaging with you. No download required for them.

SMART, OPTIONAL AI
• "Catch me up" gives you a plain-language brief of your whole day — every appointment, booking request, and flagged check-in — the moment you open the app.
• "Ask your book" lets you search your clients in plain English ("who's due for a touch-up?") to surface the ones worth rebooking, so your calendar stays full.
• Generate a one-tap pre-visit AI Brief or a clean session summary, and dictate notes by voice.
AI features are optional and can be turned off anytime.

BUILT FOR TRUST
Your data syncs securely to the cloud so nothing lives on just one device. You can permanently delete your account and all associated data from within the app at any time.

Look polished, protect what you've built, and turn your expertise into income — without a clunky, expensive system.

SlickChart requires an active subscription.

SlickChart is a practice-management tool, not a medical device, and does not provide medical advice.
```

**Graphics** — upload these files from your cloned repo (folder shown):
| Play field | File to upload | Size |
|---|---|---|
| **App icon** | `icon-512.png` | 512×512 |
| **Feature graphic** | `store-assets/feature-graphic_1024x500.png` | 1024×500 |
| **Phone screenshots** (upload 2–8) | everything in `store-assets/google/` (`01-home.png` … `08-client-summary.png`) | 1080×1920 |

Then **Save**.

---

# PART 4 — App content & settings (the checklist items)

### Store settings → App category
- **App category:** Business
- **Tags:** pick a few relevant (medical/health, productivity)
- **Contact details:** email `support@slickchart.app` · website `https://slickchart.app`

### Policy → App content (do each row)

**Privacy policy**
```
https://slickchart.app/privacy
```

**App access** — ⚠️ important, or a reviewer can't get in
Your app is behind a login, so choose **"All or some functionality is restricted"** and add a
**demo login** for the reviewer (a real provider account you create for them). Give username + password
in the boxes. Without this they'll reject it as "can't access the app."

**Ads** → **No, my app does not contain ads.**

**Content rating** → start the questionnaire:
- Email: your email
- Category: **Utility, Productivity, Communication, or Other**
- Answer **No** to all the violence/sexual/drug questions (SlickChart has none).
- Submit → you'll get an **Everyone** rating.

**Target audience and content**
- Target age: **18 and over** (it's a professional tool — do **not** target under 18; keeps you out of
  the Families program).
- "Is your app designed for children?" → **No**.

**Data safety** → this is the big form. Answers below match SlickChart exactly.

Start:
- **Does your app collect or share user data?** → **Yes**
- **Is all of the user data encrypted in transit?** → **Yes**
- **Do you provide a way for users to request that their data is deleted?** → **Yes**
  (in-app: Settings → Delete account; it deletes server-side)

Then mark these data types as **Collected = Yes**, purpose **App functionality** (the two noted also
**Analytics**). Everything else = **No**. For every one: **not** used for advertising, **not** sold.

| Category → data type | Collected |
|---|---|
| Personal info → Name | Yes |
| Personal info → Email address | Yes |
| Personal info → Phone number | Yes |
| Personal info → Address | Yes |
| Health and fitness → Health info | Yes |
| Financial info → Purchase history | Yes |
| Financial info → Payment info | **No** (Square/Stripe handle cards, app never stores them) |
| Photos and videos → Photos | Yes |
| Audio → Voice or sound recordings | Yes |
| Messages → Other in-app messages | Yes |
| App activity → App interactions | Yes (App functionality + Analytics) |
| Device or other IDs → Device or other IDs | Yes (push notifications) |
| Location | **No** |
| Diagnostics / crash logs | **No** |

**Government apps / Financial features / Health apps declarations:** if it asks whether you're a
"Health" app, you're a business/records tool, not a medical provider — answer per the prompts; you can
note it's practice-management, not a medical device.

**News app?** No. **COVID app?** No.

---

# PART 5 — Upload the build & go live

1. Left sidebar: **Test and release → Production** (for a real launch) → **Create new release**.
   - *(Optional but nice: do **Testing → Internal testing** first — same steps, but only your invited
     testers see it, and it goes live in minutes so you can install it on your own phone before the
     public sees it. Your account is an **Organization** account, so you're **exempt** from the
     new-personal-account "20 testers for 14 days" rule — you can go straight to Production if you want.)*
2. **App signing:** when prompted, **let Google manage app signing** (accept **Play App Signing**).
   Your `.jks` is your *upload* key; Google holds the real signing key. This is normal and recommended.
3. **App bundles:** click **Upload** and choose `android/app/release/app-release.aab`.
4. **Release name:** `1.0` · **Release notes:** paste:
   ```
   Welcome to SlickChart! Protect your business with signed consent and before/after proof, earn more with a built-in shop and courses, and keep every client's record, forms, and Square booking in one place — all pre-built for your profession, ready the moment you log in.
   ```
5. **Next → Save → Review release.** Fix anything it flags (usually a checklist item from Part 4 you
   haven't finished — green-check them all).
6. **Start rollout to Production** → confirm.

That's it. First review typically takes a few hours to a few days. You'll get an email when it's live.

---

## Quick reference — where each asset lives in your repo
- App icon: `icon-512.png`
- Feature graphic: `store-assets/feature-graphic_1024x500.png`
- Screenshots: `store-assets/google/*.png`
- Listing text: this file (already pasted from `STORE-LISTING-COPY.md`)
- Data-safety detail: `STORE-PRIVACY-ANSWERS.md`
- Privacy policy (live): https://slickchart.app/privacy · Terms: https://slickchart.app/terms

## What I can still do for you (just ask)
- Gate the in-app "subscribe/pay" flow so the store build only signs existing subscribers in (the one
  rejection risk above).
- Create/confirm a clean **reviewer demo login** and pre-fill its data so the reviewer sees a working app.
- Double-check `privacy.html` lists the subprocessors + health-adjacent data + deletion right.
- Anything that bounces in review — paste me the rejection and I'll tell you the exact fix.
