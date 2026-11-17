# Workflows — wiki (durable decisions)

- **A workflow is not an engine.** Goals already have ordered items, and items already have review gates. A workflow
  only decides *who signs* (gates) and *who leads* (temporary lead + crew). Anything more is a second system that
  will drift from dispatch.
- **One shape, two lifetimes.** Stable = on the project (named, with a `when` scenario, first = default).
  Temporary = on one goal (adds `lead` + `crew`). Same schema, same validation, same `gatesFor`.
- **Snapshot on the goal.** A goal keeps the workflow it started with, as items keep their gates. Editing the
  project's workflows never changes running work.
- **Derive temporary powers, never write them.** Contact, approver, stop/tell reach and "hand-out stays on this
  goal" are all computed from *running* goals. Ending needs no cleanup, a crash can't leave a stale crew behind, and
  "goes back" is free. Mutating teams for a temporary job was rejected for exactly this reason.
- **A lead's hand-outs are main-quest work.** Before this design, `call_agent work: true` always made a side quest:
  the lead's real build work was demoted, didn't serve the feature, and the feature could ship without it. Inside a
  temporary workflow, lead → crew work goes onto the same goal.
- **Command implies sign-off.** A temporary workflow always gates each crew member's work by the lead. This makes
  "built on Elon's command" a real checkpoint, not a promise.
- **Soft choosing, hard signing.** The orchestrator picks a workflow as a suggestion (it may deviate and says why).
  Once on the board, sign-offs bind. That resolves the vision's "soft rules" vs "every agent must sign".
- **The signed report is derived.** "Signed by …" comes from item reviews that already exist. No goal-level review
  runs, no new table, no extra cost.
- **UI: show only the exception** (Jony). No chip for the default workflow; a dashed chip + lead avatar for a
  temporary one; a sign-off strip only where there are reviewers; the office ring around a crew fades when the goal
  ends. No workflow picker on the board: choosing is done by voice through the orchestrator.

## Phase 5 API (as built, b630d05) — build the screens against this

`Person = {id, name, look}` (the same shape tasks already use for `workingNow` / `finishedBy`; someone who left →
`name: 'Someone who left'`, the default look). Source: `server/src/whiteboard/present.ts`.

**`GET /projects/:id/work` and `/work/:goalId`** (each goal):

```jsonc
{
  "workflow": { "id": "temp", "name": "Elon leads", "temporary": true, "lead": "a-elon" }, // null = an older goal: the usual way
  "signedBy": [Person, ...],   // who signed off any task, once each, in task order; [] unless status is "done"
  "items": [
    {
      "signoffs": [            // one per review gate, in gate order; [] = no reviewer → show no strip
        { "reviewer": Person, "kind": "quality|user-test|crash-test|security|review", "state": "pending|signed|sent-back" }
      ]
    }
  ]
}
```

- `lead` is only there when `temporary` is true. The default workflow is the project's first (`GET /projects/:id/workflows`
  lists them, first = usual): hide the chip when `workflow` is null or its id is the first's and it isn't temporary.
- `state`: gates before the task's current gate are `signed`; the current one is `sent-back` when that reviewer's
  last verdict there asked for changes; everything else is `pending`. A task redone from scratch starts all pending.

**Events** (project scope, SSE):

- `goal.changed`: on board changes the full form `{goalId, status, text, summary, quest, workflow: {id, name,
  temporary, lead?}}`; when a goal settles only `{goalId, status}`.
- `workflow.changed` `{goalId, regated, id, name, temporary, lead?}` — a goal switched workflow mid-way; `regated` =
  how many not-started tasks took the new checks. Refresh the board query.
- `workflow.ended` `{goalId, lead, crew: [ids], status: "done|failed|cancelled"}` — a temporary goal settled: fade
  the crew ring. Refresh the board query.

**Orchestrator thread lines** when a goal settles (`server/src/crew/settled.ts`, `goalId` set on the message):

- temporary + done: `<Lead>'s crew finished '<goal>'. Keep this way of working? I can save its checks as a workflow,
  or make <Lead> and <Crew> a team.` + ` Signed by A, B.` when anyone signed.
- any other done goal with sign-offs: `'<goal>' is done. Signed by A, B.`
- anything else: no line.

**The goal's `workflow` tag** also carries `crew: [ids]` when `temporary` is true (the office ring needs lead + crew).

## Graphs (as built) — the visual editor saves and reloads these

Three kinds of workflow can be drawn: **office** (one of the project's workflows), **team** (a team's own, in the
Cast; checks that team's work on every project it joins) and **temporary** (a running goal someone leads). Same
shape for all three (`server/src/domain/graph.ts`):

```jsonc
{
  "nodes": [                                   // 1–16; one agent may sit on several nodes
    { "id": "build", "type": "agent", "agent": "a-pete", "x": 0, "y": -40 },      // x/y: integer px, negatives OK
    { "id": "ok", "type": "decision", "question": "Ready to ship?", "x": 200, "y": 0 }
  ],
  "start": "build", "end": "ship",             // explicit; both must be agent nodes
  "edges": [                                   // 0–32
    { "id": "e1", "from": "build", "to": "ok", "why": "hand it over", "signoff": "quality" /* optional gate kind */ },
    { "id": "e2", "from": "ok", "to": "ship", "branch": "yes" }          // leaving a decision: branch required, why may be empty
  ]
}
```

- No waypoints, labels or colours (strict: unknown keys are a 422). Ids are slugs (`a-z0-9-`, ≤ 40).
- **An arrow with `signoff` is a review gate**: `to` signs off `from`'s work. The workflow's `gates` are derived from
  these arrows on save (one per agent pair + kind) — never send gates alongside a graph and expect them kept.
- **Errors**: 422 with `error.details = [{path, message}]` — every problem at once, so the editor can mark them all.
  Paths are relative to the request body (e.g. `workflows.0.graph.edges.1.to`, `graph.nodes.2.agent`, `nodes.0`).
  Checked: duplicate ids, start/end exist and are agents, arrow ends exist, no self-arrows, `why` on non-decision
  arrows, branches only (and always) out of decisions, ≥ 2 distinct branches per decision, every node reachable from
  start, sign-offs only agent→agent and never by the same agent, ≤ 8 distinct sign-offs, and who may stand on a node.

**Endpoints**

| Kind | Read | Save (whole) | Who may stand on a node |
|---|---|---|---|
| office | `GET /projects/:id/workflows` (each may have `graph`) | `PUT /projects/:id/workflows` `{workflows: [{…, graph}]}` | on the project |
| team | `GET /teams/:id/workflow` → `{workflow: {name, summary, graph, gates} \| null}` | `PUT` `{name, summary?, graph}`; `DELETE` clears | the team's members |
| temporary | the goal's `workflow.graph` in `GET /projects/:id/work` | `PUT /projects/:id/work/:goalId/workflow/graph` (the graph itself) → the goal | the lead or the crew |

- Temporary: 409 unless the goal is running under a lead. Saving regates the tasks not started yet (a
  `workflow.changed` event follows); the lead's own sign-offs on crew work always stay.
- No event on a team workflow save (nobody needed it yet) — the Cast refetches after its own PUT.
