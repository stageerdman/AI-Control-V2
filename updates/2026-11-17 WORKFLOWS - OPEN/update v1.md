# Workflows — update v1

Feature: `f-workflows`. Designed by Elon (lead), built by Uncle Bob (backend) on Elon's command; front-end phase
by Jony. Status at the bottom.

## Goal

How work flows through the studio. Two kinds:

- **Stable workflow:** the standing way a project works: who the orchestrator briefs, and who signs off whose work.
  A project has one or more, each named for a scenario ("Feature build", "Quick fix"). Each goal runs under one.
- **Temporary workflow:** for one goal the structure changes. Someone leads with a small crew (live example:
  *Elon leads, Uncle Bob builds*). When the goal ends it is gone, and everything is back as it was. If it worked,
  it can be kept: saved as a stable workflow, or rebuilt into a real team.

From the user's vision: *several workflows, each for a different scenario; soft suggestions, not hard rules;
quality checkpoints that every named agent must sign.*

## The problem today (first principles)

Look at what the studio actually knows right now:

1. **Stable workflows almost exist already.** `projects.collaboration` (B8, `server/src/domain/collaboration.ts`)
   stores who the orchestrator talks to, review gates (reviewer approves or sends back) and the send-back limit.
   Dispatch snapshots the gates onto each checklist item. What's missing: there is only one per project, it has no
   name and no scenario, and a goal can't choose.
2. **Temporary workflows exist only as words in a brief.** "Elon leads, Uncle Bob codes" is text in Pixel's brief.
   The studio doesn't know it:
   - `room` names Pixel as Uncle Bob's contact, not Elon (`contactOf`, `server/src/room/rule.ts`).
   - Elon has no `stop_work` / `tell_agent` over Bob (`captainTools` only knows captains,
     `server/src/office/leader-tools.ts`).
   - **The worst one:** when Elon hands Bob a phase with `call_agent work: true`, `addWork` (`server/src/app.ts`)
     makes a *new side quest goal*. It doesn't serve the feature, it waits behind every main quest, and the
     feature ships without it. The lead's real work gets demoted to an errand.
   - Nobody checks Bob's work against Elon's design unless someone remembers to.

So the job is not "build a workflow engine". It is: **give the existing collaboration a name and a lifetime, and
make a temporary lead real.**

## Design

### One object, two lifetimes

```ts
// server/src/domain/workflows.ts (pure)
Workflow = {
  id: string;                       // slug, unique within the project ("feature-build"); temporary: "temp"
  name: string;                     // "Feature build" | "Elon leads"
  when: string;                     // the scenario, for the orchestrator: "new features and big changes"
  orchestratorTalksTo: 'captains' | 'everyone';   // as today
  gates: Gate[];                    // sign-offs, as today (after / reviewer / kind / why)
  maxSendBacks: number;             // as today
  summary: string;                  // one line for people
  lead?: string;                    // agent id — temporary only
  crew?: string[];                  // agent ids, 1–4 — temporary only
}
```

- **Stable** = lives on the project: `projects.workflows` (a JSON list, 1–6 entries). The first is the default.
  It never has `lead` / `crew`.
- **Temporary** = lives on one goal only. It always has `lead` + `crew`.
- **Every goal stores the workflow it runs under** as a snapshot (`goals.workflow` JSON), the same way items already
  snapshot their gates. Editing the project's workflows never changes a running goal.

The old `Collaboration` becomes a `Workflow` without the new fields. Migration turns an existing
`projects.collaboration` into `workflows[0]` (`id: "usual"`, `name: "Our usual way"`, `when: "everything"`).

### Soft for planning, hard once on the board

- **Choosing is soft.** The orchestrator sees every stable workflow with its `when` and picks one per goal, or
  writes a temporary one. It may pick none, and then the default applies. The user can override by voice
  ("use the quick-fix way").
- **Signing is hard.** Once a goal is on the board, its item gates are binding, as today: an item is done only when
  every reviewer on it signed (approved), within `maxSendBacks`.

This is the user's "soft suggestions" plus "a report every agent must sign" without a contradiction.

