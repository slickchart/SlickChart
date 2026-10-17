#!/bin/bash
# Roadmap sale -> founder email + phone push, once per sale, named for what was bought (2026-10-17,
# Ashley: "when people purchase the beauty biz app build roadmap ... i get a notification").
# Runs lib/build-sales.js against stubbed db/email/push: bash scratchpad/test-build-sale-alert.sh
set -e
D=$(cd "$(dirname "$0")" && pwd)/build-sale-alert
sed -e "s#from './db.js'#from './stubs.mjs'#; s#from './email.js'#from './stubs.mjs'#; s#from './fcm.js'#from './stubs.mjs'#; s#from './notify-log.js'#from './stubs.mjs'#" \
  "$D/../../slickchart-vercel/lib/build-sales.js" > "$D/build-sales.mjs"
cd "$D" && node run.mjs; rc=$?; rm -f "$D/build-sales.mjs"; exit $rc
