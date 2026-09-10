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
- Nothing that reads as a medical diagnosis — estheticians have a scope of practice, and the posts
  should model staying inside it.
- Point at state boards and real authorities for anything regulatory rather than asserting a rule.
- Link to one or two other posts, and to `/slickchart` once, naturally.
- 700-1000 words is the target.
