# Honest Task Completion — v1

**Goal.** Two SuperCut bugs: (1) a work task showed done, 100%, when its agent only replied with a plan;
(2) a face-to-face handoff with `work: true` closed at once as done instead of running as a real task.

## What changed

- **One rule for "done"** — `server/src/domain/real-work.ts`. A task is done only with real work: a command
  run, a file edited or written, a commit, or a report filed. Reads, searches, asks and calls don't count.
- **Every task's build ends through it** — `afterBuild` in `server/src/crew/dispatch.ts`. A plan-only reply
  puts the task back to `todo` and it carries on *in the same session*, told "a plan is not the work". After
  `MAX_PLAN_ONLY` (2) such carry-ons it ends **failed**, saying why — never done.
- **Step limit mid-task** — the runtime already carries a capped build on as the same run in a fresh session
  (`runtime/limits.ts`); the work evidence now counts across all of that run's sessions, so the finishing
  session's plain reply doesn't make the task look plan-only.
- **Face-to-face `work: true`** — `room/room.ts`, `office/action-tools.ts`, `app.ts`. The whiteboard task's
  brief is now the work itself, not the call message (which ended with "say how you will do it", so the run
  did exactly that and closed).

## What was tested

End to end, `server/test/e2e/swift-build-check.test.ts`, a Swift build check task played in three sessions —
a plan-only reply, then `swift build` cut by the step limit, then `swift test` and "green" in a fresh session:

- **Case 1, whiteboard goal:** the task stays `running` through the plan and the carry-on, the plan's
  carry-on resumes the same session, the step limit carries on as the same run in a fresh session, and the
  task (and goal, 100%) shows done exactly once, as the last thing the office saw.
- **Case 2, face-to-face `work: true`:** the director hands the check over from chat; it lands on the
  whiteboard as Twinkle's task with the work as its brief, is not done when the call returns, runs, and then
  passes the same three-session check as case 1.

Also covered by unit and flow tests: `test/domain/real-work.test.ts`, `test/crew/dispatch.test.ts`
(plan-only forever → failed), `test/runtime/carry-on.test.ts`, `test/office/director-ask.test.ts`.
Full server suite: 1027 passed, 1 skipped; typecheck clean.

## Next / risks

- Real-work detection keys off activity kinds (`running`, `editing`, `writing`). A new tool that does work
  but reports another kind would read as plan-only — add its kind to `WORK_KINDS`.
- Pre-existing lint findings in other files (not touched here) still fail `npm run lint`.
