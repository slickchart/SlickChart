# App Store & Google Play — listing copy (draft)

Copy/paste into App Store Connect and Play Console. Tweak the voice to taste. Character limits noted;
stay under them. Don't mention other platforms or use words like "best/#1" (both stores dislike them).

---

## App name / title
**SlickChart**  *(Apple: 30 char max · Play title: 30 char max — you're at 9)*

## Subtitle (Apple, 30 char max)
**Protect & grow your business**  *(28/30 — chosen)*
Alt: **Charts, consent & income tools** (30)

## Short description (Google Play, 80 char max)
**Charts, photos, forms, and booking sync for solo beauty & wellness pros.**

---

## Promotional text (Apple, 170 char max — you can change this anytime without review)
**Protect your practice and earn more — signed consent, before/after proof, license reminders, plus shop & courses, pre-built for your profession and ready day one.**
*(~162/170 — protect · profit · turn-key. Good spot to rotate a Founding offer later.)*

---

## Keywords (Apple, 100 char max, comma-separated, no spaces after commas)
```
esthetician,client chart,SOAP note,before after,intake,consent,tattoo,PMU,brow,lash,salon,square
```

---

## Full description (Apple 4000 / Play 4000 char max)

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

SlickChart requires a subscription. Create your account at slickchart.app.

*SlickChart is a practice-management tool, not a medical device, and does not provide medical advice.*

---

## What's New (version notes for the first release)
**Welcome to SlickChart! Protect your business with signed consent and before/after proof, earn more with a built-in shop and courses, and keep every client's record, forms, and Square booking in one place — all pre-built for your profession, ready the moment you log in.**

---

## App metadata suggestions
| Field | Suggested value |
|---|---|
| **Primary category** | Business |
| **Secondary category** | Health & Fitness (or Productivity) |
| **Age rating** | 4+ / Everyone (no objectionable content) |
| **Price** | Free (subscription billed in-app via your existing Stripe/web — see note) |
| **Support URL** | https://slickchart.app/support |
| **Marketing URL** | https://slickchart.app |
| **Privacy Policy URL** | https://slickchart.app/privacy |
| **Terms of Use (EULA) URL** | https://slickchart.app/terms |

> **Where each URL goes:**
> - **App Store Connect** → your app → *App Information*: Privacy Policy URL; and under the version's
>   *App Review Information* / *General*: **Support URL** (required) and Marketing URL (optional).
> - **Google Play Console** → *Store listing*: **Website** (marketing) + **Email** (support@slickchart.app);
>   *App content → Privacy policy*: the Privacy Policy URL. Play uses a support **email** (required) and
>   optionally a website — use `https://slickchart.app/support`.

> ⚠️ **Payments note:** SlickChart's own subscription is billed through Stripe/your website, and Client
> payments run through the provider's Square account. Apple/Google generally require **their** in-app
> purchase system for *digital* subscriptions sold in the app. If your subscription is sold or upgraded
> inside the app, review the IAP rules — you may need to (a) only let existing web subscribers sign in,
> not subscribe in-app, or (b) add Apple/Google in-app purchase for the subscription. Physical
> services/products (salon services, retail) are exempt and can use Square. Worth confirming before you
> submit so review doesn't bounce it.

---

## Screenshots you'll need (capture from the app)
Suggested set (same 5 for both stores): **Home/dashboard · Client chart · Before/after compare ·
Intake form · Session summary + client app.** You already have starters in `android/store-assets/`.
See `STORE-ASSETS-CHECKLIST.md` for the exact pixel sizes each store requires.

*Draft marketing copy — review for accuracy against your final feature set before submitting.*
