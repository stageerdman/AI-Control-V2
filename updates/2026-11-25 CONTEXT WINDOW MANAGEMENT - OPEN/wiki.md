# Context Window Management: wiki

## Lessons
- **The bill is re-reads.** 95% of tokens (and ~55% of money) are cache reads of context the model already saw. The
  cost of a session ≈ turns × average context, and that grows with the square of its length. Long sessions and stale
  transcripts are the target. Output (0.6%) is not.
- **`--resume` loads the whole old transcript.** A rework that resumes carries round 1's file reads and dead ends:
  median 54 k context per turn vs 20 k fresh. Past the prompt cache's lifetime, it also writes all of it to the cache
  again.
- **A run is not a session.** One run can hold several sessions (forget, limit carry-on). `runs` stores totals only, so
  per-session questions (cold prefix, peak context, why it started) need their own rows.
- **A resumed run is visible as `sessionId ≠ id`.** Fresh runs use their own id as the session id (`--session-id
  runId`). Carry-on sessions inside a run get a random id, and their start is a chat message of kind
  `forget` / `limit`.
- **Crew calls are cheap** (~0.5% of tokens). Agent-to-agent talk is not where the context goes.
- **Price weights that fit our bill:** read ≈ 0.1×, write ≈ 1.25×, output ≈ 5× input, which gives ≈ $3/M input.
  Use them to turn token savings into money.

- **Fresh beats resume unless small and warm.** The rule lives in one pure function (`context/resume-rule.ts`):
  resume only if the last session's last context is < 40 k and it ended < 5 min ago. Everything else gets a
  handoff brief (ask, commits + diff stat, last words, desk note, original brief).
- **Use the last turn's context, not the peak,** to judge how big a session is to resume: the peak can come
  from before a forget.

## Gotchas
- Don't run `npm run format` across the repo: biome rewrites ~20 unrelated files. Use
  `npx biome check --write <files>`.
- The running studio may be older than the checkout: chat messages were at `/chats/:runId/messages` before project
  isolation, and are at `/projects/:id/chats/:runId/messages` after. The spike tries both.
- Agents' file tools can't read `~/.ai-studio/runs/*.jsonl` (`--restricted`). Use the API, or the fixtures in
  `server/test/fixtures/`.
