# NO SILENT STUCK TASKS — update v1

Feature: No Silent Stuck Tasks (f-no-silent-stuck-tasks). Checklist item: "Check which stuck-task fixes exist,
build the missing ones". Earlier parts landed through BACKGROUND WAITS v1–v3 (waits, restarts, Sea GPS replay),
Honest Task Completion, stall alerts and the review-loop guard.

## Goal

Tasks never get stuck quietly. Six parts:

1. A new brief or restart clears old `tell_agent` notes; notes can be seen and cleared.
2. Restart a task fresh from main.
3. After 2 "no new commits" send-backs, stop and escalate to Pixel.
4. Pixel hears right away why work stopped.
5. Handoffs stay open until delivered.
6. Check the builder can build and test before work starts.

## What master already has (checked 2026-11-23)

| Part | State on master | Where |
| --- | --- | --- |
| 1 notes | **Partly.** Notes wait on the live run (`runtime.tell` → `Live.notes`) and go when that run ends, so a fresh run never gets them. Gaps: nobody can see or clear notes still waiting; a restart that *resumes* the old session still has the old notes in its history, and nothing says they no longer apply. | `runtime/service.ts` tell/nudge |
| 2 fresh restart | **Missing.** Restarts carry on in the old session and checkout (`requeuePatch`); `edit_task status: todo` on done work rebuilds on the same branch. Nothing starts over from main's tip. | `crew/requeue.ts`, `board.reopen` |
| 3 empty send-backs | **Partly.** The same note twice escalates to Pixel (`review-loop.ts`). Different notes on work with no new commits (Sea GPS: "HEAD is 1bb2479 with no new commits", sent back 5 times) only stop at `maxSendBacks`, as failed. | `crew/review-loop.ts`, `dispatch.afterReview` |
| 4 Pixel hears why | **Works.** Stall alerts for failed, max send-backs, stuck, goal stopped partway; cant_do puts a line in Pixel's chat; tests in `stall-alerts-flow`, `cant-do-flow`. | `crew/stall.ts`, `office/stall-alerts.ts` |
| 5 handoffs open | **Works** for `handover: true`, cant_do, same-note escalation, `work: true` to Pixel (`[waiting for a new owner]`, tests in `handover-flow`, `cant-do-flow`, `review-loop-flow`). Not locked by a test: an item handed over mid-run whose old run then fails stays open, and goal % doesn't count it. | `crew/handover.ts` |
| 6 builder check | **Missing.** Nothing checks the checkout, tools or push access before the first run; the builder finds out mid-task. | — |

## Phases

### Phase 1 — notes can be seen and cleared; restarts void old notes
- Runtime keeps each waiting note as `{ from, text, at }`; `notesFor(projectId, agentId?)` and
  `clearNotes(projectId, agentId)`.
- `GET /projects/:id/notes[?agentId=]` → notes still waiting; `DELETE /projects/:id/agents/:agentId/notes`.
- Dispatch clears an agent's waiting notes whenever its item is queued again (restart, new owner, fresh).
- The carry-on brief of a resumed session says notes from earlier runs no longer apply; the brief now does.
- Tests: runtime notes list/clear; carry-on text.

### Phase 2 — restart fresh from main
- `worktrees.retire(repo, ws)`: commit what's left, remove the checkout, keep unmerged work by renaming its branch
  (`<branch>-before-restart-<n>`), else delete it.
- `dispatch.restartFresh(projectId, itemId)`: not while running; the checkout is retired, the item starts a
  fresh build (no session, no send-backs, gate 0) and gets a new checkout from main's tip.
- `POST /projects/:id/tasks/:itemId/restart-fresh`; Pixel: `edit_task` `fresh: true`.
- Tests: flow with a real repo — old work kept on the renamed branch, new branch starts at main, fresh session.

### Phase 3 — empty send-backs escalate
- Each review records the branch head it saw (`head`). A send-back whose head equals the previous send-back's
  is an empty try; the second empty try stops the loop and hands the item to Pixel (like the same-note guard),
  with a stall alert.
- Tests: pure rule; flow — builder never commits, two empty tries → back with Pixel, alert sent.

### Phase 4 — builder check before work starts
- Pure `preflightProblems(facts)`; I/O `gatherFacts(cwd)`: checkout is a git repo; tools the project needs are on
  PATH (node/npm for package.json, cargo for Cargo.toml, swift for Package.swift, python3 for pyproject);
  `origin`, when set, answers (`git ls-remote`, short timeout).
- Before a fresh item's first build run: problems → the item goes back to Pixel (waiting for a new owner, not
  failed) with what's missing and how to fix it, plus a stall alert. Injected as `deps.preflight` (off in tests
  that don't ask for it).
- Tests: pure rules; flow — missing tool → back with Pixel, no run started.

### Phase 5 — lock in handoffs + wrap up
- Test: handed over mid-run, the old run fails → still open with the new owner, goal not done.
- Full suite, typecheck, wiki, feature line, merge into master.

## Status

- [x] Phase 1  - [x] Phase 2  - [x] Phase 3  - [ ] Phase 4  - [ ] Phase 5
- Phase 1: `runtime.notesFor/clearNotes`, routes in `routes/runs.ts`; dispatch `voidNotes` on requeue, handover, fresh
  reopen; carry-on brief line `STALE_NOTES`. Tests: `test/runtime/notes.test.ts`, `test/crew/restart-flow.test.ts`.
- Phase 2: `worktrees.retire`, `dispatch.restartFresh` (caller then calls `board.changed`), route in `routes/crew.ts`,
  `edit_task fresh: true`. Sub-tasks and split team items are refused. Test: `test/crew/restart-fresh-flow.test.ts`.
- Phase 3: reviews keep `head`; `emptyTries` + `MAX_EMPTY_TRIES` in `review-loop.ts`; `dispatch.loopGoesNowhere`
  (was `stuckOnSameNote`). Workflows cap `maxSendBacks` at 3, so the flow uses 3. Tests: `review-loop(.flow).test.ts`.
