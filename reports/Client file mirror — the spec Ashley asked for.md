# Client file mirror — the spec, in Ashley's own words

The working prototype: **https://claude.ai/artifact/MaaqR2uQxGCgJbWLQPsq6T**

This file exists because the scratchpad copy was lost once when the container recycled. Every
decision below came from Ashley directly. **Treat it as settled unless she says otherwise — do not
re-raise a point that is marked settled, and do not quietly drop one when rebuilding.**
Source: the 2026-10-09 / 2026-10-10 session. Research behind it is in
`Client file redesign research.md` and the two virtual-consult reports beside this file.

---

## 1. The core idea

> *"what if we had the client file mirror what the client sees on their app? when you click the
> client it has bottom nav tabs for their journey, photos, product recs, etc"*

> *"that was its more cohesive"*

> *"but also of course the provider has their extra features that are needed and built in"*

So: the provider's client file uses **the same tabs, under the same names, as the client's own app**,
plus the provider-only things layered in. Not a separate mental model for each side.

**Tabs:** Visit · Journey · Photos · Homecare · Her file
A **blue dot** marks a tab the client also has under that same name (Journey, Homecare). Visit,
Photos detail and Her file are provider-side.

The prototype also offers a **top-tabs vs bottom-bar** toggle so the placement can be felt rather
than argued about. Not yet decided.

---

## 2. Vitals must stay on screen — settled

> *"dont forget to keep client vitals/intake info somewhere top of mind and visible as that is very
> important"*

> *"those tabs at the top - skin, fitz, last seen should be changed to the most important things
> like allergies, concern/goals, conditions"*

A safety strip sits **above the tabs and never moves**, so it is on screen on every tab:

- Allergy chip (red), condition chip (amber), and an outstanding-forms chip that is tappable
- Next appointment, treatment, visit number
- Three fact tiles: **Skin · Goal · Fitz**

Allergies, concerns/goals and conditions are the promoted ones. "Last seen" was demoted — it was
taking a slot that a safety fact needed. Allergy text wraps to two lines rather than truncating:
truncating an allergy to fit a tile is the wrong failure.

---

## 3. "Send to Jennifer" — her names, settled

> *"the virtual consult/product consult invite, notes, forms, etc should be a really clear and easy
> section"*

> *"I would like them to be named - Photo consult, product consult, Forms, Guides + Courses, Visit
> summary"*

> *"the descripton next to it is good still"*

One section headed **Send to Jennifer**, with the line *"Everything here lands in her app. She gets
a notification."* Five rows, in this order, **named exactly this**:

| Row | Description (she approved these, keep them) |
|---|---|
| **Photo consult** | She sends photos from home, you reply when you have a minute |
| **Product consult** | A few questions, then you build her product plan |
| **Forms** | Intake, consent, or one you wrote · 1 still out |
| **Guides + Courses** | 7 guides, 3 courses · last sent 6 Oct |
| **Session summary** | Written when you finish a session · she reads it in Journey |

Separately below, **Just for you → Private notes**, with *"Jennifer never sees these"* said plainly.

---

## 4. The consult flows — settled

> *"When clicking the photo + product consults there should be the associated processes of intakes,
> forms, etc built into the flow. make sure to follow the rules we dictated earlier of these being
> editable wording, updates can be made when communicated back and forth, and this flow should all
> be easy to follow on the client side"*

> *"yes lets have the client side follow the changes we decide on too"*

Both consults are **step-throughs with a You / Jennifer toggle**, so the provider can walk her
client's side and see what she is putting them through.

**Photo consult, provider side:** what to ask her → changing it just for Jennifer → which photos →
your words → send it → she sent them → your reply → update her plan → what she will see.

**Photo consult, client side:** it lands on her Home → three questions → then the photos → a look
before it goes → then she waits → her reply lands in Journey → she can write back.

**Product consult** is the same shape with **no photos** — it is about what she already owns. Its
plan lands in **Homecare**, the tab her routine already lives in, not somewhere new.

Consent is enforced inside the flow: photo consent signed is shown, and *"if it was missing she
would be asked to sign before the camera opens."*

---

## 5. Editable wording that PERSISTS — settled

> *"for the photo and product consult form make sure that is fully editable on providers side, and
> that those edits persist so they are not re-writing them every time, but they can change if
> wanted each time"*

- Questions and photo angles are **saved sets**. *"Set up once. It comes back exactly like this
  every time."* Untick one and it stays unticked next time.
- Ticked questions are pulled from her intake form, so she is not writing them twice.
- Every message is editable with tokens: `{client} {me} {business} {consult} {fee}`, with a
  **"She will see:"** preview resolved underneath.
- **The one-off vs forever choice** — after changing any wording she picks:
  **Just for Jennifer** (saved version untouched) or **Save it for everyone** (changes it from now
  on). *"So a one-off tweak for one client never quietly rewrites the version you send everybody."*
- Reset to default restores the original AND keeps up with later improvements we make to it.
- Photo consult and product consult keep **separate** saved question sets.

---

