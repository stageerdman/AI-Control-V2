# Context Window Management — v1

Feature `f-context-window-management`. Lead: Elon Engineer. It builds on Agent Performance (`server/src/performance/`)
and the AI Credits Tracker (`server/src/credits/`).

## Goal
Know exactly where the studio's tokens and context go: which agent, which moment (work, session start, fresh restart,
resume, call), and what was thrown away or loaded twice. Then cut the waste a lot **without dropping quality**. Quality
means the same tests pass, the same review verdicts, the same finished items.

## First principles
- A model turn costs **its whole context**. 95% of our tokens are cache *re-reads*: the same context sent again on every
  turn. So the cost of a session is about turns × average context, and that grows with the **square** of its length.
- The levers:
  - fewer turns
  - a smaller context per turn: shorter sessions, a slimmer fixed prefix, no stale transcript
  - fewer cold cache writes: cold starts, and resumes after the cache has expired
- Output and fresh input are under 1% of tokens. Shorter answers won't move the needle.
- The numbers: [`findings.md`](findings.md). The report in the Reports tray has the same numbers in plain words.

## Roadmap

### Phase 0: Research (done, 2026-11-25)
- Measured from the live studio API and the stream fixtures. Scripts are in `spike/` (`analyze.mjs`, `resumes.mjs`,
  `prompt-size.ts`).
- **Exit:** findings and the report are filed, and the top 5 wastes are ranked by savings.

### Phase 1: Measure every session (server)
Today a run stores only its totals. One run may hold several sessions (forget, limit), and a resume hides the context it
loaded. Phase 1 records what we had to estimate.
- **Migration: `run_sessions`.** One row per CLI session of a run:
  - `run_id`, `n`
  - `started_by`: one of `new`, `resume-rework`, `resume-thread`, `forget`, `limit`, `answer`
  - `resumed_gap_ms`
  - `first_context` (the cold prefix: input + cache read + cache write of turn 1)
  - `peak_context`, `turns`, the four token columns, `ended_by`
- It's filled from the stream parser's per-message usage (`stream.ts` already sees it) in `service.ts` `watch()`. No new
  CLI flags.
- Crew calls (`crew_time`) get `first_context` and `peak_context` too, from `crew/structured.ts`.
- **Tests:**
  - The parser reports first and peak context from a fixture.
  - A forget run gives 2 session rows with `started_by` = `new`, then `forget`.
  - A rework run records `resume-rework` and its gap.
  - Crew calls save their context sizes.
  - Older rows stay NULL, meaning "not measured".

### Phase 2: Show it (server read, then UI)
- `performance/tally.ts` adds per agent:
  - cold starts
  - resumes
  - forgets
  - average and peak context per turn
  - "re-read share"
- It adds per office the **cost of a cold start**: the median `first_context`.
- `GET /projects/:id/performance` carries it. The Credits Tracker's `studioShare` gains "of which re-reads".
- UI: the team sheet's agent row gets one context line, for example "avg 54 k context · 12 cold starts · 3 resumes".
  It's designed with Jony, with no new screen.
- **Tests:** tally maths on seeded sessions, the route shape is locked, and the sheet model's words come out right for
  none, some and many.

### Phase 3: Evaluate (a benchmark, before any fix)
- A fixed **replay set**: 3 real past items of different sizes (a small fix, a mid feature, a long build with a
  review send-back). They're replayed in a sandbox copy of their repo at the commit they started from.
- For each one, record tokens, $, turns, cold starts and peak context. Also record **quality**: tests pass, the
  reviewer's verdict, and that the item finishes.
- Every Phase 4 fix runs against the same set: A (now) vs B (fix). **A fix ships only if tokens fall and quality holds.**
- **Tests:** the benchmark runner's summary maths. The replay set itself runs by hand (it costs real tokens), and its
  results go in `wiki.md`.

### Phase 4: Prevent (one fix per step, ranked by savings, each behind the Phase 3 gate)
1. **Rework starts fresh, with a handoff, instead of `--resume`.** When work comes back (review send-back, continue),
   start a new session. Its brief holds:
   - the original brief
   - the reviewer's findings
   - the item's diff stat and commits
   - the builder's last desk note or summary

   Keep `--resume` only when the transcript is small (< 40 k) **and** the cache is warm (< 5 min since it ended). The
   same rule applies to the orchestrator's thread.
   *Tests:* `requeue` / `dispatch` pick fresh vs resume by those two numbers, and the handoff brief holds each part.
2. **Shorter sessions: forget earlier.** `FORGET_AT` goes from 120 k to about 60 k (tuned by the benchmark). The
   nudge also comes when a big chunk of work is committed, and the desk note stays short and concrete.
   *Tests:* the nudge fires at the new threshold, and once per memory.
3. **A slimmer fixed prefix.** Every run gets only the studio tools its role uses. A builder doesn't get
   `propose_agent`, `comms_log`, `mail_directory`, `my_runs`, `cancel_run`, `propose_feature`… unless asked.
   Long tool descriptions get shorter. CLAUDE.md keeps project rules only: the generic UX and orchestrator modules move
   out, or are rebuilt shorter.
   *Tests:* the tool list per role is locked, and the size budget for prompt plus tools is checked in a test
   (`composePrompt` ≤ N chars).
4. **Reviews start informed.** The review brief carries the diff stat, the changed files, the builder's summary and the
   test result, so the reviewer reads the change instead of exploring the repo.
   *Tests:* the review brief holds those parts. Benchmark: review turns go down and verdicts stay the same.
5. **The orchestrator gets deltas.** Pixel's brief carries what changed on the board since its last turn, not the whole
   board, features and health every time.
   *Tests:* the delta brief for no change, one change and many changes.
- **Exit:** the benchmark shows each fix's saving, and Phase 2's numbers show it on real work for a week.

## Status
- [x] Roadmap
- [x] Phase 0: research, findings and report (2026-11-25)
- [ ] Phase 1 · [ ] Phase 2 · [ ] Phase 3 · [ ] Phase 4

## Decisions
- **Measure first, then cut.** Every fix in Phase 4 waits for Phase 1's numbers and Phase 3's quality gate.
- **Re-reads are the cost.** Don't chase output length or brief boilerplate: together they're under 1%.
- **Deleted from scope:**
  - Our own compaction or summariser model (Claude Code's forget and desk notes already do it, so tune them instead).
  - A token "budget per agent" (it treats the symptom).
  - Trimming brief boilerplate (0.3%).
