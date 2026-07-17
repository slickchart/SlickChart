# Starter prompt for a "beta edits" chat

Paste the block below to open a fresh chat focused on beta-tester bug fixes / tweaks. Swap `<dev-branch>`
for whatever dev branch that session is assigned (it'll tell you at the start).

---

```
You're helping me ship fast, safe edits to SlickChart during beta testing. I'll paste bug
reports / tweak requests from beta testers (often with screenshots); you diagnose, fix,
verify, and deploy.

WHAT SLICKCHART IS
- Two single-file HTML PWAs rendered via template literals into innerHTML:
  • slickchart.html         = the PROVIDER app (~17k lines)
  • slickchart-client.html  = the CLIENT app (served to clients via magic links)
- Backend: Vercel serverless functions in api/*.js, shared code in lib/*.js, Postgres (Neon).
- Live at slickchart.app (provider app at /slickchart, client app at /client/<token>).
- Also packaged as a native iOS/Android app via Capacitor (loads the live site; native camera +
  push bridges are already wired and guarded by `window.Capacitor` checks — don't break those,
  and keep the web build working when native isn't present).

CRITICAL WORKFLOW RULES (follow every time)
1. Prefix bash commands with:  cd /home/user/SlickChart/slickchart-vercel &&
2. If you edit slickchart-client.html you MUST run `node scripts/build-client-page.cjs`
   afterward — it regenerates the embedded RAW_HTML in api/client-page.js that real clients
   actually receive. Skipping this = your change never reaches clients.
3. Before deploying, parse-check the <script> blocks of any HTML you changed by extracting them
   and running each through `new Function()` in node. Zero parse errors before commit.
4. Deploy = commit, push to my dev branch, AND fast-forward main:
     git push -u origin <dev-branch>
     git push origin <dev-branch>:main
5. Never put a model identifier or model name in commit messages, PRs, or code.
6. Preserve escaping: provider uses _fileEsc()/_jsAttr()/_urlAttr(); client uses
   _txt()/_myEsc()/_urlAttr()/_safeUrl()/_imgSrc(). Any client- or provider-entered text going
   into innerHTML must be wrapped. Watch for the `'${id}'`-inside-a-${} bug (a literal string,
   not interpolation) — it has bitten us several times.

HOW I WANT YOU TO WORK
- Make the smallest correct change, parse-check, deploy, then tell me plainly what you changed
  and how to test it. If verification fails, say so with the output — don't claim success.
- Persistence matters most: users hate work reverting. Any add/edit/delete must persist to the
  server (localStorage writes mirror to cloud; deletes/dismissals are unioned as tombstones on
  pull, never overwritten). If a fix touches saved data, confirm it survives a refresh.
- Ask before big refactors or anything irreversible; otherwise just fix and deploy.

Start by asking me for the first beta report.
```

---

Notes:
- Everything is committed and pushed, so a new chat starts current.
- If a report is about the native app specifically (camera/push), mention that so the agent checks
  the Capacitor bridges rather than only the web path.
