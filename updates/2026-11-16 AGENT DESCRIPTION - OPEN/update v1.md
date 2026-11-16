# Agent Description — update v1

## Goal
Next to an agent's description, its Cast panel shows its tools: what it can **edit**, **run** and
**reach** — so the user (and later other agents) can see who can do what without guessing.

Why: HR's office review (`updates/2026-11-15 HR - OPEN/points-list.md`, E3) passed on a gap found by
the Health Analyst (`updates/2026-11-15 AGENT ARCHETYPES - OPEN/e2e-check.md`): the server already
stores each agent's toolset, but the Cast shows it nowhere. The project rule "make what each agent can
reach visible and honest" asks for it.

## Phased roadmap

### Phase 1 — Server: a plain tool list per agent (this item)
- A pure function turns an agent's stored toolset (`domain/toolset.ts`, null = the studio's full kit)
  into three plain lists: `edit`, `run`, `reach`. It uses the same rules the runtime uses
  (`runtime/permissions.ts`, `runtime/service.ts`), so the list never promises more or less than a run gets.
- The Cast API (`GET /agents`, `GET /agents/:id`, and the POST/PATCH replies) adds `toolList` to every agent.
- **Tests:** unit tests for the pure function (full kit, read-only, scoped edits, git-only shell,
  web, mail, reporter role); route tests that the Cast API returns it.

### Phase 2 — App: the Tools section in the Cast panel
- `app/src/api/types.ts` gets `toolList` (and the existing `tools.works` lines).
- `AgentPanel` shows a short Tools block under the description: Edit / Run / Reach, an empty list
  reads "Nothing". Design first (UX expert), one reusable component.
- **Tests:** component test renders all three lists, the empty states, and a full-kit agent.

### Phase 3 — Agents can see it too
- The room's "who's here" view carries each agent's one-line tool summary, so an agent picks the right
  person for a job (the feature's vision: "who's available, without guessing").
- **Tests:** room text includes the tool line for a scoped agent and for a full-kit agent.

## Status
- [x] Phase 1 — server `toolList` on the Cast API, with tests.
- [x] Phase 2 — app panel: `ToolList` (Edit / Run / Reach rows) under the Brain in every saved agent's
  Cast panel, spec `design/cast/tools.md`; tests `ToolList.test.tsx` + the nine archetypes checked
  against the server's own `toolList` (`archetypes.e2e.test.tsx`).
- [ ] Phase 3 — room view for agents.

## Decisions
- `toolList` is derived, never stored: the toolset stays the one source of truth.
- Lines are plain words; an empty list means "nothing" (the UI words it: Edit "Nothing — reads only", Run "Nothing").
- The panel no longer shows the old prose "works with" lines (`tools.works`): they overlapped the real
  permissions and could disagree with them. One truth, shown once. `works` stays in the data for Tinker.
- "Reach" covers: reading the project (always), the web, mail, and the keys granted to the project the
  agent works in (names only, never values — runs get every key granted to their project).
- Web: a toolset's `web`, or a reporter role (report runs always get the web). A report *team* also
  gives the web, but only for that team's runs — that is per run, not per agent, so it is not listed.

## Known gaps
- Orchestrators chatting in the office get the director's own action list (`office/capabilities.ts`),
  not this kit; `toolList` describes the agent's working runs.
