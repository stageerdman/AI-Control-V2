# Turn cap carry-on: live check (2026-11-16)

Script: `live-check.mts` (run from repo root: `npx --prefix server tsx "updates/2026-11-16 ELON - turn cap/live-check.mts" <progress|stall> <cap>`).
Real Claude Code CLI, a throwaway studio home, a real git repo, `kind: 'building'`, tiny step caps.

| Check | Result |
|---|---|
| Carries on by itself (progress, cap 10) | PASS: 4 sessions, 1 run id, 3 "Carrying on in a fresh session (n)" lines, ended `succeeded` / `DONE-10`, all 10 commits. Picked up an uncommitted file left by the cut session. |
| Turns summed | PASS: 11+11+11+5 = 38 on the one run row. |
| No-progress stop (stall, chain of 30 reads, cap 8) | PASS: 2 sessions without a commit, then `failed` with "Stopped: no new commits in its last 2 sessions…". |
| Board wording | PASS: "Stuck: no new work after fresh starts. The work is saved and can continue." |
| Cost logged | FAIL: a session cut at the cap has no CLI `result` line, so its cost is `undefined` and dropped. Progress run logged $0.032 (last session only, about 1/4 of the real spend); stall run logged `null`. |
| Research / report items | GAP (code): dispatch starts them as `kind: 'research'`; carry-on runs only for `building`; the old dispatch carry-on that covered them was removed. A report item that hits the cap now just fails. |
| Stall rule vs. read-only work | GAP (design): progress = new commit. A read-only run that is really moving (6 of 30 files read) is still stopped as stuck. In run 1 the agent pushed back on the brief's "commit what is done" because its task said read-only. |
| Step count | Note: the cap counts model messages; batched tool calls in one message count once, so one session went to 33 CLI turns under a cap of 8. The run's `turns` mixes the two counts (parser count for cut sessions, CLI `num_turns` for the last). |

Fixes, smallest first:
1. Cost: when a session ends without a result, estimate cost from its streamed token usage (model price table), or mark the total "at least $X".
2. Research: allow carry-on for `research` too (`carriesOn = !big && (kind === 'building' || kind === 'research')`), with progress = a new commit OR a new desk note / report filed.
3. Stall rule: count a fresh `forget` note (or changed working tree) as progress, not only a commit; drop "commit what is done" from the brief for read-only tasks.
