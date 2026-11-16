# Turn cap, forget, nudge: why we have them and what to keep (Elon, 2026-11-16)

Data: `GET /projects/ai-studio/runs` (192 runs) + desk notes, scanned with
`node "updates/2026-11-16 ELON - turn cap/scan-caps.mjs"` (studio on :4319). Code read at the lines cited.

## Answer in one line

The 30-turn cap isn't a safety limit. It's a checkpoint that interrupts healthy work every ~4 minutes, and dispatch
then quietly undoes it up to 3 times. Make one honest cap of **120 turns per run**, counted across forgets.
**Delete** the turn-cap carry-on. **Keep** forget and the 120k nudge, which then become the real memory tool. Add a
"10 steps left" warning. Fix two small bookkeeping bugs. This also fixes "Fix Stopped bug".

## The numbers

| | value |
|---|---|
| Agent runs (30-turn cap) | 140 |
| …stopped at the turn cap | **55 (39%)**. First build runs: 44 of 91 (48%) |
| …other failures | 4, all "server stopped during the run" |
| Team members' failed runs that were turn-cap stops | **28 of 30** |
| Capped runs: how long they ran | median **4.3 min**, p90 6.4 min |
| Capped runs: average context per turn | median 61k tokens (so ~100k at the end, just under the 120k nudge) |
| Pieces of work (one session, including carry-ons) | 88. Total turns: p50 36, p90 68, p95 76, **max 95** |
| …needing more than 30 turns | **66 of 88 (75%)** |
| …needing more than 100 / 120 turns | **0 / 0** |
| Carry-on runs after a cap | 49. 37 finished, 11 capped again |
| Cost of a 30-cap run that finished | p50 $0.84, p90 $2.33, max $3.29 (the $10 budget never came close) |
| Capped runs with a cost recorded | **1 of 55** |
| Orchestrator runs (6-turn cap) | 52, all OK, p90 2 turns |

## Each rule: where it lives, why it exists, verdict

### 1. Agent turn cap: 30 turns → CHANGE to 120 per run, counted across forgets
- Code: `server/src/runtime/config.ts:12` (`DEFAULT_CAPS`). It's enforced by killing the process at
  `server/src/runtime/claude-cli.ts:204` and counts distinct assistant messages (`runtime/stream.ts:152-175`).
- Why it was added: a runaway guard. B6 found 8 turns too tight (`updates/2026-11-13 BACKEND - OPEN/wiki.md:102`),
  so it went up to 30. There is no deeper reason behind the number 30.
- What it actually does: it stops 75% of real work partway through. Dispatch then resumes it up to 3 times, so the
  **real ceiling is already 30 × 4 = 120 turns**. You just pay for it with 4 processes, 4 run rows, 3 "failed"
  labels, lost cost data and a "Stopped" message.
- Spend is already guarded by `--max-budget-usd` ($10, `claude-cli.ts:131`). At ~$0.05 a turn, 120 turns stays under it.
- Verdict: one cap of 120 per run, counted across forgets. The ceiling stays what it is today, so nothing that
  finishes today would be stopped (max seen: 95). A cap stop then really means "stuck", not "busy".

### 2. Turn-cap carry-on (MAX_CONTINUES = 3) → DELETE (keep restart recovery)
- Code: `server/src/crew/dispatch.ts:62-64` and `carryOn` at `:377-383`. It was added in `11ae43f` so that a capped
  item doesn't fail the goal.
- It exists only to undo rule 1. Once the cap is honest, it has no job. It also does harm: it resumes the old,
  bloated session, so the nudge fires on the first tool. That is the loop HR found (5 of the 7 forgets were on
  resumed runs).
- Keep the restart and interrupt pick-up (`STUDIO_CLOSED`, "Interrupted"). The user's **Continue** on a stopped goal
  stays as the way forward after a real stuck run.

### 3. Forget + desk notes → KEEP (fix the bookkeeping, delete MAX_FORGETS)
- Code: `server/src/runtime/service.ts:614-630` (the tool) and `:530-588` (restart with the note as the brief).
  Added in `ff8a634` (STUDIO LIFE L2) so agents could manage their own memory, visibly.
- Agents aren't forgetting rarely out of negligence. The cap kills them first: at 30 turns the context is ~100k,
  below the 120k nudge. Elon, Blair and the others never reached the nudge. The notes that did get written are good.
- Why keep it rather than rely on Claude Code's own auto-compact: the note is written on purpose, after a commit,
  and it's visible on the desk and in the comms log. Auto-compact is opaque.
- `MAX_FORGETS = 5` (`service.ts:81`) is a loop guard. Once the turn cap counts across forgets, the cap already
  bounds any loop, so delete it.

### 4. Context nudge at 120k → KEEP, add a turn warning and record both
- Code: `FORGET_AT` at `service.ts:83`, `nudge()` at `:632-638`, the hook in `runtime/nudge-hook.ts`, the text in
  `room/context.ts:35`.
