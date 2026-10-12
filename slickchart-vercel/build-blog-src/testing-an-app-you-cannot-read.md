---
title: Testing an app when you cannot read code
h1: How to check your own app when you cannot read the code
description: You cannot read the code, but you can be the person using it. A practical way to test your own app, and the two questions that catch real bugs.
date: 2026-10-12
keywords: how to test an app you built with ai, testing an app without coding, check an app before launch, non technical app testing, test your own app
draft: true
---

Once your app starts working, a particular worry turns up: *I cannot read any of this, so how would I know if it is broken?*

I had it too. The honest answer surprised me: you are better placed to test your app than you think. Not because testing is easy, but because the code being correct and the app being right are two different things, and only one of them is a code question.

## Running is not the same as working

AI writes code that runs. That part is genuinely solved, and it is the part people worry about. What AI cannot know is what you meant.

It does not know that your clients book in pairs, that you never charge for the first ten minutes, that nobody in your trade would ever type a date that way round. It will produce something that runs perfectly and does the wrong thing, confidently, and nothing in the code will look wrong, because nothing in the code *is* wrong. The requirement was wrong.

That is not a programming problem. It is a "what is this actually for" problem, and you are the only person in the room who knows the answer.

## You are the worst person to test your own app, and that is fixable

Here is the catch. By the time your app works, you have used it two hundred times in the same order. Your fingers know the way, your test data is tidy, and it works every time.

Real people do not do that. They arrive from somewhere else, in a hurry, with a name that has an apostrophe in it.

Three habits fix most of this:

**Test as a stranger.** This is the big one and almost nobody does it. You built the whole app while already signed in, which means the one path you have never once walked is the path every single new person walks first. Sign out. Better, use a device that has never seen it, or a private window. Sign up from scratch with a real email. Confirm it. Reset your password on purpose. Sign back in. Come back tomorrow and see if you are still signed in. I found more problems in that one exercise than in weeks of ordinary use.

**Write down what a real person does, then do only that.** Three or four sentences, in their words, not yours. "She opens it between clients, finds the person she just saw, types two lines, and closes it." Then do exactly that, with no warming up and no going the long way round because you know it works.

**Do it on a phone if you built it on a laptop.** Buttons that are easy with a mouse can be genuinely unreachable with a thumb, and a big screen hides it.

## The break list

None of these need any code knowledge. They are just mean.

- Leave a required thing empty and save anyway.
- Put an apostrophe in a name. O'Brien breaks more software than you would believe.
- Tap save twice, fast. Did it save one thing or two?
- Start filling something in, go back, then come forward again. Is your half-finished work still there, or did it quietly vanish?
- Turn your wifi off in the middle of saving something.
- Type far too much text into a small box.
- Try zero. Try a negative number. Try a date in the past.
- Do the main thing twice in a row without closing anything.

Each takes seconds, and they are the situations the demo never covers.

## The two questions that catch the expensive bugs

If you only ever ask two things, ask these.

**Did it actually save?** Not "did the screen say saved." Close the app completely, open it again, and go and look. A message saying it saved is a message. The data being there is the fact.

**Is it still there tomorrow, and on your other device?** The worst bug my own app ever had was exactly this shape: I made something on my phone and it was not on my computer. Both screens said everything was fine. Nothing looked broken to anybody, and it took far longer to find than it should have, because it only showed up on the second device.

If your app stores anything at all, that pair of questions is worth more than every other test combined. Make a thing here, look for it there, the next day.

## What makes it "tested" rather than "I had a look"

Write the list down. Once. On paper is fine.

The reason is not organisation, it is memory. You will fix something next month and quietly break something you tested in week two, and you will not think to check it because it worked last time you looked. Running the same short list before every release is what stops that, and it is the entire idea behind proper testing, minus the jargon.

Mine was about fifteen lines and took ten minutes to run.

## What this will not tell you

I want to be straight about the limit. Using your app like a person tells you whether it does the right thing. It does not tell you whether it is safe, and if you are storing other people's information or taking money, those are not the same question. Whether one customer can reach another customer's data is its own subject and deserves its own post, not a bullet point here.

Everything else you can check yourself, today, with no code and no tools. Being non-technical is not the obstacle. Knowing what the app is supposed to do is the rare part, and you already have it. If you want the ordered version, [the free walkthrough of the first steps is here](/free).

I wrote about [describing what you want clearly enough to get it back](/build/blog/describing-what-you-want-built) separately, because a good description stops half of these bugs getting built at all.
