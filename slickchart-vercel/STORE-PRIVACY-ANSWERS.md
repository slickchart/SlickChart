# App Store & Google Play — Data Safety / Privacy answers (draft)

Fill these into **App Store Connect → App Privacy** and **Play Console → App content → Data safety**.
They're written from SlickChart's actual data flows. **Two important framing notes:**

- SlickChart is a tool a **provider** (the account holder) uses to run their practice. Most sensitive
  data (client names, photos, health notes) is entered **by the provider about their clients**. The
  stores still count this as data your app "collects/processes," so it's disclosed below.
- **Nothing is used for tracking or advertising.** No ad SDKs, no data brokers, no cross-app tracking.
  Answer **"No"** to every "used to track you" / advertising question.

> ⚠️ You store health-adjacent info (skin conditions, allergies, medications, treatment notes). That's
> sensitive. Your live Privacy Policy (`/privacy.html`) and Terms (`/terms.html`) should reflect this,
> and it's worth a quick check with an advisor on whether HIPAA/a BAA applies to your providers. This
> doc covers the store forms, not legal compliance.

---

## APPLE — App Store Connect → App Privacy

For each type: **Collected? → Linked to the user? → Used for tracking? → Purpose.**
Tracking is **No** for everything. Linked is **Yes** for everything (tied to an account).
Purpose is **App Functionality** (a couple also "Analytics" — noted).

| Data type (Apple's list) | Collected | Notes / what it is |
|---|---|---|
| **Contact Info — Name** | Yes | Provider name; client names |
| **Contact Info — Email** | Yes | Provider + client emails |
| **Contact Info — Phone Number** | Yes | Provider + client phones |
| **Contact Info — Physical Address** | Yes | Provider's studio address |
| **Health & Fitness — Health** | Yes | Client skin conditions, allergies, medications, treatment/contraindication notes |
| **Financial Info — Other Financial Info** | Yes | Payment/transaction records & amounts. **Card numbers are NOT collected by the app** — Square/Stripe handle and store those. |
| **User Content — Photos or Videos** | Yes | Before/after, check-in, consult photos |
| **User Content — Audio Data** | Yes | Voice notes (sent for transcription; see third parties) |
| **User Content — Customer Support** | Yes | In-app messages between provider & client |
| **User Content — Other User Content** | Yes | Intake/consent form answers, session notes, routines |
| **Identifiers — User ID** | Yes | Account ID |
| **Identifiers — Device ID** | Yes | Push notification token |
| **Purchases — Purchase History** | Yes | Provider's subscription status (via Stripe) |
| **Usage Data — Product Interaction** | Yes | Minimal beta/feature-usage events → mark purpose **Analytics** + App Functionality |
| **Diagnostics** | No | No crash/analytics SDK is bundled |
| **Location (Precise or Coarse)** | No | The app does not use device location services |
| **Browsing History / Search History / Contacts (address book) / Sensitive Info (as its own bucket)** | No | Not collected |

**"Data Used to Track You": NONE.** **"Data Linked to You": all of the Yes rows above.**
**"Data Not Linked to You": none** (everything is tied to the account).

Purpose for the sensitive/content rows = **App Functionality** (delivering the service). Usage Data may
also be **Analytics**.

---

## GOOGLE PLAY — Play Console → Data safety

### Overview answers
- **Does your app collect or share user data?** → **Yes**
- **Is all data encrypted in transit?** → **Yes** (everything is HTTPS/TLS)
- **Do you provide a way for users to request data deletion?** → **Yes** — there's **in-app account
  deletion** (Settings → Delete account for providers; Privacy & Data → Delete my data for clients),
  and it truly deletes server-side. (Provide this deletion URL if asked: your app's settings screen;
  or a web page describing it.)
- **Has your app been independently reviewed against a security standard?** → No (unless you've done one)

### Data types — Collected & (processed by service providers)
Mark each **Collected = Yes**. For "Shared": these go to **service providers/processors** acting on
your behalf (not sold, not for ads). Disclose them (Google wants transfers to processors listed).

| Google category → data type | Collected | Purpose |
|---|---|---|
| **Personal info** — Name | Yes | Account management, App functionality |
| **Personal info** — Email address | Yes | Account management, App functionality |
| **Personal info** — Phone number | Yes | App functionality |
| **Personal info** — Address | Yes | App functionality (studio address) |
| **Health and fitness** — Health info | Yes | App functionality |
| **Financial info** — Purchase history | Yes | App functionality |
| **Financial info** — Payment info | No* | *Card data handled by Square/Stripe, not stored by the app |
| **Photos and videos** — Photos | Yes | App functionality |
| **Audio** — Voice or sound recordings | Yes | App functionality (transcription) |
| **Messages** — Other in-app messages | Yes | App functionality |
| **App activity** — App interactions | Yes | App functionality, Analytics |
| **Device or other IDs** — Device or other IDs | Yes | App functionality (push notifications) |

For every row: **Data is processed ephemerally? No. Collection required? Yes** (core to the service).
**Used for advertising/marketing? No. Shared for advertising? No.**

---

## Third parties (subprocessors) — the same list for both stores' "who receives data"

These are **service providers processing data on your behalf** (not advertisers, not sold):

| Provider | What it processes | Why |
|---|---|---|
| **Vercel** | All app traffic | App hosting |
| **Neon** (Postgres) | The database | Data storage |
| **Square** | Payments, bookings, catalog, cards on file | Payment processing / POS sync |
| **Stripe** | Provider subscription billing | Billing |
| **Resend** | Transactional emails (invites, receipts) | Email delivery |
| **Anthropic (Claude)** | Client notes/summaries when a provider uses the AI Brief/Summary | AI assistance |
| **Groq** | Voice-note audio, for transcription | Speech-to-text |
| **Google Firebase (FCM)** & **Apple (APNs)** | Push notification tokens/messages | Notification delivery |

> Card numbers never touch SlickChart's servers — Square and Stripe collect and store those directly.

---

## Privacy nutrition / policy consistency
- Your **Privacy Policy URL** for both stores: `https://slickchart.app/privacy` (already live).
- Make sure the policy text mentions: the third parties above, health-adjacent data, and the in-app
  deletion right. (Ask me and I can update `privacy.html` to match this list.)
- **Account deletion** is a hard requirement both stores now enforce — you already pass it.

*This is a drafting aid based on the app's current data flows, not legal advice. Review it against your
actual practices (and the privacy policy) before submitting.*
