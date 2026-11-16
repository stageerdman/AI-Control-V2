# Are agents clearing their memory? (HR, 2026-11-16)

Sources: studio comms log (195 entries, 2026-11-15 06:28 → 2026-11-16 03:52), the studio API
`GET /projects/ai-studio/runs` (186 runs) and `GET /projects/ai-studio/desk-notes` (7 notes), and the code
in `server/src/runtime/service.ts`, `claude-cli.ts`, `room/context.ts`.
Re-run with `node "updates/2026-11-15 HR - OPEN/hr-memory-scan.mjs"` and `hr-forget-runs.mjs` (studio on :4319).

## Answer

Barely. 7 forgets in 186 runs, from 2 agents only: Uncle Bob 5, Jony 2. Elon, Blair, Health Analyst,
Humanitarian and HR never forgot. Pixel can't: director chats ("bigPicture") get no `forget` tool. Its turns
are short (6 at most), so that's fine.

The real memory limit is the **30-turn cap**, not the context size:

| | runs |
|---|---|
| stopped at the turn cap ("Stopped: reached the turn cap (30)") | **53 of 186 (28%)** |
| forgot at least once | 7 |
| forgot and still hit the cap afterwards | 5 of 7 |

- 5 of the 7 forgets came on **resumed** runs ("You were stopped partway through…"), 21–196 s after start.
  The cycle: the run hits the cap with no warning and no note → it resumes in the same bloated session → the
  context is already past 120k → the nudge fires on the first tool → the agent forgets → the fresh copy
  then hits the 30-turn cap again.
- When agents do forget, the notes are good: concrete branch, files, done/not done, ordered next steps,
  and the shell rules carried over.
- Runs stopped at the cap record **no cost** (`costUsd: null`). The process is killed before the CLI's
  result message, so the spend for 28% of runs can't be seen.

## Can HR measure this? Partly.

- `comms_log` shows desk notes (`kind: desk-note`), but not the nudges, context sizes or turn counts.
- The studio does not store whether the nudge fired: `Live.nudged` and `Live.context` live only in memory
  (`service.ts:68-70, 632-638`). So **nudged forgets can't be told apart from self-started ones**, and nobody
  can see an ignored nudge.
- Per-turn context size is only emitted as a live `tokens` event and is never saved.
- I got the numbers by calling the studio's HTTP API with `node`. HR has no studio tool for this, and run
  transcripts in `~/.claude/projects` are outside HR's sandbox.

## Recommendations

1. **Warn before the turn cap** (biggest win). Add a turn-based check to the same PostToolUse nudge: at
   cap − 5 turns, say "5 turns left: commit, then `forget` (or finish)". Today the only trigger is 120k
   tokens of context, and most runs hit 30 turns first.
2. **Resume capped runs from a desk note, not the old session.** When a run is stopped at the cap, ask for
   or generate a note and start fresh, so the resumed run doesn't start already past the context limit.
3. **Log nudges to the comms log** (`kind: 'nudge'`, with context size and turn number), and save on each
   run `peakContext`, `forgets` and `nudgedAt`. Then nudge → forget compliance can be measured.
4. **Keep cost on cap stops.** End the run gracefully (e.g. the CLI's own `--max-turns`, which still sends a
   result with `total_cost_usd`) or keep the last known cost. Don't kill the process before the result arrives.
5. **Give HR a read-only `run_stats` tool** (runs, turns, cost, how each ended, forgets, peak context) so
   reviews like this don't depend on side-channel HTTP calls.
6. Prompt (`room/context.ts` YOUR_MEMORY): add "you have about 30 turns per memory; past ~20, wrap up the
   step, commit and forget". Agents can't see their turn count today.