### Temporary workflow: what the lead really gets

Everything is **derived from running goals**. Nothing is written to teams, the Cast or the room. So "end" needs
no cleanup code: when the goal stops running, the powers are gone. That *is* "goes back".

While goal G (temporary, lead L, crew C) is `running`:

1. **Contact.** In a run on G, a crew member's `yourContact` is L, and L approves their bring-in calls
   (`approverFor`). Their runs on other goals keep their usual contact.
2. **Leader hands.** L gets `stop_work` / `tell_agent` scoped to C (same tools as captains, wider reach).
3. **Handing out work stays main-quest work.** In L's run on G, `call_agent work: true` to someone in C adds a
   task **to G itself**: owner = the crew member, after L's own task and after the tasks L handed out earlier
   (in order, not parallel), with L's sign-off gate. It serves G's feature, it is a main quest, and the goal
   doesn't settle while it's open. A work call to someone outside C stays a side quest, as today.
4. **The lead signs off the crew's work.** A temporary workflow's gates always include, for each crew member,
   `{after: member, reviewer: L, kind: 'review', why: 'The lead signs off their crew's work'}`, on top of any
   gates it names. This turns "built on Elon's command" into a real checkpoint.

**Start:** the goal is added with a temporary workflow (Pixel's `add_goal`, or the plan). Crew members who are
Cast guests are seated, as work calls already do (`seatForWork`).
**Switch:** `edit_goal` with a new `workflow` (stable id, or lead + crew). Running items keep their gates.
Waiting items are re-gated. Powers follow at once (they're derived).
**End:** the goal settles (done / failed / cancelled). A failed goal releases the crew. `resume_goal` brings it back.
**Keep it:** when a temporary goal ends `done`, the orchestrator's thread gets one line: "Elon's crew finished.
Keep this way of working?" Pixel can then `save_workflow` (gates become a stable workflow; lead and crew are dropped,
because a stable workflow names checks, not command), or `rebuild_teams` (existing, user confirms) to make lead +
crew a real team with L as captain. That is "rebuilt inside the team".

### Sign-offs: the signed report, from data we already have

Each item already stores `gates`, `gateIndex` and `reviews` (verdict, notes, reviewer, run). The sign-off sheet is
**derived, not a new run or table**:

- per item: each gate's reviewer → `pending` | `signed` | `sent-back` (last verdict 'changes', not yet re-reviewed);
- per goal, when done: "Signed by …" (the distinct reviewers who approved).

No extra review runs, no extra cost. The "every agent must sign" guarantee is the existing gate rule.

### How it shows (Jony's UI call, 2026-11-17)

- **Whiteboard chip.** No chip for the default workflow. A different stable workflow gets a plain text chip in the
  goal's meta line (on folded strips and side cards, at the right end). A temporary workflow gets the same chip
  with a **dashed outline + the lead's tiny avatar**: "◌ Elon leads". No new colour.
- **Sign-off strip.** At the right end of each task strip, after the people chips: 16px avatars, at most 3, then "+N".
  Pending = hollow grey ring; signed = full colour + ✓ badge; sent back = amber ring + ↩ badge. Each state has a glyph
  as well as a colour. The tooltip and aria text say "Health Analyst: signed". No strip on items without reviewers.
  A done goal shows one muted line: "Signed by Health Analyst, Humanitarian". Not on the folded "N more done" strip.
- **Office.** No new panel. While a temporary goal runs: one soft dashed ring around the lead and crew, labelled with
  the goal, and the crew's contact line points to the lead. It fades out when the goal ends: that fade *is* "the crew
  dissolved".
- **No workflow picker on the board.** Choosing happens where goals are created (by voice through the orchestrator,
  or the plan).
- **Voice path.** Everything goes through the orchestrator: "Elon, take command and use Uncle Bob for the code",
  "From now on Health Analyst checks all backend work", "Use the quick-fix way for this".

### Deleted on purpose (and why)

- **A workflow engine / state machine / step graph.** Goals already have ordered items and gates. A workflow only
  chooses who signs and who leads.
- **Writing temporary structure into teams.** That would mean mutating the Cast and restoring it afterwards, and a
  crash halfway would leave it broken. Derived state can't be left behind.
- **Goal-level review runs.** The signed sheet comes from item reviews.
- **A separate "temporary workflow" table.** It lives on its goal.
- **A board picker and workflow-editing screens in v1.** Voice through the orchestrator first; WorkDesign only shows.
- **Added back (optional, Phase 6):** the vision's "is this a good idea / is there a better way" check *before*
  building, and a team's own usual way. Both reuse what exists: a report task first, and gates scoped to a team.

## Roadmap

Each phase is one PR-sized commit series, ends with tests, and keeps every existing test green
(`npm test` in `server/`, `npm test` in `app/`). Server phases first; nothing on screen changes until Phase 5.

### Phase 1 — The Workflow model (server, pure + storage)

1. **New `server/src/domain/workflows.ts`** (pure). Move the shared parts out of `collaboration.ts`, keeping that
   file as thin re-exports so imports don't break:
   - `WorkflowSchema` = today's `CollaborationSchema` fields + `id` (slug, `/^[a-z0-9-]{1,40}$/`), `name` (1–60),
     `when` (1–200, default `"everything"`), `lead?`, `crew?` (1–4 ids, unique).
   - `WorkflowsSchema` = array, 1–6, unique ids.
   - `MAX_WORKFLOWS = 6`, `MAX_CREW = 4`.
   - `workflowIssues(w, staffing, {temporary})`: everything `collaborationIssues` checks today, plus:
     stable → no `lead` / `crew`; temporary → both required, lead and crew on the project (team member, specialist
     or guest; add guests to `Staffing.specialists` where `staffing()` is built), lead not in crew.
   - `workflowsIssues(list, staffing)`: each one valid, ids unique.
   - `fromCollaboration(c): Workflow` → `{...c, id: 'usual', name: 'Our usual way', when: 'everything'}`.
   - `DEFAULT_WORKFLOW` = `fromCollaboration(DEFAULT_COLLABORATION)` (move that constant here).
   - `pickWorkflow(list, id?)`: that id, else `list[0]`, else `DEFAULT_WORKFLOW`.
   - `effectiveGates(w)`: `w.gates` plus, when `w.lead`, one `{after: m, reviewer: lead, kind: 'review', why:
     'The lead signs off their crew’s work'}` per crew member (skip duplicates of a gate already listed).
   - `gatesFor(w, item)`: today's function, reading `effectiveGates(w)`.
2. **Migration 40** (`server/src/db/migrations.ts`):
   `ALTER TABLE projects ADD COLUMN workflows TEXT;` `ALTER TABLE goals ADD COLUMN workflow TEXT;`. Migrations are
   plain SQL strings, so do the conversion **on read** in `projectsRepo`: `workflows ?? (collaboration ?
   [fromCollaboration(collaboration)] : null)`. The first write saves `workflows`. Leave the old column in place,
   unused.
3. **Repos.** `Project.workflows: Workflow[] | null` (null = never designed) in `server/src/db/projects.ts`
   (read with `WorkflowsSchema.safeParse`, bad JSON → null, like `readCollaboration`). Remove `Project.collaboration`
   and fix the callers (`grep -n "collaboration" server/src`, about 10 sites) to use
   `pickWorkflow(p.workflows ?? [])`. `Goal.workflow: Workflow | null` in `server/src/db/work.ts` (`insertGoal`
   takes it; `setGoalWorkflow(id, w)` added).
4. **Plan + setup.** `domain/plan.ts`: `collaboration` stays accepted in setup plans (the setup chat contract) and
   becomes `workflows: [fromCollaboration(...)]` at `setter/finish.ts` / `crew/creator.ts` (`resolvePlaceholders`
   works on a Workflow too: also rewrite `lead` / `crew`).
- **Tests** (`server/test/domain/workflows.test.ts`, `server/test/db/migrations.test.ts`):
  schema accepts and refuses (bad id, 7 workflows, crew of 5, duplicate ids); `workflowIssues` for stable-with-lead,
  temp-without-crew, lead in crew, crew not on the project, guest crew accepted; `effectiveGates` adds the lead's gate
  per member and skips duplicates; `pickWorkflow` fallbacks; migration turns a stored collaboration into
  `workflows[0]`; goal round-trip of `workflow`. Every existing collaboration test still passes.

### Phase 2 — Goals run under a stable workflow (server)

1. **Dispatch** (`server/src/crew/dispatch.ts`): when a goal is created (orchestrator plan, `board.addGoal`,
   `addDirectGoal`), it gets `workflow = pickWorkflow(p.workflows ?? [], requested)` as its snapshot. Everything that
   reads `p.collaboration` today reads **the goal's** workflow instead: `gatesOf` (→ `gatesFor(goal.workflow, owner)`),
   `maxSendBacks`, and `crewing()`'s `orchestratorTalksTo` (crewing takes the chosen workflow). Goals stored before
   this phase have `workflow = null` → `pickWorkflow(p.workflows)` at read time.
2. **Planning picks one.** The `dispatch` contract gains `workflow?: string` (a stable id). The planning task lists
   the workflows as `{id, name, when, summary, gates (names)}` instead of today's single `describeCollaboration`, with
   this rule: "Pick the workflow whose `when` fits this goal; leave it out for the first one. These are suggestions:
   if none fits, pick the closest and say why in `summary`." An unknown id is a validation issue (the crew retries).
3. **Orchestrator tools** (new `server/src/office/workflow-tools.ts`, registered where `teamTools` are):
   - `workflows`: read the list.
   - `set_workflow {id?, name, when, talksTo?, gates: [{after, reviewer, kind, why}], maxSendBacks?, summary,
     first?}`: add, or replace by id. Names resolve to ids (`agentByName`, team by name). `first: true` makes it
     the default. Refusals say which field.
   - `remove_workflow {id}`: never removes the last one.
   - `add_goal` / `edit_goal` (`server/src/whiteboard/tools.ts`) gain `workflow` (stable id). The description says
     when to use it.
   - Every change: event `workflows.changed` `{count, names}` (add to `server/src/domain/events.ts`), and a
     whiteboard history entry like the board tools write.
4. **Routes.** `GET/PUT /projects/:id/workflows` (whole list, validated). Keep `GET/PUT /projects/:id/collaboration`
   working by reading and writing the **first** workflow (the app's `WorkDesign` uses it until Phase 5).
   `POST …/collaboration/design` now designs the list: contract `{reply, workflows}`. Update `COLLABORATION_RULE` /
   `COLLABORATION_EXAMPLE` in `crew/prompts.ts`: "1–3 workflows, the first is the usual one; add another only for a
   scenario that really needs different checks". Update `fake-brain.ts` to match.
5. **Board text** (`server/src/whiteboard/board-text.ts`): a goal not on the default workflow reads
   `(workflow: Quick fix)`. `presentGoal` and the `goal.changed` event carry `workflow: {id, name, temporary:false}`.
- **Tests:** a goal planned with `workflow: "quick-fix"` snapshots it and its items get that workflow's gates, not
  the default's; editing the project's workflows doesn't change a running goal's gates; old goals (null) fall back;
  unknown id is refused; `set_workflow` / `remove_workflow` (last one refused, names resolved, `first` reorders);
  `/collaboration` still reads and writes the first workflow; the design call returns a validated list (fake brain).

### Phase 3 — Temporary workflows: a real lead (server) ← the live example

1. **Defining one.** `add_goal` / `edit_goal` `workflow` also accepts an object
   `{lead: name, crew: [names], gates?: [...], why?: string}`. The board builds
   `{id: 'temp', name: '<Lead nick> leads', when: 'this goal', orchestratorTalksTo: base.orchestratorTalksTo,
   gates: given ?? [], maxSendBacks: base.maxSendBacks, summary: why ?? '<Lead> leads <crew names>', lead, crew}` from
   the default workflow `base`, validates with `workflowIssues(…, {temporary: true})`, and seats guest crew
   (`seatForWork`). The dispatch contract gains the same object form (`workflow` = string | object).
   **As built:** crew (or a lead) who are Cast agents but not on the project are seated as guests; only names
   nobody in the studio has are refused.
2. **Who leads whom now** (new pure helpers in `domain/workflows.ts`):
   - `leadOf(agentId, goal)`: `goal.workflow?.crew?.includes(agentId) && goal.status === 'running'` →
     `goal.workflow.lead`, else null.
   - `crewsLedBy(leadId, goals)`: the crew ids of every running goal whose temporary lead is `leadId`.
3. **Room** (`server/src/room/room.ts`): `RoomCtx` gets `goalId?: string`. Set it in
   `runtime.setStudioTools` (`server/src/app.ts`, where `room.tools({... chain: []})` is built): the run's checklist
   item via its `runId` (the same lookup `agentFeatureTool` uses) → its `goalId`. Chats and calls have no item →
   no `goalId` → the usual rules. Calls inherit the caller's `goalId` in `inner`.
   **As built:** `RoomCtx` carries `runId`, not `goalId`; the room's `deps.goalOfRun` looks up the run's goal at call
   time. Why: a run's tools are built before dispatch links the run to its item, so a goal fixed at build time was
   always missing. In `room()` and `call()`, a caller whose goal has a
   temporary lead gets `contact = leadOf(...)` before the usual `contactOf`. `approverFor`'s
   `captainOf` for that caller returns the lead. Pure change in `rule.ts`: `contactOf` takes an optional
   `leadOverride`.
4. **Leader hands** (`server/src/office/leader-tools.ts`): `captainTools` becomes `leadTools(s, projectId, agentId,
   goals)`: the reach is the members of the teams they captain **∪** `crewsLedBy(agentId, running goals of the project)`.
   Rename the call site (`app.ts`, next to `room.tools`). A lead with no team gets the tools while they lead a crew.
   The studio tools are built when a run starts. That is enough: the lead's runs on G start while G runs, and when G
   is cancelled its runs stop too, so no live re-check is needed.
5. **Handing out work stays on the goal** (`addWork` in `server/src/app.ts`, and `room.call`'s `work: true` path):
   if the caller's ctx goal has a temporary workflow with them as `lead` and the callee in `crew`, call a new
   `board.addCrewTask(goalId, leadId, calleeId, request)` instead of `addDirectGoal(... quest: 'side')`. It inserts a
   task at the position after the lead's own item and after every task this lead already handed out on that goal,
   with `parallel: false`, `gates = gatesFor(goal.workflow, {agentId: callee, teamId: null})` (so it includes the
   lead's sign-off), and announces it like `add_task`. The to-do still gets queued. The answer to the lead says
   "Added to this goal as <Bob>'s task #n; you sign it off."
   Anyone else's work call → side quest, unchanged.
6. **Prompts.** In a crew member's run on such a goal, the task names the lead ("Elon leads this goal: report to them;
   they sign off your work"). In the lead's run: "You lead <crew> on this goal. Hand them work with `call_agent`
   `work: true` (it stays on this goal); you sign off each of their tasks; `tell_agent` / `stop_work` reach them".
   Add both to where the item task is composed (`dispatch.ts` task builder).
- **Tests:** `leadOf` / `crewsLedBy` (running only; a cancelled goal → null); a crew member's `room` shows the lead as
  contact during the goal and the usual contact after it ends; the lead approves the crew's bring-in call; the lead
  has `stop_work`/`tell_agent` over the crew only, and loses them when the goal ends; **the lead's `work: true` call
  to a crew member adds a main-quest task to the same goal (not a side quest), in order, gated by the lead, and the
  goal doesn't settle until it's done**; a work call to a non-crew agent is still a side quest; a temporary workflow
  with a crew member not on the project is refused.

### Phase 4 — Switch, end, keep (server)

1. **Switch.** `edit_goal` with `workflow` (id or object): `work.setGoalWorkflow`. Then re-gate every item still
   `todo` and in stage `build` with no `buildRunId` (`gates = gatesFor(new, owner)`, `gateIndex = 0`). Running or
   reviewed items keep theirs. Answer with how many were re-gated. Event `workflow.changed`
   `{goalId, name, temporary, lead?}` (goal → project scope like `goal.changed`).
2. **End.** In `refreshGoal`, when a goal with a temporary workflow settles: event `workflow.ended`
   `{goalId, lead, crew, status}`. No cleanup: powers are derived (Phase 3). On `done`, the orchestrator's thread
   records one agent line (`threadsRef.record`, like `onPlanned`): "<Lead>'s crew finished <goal>. Keep this way of
   working? I can save its checks as a workflow, or make <lead> + <crew> a team."
3. **Keep.** Orchestrator tool `save_workflow {goal, name, when}`: takes a goal's workflow; temporary → a stable copy
   without `lead` / `crew` but **with** the lead's sign-off gates written out as plain gates; appends it to the
   project's workflows. Rebuilding into a team stays `rebuild_teams` (no new code: the tool description of
   `save_workflow` points to it).
4. **Sign-off sheet** (pure, `domain/workflows.ts`): `signoffs(item)` → `[{reviewer, kind, state: 'pending' | 'signed'
   | 'sent-back'}]` from `gates`, `gateIndex` and the last review per gate; `signedBy(goal)` → distinct reviewers
   who approved, in order. `presentGoal` / the item JSON carry `signoffs`, and done goals carry `signedBy`. When a
   goal settles `done` with any sign-offs, the orchestrator's plan-thread line about it ends "Signed by A, B."
- **Tests:** switch re-gates only untouched todo items; a running item keeps its gates; switching stable → temporary
  gives the lead powers at once and back again removes them; `workflow.ended` fires once per settle, with the right
  status; `save_workflow` writes out lead gates and drops lead/crew; `signoffs` for pending / signed / sent-back /
  re-reviewed-then-signed; `signedBy` order and de-dupe; event schemas accept the new events.

### Phase 5 — On screen (front-end, Jony; UX pass first)

1. `app/src/api/types.ts`: goal `workflow {id, name, temporary, lead?}`, item `signoffs`, goal `signedBy`; the new
   events in the SSE handlers (`goal.changed` carries the workflow; `workflow.changed` / `workflow.ended` refresh the
   board query).
2. **Chip** (`app/src/features/office/QuestBoard.tsx`, one new `WorkflowChip` component in the same folder): hidden
   for the default workflow; plain for another stable one; dashed + lead's 16px avatar for temporary.
3. **Sign-off strip** (`SignoffStrip.tsx`, used by `TaskCard.tsx` / the task strip): as in the design above; done
   goal → muted "Signed by …" line; none on the folded done strip; none without reviewers.
4. **Office ring** (`app/src/features/office/engine.ts` / `layout.ts`): while a temporary goal runs, a dashed ring
   around the lead + crew desks, labelled with the goal's short text; the crew's contact line points to the lead;
   it fades out on `workflow.ended`. Pure helper `crewRings(goals) → [{goalId, label, lead, crew}]` in `state.ts`.
5. `WorkDesign` (`app/src/features/collab/`) lists the workflows (name, when, gates) instead of one design;
   read-only. Editing stays voice-first through the orchestrator.
- **Tests:** `crewRings` (running temp goals only); `WorkflowChip` three cases; `SignoffStrip` states, "+N" past 3,
  aria labels, hidden without reviewers; QuestBoard shows "Signed by" on done goals only; WorkDesign lists several.
  Screenshot pass with Humanitarian for contrast and glyphs.

- **As built (Jony):** the tag also carries `crew` on temporary workflows (`workflowTag`, event schema), because the
  office ring needs the crew and the goal JSON had only the lead. The design's "crew's contact line points to the
  lead" is dropped: the office draws no contact lines anywhere, and the ring already says who leads whom.

### Phase 5b — The workflow editor (scope from the user, 2026-11-17; front-end Jony, backend Uncle Bob)

The user asked for more than a read-only list: **three types** (team, office, temporary) and a **visual editor**:
agents as nodes, arrows for what goes where and why, light decision branches, hand editing (place agents, set the
first and the final agent). Opened from the Cast (a team's way) and the office ("How we work").

- **Three types, one shape.** *Office* = today's stable workflows (`projects.workflows`). *Team* = one per team
  (`teams.workflow`, the team's usual way from Phase 6; stored and shown, dispatch uses it once Phase 6 runs).
  *Temporary* = on a goal (lead + crew). Where it lives says which kind: the server adds `scope` (and `teamId`) on reads.
- **Data (agreed with Uncle Bob):** `Workflow += first?` (agent or team: who starts), `final?` (agent: who signs
  last; one of the reviewers when there are gates), `layout?` (`{nodeId: {x 0..1000, y 0..600}}`, editor only),
  `steps?` (`[{from, to, why, when?}]`, ≤12: hand-offs that aren't reviews). `Gate += when?` (a soft branch label:
  "only if it touches the UI"). Review arrows **are** the gates: sign-offs keep one source of truth.
- **Routes:** `GET/PUT /projects/:id/workflows` (new fields; issue messages start with their path, so an error pins to
  its arrow), `GET/PUT /teams/:id/workflow` (`{workflow | null}`), event `team.workflow.changed {teamId, name|null}`.
- **Editor (one component, `app/src/features/collab/flow/`):** a calm canvas. Nodes = avatars (drag to place; arrow
  keys move a focused node). Two arrow styles only: solid = hands work to, dashed with a ✓ = signs off. Branch label
  on the arrow in small italic. "Starts here" / "Signs last" are badges on the node, set from the selected node's
  small toolbar. Connect = select a node, then "Connect to…" → pick the other → one sheet: hand-off or sign-off,
  why, "only when…" (optional). The same arrows are listed as text under the canvas (the keyboard and
  screen-reader path, and where errors show). One primary action: **Save**.
- **Temporary = read-only** (Pixel's call): the editor shows it with one line, "Temporary: ask <Pixel> to change
  it." Keeping it (`save_workflow`) makes it an office workflow you can edit.
- **Deleted on purpose:** free-form shapes, colours per arrow, conditions as logic (a `when` is words for the
  orchestrator, not an expression), editing temporary workflows by hand, a separate editor per type.
- **Tests:** pure graph model (nodes from gates/steps/lead/crew, add/remove arrow, first/final rules, layout
  defaults for nodes without a position, server issue path → arrow), the editor's states (empty, read-only, error
  pinned), keyboard move; Elon's final check draws, saves and reloads all three types.

### Phase 6 — Optional: the check before building, and a team's own way (server + small UI)

Only after Phase 7 shows the core works. Both reuse existing parts:
1. **Opening check** (the vision's "is this a good idea, is there a better way?"): `Workflow.opening?: {reviewer,
   why}`. When a goal starts under such a workflow, the board puts a **report task** first for the reviewer: "Check the
   plan: is it worth doing, is there a simpler way? Say go or what to change." Later items already read earlier
   reports (`reportFor`). Refused if the reviewer can't file reports.
2. **A team's usual way:** `teams.gates` (JSON, migration 41): gates whose `after` and `reviewer` are the team's own
   members, edited with the team in the Cast. `gatesFor` adds a team's gates for that team's items, on every project
   the team joins.
- **Tests:** an opening workflow prepends exactly one report task; team gates apply only to that team's items and
  follow the team to another project; a team gate naming a non-member is refused.

### Phase 7 — Live check

With real agents on this project:
1. Pixel: "Elon, take command of X and use Uncle Bob for the code" → one goal, temporary workflow; Elon's work calls
   to Bob land on the same goal; Elon signs Bob's tasks; Bob's `room` shows Elon; after the goal, Pixel again.
2. "From now on, Health Analyst checks every backend change" → `set_workflow`; the next backend goal is gated.
3. A quick fix: Pixel picks the quick-fix workflow.
- **Tests:** notes (`live-check.md` in this folder) with what happened, cost, and anything that surprised us.

## Status

- 2026-11-17: Design final (Elon). UI call from Jony folded in. Phases 1–5 ready for Uncle Bob (1–4) and Jony (5).
  Phase 6 optional, Phase 7 after 5.
- 2026-11-17: Phases 1–4 built (Uncle Bob, b630d05, 803 tests green). Phase 5 next (Jony) — the API as built is in
  `wiki.md` → "Phase 5 API".
- 2026-11-17: **Signed off by Elon (Phases 1–4, server).** Checked the build against this design at 5d8f8f0:
  804/804 server tests green, typecheck clean, every changed file lint-clean (the 9 lint errors in `npm run lint`
  are in older test files this work never touched). Every test the roadmap asks for in Phases 1–4 exists. End to
  end through the app (fake runner, real HTTP + agent tools): a stable goal takes its workflow's gates and keeps
  them when the project's list changes; a temporary goal gives the lead contact, approval, stop/tell and
  on-goal crew tasks gated by the lead; the goal ends, the powers go, `workflow.ended` fires once, Pixel offers
  to keep it, `save_workflow` writes the lead's sign-offs out as plain gates. Two choices in the build that I
  accept: the room looks up a run's goal at call time (`goalOfRun`), and a lead's review run counts as on the
  goal, so a fix asked for while signing off stays on the goal. **Still open:** Phase 5 (screens, Jony),
  Phase 7 (live check). Phase 6 waits for Phase 7.
- 2026-11-17: Scope grows (user, via Pixel): three types + a visual editor → Phase 5b. Shape agreed Jony ↔ Uncle Bob;
  backend handed to Uncle Bob. Temporary workflows read-only in the editor (Pixel). Jony builds Phase 5 first.
- 2026-11-17: **Phase 5 screens built (Jony).** Quest Board: a workflow chip on the main card and side cards
  (none for the usual way, plain for another stable one, dashed + the lead's face for a temporary one), "Signed by
  …" under a done goal (not on the folded done strip). Task cards: the sign-off strip (3 faces + "+N", a glyph per
  state, words for screen readers) next to who has it. Office: a dashed ring with the goal on a pill around a
  running temporary crew's desks; it fades when the goal ends (`workflow.ended` / `workflow.changed` refresh the
  board). How we work: the usual way ("Usually") plus every other workflow with its "when". The keep offer is
  Pixel's thread line (server). App tests 600 green, typecheck clean; read against a real server. **Next:**
  Phase 5b editor once Uncle Bob's routes land; Phase 7 live check.
- 2026-11-17: **Phase 7 live check: not signed off (Elon).** See `live-check.md`. Server half works for all three
  types: drawings with first/final, hand-offs, a decision and sign-offs save, reload, refuse broken ones by path, and
  real work (fake runner) takes the sign-off arrows as gates and shows "Signed by". Gaps sent back: (1) no visual
  editor on screen (Jony); (2) start, final, hand-offs and decisions reach nobody at run time — the planner and tasks
  should get the drawing in words (Uncle Bob); (3) `set_workflow` on a drawn workflow silently erases the drawing
  (Uncle Bob). Re-check with `live-check.mjs` + the editor once those land.
- 2026-11-17: **Phase 5b editor on screen (Jony)** — gap (1). `app/src/features/collab/flow/` (model, canvas,
  arrow list, sheet). Office: How we work → "Draw it" / "Open drawing" under each way (no drawing yet = seeded from
  its agent gates, with a line on what saving replaces); running goals with a temporary way → "View drawing",
  read-only ("Temporary: ask <director> to change it."). Cast: a team panel → "How this team works" → Draw it /
  Open drawing (`PUT /teams/:id/workflow`). Keyboard: Tab to a face, arrow keys move it (Shift = bigger), Enter
  selects, "Connect to…" then Enter on the other node opens the arrow form; the arrow list under the canvas is the
  screen-reader path and where 422 problems are pinned (by arrow; node problems ring the node). The director isn't
  offered (the server refuses them as "not on this project" — found in the live run). Checked live:
  `live-check-5b.mjs` (drawings built by the editor's model, sent as the screens send them: all ok).
  Not built: team DELETE (no button; drawing stays until replaced).
