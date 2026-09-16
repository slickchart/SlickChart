---
title: The Google Play rule that costs a month
h1: The Google Play rule that quietly costs you a month
description: Google Play makes personal accounts run a closed test with a dozen testers for two weeks. The business route skips it, but only if the paperwork starts early.
date: 2026-09-16
keywords: google play 12 testers, closed testing requirement, D-U-N-S number google play, publish app google play, app store requirements
---

This is the one I tell people about first, because it is the step that costs the most calendar time and it is invisible until it has already happened to you.

Here is the shape of it. Google Play treats a personal developer account differently from a business one. If you sign up as an individual, before your app can go out to the public you have to run a closed test: a group of testers, signed up and actually opted in, staying on the test for a continuous stretch of days. When I went through it the requirement was a dozen testers for fourteen straight days. If people drop out below the threshold, you are not shortening that clock, you are restarting it.

A business account does not have that requirement. So the obvious move is to register as a business.

And that is where the trap is.

## The dependency nobody draws for you

To open a Google Play developer account as an organisation, you need a D-U-N-S number. That is a business identifier issued by Dun and Bradstreet, not by Google, and Google verifies your details against it.

Requesting one is free. They will offer you a paid expedited option, and you do not need it if you plan properly. What you do need is patience, because the standard request is measured in weeks, not days. I planned around roughly a month.

So read those two facts next to each other:

- Skipping the test requires a business account.
- A business account requires a number that takes weeks to arrive.

Which means the decision about how you publish to Google Play is a **week one** decision. Not a week six decision. By week six it is too late to be a decision at all, because whichever path you are on, you are on it.

If you request the D-U-N-S number on day one, it turns up quietly while you are building and you never feel it. If you wait until your app is finished and you are ready to submit, you have a finished app and a month of nothing, or you fall back to running the closed test, which is its own two weeks plus the work of finding a dozen real humans who will actually install the thing and leave it installed.

## Why finding twelve testers is harder than it sounds

People underestimate this part. The testers have to be real accounts that opt in through the link you send, and they have to stay in. Friends say yes and then never tap the link. Someone changes phones. Someone uninstalls because they were only doing you a favour.

You are also asking people to look at your app before it is good, which is a different ask from "try my app," and you only get to make it once with any given person.

None of that is impossible. It is just work that has to happen while you are also finishing the app, and it lands in the exact week when you thought you were done.

## What I would actually do

Three options, honestly laid out.

**Start the business paperwork in week one.** Request the D-U-N-S number before you have anything to publish. It costs you nothing but the form, and it buys you the option. If you later decide not to go to Google Play at all, you have lost nothing.

**Or plan the closed test as real work, not a formality.** Put it on the calendar as a two week block, start recruiting testers in week four rather than week six, and over-recruit, because some of them will not follow through.

**Or skip Google Play for now.** This is the one people do not expect me to say. A web app that people add to their home screen works on Android without going near the Play Store, and for a lot of businesses that is enough to start. I wrote about [whether you need the app stores at all](/build/blog/do-you-need-the-app-stores) separately, because it deserves its own answer.

## The general lesson, which is bigger than Google

The reason I lead with this example is not that Google Play is especially unfair. It is that this is the *shape* of almost every problem in shipping software as a beginner.

The hard steps are not hard. They are slow, and they have dependencies. Something cannot start until something else has finished, and the waiting does not begin when you feel ready. It begins when you file the form.

That is why the order matters more than the skill. You can be perfectly capable and still lose a month to doing a free, five minute form in the wrong week. Nobody writes that down for you anywhere, which is the entire reason I ended up writing it down.

## Check it yourself before you rely on it

One caveat I want to be clear about: these are platform rules, and platform rules change. The numbers above are what I planned around during my own build. Before you make a decision on them, go and read Google's current developer policy pages yourself, and check what Dun and Bradstreet currently says about turnaround for your country. Take two minutes. It is the cheapest two minutes in this whole process.

If you want to see what the earliest part of a build feels like before you take any of this on, the [free starter](/free) turns your idea into a clickable demo of your app in about seventy minutes, with no coding and nothing to install.
