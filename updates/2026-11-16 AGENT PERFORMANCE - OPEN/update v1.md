# Agent performance — update v1

## Goal
Per office (project), for every agent: how often they are asked for something, the tokens they burn, the time
they spend, and how their work ends (finished or stopped early) — totals over a time range, with the previous
range for trends and a per-day breakdown, so the user can see who carries the load and where the team is stuck.
UI design: [`design.md`](design.md) ("How the team works", the wall clock's sheet grown up).

## Where the data comes from (already there)
- `runs` — every runtime run: agent, kind of work, status, turns, **tokens** (input / output / cache read / cache
  write), start and end.
- `crew_time` — the crew calls that never become runs (planning a goal, a captain's split, answering a fellow
  agent's call, health checks, the setup chat…): agent, kind, turns, start and end. **No tokens, no outcome yet.**
- `office/work-time.ts` — the work clock: reads both into spans and sums agent time.

## Phases

### Phase 1 — record what is missing (server)
- Migration 37: `crew_time` gets the four token columns and a `status` (NULL on older rows = not measured);
  `runs` and `crew_time` get `asked` (`task` | `call` | `chat`, NULL = task) — *why* the agent was working,
  recorded where the work starts; an index on `runs(project_id, started_at)`.
- The crew caller saves a call's tokens and outcome; the room marks a call it answers (and an approval) as
  `call`; office chat turns and the setup chat as `chat`.
- **Tests:** a crew call's tokens / status / asked land in `crew_time`; a chat turn's run is `asked = 'chat'`.

### Phase 2 — one span reader, one tally (server, pure core)
- `performance/spans.ts`: the one place that reads a project's runs + crew calls into `Span`s. The work clock
  uses it too (its own copy of that SQL goes).
- `performance/tally.ts` (pure, no I/O): spans + range + time zone → totals, the previous range's totals, per
  agent (time, runs, turns, tokens new / re-read, requests by task / call / chat, stopped early, last asked,
  live) and per local day (time, tokens, requests — total and per agent).
- **Tests:** ranges and local days, the previous range, tokens split, requests split, stopped, live spans count
  up to now, unmeasured older rows, the work clock still sums the same.

### Phase 3 — the read (server)
- `GET /projects/:id/performance?range=7d|30d|all&tz=<minutes>` — one request per office and range, as the
  design asks. `tz` = the browser's `getTimezoneOffset()`.
- **Tests:** route shape, 404 for an unknown office, bad range or tz → 422 (the studio's validation status), runs and older unmeasured crew calls show up.

### Phase 4 — the sheet (UI, separate item)
The clock's sheet grows into "How the team works" per `design.md`, on top of the Phase 3 read.

### Later (not in v1)
- **Queued wait** ("Work waited 2h for Rivet"): calls waiting on a busy agent aren't timed yet; the flag stays
  hidden until they are.
- **Worth a look** flags are worked out in the UI from the read; move them to the server only if a second caller
  (e.g. the director answering "where's the bottleneck?") needs them.

## Status
- [x] Roadmap
- [x] Phase 1 — tokens, outcome and `asked` recorded for crew calls and runs
- [x] Phase 2 — `performance/spans.ts` + `performance/tally.ts`, work clock on the shared reader
- [x] Phase 3 — `GET /projects/:id/performance`
- [ ] Phase 4 — UI sheet

## Decisions
- **A span belongs to the moment it started.** Its time, tokens and the request all count on the day (and in
  the range) where it began — so ranges and days always add up, and a long run is never split or counted twice.
- **Tokens = input + output + cache write + cache read.** "New" = input + output + cache write; "re-read" =
  cache read.
- **A request** = one span: a task (dispatched work, crew work), a call (answering a fellow agent, deciding on an
  approval), a chat (an office chat turn, the setup chat).
- **Stopped early** = a span that ended `failed` or `cancelled` (a turn cap ends a run as failed).
- **Local days** use one fixed offset for the whole range (DST shifts within a range are ignored).
- No money: cost is never read.
