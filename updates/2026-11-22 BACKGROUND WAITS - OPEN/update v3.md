# BACKGROUND WAITS — update v3

Feature: No Silent Stuck Tasks (f-no-silent-stuck-tasks). Checklist item: "Tests that replay the Sea GPS
timeline".

## What it adds

`test/crew/sea-gps-timeline.test.ts`: one task through the whole Sea GPS timeline, end to end (git checkouts,
review gate, director chat turns). The builder's first run goes through the **real CLI runner** with a
stand-in `claude` that leaves `npm run e2e` in the background and answers "the full e2e is still running, I'll
pick up again when it finishes"; every other run is scripted. At each step it checks the store and the
whiteboard text Pixel reads (`whiteboard` tool):

1. **Waits, not failed:** the run stays open well past the 100 ms a lingering CLI gets; the item is running,
   stage build, no send-backs, no review; the board says `[waiting for its background tests to finish]`.
2. **Wakes when the tests end:** the test commits and drops a "finished" file; the same run gets the woken
   reply, succeeds with it as its answer ("All 42 e2e tests pass. Committed.") and goes to review.
3. Two send-backs fail it: `[did not finish]`.
4. **`edit_task` todo + new brief:** the builder (not the reviewer) runs in its latest session with "Your
   brief now: …" and the last review notes; the board shows `[running now]` and the goal running.
5. **`stop_work` everyone:** the goal is `stopped` (store and board), never `cancelled`; the task `[stopped]`.
6. **`edit_goal` running:** the builder carries on ("the user stopped you…") with the new brief; review
   approves; goal done, board `[done]`.

`test/crew/aurora-studio.ts` `studio()` takes an optional runner wrapper for this (default: the scripted one).

## Results

New test passes; full server suite 1105 passed, 1 skipped; typecheck clean. No product code changed.
