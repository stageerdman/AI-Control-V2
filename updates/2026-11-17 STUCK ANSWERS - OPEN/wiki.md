# Stuck answers — wiki

What we learned, for whoever touches chats, dispatch or the app cache next.

- **Durable facts live in the db, not in memory.** Which thread a run answers is read from the stored user
  line (`thread_messages.run_id`, `turnOf` in `server/src/office/threads.ts`). The in-memory `turns` map only
  carries the director's extras for a live turn. Anything kept only in memory is gone after a restart.
- **One reply per run.** `turnOf` returns null once an agent line with that run id exists, so `onFinished`
  and `recover` can both run safely.
- **Restart = honest answer.** `runtime.recover()` returns the ids it marked interrupted; `threads.recover`
  answers those turns ("The studio restarted before I could answer…", `whyNoAnswer`).
- **No background promise without a catch that settles.** In `server/src/crew/dispatch.ts` use `stopLater`,
  `startItem` and `failOnError(itemId, doing)` — never a bare `void someAsync()`. A throw ends the item
  `failed` with "Couldn't <doing>: <reason>" and is logged with project / item / run.
- **Events are a live view, not the record.** The office stream resumes from `office.lastEventId`, so
  anything that happened while the user was away never arrives as an event. Entering the office invalidates
  `keys.scope(pid)` (`office:<pid>:`) so every panel re-reads the server as it mounts. New office query keys
  must start with `office:<pid>:` to be covered.
- **Replay tests:** `server/test/office/replies-kept.test.ts` (away / told note / restart),
  `server/test/crew/settles-always.test.ts` (merge throws), `app/src/api/query.test.tsx` (stale on return).
