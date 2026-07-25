# App Store review — reply notes (Submission 21e732f4-…)

Paste the answers below into the **Reply** box in App Store Connect for this
submission. Written in the first person so you can send them as-is.

> **Do NOT put your reviewer/demo login in this file or in the repo.** Enter the
> demo account email + password in App Store Connect → your app → **App Review
> Information → Sign-In required → Username/Password**, not here.

---

## Guideline 2.3.8 — App icons (placeholder) — FIXED

The previous build shipped with the default Capacitor template icon (the blue
logo on a grid). That has been replaced with our finalized SlickChart app icon —
the Marine Opal lotus mark on our brand gradient — across every size, all
generated from one master so they match:

- iOS `AppIcon-512@2x.png` (1024×1024) in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- Android adaptive launcher (foreground lotus + `#0A1719` background) at every density
- Web/PWA: `apple-touch-icon`, `icon-192`, `icon-512`, maskable, favicons

Rebuild and re-upload the binary before resubmitting so the finalized icon is in
the reviewed build.

---

## Guideline 2.2 — Beta testing — FIXED

All "beta," "beta tester," "trial," and "coming soon" wording has been removed
from the app and its metadata. The app ships as a complete v1 with no
placeholder or partially implemented features.

---

## Guideline 2.1(b) — Business model (answers to the 5 questions)

**Business model in one line:** SlickChart is a business-to-business SaaS tool
that independent beauty, health, and wellness professionals use to run their own
practice. The professional subscription is sold only on our website; the iOS app
is a companion client for existing subscribers and sells nothing in-app.

**1. Who are the users that will use the paid content, features, and services in the app?**

The paying users are independent, licensed beauty, health, and wellness
professionals — estheticians, lash and brow artists, massage therapists, nail
techs, hair stylists, permanent-makeup artists, nutritionists, and wellness
coaches — who run their own solo practices. They use SlickChart to manage their
own business: client charting and notes, before/after photos, intake and consent
forms, scheduling, messaging, and reports. Their own clients use a free,
no-login web link and never pay anything.

**2. Where can users purchase the content and services that can be accessed in the app?**

Providers purchase a SlickChart subscription only on our website,
https://slickchart.app, processed by Stripe. There is no purchase of any kind
inside the iOS app. The subscription ($10/month) is a software-as-a-service
subscription for professional practice-management software — the same model as
companion apps like Square, QuickBooks, or Shopify.

**3. What specific types of previously purchased content and services can a user access in the app?**

A provider who subscribed on the web signs in to the iOS app and uses the same
practice-management tools: their own client list and charts, before/after
photos, intake and consent forms, appointment and calendar information,
client messaging, and business reports. These are the provider's own business
records — not media, catalogs, or digital goods sold by us.

**4. What paid content, subscriptions, or features are unlocked within the app that do not use In-App Purchase?**

None are sold or unlocked within the app. The iOS app does not offer, advertise,
or link to any purchase — it is payment-silent. Billing, plan management, and any
"subscribe" links are hidden entirely in the native app; a signed-in provider
only sees their professional tools. The subscription is a cross-platform SaaS
service bought on our website, so there is no digital content, consumable, or
in-app upgrade that would fall under In-App Purchase. This mirrors the treatment
Apple already applies to business/SaaS companion apps whose service is sold on
the web.

**5. How do users obtain an account? Do users have to pay a fee to create an account?**

Providers create a free account with their email address — there is no fee to
create an account or to sign in. A subscription is only needed to use the
professional tools, and it is purchased separately on our website. End clients
never create an account at all: they open a private link with no login and no
cost, ever.

---

## Pre-resubmission checklist

- [ ] Rebuild the iOS binary so the finalized app icon is embedded, then upload.
- [ ] Confirm the running app shows no "beta / tester / trial / coming soon" text.
- [ ] Confirm the native app shows **no** Subscribe / Buy / Billing links (it is
      already gated by `_isNativeApp()`; verify on device).
- [ ] Provide a working demo login in **App Review Information → Sign-In required**
      (not in the repo), plus a note: "Web signup and subscription happen at
      slickchart.app; this account is already subscribed for review."
- [ ] In the reply box, paste the 2.1(b) answers above.
