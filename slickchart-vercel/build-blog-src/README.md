# How the Build blog works

Posts are markdown files in this folder. They build to `build-blog/` and are served at
**`/build/blog`** (a `vercel.json` rewrite, same pattern as `/build/unlocked`).

`node scripts/build-blog.cjs` (or `npm run build:blog`, run from `slickchart-vercel/`) builds
**both** blogs — this one and `blog-src/` — because that one script also owns `sitemap.xml` and a
second generator would clobber the first one's entries. Adding a post here does not require touching
the script.

## Frontmatter

```
---
title: Short SEO title            # <title>; must be <= 47 chars (60 with " | SlickChart")
h1: The longer on-page heading    # optional; defaults to title
description: 70-160 characters    # the search-result snippet
date: 2026-09-17                  # YYYY-MM-DD
keywords: comma, separated        # optional
draft: true                       # optional; true = written but NOT published
---
```

The build **fails** on a too-long title or an out-of-range description, so a post can't ship in a
state that would get truncated in search results.

## Drafts

`draft: true` means the post exists as a file and nothing else: no page, no sitemap entry, no link
from the blog index. It cannot be reached on the live site.

**To publish a draft:** change `draft: true` to `draft: false`, run the build, commit and push.
Unpublishing works too — flip it back and the build deletes the stale page.

## The weekly draft

A scheduled Routine writes one new draft a week from `TOPICS.md`, the same way the SlickChart blog
works. It never publishes. Ashley reads it, and it goes live only when she says so.

The Routine is bound to a single Claude session and reports there rather than by push or email. **When
a new conversation starts it has to be re-pointed at that session or the weekly post silently stops** —
see section 4 of the repo's `CLAUDE.md` for the ids and the procedure. Both weekly Routines (this
blog and the SlickChart one) have the same failure mode, so check both.

## Writing guidance — read this one carefully

This blog sits in the "make money online" neighbourhood, which is full of people making claims they
cannot support. Everything that makes it credible comes from *not* sounding like them.

- **No income claims, ever.** Not "life-changing money," not "replace your salary," not a number, not
  a range, not a screenshot, not "students have made." Not implied through a story either. The
  product page's own line is the boundary: time and location freedom are facts about what software
  is; financial freedom is what people are chasing and nobody can promise it. Write inside that.
- **No em dashes.** Ashley's preference, and it's consistent across `/build`, `/free` and this blog.
  Commas, full stops and colons do the job.
- **No invented statistics.** No "87% of founders." If a number isn't known, use arithmetic, ranges,
  or say it varies.
- **Platform rules change.** App store requirements, fees, and third-party turnaround times are
  moving targets. Write them as *what Ashley planned around during her own build*, and tell the
  reader to check the current policy page themselves. Never state a current fee or rule flatly from
  memory.
- **Ground it in the real build.** The credibility here is one specific true story: an esthetician
  with no prior tech experience, six weeks, both app stores, built between clients. Don't invent
  details of it. What's on `/build` is the source of truth for that story.
- **Useful beats keyword-stuffed.** Google penalises mass-produced content made only to rank.
- **700-1000 words.** Link to one or two sibling posts, and to `/free` once, naturally. The
  end-of-post CTA already points at `/free`, so one in-body link is plenty.
- **Audience:** someone who already has an idea and no technical background. Not developers, and not
  people looking for an idea. `/build` says explicitly that it does not help you find one.

## Positioning — what this blog is arguing

Every post is a version of the same claim, which is also what the product sells:

1. **The code is not the hard part anymore.** AI writes it. That part is genuinely solved.
2. **The hard part is the order.** Steps have dependencies and waiting periods, and the waiting
   starts when you file, not when you're ready. Doing a free form in week six instead of week one
   costs a month.
3. **The app stores are optional.** A web app people add to their home screen is a real app. Saying
   so out loud is unusual in this category and it's true.
4. **The costs are small and knowable.** An AI subscription, and some optional fees. No commas.

If a post doesn't land on at least one of those, it probably belongs on the SlickChart blog instead.
