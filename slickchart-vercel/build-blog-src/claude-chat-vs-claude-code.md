---
title: Claude Chat or Claude Code?
h1: Claude Chat or Claude Code: knowing which window you should be in
description: The most common beginner mistake when building an app with AI is using the wrong tool for the job. Here is the simple rule for which one to open, and when.
date: 2026-09-16
keywords: claude chat vs claude code, claude code for beginners, build an app with claude, ai coding tool, which claude to use
---

If I had to name the single mistake that wastes the most beginner time, it is not a bad prompt. It is a good prompt typed into the wrong window.

There are two ways to work with Claude, and they are not two versions of the same thing. They do genuinely different jobs. Once you can tell them apart, a lot of the frustration people describe as "the AI keeps forgetting" or "it broke something else" stops happening.

## The plain version

**Claude Chat is for thinking.** You are in a conversation. You describe things, ask questions, get explanations, work out what you want. Nothing you say changes any file anywhere.

**Claude Code is for doing.** It runs on your actual project. It can read your real files, change them, and put the change where it belongs. It is the difference between describing a shelf and having someone build it into your wall.

That is the whole distinction. Thinking, or doing.

## The rule I use

Ask yourself one question before you type: **does this need to touch my actual project?**

If the answer is no, you are in Chat. Planning what the app should do. Working out what screens exist. Deciding on a name. Writing your privacy policy. Asking what a word means. Drafting the words on a sales page. Making an icon. Naming your colours. Talking yourself out of a bad idea. None of that touches your files, so none of it needs Code.

If the answer is yes, you are in Code. Adding a feature. Fixing something broken. Changing what a button does. Adding a database. Putting the app live. Anything where the point of the exercise is that a file ends up different afterwards.

## Why using the wrong one hurts

The failure is asymmetric, which is why it confuses people.

**Using Chat when you needed Code** feels productive and produces nothing. You get code back in the conversation, it looks right, and then you are left holding it. Now you have to work out which file it goes in and what it replaces, and that is precisely the job you were trying to avoid doing. This is the version where people end up copying blocks of text between windows, pasting them into the wrong place, and breaking something they cannot diagnose. The tool that could have read the file and made the change was right there.

**Using Code when you needed Chat** is the opposite problem. You are still deciding what you want, and meanwhile something is making changes to your real project based on half-formed ideas. You end up with three abandoned attempts at a feature you had not decided on yet, tangled into files you now have to clean up.

Thinking out loud is free in Chat. It is not free in Code.

## The order that works

Here is the loop I ran a few dozen times over six weeks, and it is always the same shape.

1. **Decide in Chat.** Describe what you want until you can say it in a sentence. If you cannot say it in a sentence, you are not ready to build it, and no tool fixes that.
2. **Ask for the plan first.** Before anything gets written, have the plan read back to you in plain words. This is where you catch the misunderstanding, while it is still free to catch.
3. **Build it in Code.** One change at a time. Not five.
4. **Check it yourself.** Open the app and use it like a person would. Not "does the code look right," which you cannot judge, but "does the button do the thing."

Step four is not optional and it is not beneath you. You do not have to read code to know that tapping save should save.

## Two habits that save real money

**Ask for one change at a time.** A request with five things in it produces five things you now have to verify at once, and when one is wrong you cannot tell which. Small changes are easier to check, easier to undo, and cheaper.

**Say what should not change.** The most useful sentence you can add to a request is a boundary. Change this button, and do not touch anything else on the screen. It costs you seven words and it prevents the specific disaster where fixing one thing quietly breaks two others.

## If you take one thing from this

You do not need to understand what either tool does under the hood. You need to know which one you are supposed to be in, which comes down to one question asked before you type: am I deciding, or am I building?

People who get that right stop having the experience of fighting the AI. People who get it wrong spend weeks convinced they are bad at this, when actually they were just in the wrong window.

This is also a good illustration of the wider point in [you do not need to learn to code](/build/blog/build-an-app-without-coding). Nothing in this post is a technical skill. It is knowing the order and knowing which tool does what, which is the part nobody hands you.

If you want to try the thinking half of that loop with no commitment, the [free starter](/free) walks you through describing your idea until it turns into a clickable demo you can tap through on your phone. That whole first stage happens in conversation, before any code exists at all.
