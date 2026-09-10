# How the blog works

Posts are markdown files in this folder. `node scripts/build-blog.cjs` (or `npm run build:blog`,
run from `slickchart-vercel/`) turns them into pages under `blog/` and regenerates `sitemap.xml`.

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
state that would get truncated or look thin in search results.

## Drafts

`draft: true` means the post exists as a file and nothing else: no page, no sitemap entry, no link
from the blog index. It cannot be reached on the live site.

**To publish a draft:** change `draft: true` to `draft: false`, run the build, commit and push.
Unpublishing works too — flip it back and the build deletes the stale page.

## The weekly draft

A scheduled Routine writes one new draft a week from `TOPICS.md`. It never publishes. Ashley reads
it, and it goes live only when she says so. That's deliberate: posts carry her name and her
professional credibility, and skin-treatment advice shouldn't go out unread.

## Writing guidance

- Genuinely useful beats keyword-stuffed. Google penalises mass-produced content made only to rank.
- No invented statistics. If a number isn't known, use arithmetic, ranges, or say it varies.
- Nothing that reads as a medical diagnosis — beauty pros have a scope of practice, and the posts
  should model staying inside it.
- Point at state boards and real authorities for anything regulatory rather than asserting a rule.
- Link to one or two other posts, and to `/slickchart` once, naturally.
- 700-1000 words is the target.
- Audience is solo beauty pros: estheticians first, then waxing, PMU, and makeup artists. Write to a
  one-person business, not a salon with a front desk.

## Writing about competitors — read this before naming anyone

Comparison and "alternatives" posts are the highest-intent content in this category, so they're worth
writing. They're also the easiest way to publish something false under Ashley's name.

**Never state a competitor's price, fee, or feature from memory.** Pricing in this category changes
often and plans get renamed. Either:

- fetch the competitor's own live pricing or feature page in the same session and cite what it says,
  with the date you checked; or
- write the comparison in terms of *categories and questions* ("ask what a plan costs once forms and
  marketing are added; ask what the card-not-present rate is") and tell the reader to check current
  pricing themselves.

Other rules: compare honestly, name what a competitor genuinely does better, never imply an
affiliation or use a competitor's logo, and don't claim SlickChart has a feature it doesn't. A
comparison that's fair is more persuasive than one that isn't, and it's the only kind that survives
someone in the industry reading it.

## Positioning — what makes SlickChart different

Lead with these rather than a feature list. See TOPICS.md for the reasoning.

1. **You don't have to leave Square.** SlickChart connects to the seller's own Square account instead
   of replacing their booking and POS. The biggest reason people don't switch software is migration
   and retraining — this sidesteps it entirely, and no all-in-one competitor can make the same offer.
2. **Charting is the product.** Notes, photos, forms and aftercare are the core, not an upsell tier.
3. **One place instead of three subscriptions.** Especially for PMU and waxing pros who currently pay
   for booking and a separate consent-form app.
4. **The client gets an app too** — aftercare, forms, photos and messages, not just a booking screen.

Don't oversell. If a reader would be better served by something else, the post can say so; that's what
makes the rest of it credible.
