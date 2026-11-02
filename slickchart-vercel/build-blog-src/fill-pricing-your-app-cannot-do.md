---
title: The fill pricing your booking app cannot do
h1: Lash fills, color touch-ups and the pricing your booking app cannot do
description: A fill is priced by how long it has been since the last visit. Why generic booking apps leave that to you, and what it takes to make your own app do it.
date: 2026-11-02
keywords: lash fill pricing, lash fill booking, booking app for lash artists, time since last visit pricing, build your own booking app, beauty business app, build an app with ai
---

Look at a lash artist's booking page and you will often find the same thing: three or four fill services that are really one service.

There is a fill for clients who come back soon, one for a little later, one for later still, and a note underneath explaining which one to choose based on the date of the last visit. Some pages add a line saying that anything past a certain point is booked as a full set. Some say an overdue fill will be adjusted at checkout.

Every one of those notes is a workaround. The rule is simple and the artist knows it by heart: a fill is priced by how long it has been since the client's last appointment. The booking app just does not know it.

## The rule the app cannot see

Most booking apps price by the service you pick from a menu. That is a reasonable design for a salon menu with a hundred services. It means the price is decided by the client's choice, not by the client's history.

Fill pricing works the other way round. The right price depends on a fact the client may not remember and the app already has: the date of their last visit. So the artist splits one service into several, writes instructions, trusts the client to read them, and then checks by hand when the booking comes in. If the client picked the shorter fill but came back late, someone has to notice, and someone has to have an awkward conversation at checkout.

Lashes are the clearest example, but it is not only lashes:

- **Color.** A root touch-up and a full color are priced differently, and which one a client needs depends on how long it has been.
- **Brows.** A tint, a lamination refresh or a wax booked on a regular rhythm can follow the same logic.
- **PMU.** A perfecting session inside its window is one thing. A refresh a year or more later is another.

Each trade has its own version, which is exactly why a booking app built for everyone at once leaves it to you.

## What it looks like when the app knows the rule

When the app is yours, the rule can live where it belongs. The client books "a fill." The app looks up their last visit, works out how long it has been, and shows the right fill, the right price and the right amount of time on your calendar. If it has been too long for a fill, it says so kindly and offers the full set instead, before anyone arrives.

Nothing about that is technically hard anymore. AI writes the code, and that part is genuinely solved. What it needs from you is the rule, written down precisely.

## The hard part is deciding the rule

This is where most people stall, and it has nothing to do with technology. Writing the rule forces decisions you have been making on the fly:

- Where exactly does each window start and end? Counted from the last visit's date, or the last fill's?
- What happens on the boundary day?
- Does a client who cancelled and rebooked keep their place in the window?
- Is the overdue case a higher fill price, a full set, or your call each time?
- Does a brand-new client ever see the fill option at all?

None of those have a right answer that a blog post or an AI can give you. They are your business decisions. The value of building your own app is that you make them once, deliberately, and then the app applies them the same way every time, including the day you are running behind.

Once you have them, the description almost writes itself:

> When an existing client books a fill, look up their last completed lash appointment. If it was within my first window, show the shorter fill. If it was within my second window, show the longer one. If it was longer ago than that, explain that a full set is needed and offer that instead.

That sentence, with your own windows filled in, is most of the feature. I wrote more about writing descriptions like this in [how to describe what you want built](/build/blog/describing-what-you-want-built).

## Then try to break it

Before a single client sees it, book it as each of them would. A client who comes back right on time. One who comes back a day past a window. One whose last visit was a full set rather than a fill. A brand-new client who taps "fill" by mistake. Each one should land exactly where you decided. You do not need to read code to check that. You need to know what should happen, and you already do.

## Why this one example matters

Fill pricing is small, but it is a good test of the whole idea. A generic app makes the trade adapt to the software. Your own app adapts to the trade. If your days are full of little rules like this, the ones you explain to clients and check by hand, each of them is a feature you could own.

I wrote about a closely related rule, the bookings that should never go through without a patch test or a signed form, in [the booking your app should refuse](/build/blog/booking-your-app-should-refuse).

If you want to see what an app shaped around your own services would look like before deciding anything, the [free starter](/free) walks you through building a clickable demo of it.
