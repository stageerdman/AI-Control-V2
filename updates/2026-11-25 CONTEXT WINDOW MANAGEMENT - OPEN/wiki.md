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

## Gotchas
- The running studio may be older than the checkout: chat messages were at `/chats/:runId/messages` before project
  isolation, and are at `/projects/:id/chats/:runId/messages` after. The spike tries both.
- Agents' file tools can't read `~/.ai-studio/runs/*.jsonl` (`--restricted`). Use the API, or the fixtures in
  `server/test/fixtures/`.
