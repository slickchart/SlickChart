#!/bin/bash
# Run an existing headless test in WebKit (Safari's engine) instead of Chromium.
#   bash scratchpad/run-in-safari.sh scratchpad/test-offload-stale.mjs [args]
# WebKit lives outside /opt/pw-browsers (installed 2026-10-17 at Ashley's request, with
# `playwright install webkit` + `install-deps webkit`). Set SC_WEBKIT to override where.
# The test is copied with every chromium launch swapped for webkit; nothing in the original changes.
# Service workers are blocked in the copy: in WebKit the app's sw.js would answer /api/** itself and
# the test's mocked routes would never see those requests (Chromium's runs never hit this).
set -e
here="$(cd "$(dirname "$0")" && pwd)"
export PLAYWRIGHT_BROWSERS_PATH="${SC_WEBKIT:-/tmp/claude-0/-home-user-SlickChart/be0fe3b4-54df-5d41-bda7-89dbec145231/scratchpad/pw-webkit}"
src="$1"; shift
tmpdir="$here/.safari-run"; mkdir -p "$tmpdir"
for f in "$src" "$here"/*-lib.mjs; do
  sed -E "s#newContext\(\{#newContext({serviceWorkers:'block',#g; s#newContext\(\)#newContext({serviceWorkers:'block'})#g; s#\.newPage\(\{#.newPage({serviceWorkers:'block',#g; s#pw\.chromium\.launch\(\{ ?executablePath: ?'[^']*' ?\}\)#pw.webkit.launch()#g; s#chromium\.launch\(\{ ?executablePath: ?'[^']*' ?\}\)#pw.webkit.launch()#g" "$f" > "$tmpdir/$(basename "$f")"
done
node "$tmpdir/$(basename "$src")" "$@"
