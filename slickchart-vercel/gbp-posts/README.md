# Google Business Profile posts

One GBP listing covers **both** products, so every week gets **two** posts: one aimed at SlickChart
(solo estheticians) and one aimed at Build Your Own App. Each is written from that week's blog post
and sends people to it.

Files are `YYYY-MM-DD-slickchart.txt` and `YYYY-MM-DD-build.txt`, plain text, ready to paste.

## The rules Ashley set

1. **Use as close to the 1500 character limit as possible.** Target **1480 to 1499**. A short GBP
   post wastes the slot. Count it with code and state the count when reporting it, because eyeballing
   it is how you end up at 1200 or at 1510. Google counts characters, not words, and a post over the
   limit is rejected outright.
2. **SEO filled.** Put the main keyword in the **first 80 characters**, because that is roughly what
   shows before the fold. Then work the real search terms through the body naturally: *best software
   for a solo esthetician, esthetician software, client charting, SOAP notes, treatment notes,
   consent forms, Square* for SlickChart; *build an app without coding, test an app you built with
   AI, AI app builder, app testing checklist, no code* for Build. Natural, not stuffed. Google
   penalises keyword stuffing and so does a reader.
3. **Short labelled sections**, not one block of prose. They are read on a phone.
4. **No phone number in the text.** The button is the call to action.
5. **No em dashes.** Consistent with `/build`, `/free` and both blogs.
6. **An image with every post**, made from the **real UI**, 4:3, at least 1200x900.

## The business description

Separate from the posts: GBP has **one** description field, **750 characters**, and it describes the
business rather than a post. Same two rules apply, so target **720 to 749** and lead with the search
terms. Keep both products in it, because the one listing covers both. `2026-10-12-business-description.txt`
holds the current wording and an alternative that leads with SlickChart.

Only one of them can be live at a time. When it changes, update that file so there is a record of
what the listing actually says.

## The rules that come from elsewhere and still apply

- **Never state a competitor's price or feature from memory.** Same rule as `blog-src/README.md`. If
  the blog post it came from did not verify a price, the GBP post does not get to assert one either.
  Prefer leaving prices out of GBP entirely: a post is hard to go back and correct, and a dated "I
  checked on 12 October" caveat eats the character budget. Point at the blog post instead.
- **No income claims, ever,** in the Build post. FTC exposure, not style. See
  `build-blog-src/README.md`.
- **No invented statistics**, and nothing that reads as a medical claim.

## The image

**Ashley's style (her rule, 2026-11-12: "for google my business images make them more like this in
the future").** Her reference was the cover of reel 22 (): a branded poster, not a bare screenshot.

- Mint gradient background. SlickChart lotus logo with the wordmark ("Slick" dark, "Chart" teal).
- A dark pill with a teal dot and a short spaced-capitals label naming the feature.
- A big serif headline (Playfair Display bold): one dark line, then an italic teal line.
-  under it.
- The **real product** in a phone frame on the right, from the demo apps (
  or ), **never a real account** (§0 of : a real account's
  clients are real people). Hide the demo banners first.
- 4:3 landscape, 1800x1350 (rendered at 1200x900, scale 1.5), JPEG.

How:  takes the phone screenshots (serve  on port 8898
first),  fills  per post (edit its  list:
file name, pill, dark line, italic line, screenshot) and writes the JPEGs. Copy the logo
() next to the template as . **Look at every image before
sending it**: check nothing is cut off at the bottom of the phone and the headline wraps cleanly.

Headlines stay short (two to six words a line) and make no income claims.

## Where they go

`gbp-posts/` is content, so it goes **straight to `main`** under `CLAUDE.md` §1a. It is not built,
not served and not linked from the site. It exists so there is a record of what was posted and when,
and so the next one can be written without re-deriving the rules.

## Claude's watermark (2026-10-29)

GBP posts are short, so Claude's text watermark is barely there, and nothing outside Anthropic can read
it anyway. Nothing changes here. The full write-up, and the two rules that matter (never invent
Ashley's experience; never say a post is "human-written"), are in `blog-src/README.md`.
