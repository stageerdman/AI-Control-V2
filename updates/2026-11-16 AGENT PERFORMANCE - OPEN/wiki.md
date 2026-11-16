# Agent performance — wiki

Durable decisions and lessons from this update.

## One reader, one tally
`performance/spans.ts` is the only code that reads `runs` + `crew_time` for time or tokens; the work clock and
the performance read both use it. `performance/tally.ts` is pure (spans + window + now → numbers). New views of
agent work add a tally over spans, never a second SQL reader.

## A span belongs to the moment it started
Its time, tokens and the request count on the local day (and in the range) where it began. Ranges and days
always add up and a long run is never split or counted twice.

## `asked` says why the agent worked
`task` (dispatched or crew work), `call` (answering a fellow agent, deciding an approval), `chat` (office chat
turn, setup chat). It is recorded where the work starts; NULL on older rows reads as `task`.

## A crew call is timed once
`crewEnd` (crew/structured.ts) writes a call's end, tokens and status in one place, so a call that retries or
throws is still one span with its real outcome.

## Older rows are "unmeasured", not zero
Crew calls from before migration 37 have NULL tokens. The read counts them as requests and time but reports them
in `unmeasured`, so the UI can say "some older work has no token count" instead of showing a false low.

## Local days use one fixed offset
`tz` = the browser's `getTimezoneOffset()` for the whole range; DST changes inside a range are ignored.

## The sheet says nothing the model didn't work out
Everything "How the team works" says (numbers in words, trends, bars, Worth a look, team order, detail line)
comes from `app/src/features/office/performance/model.ts`, pure and tested; `TeamSheet.tsx` only draws it.
`TeamView` renders from a `Performance` prop, so states are tested from `fixtures.ts` without a server.

## Per-agent kind of work rides on the read
Each agent in the read carries `kinds` (ms per kind of work), so "Kind of work" follows the picked agent with no
second request.

## Bars: days while it fits
7 and 30 days show one bar per day; all time does too while it spans 30 days or less, then one bar per week
ending today, at most 26 (older weeks fold into one "earlier" bar).

## No money, no "Work waited" yet
The sheet never shows cost. The "Work waited" flag stays hidden until queue time is recorded.

## Migration tests pin their migration
A test that builds "the database before migration N" must find N by content and write legacy rows in plain SQL —
`MIGRATIONS.length - 1` and today's repos break as soon as a later migration adds a column.
