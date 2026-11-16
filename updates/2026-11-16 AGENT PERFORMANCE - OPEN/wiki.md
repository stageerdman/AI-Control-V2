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

## Migration tests pin their migration
A test that builds "the database before migration N" must find N by content and write legacy rows in plain SQL —
`MIGRATIONS.length - 1` and today's repos break as soon as a later migration adds a column.
