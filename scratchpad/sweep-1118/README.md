# 2026-11-18 growth sweep: the reproductions

Each file here reproduced one problem the sweep found, and now shows it fixed. They print what they
measured (no pass/fail framing on most); read the numbers against the line below.

| File | What it showed before the fix | Now |
|---|---|---|
| `merge-t1.mjs` | starter automation toggled: on AND off copies; deleted one came back | 3 rows stable, delete sticks |
| `merge-t3.mjs` | editing a starter automation left an id-less ghost | ghost deletable |
| `merge-t4.mjs` | in-person form shown twice on the client; unkeyed photo/summary entries doubling | 1 / 1 |
| `merge-t5.mjs` | thread with a new message marked read; merge(X,X) changed | new message stays unread |
| `merge-t6.mjs` | 300 photo re-uploads every launch past 6000 photos | 0 after the first |
| `merge-t7.mjs` | two inventory items with one name merge (old id-less rows only; new items now get an id) | unchanged for old rows |
| `merge-t8.mjs` | threads / bookings / guide opt-outs pushed on every pull | 0 pushes in 10 pulls |
| `boot-t3-ghostform.mjs` | one repaired form became one copy per device | 1 |
| `boot-t4-stalepull.mjs` | an edit saved during a slow account read reverted | edit kept |
| `boot-t6-twotabs.mjs` | an older tab saved over a newer tab's form | older tab stops saving (notice) |
| `append-imported-delete.mjs` | a deleted CSV-imported product came back on every shop render | stays deleted |

Run from the repo root: `node scratchpad/sweep-1118/<file>`. The every-key version is
`scratchpad/sweep-sync-growth.mjs`; the CI version is `slickchart-vercel/scripts/check-merge-growth.cjs`.
