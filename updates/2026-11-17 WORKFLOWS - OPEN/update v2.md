# Workflows: update v2, finding and keeping the way

Feature: `f-workflows`. Designed by Jony from his review (`design/workflows/review.md`). Server: Uncle Bob.
Screens: front-end (Jony). Live check: Elon. v1 (`update v1.md`) built the model, the run-time rules and the
editor. v2 rebuilds **how people reach it** and adds the team step. Status at the bottom.

## Goal

User goal: *"Decide who hands work to whom and who checks it, then trust the studio to follow it."*
Trigger: the user couldn't find the diagram.

1. **How we work opens straight onto the drawing.** The drawing is the page. Edit happens in place.
2. **A live picture of the way on the Quest Board** that opens it, and a goal's way chip that opens that way.
3. **"How this team works" while you build a team:** pre-drawn from the crew, kept as is or adjusted.

## Final screens (locked)

One file per piece, each with its states and tests:

| piece | spec |
|---|---|
| `WayThumb`: the small live picture (board, ways row, team panel) | `design/workflows/way-thumb.md` |
| How we work page + the three ways in | `design/workflows/how-we-work.md` |
| How this team works, in team creation | `design/workflows/team-way.md` |
| Editor polish: view mode, drag to connect, optional why, folded list | `design/workflows/editor-polish.md` |

**One name on screen:** "way" ("How we work" / "How this team works" as titles). Kickers say the type in the
same spot every time: `OFFICE WAY` · `TEAM WAY` · `JUST FOR THIS GOAL`.

## Decisions (what changed from the review, and why)

- **The team default is a picture of what already happens.** At run time a captain already splits, members
  build, and the captain pulls it together and can send parts back. So the default ("Captain checks all") is
  hand-offs only, with no sign-off gates: no new review runs, no cost change. The review's "✓ review" arrows
  back to the captain are dropped. They'd have added a paid review per part that nobody asked for.
- **The server derives the default, the client never does.** One source, so the drawing and the run can't
  disagree. That deletes "save a way on a team that isn't saved yet": an unsaved draft says "Name the crew
  and we'll sketch how they work together."
- **No second hotspot in the office scene.** The board header thumb is one hop from the whiteboard and is a
  picture. One way in per object.
- **Two shapes as a visible segmented control,** not a ▾ menu.
- **Edit in place** on How we work, not in a sheet. The sheet stays for the team panel's Adjust.
- **No "new way" button.** Adding or removing a whole way stays a request to the director (the ask field).
  *Assumption, check:* do people look for one? If two people ask, add it.

## What the server must provide (for Uncle Bob)

All in Phase 1. Every item has a test in that phase.

- **S1. A way in words on every read.** Add `inWords: string` to each workflow returned by
  `GET /projects/:id/workflows`, `GET /teams/:id/workflow` and a goal's `workflow` in `GET /projects/:id/work`.
  It's the existing `drawingInWords` with people's short names (no ids), or the way's `summary` when nothing is
  drawn. Read-only (a PUT ignores it, like `scope`). The screens use it as the words line and the screen-reader
  text, so the client never re-implements it.
- **S2. A team's default way, derived.**
  - Pure `defaultTeamWay(team, shape)` in `server/src/domain/workflows.ts` (or `crew/team.ts`):
    `captain` → first = final = captain; steps captain → each member ("Their part of the work") and each member
    → captain ("Brings it back to be pulled together"); `gates: []`; layout captain at (150, 300), members
    stacked at x = 650, evenly spread over y 80..520. `chain` → captain → m1 → … → mn → captain; first = final =
    captain; laid out left to right. Members = the team's crew order with the captain first (the same order
    the Cast shows, `orderedMembers`). A team with fewer than 2 members → null. No captain → the first member
    leads.
  - New team field `wayShape: 'captain' | 'chain'` (migration, default `'captain'`), on `Team` and in
    `TeamPatch`, so the panel's auto-save sets it.
  - `GET /teams/:id/workflow` → `{workflow, own: boolean, shape}`. With no own way, `workflow` is the derived
    default (`scope: 'team'`, `inWords` filled), `own: false`. `PUT {workflow}` saves an own way (as today);
    `PUT {workflow: null}` returns to the default.
  - **Run time uses the same thing:** dispatch's `teamWay(team.id)` returns own ?? default, so the captain's
    split reads the default in words as well.
  - Emit `team.workflow.changed` whenever the **shown** way changes: own save or clear (as today), and, while
    there's no own way, when members, captain or `wayShape` change (payload as today; `name` = the default's
    name).
