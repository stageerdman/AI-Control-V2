# Time estimates — update v1

## Goal
Know how long work really takes, and use it to guess how long new work will take. For every task on the
whiteboard (a checklist item): when it started, when it ended, how much agent time went into it (active time),
who worked on it, and the tokens it burned — rolled up per goal and per feature, per office. From finished work,
a simple estimate for a new task, goal or feature (time and tokens), with how many past ones it rests on.

Built on Agent Performance (`updates/2026-11-16 AGENT PERFORMANCE`): the same spans (`performance/spans.ts`) —
every run and crew call — now also know which task they served.

## Words
- **Active time** = agent time: the sum of the task's runs and crew calls (two agents for an hour = 2h). A run
  still going counts up to now.
- **Wall time** = from the first start to the end (or now while it runs): what the user waits.
- **Started** = the first span's start. **Ended** = the last span's end, once the task is finished (done, failed
  or cancelled); null while it is open.
- A **task's** time includes its team members' sub-tasks (the captain's split hands them out as child items).

## Phases

### Phase 1 — record which task a run serves (server)
- Migration 43: `runs.item_id` and `crew_time.item_id` (NULL = not a task's work: chats, calls, planning).
  Back-fill older runs from `checklist_items.run_id / build_run_id / resume_run_id`.
- `StartRun.itemId` and `Track.itemId`; dispatch sets them for an item's build / review runs and the captain's
  split. `Span.itemId` carries it to every reader.
- **Tests:** an item's run and its captain's split land with `item_id`; the back-fill links an older run.

### Phase 2 — roll up (server, pure core)
- `performance/rollup.ts` (pure, no I/O): spans + items + goals + features → per task, per goal, per feature:
  started, ended, active ms, wall ms, runs, turns, tokens, live, per agent (ms, tokens, runs).
- **Tests:** a task sums its runs and its members' sub-tasks, goals sum their tasks, features their goals; open
  tasks have no end and count up to now; work with no task is left out; per-agent split.

### Phase 3 — estimate (server, pure core)
- `performance/estimate.ts` (pure): past finished samples → `{ ms, tokens, low, high, basis }` (median, with the
  middle half as the range). Tasks: the assignee's own finished tasks when there are enough (≥ 3), else the
  office's. Goals: finished goals. Features: shipped features. Too few samples → null (no guess beats a bad one).
- **Tests:** median and range, the fallback from agent to office, too few → null, failed/cancelled work is not
  a sample.

### Phase 4 — the read (server)
- `GET /projects/:id/times` → `{ tasks, goals, features, estimates }` — one request per office.
- `GET /projects/:id/estimate?agentId=` → the estimate for a new task (for that assignee), goal and feature.
- **Tests:** route shape, 404 for an unknown office, an office with no work, a finished goal rolls up and feeds
  the estimate.

### Phase 5 — the app (UI, separate checklist item)
Show times on the whiteboard and the features folder, and the estimate when new work is planned.

### Later (not in v1)
- **Planning time** (the orchestrator's dispatch call) happens before the goal exists; it is not counted in a
  goal yet. Attach it once the crew call can be re-pointed at the goal it planned.
- **Studio-wide samples** for a new office with no history.
- **Feed the estimate to the orchestrator** when it plans, and compare guess vs. real afterwards.
- Smarter estimates (by kind of work, by size of the brief) only once there is enough data to tell.

## Status
- [x] Roadmap
- [ ] Phase 1 — `item_id` on runs and crew calls
- [ ] Phase 2 — `performance/rollup.ts`
- [ ] Phase 3 — `performance/estimate.ts`
- [ ] Phase 4 — `GET /projects/:id/times`, `GET /projects/:id/estimate`
- [ ] Phase 5 — UI (separate item)

## Decisions
- One reader: spans (`performance/spans.ts`) stay the only reader of `runs` + `crew_time` for time and tokens.
- Link by id, not by time window: a run says which task it serves when it starts. Guessing from overlapping
  times breaks as soon as two items run side by side.
- Estimates are medians, not means: one run that hung for hours shouldn't double every guess.
