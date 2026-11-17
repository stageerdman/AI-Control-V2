# Workflows — Phase 7 live check (Elon, 2026-11-17)

**Verdict: not signed off.** The server half works; the drawing the user asked for can't be drawn yet, and once
drawn, only its sign-off arrows change how work runs.

## How it was run

- Real backend from this branch (9f41df8), fake runner (`AI_STUDIO_RUNNER=fake`, no paid runs, cost $0), on a
  throwaway data folder, port 3569. Script: `live-check.mjs` in this folder (`node live-check.mjs` against a running
  backend). Project *Aurora* (seed), teams Ship-It and Polish.
- Plus the graph/temporary suites: `test/crew/graphs.test.ts`, `test/crew/temporary.test.ts`,
  `test/domain/graph.test.ts` — 19/19 green.

## What works

| Check | Office | Team (Ship-It) | Temporary |
|---|---|---|---|
| Draw: first + final agent, hand-off arrows with why, a decision with yes/no, sign-off arrows | ✅ PUT 200 | ✅ PUT 200 | ✅ (suite) |
| Reload returns the drawing | ✅ (only change: an empty `why` filled in on branch arrows — fine) | ✅ | ✅ (suite) |
| Broken drawing → every problem by path | ✅ start on a decision, outsider on a node, decision with one way out — all three at once | ✅ non-member | ✅ outsider, 409 unled goal |
| Gates come from the sign-off arrows | ✅ Pete→Lint quality, Semic→Scar crash-test | ✅ Pete→Scar user-test | ✅ + the lead's sign-offs |
| Real work follows the sign-offs | ✅ goal ran: Semic's task gated by Scar (crash-test), signed; "Signed by Scarlett Scenario" | ✅ (suite: a member's new task gets the team gate) | ✅ (suite: regates tasks not started) |

## Gaps (sent back)

1. **No visual editor on screen (Jony).** `app/src/features/collab/` has no `flow/` editor, and nothing in the Cast
   or "How we work" opens one. The user can't draw, place agents, set first/final, or connect arrows. The brief's
   "draw one in the visual editor" can't be done.
2. **The drawing is decoration except its sign-offs (Uncle Bob).** Nothing at run time reads `start`, `end`,
   hand-off arrows, decisions or branches: `describeWorkflows` (`server/src/crew/dispatch.ts:161`) gives the planner
   `{id, name, when, gates, summary}` only, and item tasks don't mention it. Live: the office drawing starts at Pete;
   the plan started with Semic. Smallest fix (not an engine): give the planner and each item's task the drawing in
   words — who starts, who hands to whom and why, each decision's question and branches, who signs last.
3. **Changing a drawn workflow by voice silently erases the drawing (Uncle Bob).** `set_workflow`
   (`server/src/office/workflow-tools.ts:55`) builds the workflow without `graph`, and `put` replaces it whole
   (`server/src/crew/workflows.ts:122`). Either keep the drawing and refuse gates that contradict it, or drop it and
   say so in the answer ("the drawing was replaced by these checks").
4. **"Signs last" isn't enforced.** `end` is stored, but gate order is arrow order. Fine as a soft suggestion if
   gap 2 tells the planner; otherwise order the end node's sign-off last in `gatesFromGraph`.

Not checked yet (needs gap 1): placing nodes by drag/keys, errors pinned to arrows on screen, the temporary
drawing read-only line, contrast (Humanitarian).

## What surprised us

- The server validation is good: every problem at once, by path, ready for an editor that doesn't exist yet.
- The `when` on a gate (Phase 5b design) became `branch` out of a decision node in the build. Simpler; keep it.
