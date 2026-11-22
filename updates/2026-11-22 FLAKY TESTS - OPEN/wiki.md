# FLAKY TESTS — wiki

- **Shutdown must wait for dispatch's fire-and-forget work.** Anything dispatch starts without awaiting goes
  through `src/crew/background.ts` (`track`); `dispatch.close()` sets a closed flag (pump is a no-op, no new
  `runtime.start`) and waits for the tracked work. `app.ts` preClose closes dispatch before and after
  `runtime.shutdown`. Skip this and a run saves after the db is closed ("database is not open", guests.test).
- **Order tests by events, never by sleeps.** Two items racing on `wait: 5` vs `wait: 40` swap under load. The
  fake runner's `{ until }` step holds a run until a promise settles; `conflictOrder()` in `test/crew/brain.ts`
  makes one item merge first on purpose.
- **Tests turn off git auto-housekeeping** (`gc.auto`, `maintenance.auto`, `receive.autogc` in
  `test/setup.ts`). A background `git gc` still writing into a temp repo made `rmSync` fail with ENOTEMPTY.
- **testTimeout is 30 s** (`server/vitest.config.ts`). Flow tests spawn git and CLI runners: ~1 s alone, 5 s+
  when other agents run suites on the same machine. A hang still fails, just later.
- **Prove a flake gone with `repeat.mjs`** (this folder): `node "updates/2026-11-22 FLAKY TESTS - OPEN/repeat.mjs"
  10` from the repo root; failing runs keep their output in `logs/`.
