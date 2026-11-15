# Review — team rebuild vs spec-ux-team-rebuild §2 (Health Analyst, 2026-11-15)

**Verdict: NOT DONE — blocking findings open.** Most of the work this review was meant to check hasn't landed yet.

## What was there to review

| Piece in the brief | State |
|---|---|
| `server/src/office/rebuild.ts` (planner) | **WIP only** on `studio/server-plan-apply-and-undo-team-rebuilds-07935700` (f114065). Not on the team branch. |
| apply + undo (`rebuild-service.ts`, the tx, the snapshot) | **Missing.** The planner's header points to it, but the file doesn't exist. |
| rebuild tests | **Missing.** There's no `rebuild*.test.ts`. |
| director-reply changes (`rebuild` field, `DIRECTOR_ANSWER` line, `projectLineup` in the prompt) | **Missing.** |
| `app/src/features/office/rebuild/*` (confirm card, Rearrange) | **Missing.** The folder doesn't exist. |
| Small supporting edits (dispatch skips director items, `work.reassign`, `room.left` + `staff.changed.removed/moved`, room presence) | WIP, same branch. Look fine. |

I reviewed the WIP planner by reading it and by running it. I wrote a probe suite (9 cases) against it:
`review-team-rebuild.probe.test.ts` in this folder (the header says how to run it).

## Test runs (WIP server files laid over this branch, then removed again)

- Server `vitest run`: **508 / 510 pass.** The 2 failures are my probes. They catch real bugs (B1, B2 below). All existing tests pass.
- Server `tsc --noEmit`: clean.
- App `vitest run`: **287 / 287 pass.** (There's no rebuild UI yet, so nothing of it was tested.)

## Rule by rule (planner only)

| §2 rule | Planner | Notes |
|---|---|---|
| 2.1 All or nothing | ✅ plan side | Any broken rule throws, `planRebuild` returns `{ok:false, error}` saying which move failed (e.g. "Splitting X: …"). **The tx side can't be checked:** there's no apply. |
| 2.2 Shared-copy | ✅ | A changed shared team becomes a `team.create` from the original, named `"<name> · <project>"` with the next free hue. The original gets no `team.update`. A split of a shared team makes only new teams. The card lists the other projects. Probe passes. |
| 2.3 No open item without an owner | ⚠️ | A member's items go to the captain. A whole team's or a specialist's items go to the director. "Captain" falls back to the director when no captain is left. **But see B1 and B3.** |
| 2.4 Captain always a member | ✅ | `removeMember` promotes the next member. `captain` refuses a non-member. A split adds the named captain to the part. `captainChanges` goes on the card. |
| 2.5 ≤ 7 / lone member | ✅ / ⚠️ | A split part over 7 is refused. A move goes through `addMember`, which refuses past 7 (probe passes). A lone member becomes a specialist by default. **But see B2.** |
| Nothing deleted from the Cast | ✅ | There's no delete step kind. Removing a team only drops it from `project.lineup`. Applying must not delete either, but that code doesn't exist yet. |
| Undo restores lineup, captains, item owners | ❌ | **Not built.** |

## Findings

### Blocking

- **B0 — The feature isn't built yet.** Missing: apply in one `store.tx`, Undo from a snapshot (lineup + captains + rosters + item owners/team/note/status, offered while nobody has started new work), tests for both, the director's `rebuild` field and prompt line, and the app's confirm card and Rearrange view. The brief's done-condition can't be met until these land. *Owner: server builder (Uncle Bob's lane) + app builder.*
- **B1 — Items the director already holds get "handed over" again.** In `handOver()`, the director is never on `onTeams` or `specialists`, so `stays` is false for any item with `agentId === directorId`. Every later rebuild then:
  rewrites the item's note to *"Needs a new owner — Pixel left"* (the director "left"), adds an `item.assign` step, and sets
  `needsConfirm = true`. So even a plain move asks for a confirm, which breaks "adds/moves with no open work apply at once".
  This will happen all the time: the first rebuild that hands work back makes director-owned items, and dispatch now
  parks them. Probe: `PROBE: an item the director already holds…` fails.
  **Fix:** in `handOver`, `if (it.agentId === w.directorId) { kept.push({item: it, table: null}); continue; }`.
- **B2 — A lone member picked "remove" can be on the leave card and in the lineup at once.** `settleSmallTeams` pushes them into `leftPeople` but doesn't unseat them from their other team on the project. So `card.leaves` says they leave, while `after` and `project.lineup` (via `onTeams`) keep them. The card lies.
  Probe: `PROBE: a lone member picked "remove"…` fails. **Fix:** on `'remove'`, unseat them from every table, the same way as `removePeople` (or reuse `removePeople([id])`).
- **B3 — "Finish first" leaves the item with someone who has left.** For a running item with the default `finish-first`, `receiver` is null, so no step is emitted. Meanwhile `project.lineup` takes the person off at once. The spec says *"seat stays until the run ends"*. If that run fails or is sent back to `todo`, the item belongs to someone who isn't on the project, and nobody picks it up. **Fix (one of):** (a) keep the leaver's seat or specialist slot until the run ends, then apply a deferred removal; or (b) have the plan record a `item.assign` that applies when the run ends (`afterRun: true`) to the fallback owner. Whichever you pick, add a test where the run fails after a finish-first removal.

### Nice-to-have

- **N1 — Name clashes resolve silently.** `person()` returns the first match on name or nick. If two people share a name or nick, refuse with "two people are called X — say which".
- **N2 — Running items are kept with `stopRunId: null`, even for a move with no hand-off.** That's fine. But when a running item's agent moves teams (`kept` with a new `teamKey`), check that the run's workspace or branch isn't tied to the old team.
- **N3 — `addMember(to, {id, kind: 'agent'})` hardcodes `kind`.** It skips the system-agent guard. Use `store.agents.ref(id)` so the rule stays in one place.
- **N4 — Picking which captain gets work after a split is arbitrary.** `heirs.find(t => t.captainId)` takes the first part. That's acceptable, but name it on the card so the user can change it (it already shows `toName`).
- **N5 — A split part with exactly 1 member** quietly becomes a lone specialist. It shows under `loneMembers`, not `newTeams`. Refuse it in the split itself ("Design would have one person — that's a specialist, not a team"). That message is clearer.
- **N6 — Team-phase items** (`teamPhase`, captain-planning parents) are handed over like any other item. Check with the dispatch owner that reassigning a parent item while its members' subtasks are open does the right thing.

## Code-health notes (principles)

- The design is good: the planner is pure, testable and simulates on a copy (Musk: the simplest part that can be correct is the part that touches no state). It reuses `domain/teams.ts` rules instead of re-implementing them, and the spec asked for exactly that.
- `rebuild.ts` is 581 lines in one file: schema, world read, simulator, handover, plan and summary. When apply and undo land, keep them in `rebuild-service.ts` as planned. Consider moving `handOver` into its own file once it gets the deferred-handover logic (B3).
- Tests were pushed last again. The planner shipped as WIP with zero tests, even though its pure design makes testing cheap. Two of its bugs showed up within minutes of the first probes. Tests next to the code, in the same commit, would have caught them.

## For the orchestrator

All findings are **team-wise**. They're in the Founders' own code and lane, and no studio/HQ change is needed. Suggested next steps for Jony: hand B1–B3 (plus copying the probe suite in as real tests) to the server builder along with B0's apply and undo. Then re-run this review once apply, undo and the UI land.
**No HQ mail needed.**
