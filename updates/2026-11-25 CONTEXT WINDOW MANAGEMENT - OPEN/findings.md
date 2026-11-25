# Where the tokens go: findings (2026-11-25)

The data comes from the running studio's own API (`/projects`, `/projects/:id/runs`,
`/projects/:id/performance?range=all`, chat messages) and the real stream fixtures in `server/test/fixtures/live-*.jsonl`.
Scripts: `spike/analyze.mjs`, `spike/resumes.mjs`, `spike/prompt-size.ts`. Reproduce with
`node spike/analyze.mjs http://127.0.0.1:4319`.

It covers 10 projects, 1,346 runs and 2,128 requests (runs plus crew calls) from 2026-11-15 to 2026-11-25.

## Totals
| | tokens | share |
|---|---:|---:|
| All work | 1,718 M | 100% |
| Cache **re-read** (the context sent again on every turn) | 1,637 M | 95.3% |
| Cache write (new context: cold starts, tool results, resumes) | 63 M | 3.7% |
| Output | 10.5 M | 0.6% |
| Fresh input | 0.06 M | ~0% |

- **Money (API-equivalent, the CLI's `total_cost_usd`): $911.**
- Weighted by price (read ≈ 0.1×, write ≈ 1.25×, output ≈ 5× input), the money splits as **re-reads 55%, cache writes 27%,
  output 18%**. These weights fit: they give ≈ $3/M input, which matches the bill.
- Subscription windows weigh usage much like cost, so **re-reads are the target**. Re-read cost per turn = context size,
  so a session costs roughly turns × average context, and that grows with the square of its length.

## Who
| agent | tokens | share | $ | turns | requests |
|---|---:|---:|---:|---:|---:|
| Uncle Bob | 995 M | 58% | 381 | 19,978 | 378 |
| Jony | 464 M | 27% | 245 | 10,555 | 312 |
| R | 94 M | 5.5% | 62 | 2,280 | 72 |
| C | 49 M | 2.8% | 53 | 2,207 | 212 |
| Columbo | 44 M | 2.6% | 37 | 1,404 | 69 |
| Pixel (orchestrator) | 26 M | 1.5% | 77 | 1,618 | 929 |
| everyone else (10 agents) | 46 M | 2.7% | 56 | | |

Two builders burn **85%** of all tokens. Pixel makes the most requests (929) but uses few tokens, and pays more per token
because every short turn starts cold.

## When
| moment | runs / starts | tokens | share |
|---|---:|---:|---:|
| Building (dispatched work) | 696 runs | 1,632 M | 95% |
| Orchestrator thinking | 319 runs | 23 M | 1.3% |
| Reviews | 328 runs | 49 M | 2.9% |
| Research | 3 runs | 6 M | 0.4% |
| Crew calls (planning, splits, answering a call, approvals) | ~780 | ~8 M | 0.5% |

By run length:

| turns | runs | tokens | $ |
|---|---:|---:|---:|
| 0–6 | 444 | 32 M | 112 |
| 7–15 | 318 | 75 M | 143 |
| 16–40 | 288 | 284 M | 192 |
| 41–120 | 239 | 771 M | 365 |
| 121+ | 57 | 547 M | 100 |

**Runs over 40 turns: 22% of runs, 77% of tokens.**

## Starting from zero vs carrying on
- **Fresh sessions (cold start, from zero):** 929 runs. There are also 154 `forget` restarts inside 112 runs and about
  780 crew calls, which are always one-shot. So **≈ 1,860 of the 2,128 requests start from zero.**
- The moments when an agent starts from zero:
  - every new checklist item
  - every review (328, all fresh)
  - every orchestrator turn whose thread was rotated
  - every forget
  - every crew call
- **Step-limit carry-ons: 0 recorded.** The 70 turn-cap failures (135 M tokens) all fall on Nov 15–16, under the old
  30-step cap. The cap is 120 now and carry-on is in place, so that waste is already gone.
- **Resumed sessions (`--resume`, the old transcript loaded whole):** 417 runs. That's 246 builds sent back for rework
  or continued, and 165 orchestrator thread turns.
  - **These runs use 969 M tokens, 57% of everything**, and cost $385.
  - Median context per turn is **53.7 k resumed vs 20.2 k fresh** (2.7×).
  - Gap since that session last ended: 181 under 5 min, 76 from 5 min to 1 h, 43 over 1 h, 117 unknown. Past the
    prompt-cache lifetime, the whole old transcript is written to the cache again.
- **When work goes back to an agent** (a review sends it back, or the item continues), the builder **resumes its old
  session**, with every file read, every tool result and every dead end from round 1. Nothing is summarised.

## How big things are
| piece | size |
|---|---|
| Cold start (system prompt + tools + brief, first turn), measured in fixtures (older CLI, 1 studio tool) | 8–10 k tokens (build/review); 3–5 k for tool-less crew calls |
| The same today with ~20 studio MCP tools | ≈ 12–13 k (estimate; Phase 1 measures it) |
| Studio's composed system prompt (typical build, 800-char persona) | 7.5 k chars ≈ 1.9 k tokens |
| ·· Working with others / Your memory / GitHub / Ready to test | 435 / 300 / 199 / 125 tokens |
| HQ `CLAUDE.md` (read by the CLI on every run) | 7.0 k chars ≈ 1.7 k tokens |
| Briefs (task text) | median 3.0 k chars, p90 10.1 k, max 32.8 k |
| Pixel's briefs (board, features and health summary pasted in every turn) | ~10.9 k chars ≈ 2.7 k tokens per turn |
| Context growth per turn (fixtures) | 0.9–2.7 k tokens |
| Average context per turn, runs ≥ 3 turns | median 24 k, p90 61 k, max 120 k |
| Forget nudge threshold (`FORGET_AT`) | 120 k tokens |

Brief boilerplate (checkout, `run:` line, feature-tool lines) appears in 526 runs, totalling 366 k chars. Even re-read on
every turn, that's ≈ 5 M tokens (0.3%), so it isn't worth chasing.

## Thrown away or loaded twice
1. **Loaded twice:** resumed sessions reload the whole old transcript, and rewrite it into the cache after a gap.
2. **Never thrown away:** long builds keep every file read and tool result until 120 k. The nudge comes late, and only
   112 of the 525 long runs ever forgot.
3. **Sent on every turn:** the static prefix (studio prompt ≈ 1.9 k, CLAUDE.md ≈ 1.7 k, tool schemas ≈ 6 k) is re-read
   on all ~38.5 k turns, ≈ 370 M tokens. Some of it is generic: CLAUDE.md's UX/orchestrator modules, and studio tools a
   builder never uses (`propose_agent`, `comms_log`, `mail_directory`, `my_runs`…).
4. **Thrown away, now fixed:** turn-cap failures on Nov 15–16 (135 M tokens).