- **S3. "Pass it along" really runs in order.** When a team's way (own or default) is a single chain through
  its members (captain → m1 → … → captain), the split's sub-tasks are put in chain order with
  `parallel: false`, whatever the captain answered: parts are sorted by their member's place in the chain
  (a member with no part is simply skipped). Other drawings stay soft (words only), as in v1.
- **S4. Removing a member keeps an own way valid.** When someone leaves a team (removed, deleted, retired)
  that has its own way: drop every step and gate that touches them, clear `first` / `final` if it was them
  (and set `final` to the captain when the captain still has an arrow), drop their `layout` key. If no arrow
  is left, clear the own way (back to the default). Same transaction as the removal, then
  `team.workflow.changed`. Never a 409 on a member removal because of the way.
- **S5. `why` may be empty.** On steps and gates (office and team saves), an empty or missing `why` is filled
  on save with a plain default by kind: hand-off "Hands the work on", review "Checks it", quality "Checks the
  quality", user-test "Tries it as a user", crash-test "Tries to break it", security "Checks it's safe". So
  review prompts still read a reason. Sent order and paths unchanged.
- **Nothing else.** No new routes. Office ways, the goal chip and the board thumb use what exists today.

## Roadmap

Each phase is a PR-sized series, ends with tests, and keeps every existing test green (`npm test` in `server/`
and `app/`, `npm run typecheck`). Phase 1 (server) and Phases 2–3 (front) can run side by side. Phases 2–3 use
`summary` for the words line until S1 lands. Phase 4 needs Phase 1.

### Phase 1: Server needs S1–S5 (Uncle Bob)
1. S1 `inWords` on all three reads.
2. S2 `defaultTeamWay`, `wayShape` (migration + `TeamPatch`), the GET shape `{workflow, own, shape}`, dispatch
   reads own ?? default, events on default changes.
3. S3 chain order enforced on the split.
4. S4 prune on member removal.
5. S5 default `why`.
- **Tests:** `inWords` present on office / team / temporary reads and ignored on PUT; `defaultTeamWay` for 2,
  3 and 6 members, both shapes, no captain, < 2 members → null, steps ≤ 12, passes `workflowIssues`; GET
  without an own way → default + `own:false`, after PUT → `own:true`, PUT null → default again; `wayShape`
  patch changes the GET and emits `team.workflow.changed`; adding a member or changing the captain changes the
  default and emits; **a team split under the default adds no gates** (no new review runs); under a chain the
  sub-tasks come out in chain order, `parallel:false`, even when the captain answered another order;
  removing a member prunes their arrows, first/final, layout, and an emptied way returns to the default;
  removal is never refused because of the way; empty `why` saves with the kind's default, both kinds, office
  and team.

### Phase 2: WayThumb + the Quest Board way in (front)
1. `WayThumb` (`collab/flow/WayThumb.tsx`), sharing `toGraph` / `frame` with the editor.
2. Quest Board header button (thumb sm + "How we work"); delete the bottom "How we work →" link.
3. **Fix:** `workflows.changed` must also invalidate `keys.workflows(pid)` (today only `keys.collaboration`),
   or the thumb isn't live (`OfficePage.tsx` event switch).
4. `WorkflowChip` becomes a button → `how/<wayId>` or `how/goal-<goalId>`; router accepts an id on `how`.
- **Tests:** WayThumb (see its spec); header button label and route; bottom link gone; a `workflows.changed`
  event redraws the thumb (query invalidated); chip is a button only when shown, with the right route; the
  router parses `how/<id>`.

### Phase 3: How we work is the drawing (front)
1. `WorkflowEditor` `mode: 'view' | 'edit'`.
2. Rebuild `HowWeWork` in `office/Board.tsx` (better: its own file `office/HowWeWork.tsx`): kicker, canvas in
   view, words line, list toggle, Other ways row, edit in place with Save / Cancel and the unsaved ask, the
   empty state, the "changed meanwhile" line, Back → Quest Board.
3. Remove `WorkDesign` and the draw links from this page (`WorkDesign` stays for setup).
- **Tests:** every row of `how-we-work.md`'s state table and its Tests list.

### Phase 4: How this team works, in team creation (front; needs Phase 1)
1. `TeamWay.tsx` rebuilt to `team-way.md`: shown from 1 member, under Crew; states; segmented shape
   (`wayShape` via the team patch); thumb lg; Adjust → `FlowSheet` pre-drawn; own-way lines (unconnected,
   removed, emptied); Back to the default + Undo toast.
