# BACKGROUND WAITS — update v2

Feature: No Silent Stuck Tasks (f-no-silent-stuck-tasks). Checklist item: "Restarts deliver the new brief and
the board shows the true status".

## What went wrong (Sea GPS, after v1's timeline)

1. Pixel stopped the work with `stop_work`. The goal showed **cancelled**, as if the user had dropped it.
2. Task 3d3ac5af failed after too many review send-backs. Its stage stayed `review`.
3. `edit_task 3d3ac5af status: todo` + a new brief. The item was queued **at its review gate**, so the reviewer
   ran again, saw the same work, said "changes" (one over the limit) and failed it within a minute. The builder
   never ran, and never saw the new brief.
4. Even when a builder did carry on, its carry-on message only said "carry on": the brief in its session was
   the one it started with.

## What changed

- `crew/requeue.ts` `requeuePatch(item, hasSession)`, the one place that decides where a stopped item starts
  again (board reopen, `resume_goal`, the resume route):
  - a build or merge-fix carries on in its own last session;
  - a review that was only **interrupted** (cancelled) starts its gate over;
  - work that **failed in review or at merge** goes back to its builder: stage `build`, gate 0, send-backs and
    merge tries reset, resuming the builder's session (`buildRunId`).
- `dispatch.carryOnTask` always restates `Your brief now (follow this one, it may have changed): …` plus the
  last review notes. The "why" line says how the last run ended (stopped by the user, didn't get through,
  ended early, studio restarted).
- **stop_work → `stopped`.** `cancelAll` (the stopper behind stop_work and POST /projects/:id/stop) marks the
  goals; they settle as `stopped`, not `cancelled`. A hand cancel still shows cancelled. `resumable(status)`
  (failed or stopped) is used by the director's summary, `resume_goal`, and the app's lists. Migration 51
  rebuilds `goals` with the new CHECK (run with foreign keys off so checklist items survive).
- **True status while a checkout is put away.** A stopping item stays `running` while its worktree closes
  (`closing`). If it is reopened meanwhile, the late end no longer settles it back to failed/cancelled, and
  `pump` starts it once the checkout is away.
- **Stop + resume while the first checkout is being made** (found by the new tests): the stop settled the item
  with no workspace, then `launch` wrote the stale `running` status with the new workspace; a quick resume made
  the checkout a second time ("a branch named … already exists") and the item failed. Now `launch` records the
  workspace with the item's current status (`recordWorkspace`), items still being prepared are skipped by
  `pump` (`preparing`), and one queued again meanwhile starts when its launch ends. `shelve` holds the item the
  same way while its checkout closes.
- `board.editGoal` running reopens the goal's items too; `clean` of stopped goals includes `stopped`. Events
  (`goal.changed`, `workflow.ended`), spans and the app types know `stopped`.

## Tests

- `test/crew/restart-flow.test.ts` (Sea GPS timeline, end to end with git checkouts):
  - failed after 2 send-backs → `edit_task` todo + new brief → the **builder** runs (not the reviewer), in its
    own session, with the new brief and the last notes; send-backs reset; the review approves; goal done;
  - stop (stop_work's stopper) after the agent started → goal `stopped`, item cancelled → resume → the agent
    carries on in its session with the brief; goal done;
  - stop + resume while the first checkout is still being made → it starts once and lands (the race above);
  - a hand cancel still shows `cancelled`.
- `test/crew/requeue.test.ts`: every stage case of `requeuePatch`.
- `test/db/migrations.test.ts`: 51 accepts `stopped` and keeps goals with their items, foreign keys back on.

## Known noise

`team-flow` / `worktrees-flow` tests sit near the 5 s vitest timeout and sometimes time out (or swap which
item conflicts) when the machine is busy. They pass alone and on rerun. Not changed here.
