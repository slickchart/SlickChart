# The Beauty Pro Pack (DRAFT, for Ashley's review)

Ten prompts for the Master Build Roadmap, written for beauty businesses. They are not in the live
roadmap yet. The new `/build` page (preview branch only) describes them, so **they have to be added to
the roadmap artifact before that page goes live.** Nothing here is published.

They use the roadmap's own placeholders (`{APP}`, `{WHO}`, `{JOB}`), so they fill in with the buyer's
words like every other prompt. All ten are **Claude Code** prompts and belong after week 3 ("Put
something real underneath it"), once the app has a database and logins. Each one follows the
roadmap's habit: plan first, build one thing, show me how to check it.

Where they come from: the specialty features beauty pros pay extra tools for, or keep in free-text
notes, because the big booking apps do not shape them per trade (research report:
`reports/Beauty pro build page research.md`).

---

## 1. Deposits and cancellation rules, per service

```
Add deposits and a cancellation policy to {APP}, set separately for each service.

For every service I want to choose:
- no deposit, a flat amount, or a percent of the price
- whether the deposit comes off the final bill
- how many hours before the appointment a client can cancel and get it back
- what happens to a no-show

A booking is not confirmed until the deposit is paid. Use Stripe's hosted payment page so card
numbers never touch my app or my database. Show the client the policy in plain words before they
pay, and save a copy of exactly what they agreed to with the booking.

Before you write any code, tell me your plan and which screens change. Then build it, and give me
three bookings to try by hand: one with no deposit, one with a percent, and one cancelled late.
```

## 2. Fill, touch-up and rebook timing

```
In {APP}, each service can have a "come back" window, and the app should act on it.

Examples of what I mean, so you understand the shape:
- a lash fill is due 2 to 3 weeks after the last set; after that it is a full set at full-set price
- a permanent makeup touch-up must happen 6 to 8 weeks after the first session
- a facial series is every 4 weeks

Let me set the window and the price rule per service. When a client books, show the right price for
where they are in their window. A week before a window closes, remind them with a message I can edit.
On my side, show me a list each morning of who is due.

Plan first, then build. Show me how to test it with made-up dates.
```

## 3. Consent forms per treatment, signed every visit

```
Add consent forms to {APP}, one per treatment, that the client signs at every visit, not once forever.

Each form has my own wording and a contraindication checklist (for example: pregnant or nursing,
on retinoids or Accutane, recent sunburn, allergies, blood thinners). If the client ticks anything
on that list, flag the appointment for me before it starts.

Store each signed copy with the date, the client's answers and their signature, and never let a
signed copy be edited afterwards. If I change the form wording, old signed copies keep the old wording.

Plan first. Then build one form end to end and show me how to sign it as a test client on my phone.
```

## 4. Patch tests and allergy tracking

```
Add patch-test tracking to {APP}.

Some services (lash extensions, brow tint, hair color, permanent makeup) need a patch test before the
first appointment, and the test has to be recent. Let me mark which services need one and how many
days it stays valid. Record the date and the result (pass, reaction, notes).

If a client tries to book one of those services without a valid test, do not let the booking through.
Instead, offer them a patch-test appointment first, at least 48 hours before.

Show me the plan, build it, then walk me through testing all three cases: no test, expired test, valid test.
```

## 5. The visit record, shaped to my trade

```
I am a {WHO}. Every visit, I need to write down specific things that a plain notes box does not hold well.

Interview me, one question at a time, about what I record at a visit (for example: a hair color formula
and processing time, a lash map with lengths and curls, a pigment and needle for permanent makeup, or a
product, lot number, expiry date and units per area for injectables). Then design a visit record for
{APP} with a field for each of those.

When I start a new visit for a returning client, copy last visit's record forward so I only change
what is different. Keep every past visit readable and unchanged.

Do not build anything until I have approved the fields.
```

## 6. Before and after photos

```
Add before and after photos to {APP}.

I take photos at each visit from the same angles. Store them with the client and the date, private to
me. Let me put any two side by side to compare. Never put client photos anywhere public, and never use
a public link that anyone could guess.

Make sure every photo is backed up off my phone, so losing the phone never loses a photo, and show me
where the backup lives.

Plan first. Then build it and help me test it by taking photos on my phone and opening them on my computer.
```

## 7. Aftercare messages that send themselves

```
Add aftercare messages to {APP}, per service, that go out on their own after a visit.

For example: a tattoo or permanent makeup healing check on day 1, day 3 and day 30, or a chemical peel
check on day 1, 3 and 7. I write the messages once per service and pick the days. The client gets them
by email. If I want texts too, walk me through what texting needs first (the registration with the phone
carriers, what it costs, how long it takes) before you set it up.

Let me see what is scheduled for each client and stop it for one client with one tap.

Plan first, then build email only. Show me how to test it without waiting days.
```

## 8. Packages, series and memberships

```
Add packages and memberships to {APP}.

A package is a set number of sessions bought up front (for example 6 microneedling sessions). A
membership is a monthly payment that includes something each month. Track how many sessions each
client has left, take one off when a visit is marked done, and show the client their balance.

Use Stripe for the payments. Explain what happens when a card fails on a membership, and let me
decide what the client sees.

Plan first. Then build packages only, and show me how to test buying one and using two sessions.
```

## 9. A home-care plan per client

```
Add a home-care plan to {APP}.

After a visit I choose the products and steps this client should use at home, morning and night, with
a short reason for each. The client sees their own plan in their app and can tick off what they did.
If I sell the product, show where to buy it (in the studio, or my own link).

When I change the plan at the next visit, the client sees the new version and the old one is kept.

Plan first, then build it, and show me what the client sees on their phone.
```

## 10. Waitlist, travel time and taking everything with me

```
Three small things for {APP}:

1. A waitlist. When a client cancels, offer the open spot to the people waiting for that service, first
   come, first served, with a link that expires.
2. Travel buffers. I sometimes go to clients. Let me add travel time before and after those
   appointments so nothing gets booked on top of my drive.
3. Export. One button that downloads everything: every client, every visit record, every form they
   signed, and every photo, in plain files I can open without {APP}. This is my data and I want to be
   able to take it anywhere.

Plan all three, then build them one at a time, and stop after each so I can check it.
```

---

## Before these go in the roadmap

- Ashley runs each one against a test copy of an app and keeps the result, the same way the other 35
  were tested. The page says "tested on a real build", and that claim must stay true for these ten.
- Decide where they sit. The proposal is a new "Beauty Pro Pack" group in week 3 to 4, plus a line in
  the setup boxes suggesting `{WHO}` be the trade ("lash artist", "esthetician", "tattoo artist").
