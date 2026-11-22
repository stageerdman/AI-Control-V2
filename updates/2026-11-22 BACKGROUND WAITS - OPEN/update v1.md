# BACKGROUND WAITS — update v1

Feature: No Silent Stuck Tasks (f-no-silent-stuck-tasks). Checklist item: "Tasks wait for background tests
instead of failing".

## What went wrong (Sea GPS, 07:47)

The agent started its e2e tests with Bash `run_in_background` and ended its turn: "the full e2e is still
running, I'll pick up again when it finishes". The CLI runner closed stdin on the result and, 10 s later
(`AFTER_RESULT_MS`, the F3 rule for servers left running), stopped the whole process group, so the tests died.
The run counted as succeeded, went to review on a "still running" answer, was sent back, and failed after too
many send-backs.

The CLI wakes the model on its own when a background command ends, even with stdin closed (fixture
`live-f3-integrate-background.jsonl`, lines 56–62). The only thing in the way was our 10 s stop.

## What changed

- `runtime/background.ts` (new, pure): `waitsForBackground(answer)` spots waiting words ("still running", "in
  the background", "once/when it finishes", "pick it up", "I'll continue", "waiting for"...), `waitingActivity`,
  `backgroundTimeoutError`, `BACKGROUND_WAIT_MS` = 45 minutes.
- `runtime/stream.ts`: the parser tracks live background commands from `background_tasks_changed`, counts
  answers, and `awaitWake()` makes the next result the agent's answer. Its turns and cost add up; it is not
  treated as a notice.
- `runtime/claude-cli.ts` (`afterAnswerTimers`): after each answer, stdin closes. If background commands are
  live **and** the answer says it waits, the run stays open, shows "Waiting for its background tests to
  finish" (status `waiting`), and waits up to `backgroundWaitMs`. Otherwise it keeps the F3 rule: a CLI that
  lingers is stopped after 10 s.
- When the wait runs out, the run fails with "Stopped: waited 45 minutes for its background command (npm run
  e2e) to finish; they never did." `limits.ts` reads that as a stuck stop, so Pixel gets one "stuck" stall
  alert saying why.
- Board for Pixel: a running task whose run waits shows `[waiting for its background tests to finish]`
  (`runtime.waitingOn` → `createBoard` → `BoardReader.waitingOn`).

## Tests

- `test/runtime/claude-cli.test.ts`: the fake CLI plays the Sea GPS answer. It waits past the linger grace,
  wakes, and the woken answer becomes the outcome (succeeded, turns add up). When the tests never finish, it is
  stopped at the limit as stuck and nothing is left running. With no waiting words, the run is still stopped
  after the grace (F3).
- `test/runtime/background.test.ts`: wording, the timeout text as a stall, parser wake and notice rules, and the
  board line.
- `test/crew/stall-alerts-flow.test.ts`: the timeout reaches Pixel once, as stuck, with no review send-backs.

## Not in this item

Restarts that don't reach the agent, and stop_work showing as cancelled, are separate checklist items.
