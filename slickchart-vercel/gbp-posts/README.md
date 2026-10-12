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

## The rules that come from elsewhere and still apply

- **Never state a competitor's price or feature from memory.** Same rule as `blog-src/README.md`. If
  the blog post it came from did not verify a price, the GBP post does not get to assert one either.
  Prefer leaving prices out of GBP entirely: a post is hard to go back and correct, and a dated "I
  checked on 12 October" caveat eats the character budget. Point at the blog post instead.
- **No income claims, ever,** in the Build post. FTC exposure, not style. See
  `build-blog-src/README.md`.
- **No invented statistics**, and nothing that reads as a medical claim.

## The image

Screenshot the **real product**, never a mockup.

- **SlickChart:** use `slickchart-provider-demo.html`, **never a real account.** The demo's seeded
  clients (Maya, Sophie, Priya) are fake; a real account's are a provider's actual clients, and their
  names, contact details and skin notes must never leave the app in a marketing image. This is not a
  style preference, it is §0 of `CLAUDE.md`.
- **Build:** `build.html`, the real page.
- Hide the demo banner and the app-download banner before shooting. They are scaffolding around the
  product, not the product. Do not alter the UI itself.
- 4:3. Serve it from `python3 -m http.server 8899` and drive Chromium headless per `CLAUDE.md` §2.
  `scratchpad/shot-sc.mjs` from 2026-10-12 is a working example, including the clip maths: a phone
  width app in a 4:3 landscape frame always trades fill against how much of the screen you show.
- **Look at the image before sending it.** The 2026-10-12 shot is how the clipped CONCERNS tile was
  found: a bug that had been live on every phone width, invisible until something rendered it large.

## Where they go

`gbp-posts/` is content, so it goes **straight to `main`** under `CLAUDE.md` §1a. It is not built,
not served and not linked from the site. It exists so there is a record of what was posted and when,
and so the next one can be written without re-deriving the rules.