- With a 120-turn cap, long runs will cross 120k at around turn 35-40, so the nudge finally does its job.
- Today it fires once and is never recorded, so nobody can tell whether it was ignored.

### 5. How forget runs are recorded ("failed, $0.00") → FIX
- They show "failed" because the last memory hit its own fresh 30-turn cap. Forget isn't the cause.
- They show $0 because (a) a cap kill comes before the CLI's result line, which is the only place cost comes from,
  and (b) `l.before` (`service.ts:546-554`) adds up turns and tokens across memories but **not cost**. So even the 2
  forget runs that succeeded show only their last memory's cost ($0.27 for 34 turns).
- Tokens are recorded on every run, including cap stops (per-message fallback), so tokens are the reliable unit.

### 6. Review cap 15, orchestrator cap 6 → KEEP
- The orchestrator: 52 of 52 OK. There is no review data in this project. Nothing points to a problem.

## Fix "Stopped" bug

What users see today: run status **failed**, and on the board "Ran out of steps. The work is saved and can
continue." (`whiteboard/plain-problem.ts:12`). Captains read the same "failed" and finish alone ("All three members
failed"). The data confirms the guess in `design/hq-email-review.md:30`: **28 of 30** failed member runs were
turn-cap stops. The other 2 were server restarts.

Fix by deletion, not by adding a new status: with the 120 cap and no turn-cap carry-on, cap stops go from 39% of
agent runs to ~0 on this data. The rare stop that's left really is "stuck". Change its message to: *"Stopped after
120 steps. It may be stuck. The work is saved; Continue to carry on."*

## Concrete changes for a builder

1. `server/src/runtime/config.ts:12`: `DEFAULT_CAPS.maxTurns` 30 → **120**. Update the comment and the
   `server/README.md:32` row and `server/test/office/goal-thread.test.ts:105`.
2. **Cap across memories.** In `service.ts:570`, when restarting after a forget, pass
   `caps: { maxTurns: spec.caps.maxTurns - l.before.turns, maxBudgetUsd: max(0.5, spec.caps.maxBudgetUsd - l.before.costUsd) }`.
   Keep the error text at the run's full cap. Add a test to `server/test/runtime/forget.test.ts`.
3. **Cost across memories.** Add `costUsd` to `l.before` (`service.ts:67, 546-554`) and add it up in `finish`
   (`:577-586`).
4. **Delete `MAX_FORGETS`** (`service.ts:81, 622-623`) and its test.
5. **Delete the turn-cap carry-on.** Remove `MAX_CONTINUES`, `TURN_CAP` and the turn-cap path of `carryOn`
   (`dispatch.ts:62-64, 377-383`). Keep the restart and interrupt resume. Rewrite `server/test/crew/dispatch.test.ts:223-254`
   to "a capped item stops; Continue resumes it".
6. **Wrap-up warning.** In `Live`, count turns from the `tokens` events (`onRunEvent`). In `nudge()`, at
   `turns >= cap - 10`, once, return a new `WRAP_UP_NUDGE` (`room/context.ts`): *"AI Studio: about 10 steps left in
   this run. Commit what's done now, then finish and reply with your summary. If it can't be finished, say what is
   done and what is left."* It takes priority over the forget nudge.
7. **Record nudges.** Emit a comms-log entry `kind: 'nudge'` (`{runId, which: 'context'|'wrap-up', context, turn}`).
   Add `peak_context` and `forgets` to `runs` (a timestamp-named migration). Then HR can measure nudge → forget.
8. **One meaning of "turn".** The cap counts assistant messages. The stored `turns` on success is the CLI's
   `num_turns` (`stream.ts:226`), which is why "succeeded" runs show up to 61 turns under a 30 cap. Store the
   parser's count, the same one the cap uses.
9. `whiteboard/plain-problem.ts:12` and its test: the new "Stopped after N steps. It may be stuck…" text.
10. HR scripts (`updates/2026-11-15 HR - OPEN/*.mjs`): report tokens, and mark `costUsd` as "CLI-reported, may be
    missing".

## How we'll know it worked

Rerun `scan-caps.mjs` after ~50 agent runs. Targets:
- turn-cap stops under 5% (today 39%)
- carry-on runs at 0 (today 49)
- member "failed" runs that are cap stops at ~0 (today 28)
- long runs (over 120k context) that forget: most of them (today ~0)
- cost recorded on at least 95% of runs (today 130 of 192)

If cap stops stay above 5% with real work behind them, the orchestrator is making items too big. Split items
smaller; don't raise the cap.

## Risks
- A truly runaway run now burns up to 120 turns in one go. That's the same ceiling as today (30 × 4), and the $10
  budget still applies.
- Longer single runs grow larger contexts. The 120k nudge and the wrap-up warning handle that. If an agent ignores
  both, Claude Code's own auto-compact is the backstop.
