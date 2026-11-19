# Agent thinking power — update v1

## Goal
Let each agent think harder or lighter depending on the job. Today every run and every crew call uses one
studio-wide model (`AI_STUDIO_MODEL`, default `claude-opus-5-5`) and never passes an effort level, so the user
can't tell an agent "think hard on this one", an agent can't decide it needs more thought, and nobody can see
what thinking harder costs. Feature: `f-agent-thinking-power`.

## What "thinking power" means here (first principles)
Two things drive how well and how expensively an agent thinks: **which model** answers (price per token, raw
ability) and **how much it reasons before acting** (Claude Code's `--effort`: `low | medium | high | xhigh | max`,
set per session; what's available depends on the model). The user doesn't want to tune two settings. So:

**Thinking power = one dial with four steps.** Each step is a fixed (model, effort) pair:

| Step        | Model                              | Effort   | For                                              |
|-------------|------------------------------------|----------|--------------------------------------------------|
| **Light**   | `claude-sonnet-5-5`                | `low`    | health checks, short replies, routine chores     |
| **Normal**  | studio model (`AI_STUDIO_MODEL`)   | `medium` | the default for everyone                         |
| **Deep**    | studio model                       | `high`   | design, planning, hard bugs, reviews              |
| **Deepest** | studio model                       | `max`    | rare: architecture, a stuck problem, user's call |

- The pairs live in one pure table (`server/src/runtime/thinking.ts`), so changing a pair is a one-line change.
- Model and effort are never set separately in the UI. (Need a different pair later? Change the table.)
- **The hard ceiling stays the run caps** (`maxBudgetUsd`, `maxTurns`): thinking harder never lifts a budget.

### Who decides — most specific wins
1. **This task** — an override set by the user or the director on a goal/task ("think hard on this one").
2. **The agent** — a default set in the Cast (e.g. a visionary defaults to Deep).
3. **The kind of work** — studio defaults per role/call: planning a goal and reviews → Deep; health checks →
   Light; everything else → Normal.
4. **The studio** — Normal.

An agent can also **raise its own power one step** (up to Deep; Deepest only if the user or director set it):
effort is fixed for a CLI session, so the raise takes effect from its next session. That reuses `forget`
(which already starts a fresh session from a desk note): `forget` gets an optional `thinking: "deeper"`. A raise
lasts for the rest of that task only, and is recorded with the agent's one-line reason.

### What it costs (link to Agent Performance)
`runs` already store `model`; they and `crew_time` also get `thinking` (the step). The Agent Performance tally
(`server/src/performance/tally.ts`) then splits tokens, time and stopped-early by step, so the dial can show
**this office's own** averages per step ("Deep: ~2× tokens, ~1.6× time per task here"). In line with
Performance's rule, no money is shown: tokens and time only, with the model named, because a Light token
(Sonnet) is not priced like a Normal one.

## Requirements questioned (and cut)
- *"Each agent picks its model and its thinking level"* → one dial, not two knobs. Model choice only changes at
  the Light step.
- *"Several self-critique iterations"* → higher effort already makes the model reason and check its own idea
  before answering; an extra loop costs a whole run each time. v1 adds a cheap **second look** (a prompt step:
  check the plan against your values, cut what's too heavy, before acting) and measures it. A real multi-pass
  loop waits until the data shows first-idea answers are still a problem.
- *"Agents switch their own model"* → agents raise one step, capped; they never lower a power the user set, and
  never go to Deepest by themselves.
- *Switching effort mid-session* → not possible with the CLI; the next session is the switch point.

## Phases

### Phase 1 — the dial in the runtime (server)
- `runtime/thinking.ts` (pure): `ThinkingStep = 'light' | 'normal' | 'deep' | 'deepest'`, the step → (model,
  effort) table, `resolveThinking({ task, agent, kind })` (the order above).
- `claude-cli.ts` passes `--effort <effort>` with `--model`; the run spec carries the resolved step; crew calls
  (`crew/structured.ts`) take one too.
- Migration (next number): `runs.thinking`, `crew_time.thinking` (NULL = before this update).
- **Tests:** CLI args carry model + effort per step; resolution order; the step lands on runs and crew calls.
- **Live check:** a real run at each step starts and finishes with the installed CLI (Sonnet + `low`, studio
  model + `max`); Normal on `medium` is no worse than today's default on the same small task (Performance numbers).

### Phase 2 — per-agent default, per-task override (server)
- `agents.thinking` (NULL = role default); goals/tasks `thinking` next to their existing `caps`.
- Agent and goal/task routes accept and return it; the director's whiteboard tools can set a task's step
  (the voice path: "have Rivet think hard on the login fix").
- Role defaults for crew calls: planning and review → Deep, health → Light.
- **Tests:** routes validate the step (422 on a bad one); dispatch resolves task > agent > kind > studio.

### Phase 3 — an agent raises its own power (server)
- `forget` takes an optional `thinking: "deeper"` plus a reason; the next session runs one step up (capped at
  Deep unless a person set Deepest); the raise and reason are recorded on the run and show in its chat history.
- **Tests:** one step up, the caps, no raise past a person's setting, the raise ends with the task.
- **Live check:** a real agent asks for more power mid-task and its next session runs with `--effort high`.

### Phase 4 — the cost of each step (server)
- The performance tally and `GET /projects/:id/performance` add per-step totals (tokens, time, tasks, stopped
  early) for the office and per agent.
- **Tests:** per-step split, older rows count as "not recorded", totals still add up.

### Phase 5 — the dial in the UI (app, UX experts first)
- One four-step dial, defined once and reused: on the agent's Cast card (its default) and on a goal/task (the
  override). Under each step, this office's own averages from Phase 4; a step with no history says so.
- A small badge on a working agent shows its current step (and "raised itself — why" when it did).
- Voice: "think harder / lighter on this" sets the task override.
- **Tests:** the model (pure) + component tests; a live click-through.

### Phase 6 — second look (prompt) and measure
- One added step in the agent prompt: before acting on a plan, check it against your values and cut what's too
  heavy. Compare stopped-early and rework before/after in Performance. Only if that falls short, plan a real
  self-review pass (the same agent at Deep reviewing its own plan) as v2.

## Status
- [x] Roadmap (this file) and the definition above
- [x] Phase 1 — the dial in the runtime (migration 44; `runtime/thinking.ts`; runs and crew calls record their
  step; live: CLI 2.1.322 ran Light = Sonnet + `low`, 0 thinking tokens, and Deepest = Opus + `max`, which thought.
  The "Normal no worse than today" comparison waits for Performance numbers from real work.)
- [x] Phase 2 — agent default, task override (agent routes + manual run route take `thinking`; whiteboard
  `add_goal`/`add_task`/`edit_task` take a step or `default`; sub-tasks inherit; a gate's review uses the
  reviewer's own step or Deep, never the builder's task override; planning → Deep, health → Light; an agent's own
  default beats the kind of work's)
- [ ] Phase 3 — self-raise
- [ ] Phase 4 — cost per step
- [ ] Phase 5 — UI dial (in part: the Cast panel's Thinking control — four steps, one plain line each, saves
  on pick; Normal clears the agent's own step. design/cast/thinking.md. Still to do: per-step averages, the
  goal/task override, the working badge, voice.)
- [ ] Phase 6 — second look

## Decisions
- One dial, four steps; each step is a fixed (model, effort) pair in one table.
- Most specific wins: task > agent > kind of work > studio (Normal).
- Run caps are the hard ceiling; power never raises a budget.
- Agents raise themselves at most one step, up to Deep, from their next session, for the current task only.
- Cost is shown as this office's own tokens and time per step — never money, never made-up estimates.