2. Refresh the team's way query on `team.workflow.changed` and after the team's own member / captain ops.
3. Delete the panel's foot line.
- **Tests:** every row of `team-way.md`'s state table and its Tests list.

### Phase 5: Editor polish (front)
Drag to connect, inline arrow popover with pills, optional why (needs S5), opposite arrows bend apart,
folded list, unconnected cards.
- **Tests:** `editor-polish.md`'s Tests list.

### Phase 6: Live check + accessibility pass
1. Elon, on this project with a real server: find the way from the office cold (time it), edit and save it,
   open a goal's way from its chip, build a new team of 3 and keep the default, switch to Pass it along, run one
   team goal under each, and check the run matches the picture (order, no extra review runs under the default).
   Remove a member from an adjusted way.
2. Humanitarian: contrast of the thumb strokes, keyboard-only path through all three screens, screen-reader
   words.
- **Tests:** notes in `live-check-v2.md` in this folder: what happened, cost, surprises. Sign-off line in
  Status.

## Assumptions to check
- A picture is found faster than a text link. Check: Phase 6 cold-find time, and first-time users.
- "Captain checks all" fits most teams. Check: how many teams still use the default after a week.
- Two shapes are enough. Check: what people draw after Adjust.
- Nobody needs a "new way" button. Check: requests for one.

## Status
- 2026-11-17: **Plan and final screens locked (Jony).** Server needs S1–S5 listed above for Uncle Bob
  (Phase 1). Phases 2–3 can start now, side by side with Phase 1.
- 2026-11-17: **Phase 1 done (Uncle Bob).** S1–S5 on the server, tested: `server/src/domain/team-way.ts`
  (`defaultTeamWay`, `chainOrder`, `pruneWay`), `wayShape` on teams (migration 42), `GET /teams/:id/workflow`
  → `{workflow, own, shape}`, `team.workflow.changed` on roster / captain / shape changes, chain order on the
  split, prune on member removal, default `why` by kind, `inWords` on office / team / goal reads. Tests:
  `test/domain/team-way.test.ts`, `test/crew/team-workflow.test.ts`, `test/crew/team-flow.test.ts`.
  For Phase 4 (app): the GET now always returns a way for a team of 2+ (the default, `own:false`), so
  `TeamWay.tsx` should read `own` and send `wayShape` via `PATCH /teams/:id`; `Team` gains `wayShape`.
- 2026-11-17: **Phases 2–3 done (Jony).** `collab/flow/WayThumb.tsx`; Quest Board header button (thumb sm +
  "How we work"), bottom link gone; way chip is a button → `how/<id>` / `how/goal-<id>`; `workflows.changed`
  invalidates `keys.workflows`; `office/HowWeWork.tsx` is the drawing, edit in place, Other ways row.
  Tests: `WayThumb.test.tsx`, `office/HowWeWork.test.tsx`.
- 2026-11-17: **Phase 4 done (Jony).** `cast/TeamWay.tsx` rebuilt to `team-way.md`, directly under Crew, shown
  from 1 member (drafts too); shape control → `wayShape` team patch; thumb lg = Adjust → `FlowSheet` pre-drawn
  with faint cards for unconnected members (`dropLoose`); own-way lines (Connect, removed arrows, emptied);
  Back to the default + Undo toast; refused saves turn the words line red. The way refreshes on member /
  captain / shape changes (once optimistic, once confirmed) and when the panel reopens; the Cast has no
  project event stream, so `team.workflow.changed` isn't listened to there. Foot line deleted.
  Tests: `cast/TeamWay.test.tsx` (15), server round-trip of the default as an own way.
- 2026-11-17: **Phase 6.1 live check run (Elon), not signed off yet.** Real server (fake runner) + app in a
  headless browser, notes in `live-check-v2.md`. Passes: cold find in 3 clicks, draw / save / reload, new team
  with its way under Crew, runs follow each way (chain order + `parallel:false`, captain shape untouched, own
  way's sign-off on the right part, no extra sign-offs), the goal chip opens its way, member prune. v1 gap 2
  (team way reaching the run) is closed. 10 findings: **1 blocker** (the editor hides "+ Add someone" while a card
  is selected, so you can't add a second person) and **1 medium** (adjust a default team way + add one sign-off
  → Save refused, "signs nothing off"). Both are on the whiteboard with Jony (1, 2, 3, 4, 5, 6, 8, 9) and
  Uncle Bob (3, 8, 9, 10). Sign-off after the re-check. Humanitarian's pass (6.2) is still open.
