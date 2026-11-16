# Main Quests & Side Quests — update v1

Feature: `f-main-quests-side-quests`. Follows Elon's report "Off-board work: keep the rule, add side errands".

## Goal

Every goal on the whiteboard is one of two kinds:

- **Main quest** — the big feature the agents are building now (the default; what the roadmap is about).
- **Side quest** — a quick fix or a short research job. Often one task for one agent. Never serves a feature.

Agents always do main quests first: when someone has both, the main quest wins; a side quest only runs
when it doesn't hold up a main quest. The board looks more like a game: the main storyline up top, side
quests alongside.

Both kinds go through the same dispatch path (Elon's option B): tracking, stop, carry-on, cost, history and
reports keep working unchanged. Only the kind, the order and the look differ.

## Decisions

- **One column, not a new table.** `goals.quest` = `'main' | 'side'`, default `'main'`, so every existing goal
  and every existing caller stays a main quest.
- **A side quest never links a feature** — refused with a plain message, not just a convention.
- **Who sets it.** Pixel's `add_goal` takes `quest: "side"`. A colleague's `call_agent` with `work: true` is a
  side quest (a small ask from one agent to another; it never had a feature). The orchestrator's planned goals
  and "Start it" from a chat stay main quests.
- **The priority rule lives in dispatch's pump, as a pure helper** (`server/src/domain/quests.ts`):
  1. queued work is considered main quests first (each kind keeps its own order: oldest goal first, then
     checklist order), so main work claims free seats first;
  2. a side-quest task waits while its agent has main-quest work that could start now. If the agent's main
     work is only waiting on someone else, the side quest may run meanwhile (it is short by definition).
- **Known limit (accepted):** a side quest that started while its agent's main work was waiting can delay that
  main work by the side quest's length. Side quests don't preempt running work — stopping it would lose more.

## Roadmap

### Phase 1 — Quest type, saved and sent (server) ✅
- Migration 39: `goals.quest`. `Goal.quest` in the repo; `insertGoal` takes it.
- The screens get it: the goal JSON (`presentGoal`) and the `goal.changed` event carry `quest`.
- The board text the director reads marks side quests.
- **Tests:** repo round-trip (default main, side saved); event schema accepts `quest`.

### Phase 2 — Who sets it (server) ✅
- `add_goal` gains `quest` (`main` | `side`), with a description that tells Pixel when to pick side.
- `call_agent` with `work: true` → side quest.
- A side quest with a feature is refused.
- **Tests:** add_goal with `quest: "side"` saves a side quest; side + feature is refused; a work call
  lands as a side quest.

### Phase 3 — Main quests first (server) ✅
- Pure `mainFirst` + `heldForMain` in `server/src/domain/quests.ts`; `pump` uses them.
- **Tests:** unit tests of the rule; a dispatch test where one agent has both (main runs first, the side
  quest waits, then runs); a side quest runs when its agent's main work is only waiting on someone else.

### Phase 4 — The quest board (front-end, separate item)
- Board split into Main Quests and Side Quests, with a fantasy/game look (UX pass first).
- Side quests compact; they never count toward a feature's progress.
- **Tests:** board state splits by `quest`; UI tests for both sections and the empty side-quest state.

### Phase 5 — Live check
- Real Pixel: "quietly look into X" → a side quest; a main quest for the same agent runs first.
- **Tests:** the live check's notes in this folder.

## Status

- Phases 1–3 done (server). Tests: `server/test/domain/quests.test.ts` (the rule),
  `server/test/whiteboard/quests.test.ts` (order, side-while-waiting, saved + sent, side + feature refused),
  `server/test/room/room-calls.test.ts` (a work call is a side quest). Phase 4 is the front-end item; phase 5 after it.
