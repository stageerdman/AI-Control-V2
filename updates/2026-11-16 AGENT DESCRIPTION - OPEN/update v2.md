# Agent Description — update v2

Feature: `f-agent-description-improvement` (Agent Description Improvement).

## Goal
Orchestrators sometimes pick the wrong agent: every agent list an AI gets (the director's summary, the
Cast it may staff from, the room, the planning and workflow-design prompts, the setup catalogue) carried
only **name + role**. Each agent in those lists now also carries a one-line **about** (who they are)
and, when they sit on a team, their **job** there — kept short so prompts don't bloat. The user gets the
same overview as a team report (phase 2).

v1 (tools per agent in the Cast panel) stays as it was; its open Phase 3 (tool line in the room) is
still open there.

## Phased roadmap

### Phase 1 — Server: about + job in every AI-facing agent list (this item)
- One pure module `domain/agent-about.ts`: `aboutOf(prompt)` = the first sentence of the agent's own
  brain (headings skipped, whitespace collapsed, ≤ 140 chars), and `describe(agent, job?)` → the
  `{ about?, job? }` fields to spread into any list entry (empty ones left out). One source of truth:
  the prompt; nothing new is stored.
- Used by: the director's summary (`people.teams[].members`, `people.specialists`, `castAvailable.agents`),
  the room view (`inTheRoom`, `elsewhereInTheStudio`), the planning prompt (`dispatch` staff), the
  workflow-design prompt (`collaboration`), and the setup Cast catalogue (`castCatalogue`).
- **Tests:** unit tests for `aboutOf` / `describe`; the director summary, `castAvailable`, the room view
  and the catalogue include each agent's about and team job.

### Phase 2 — App: the team overview for the user
- The "list" option under the chat (next to Orchestrator / Safe) moves into the studio member profiles;
  clicking it gives a report of everyone in the team with their about and job.
- Built on the same server fields; design first (UX expert).

### Phase 3 — Performance hook
- The same overview object later carries each agent's performance check.

## Status
- [x] Phase 1 — about + job in every AI-facing list, with tests.
- [ ] Phase 2 — user team overview.
- [ ] Phase 3 — performance hook.

## Decisions
- `about` is derived from the prompt, never stored: Tinker's draft `summary` is not saved with the agent,
  and every existing agent already opens its brain with who it is ("You are Sola Simplex, the studio's
  product visionary.").
- `job` is the team seat's instructions (`Member.instr`), clipped; left out when empty or when the agent
  is on no team of that project.
- Lists that reach many agents (room's "elsewhere", `castAvailable`) use the same short clip: one line per
  agent, no full prompts.
