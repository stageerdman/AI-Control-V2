# Where the tokens go (token view)

Feature: f-context-window-management, inside f-agent-performance. Research: `updates/2026-11-25 CONTEXT WINDOW
MANAGEMENT - OPEN/token-view-research.md` (Columbo). Code: `app/src/features/office/performance/tokens/`, server
rollup `server/src/performance/tokens.ts`.

## User goal
"Is my studio spending its usage on real work, and is that getting better?" The person reads one sentence and is
done. They don't want to read a breakdown.

## Where it lives: one way in
The "How the team works" sheet already has a **Tokens** card, and that card is how you pick a measure. When you pick it,
the chart shows tokens per day and the view sits right under it. There's no new screen, button or link. Pick
another card and it goes away. The credits line doesn't point here (Eraser's call: one way in).

## What it says (only what the sheet doesn't already)
```
Where the tokens go
Most of the studio's tokens went to Rivet (about $3) and Blair (under $1). About $4 in all, if paid per use.
Spent on          ███████████████████████░  97% working · 3% getting ready
Starts            11 fresh starts · 2 picked up old work (40% of the tokens)
Per hour of work  766k tokens · ↑ 2% vs last week
Getting ready: the first step of each run, reading the rules and the task. Picked up old work: it brings the
whole earlier chat back, so it costs more than a fresh start.
```
1. **Who:** a sentence naming the few agents that cover ¾ of the tokens (3 at most), with cost only — their share is
   already in "Worth a look" and "Who does the work" (Eraser). Cost is rounded to whole dollars and labelled "if paid
   per use", because the owner pays a flat plan.
2. **Spent on:** working vs getting ready. Getting ready is each run's first step. One thin bar, sun on line.
3. **Starts:** one count each, in neutral colour. Fresh starts are cheap and fine. Picked-up old work is where the cost
   hides, so it carries its share of the tokens.
4. **Per hour of work:** tokens per hour of agent time against the window before. This compares like with like, so a busy week
   doesn't look like a failed fix. The raw per-day trend is already the chart above.

## Removed, and why
- A second per-agent list. The "Who does the work" list already ranks by tokens when the Tokens card is picked.
- Raw totals and the raw trend. The Tokens card shows them.
- "% of the plan left". That's the credits line's job.
- Re-read and new split. The open agent row already says it.
- Cost per token per agent. It reads as blame (Pixel's short, cold turns).
- Warning colours, "wasted", knobs, reduce buttons. It's read-only and calm.
- A six-reason breakdown of starts. One count each is enough.

## States
- **Empty** (tokens = 0 in the range): "Nothing measured yet. This fills in after the next run." Never zeros.
- **Quiet range / no work ever:** not shown. The sheet's own line covers it.
- **Getting ready not measured** (before session measuring, roadmap Phase 1): "Getting ready isn't measured yet." No
  bar and no definition.
- **Nothing picked up:** "none picked up old work", and no hint about it.
- **All time:** no "vs" (nothing to compare).
- **Older server without `tokenUse`:** the sentence and the rate only.
- **Loading / range switch:** follows the sheet (dimmed, last numbers kept).

## Data (read-only)
`GET /projects/:id/performance` gains `tokenUse`:
- `usd` per agent: runs' `cost_usd`. Crew calls have no price.
- `fresh` / `pickedUp` / `pickedUpTokens`: a run picked up old work when its session belongs to an earlier run of the same
  agent. A forget's new session counts as fresh.
- `ready` / `readyOf`: from `first_context` once session measuring adds it (`runs.first_context`,
  `run_sessions.first_context` or `crew_time.first_context`). Until then it's null.

## Accessibility
Real heading. A `dl` of label and value. The bar is decorative (`aria-hidden`) and its words say the same thing. No
controls. Ink-soft text keeps the sheet's contrast.

## Assumptions to check
- A1: people read the sentence and stop. Check it in the live pass.
- Per hour of work is the right yardstick, not per finished item. Revisit once per-goal cost exists.
