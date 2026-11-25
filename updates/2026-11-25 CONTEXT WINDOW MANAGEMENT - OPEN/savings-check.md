# Savings check (2026-11-25)

## What ran
- **The live studio still runs the old build.** `/health` shows `running fe409f0` (Nov 24) and `installed db48031`
  (with fixes 1 and 2 and the token view). `GET /projects/:id/context` returns 404 on the live server. So **no work has
  run under the fixes yet**, and `run_sessions` has no live rows. A real before/after on live work isn't possible yet.
- **Same method as the first report:** `node spike/analyze.mjs http://127.0.0.1:4319`. Now: 10 projects, 1,369 runs,
  1,745 M tokens, ≈ $928. That's +23 runs, +27 M tokens and +$17 since the first report, all on the old build. The shape
  hasn't changed: resumed runs 989 M (57%), runs over 40 turns 77%.
- **Replay of the shipped rules on every recorded run:** `node spike/replay-rules.mjs` (assumptions are in its header).

## Result (replay, 10 days of real runs)
| | tokens | vs before |
|---|---:|---:|
| Before (as recorded) | 1,745 M | |
| Fix 1 only (rework starts fresh unless < 40 k and < 5 min) | 1,557–1,676 M | −4% to −11% |
| Fixes 1 + 2 (also forget at 60 k) | 1,260 M | **−28%** (≈ 485 M tokens, ≈ $255) |

- **Fix 1:** of the 259 resumed builder runs, 101 would certainly start fresh (74 too big, 27 cache cold). 120 have no
  recorded gap: the low figure keeps them resuming, the high figure starts them fresh. 38 stay resumed (small and warm).
  The first estimate (−15%) was too high.
- **Fix 2 does most of the work:** 310 runs pass 60 k. Where fix 1 doesn't apply, fix 2 catches the same long sessions,
  which is why the total is −28% under both assumptions.
- **By agent:** Uncle Bob 1,015 → 697 M, Jony 468 → 343 M. The two builders are still 82% of the total.
- **Not measured: quality.** Forgetting twice as often may cost re-reading and lost thread. The Phase 3 benchmark that
  would check this isn't built.

## Still costly
1. **Long builder sessions:** the main cost even after fix 2 (about 36 k average context per turn, × many turns).
2. **The fixed prefix:** ≈ 9–10 k tokens re-read on every step, ≈ 370 M over 10 days (fix 3, not started).
3. **Carry-on after a parked ask still always resumes.**
4. **Pixel's briefs repeat the whole board every turn** (fix 5, small in tokens but highest $ per token).

## Next steps
1. Restart the studio onto the installed build, so the fixes and the token view actually run.
2. After ~3 days of work, re-run `analyze.mjs` and read `GET /projects/:id/context`. Check that the median
   `peak_context` falls below 60 k, that rework starts show `started_by` = new with a handoff, and that the share of
   tokens per finished item falls. Compare review send-back rates with before (quality).
3. Build the Phase 3 benchmark (3 replayed items), then fix 3 (tools per role, a smaller CLAUDE.md).
4. Apply the resume rule to the carry-on branch too.
