# Shipped: limit-hit builds carry on by themselves (Uncle Bob)

What the user sees: a build that reaches its step limit no longer shows up as "failed" or "Ran out of steps".
It keeps going as the **same run** in a fresh session, and stops only when it is really stuck.

- `server/src/runtime/limits.ts` (pure, tested): a turn cap or budget stop counts as a limit. The run carries on
  while it keeps committing. It stops after **2 sessions in a row with no new commit** ("Stuck: no new work after
  fresh starts") or after **10 fresh sessions** in all.
- `server/src/runtime/service.ts`: `nextSession()` is the one place that decides between a forget restart, a
  carry-on after a limit, and the end of the run. Turns, usage and cost are added up across sessions, giving one
  run row and one `run.finished`. The fresh brief has the agent's latest desk note plus the original task. A
  wrap-up nudge comes 10 steps before the cap ("commit now"). Only `building` runs carry on: reviews, research
  and big-picture runs end as before.
- Progress is measured by git HEAD (`runtime/git-head.ts`, can be swapped out as `progressMark`).
- Agent cap went from 30 to **120 per session**, as this report recommends.
- Dispatch: the old "resume the same session up to 3 times" code is deleted. The runtime handles it now.
- Orchestrator altitude: limit-hit work carries on by itself. Only stuck items need a decision.

Not done:
- Graceful stop at the cap: today the CLI is killed at the cap, so that session's cost may not be counted.
  Sending an `interrupt` control message before the kill would keep `total_cost_usd`.
- The board doesn't yet show a "continuing" badge (the run just keeps showing as running).
- A project with no git repo can't show progress, so a capped build there stops as stuck after 2 sessions.
