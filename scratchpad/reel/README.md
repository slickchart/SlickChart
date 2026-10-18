# Landing-page tour reel (`/assets/slickchart-reel.mp4`)

Rebuilt 2026-10-18 from the current demo apps. To refresh it after UI changes:

1. Serve `slickchart-vercel/` on :8899 (`python3 -m http.server 8899`).
2. `node scratchpad/reel/capture.mjs <dir>/shots` — screenshots of the provider and client demo
   screens (390x844 @3x, demo banners and prompts hidden).
3. `node scratchpad/reel/slides.mjs <dir>` — 16 slides at 1080x1920 (headline + phone), list in the file.
4. Join with crossfades (title 2.8s, screens 2.2s, "and your clients" 2.4s, outro 3.0s, 0.4s fades):
   see the ffmpeg `xfade` chain in the 2026-10-18 commit message, libx264 crf 24, yuv420p, faststart.
5. Copy the mp4 and a 540x960 poster of slide 0 into `slickchart-vercel/assets/`, and bump the `?v=`
   on both URLs in `index.html` so phones do not keep the cached copy.

The provider demo opens in Light (`PROVIDER_LIGHT` in `scripts/build-demo.cjs`, 2026-10-18) so the
phone screens stand out on the dark landing page; captures pick that up automatically.
