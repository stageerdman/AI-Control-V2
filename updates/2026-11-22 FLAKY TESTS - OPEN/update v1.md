# FLAKY TESTS — update v1

## Goal
Server tests that fail now and then on busy full runs (but pass alone) are found and fixed at the
root — timing, shared state, unclosed runs, the db closed too early. No retries, no skips.

Done when: the full server suite passes 10 full runs in a row and `test/office/guests.test.ts`
passes 20 runs in a row.

## Phases

1. **List them.** Run the full suite repeatedly (JSON reporter into this folder), collect every
   test that failed at least once with its error. Seed list from issues.txt: guests.test (a run
   saves after the db is closed), worktrees-flow conflict tests (5 ms vs 40 ms races),
   github.test "pushes main after every merge" (ENOTEMPTY), stall-alerts-flow "a goal stops partway".
2. **Root cause each.** Reproduce (loop the file alone, or under load), follow the trace, name the
   flow that races.
3. **Fix each.** Prefer fixing the product (shutdown that really waits for in-flight work) over the
   test; where the test raced on wall-clock time, make it wait for the event it actually means.
   Each fix ends with the reproduction now passing in a loop.
4. **Prove it.** guests.test 20× in a row, full suite 10× in a row. Log the runs here.
   Update issues.txt, wiki.md, commit, merge into master.

## Status
- Phase 1: in progress.