## 6. Plan updates driven by what the consult found — settled

> *"lets have an option for the homecare routine and product recommendations to be updated based on
> product and photo consult findings. have a prompt or option on the provider side to update them
> logically based on what comes up. make sure this gives suggestions that are helpful but make it
> fully editable/customizable to change one, some, or all recommendations. this is an important
> follow up for those consults"*

An **Update her plan** step in both consults. Each suggestion is **one row, ticked independently**,
with Select all / None:

| Kind | Colour | Example |
|---|---|---|
| **Swap** | amber | Drugstore SPF → Mineral SPF 40 |
| **Add** | green | Peel pads, twice a week |
| **Keep** | grey | Cica cleanser at night |
| **Stop** | red | The SPF that stings |
| **Restart** | amber | Retinol, once a week to begin |

**Every row shows WHY, quoting her own words back** — *She said "a new SPF that stings"*. Each row
is editable. Rows that need a conversation first arrive **unticked** with the reason said out loud
(*"Unticked, because you may want to talk about this in person"*).

Then a **What she will see** step before anything sends.

---

## 7. Change flags on BOTH sides — settled

> *"make sure that both of the consults have some sort of flag for both provider and clients of
> changes made so its easy to see"*

A distinct accent-coloured flag, deliberately **not** blue (which means "she sees this") and **not**
amber (which means "needs you"):

- **Provider:** *"Changed 8 Oct by her photo consult. 2 steps, 1 product."* on Homecare, and
  *"2 changes went to her plan from this"* on the Journey entry.
- **Client:** *"Ashley changed 2 things in your routine."*
- Changed lines carry a **changed** / **new** tag, and the client sees a struck-through
  **was: the SPF you had** so she knows what it used to say.
- Her plan **updates in place** — she is never left comparing two versions of it.

---

## 8. Hard rules — do not violate when building

1. **NO CAP on products in a plan.** *"some people need more and I dont want a cap."* The copy says
   *"As many as she needs. No limit, no nagging."* **Settled. Do not re-raise.**
2. **Periods, never clock times.** "Morning" / "Night" / "Twice a week", not "8am". 89% vs 77%
   comprehension. The client-side step says so explicitly.
3. **No time promises.** *"take out any promise of 'usually responds within time frame'"* — she is
   told what happens next, not how fast. *"Never say 'usually within a day'. One busy week and the
   app has lied to her."*
4. **The reply is a DRAFT and never auto-sends.** *"Nothing reaches Jennifer until you read it and
   send it."* Stated at every step that could send.
5. **No diagnosing.** Never label a practice "Medical" or "Master".
6. **No AI score is ever shown to the client.**
7. **Assume the provider is not tech savvy. Assume the same of the client.**
8. **A consult is a conversation, not a receipt.** It stays open and she can write back.

---

## 9. Answers to the questions she asked of the mock

- **"where are her photos"** → their own tab, because she reaches for them far more often than
  anything in Her file. One library indexed by visit, a drag-handle before/after wipe (a vertical
  wipe is the only comparison that works in portrait), area filters, and consent state shown with
  sharing blocked when marketing consent was never given.
- **"what does the 'start from last visit' button mean"** → it was unclear, so it was renamed
  **Copy this into today's note** and now says what it does: *"Copies the words only. You still
  write what you actually did today, and nothing is saved to her file until you finish the
  session."*
- **"and where do her forms live"** → two places on purpose. **Forms** under Send to Jennifer for
  sending one; **Her file → Forms & consents** for their status, including a greyed row for
  *Marketing photo consent · Not asked for yet*.

---

## 10. Naming, unified across both apps — settled and SHIPPED (`2026-10-10b`)

> *"client app should match photo/product consult names, and name them the same as session
> summaries please"*

Both apps said **Virtual consult** in seven different casings, and called the same object a
**session summary** in some places and a **visit summary** in others.

- **Virtual consult → Photo consult**, everywhere, both apps. The live app only ever had ONE consult
  and it is photo-based; the `kind` field (`skin`, `hair`…) is the PRACTICE type, not photo vs
  product. **Product consult does not exist in the code yet** — it is new work from the mock.
- **One name for the summary: "Session summary".** Ashley chose it over "Visit summary" when asked.
  Sentence case everywhere, so no more `Session Summary` / `Visit summaries` drift.

88 replacements. Only hyphenated identifiers keep the old word — `virtual-consult-invite` (the wire
event) and `virtual-submit` (a nav key) — because they are protocol, not language, and renaming
them would break in-flight invites. Never rename those without a migration.

## 11. Still open

- **Top tabs vs bottom bar** — toggle is in the prototype, not decided.
- **Product consult does not exist in the live app.** Only the photo consult is built.
- **The two-store summary problem — the real blocker, diagnosed and NOT fixed.** The chart reads
  `sessionSummaries[id]` while the client app reads `c.summaries`. Two stores for one thing. This
  is stage 1 of the redesign: the mirror cannot be honest while the two sides read different
  copies. See SESSION-HANDOFF §2ao.
