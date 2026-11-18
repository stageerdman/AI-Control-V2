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
- **Boot order matters for recovery.** Anything that starts runs on boot (`threads.recover`) must come after
  every dependency those runs' tools close over (`mail`, `creatorChats` in `server/src/app.ts`) — a `const`
  used too early throws a TDZ error only at run time, and only for the director.
- **A question nobody will act on must leave the screen.** If a cut-off turn can't carry on, withdraw its ask.
- **Only accept an answer someone can read.** An open ask is only real if its run is live or will be carried
  on (`reaches(runId)` in `runtime/service.ts`). Anything else is withdrawn through the one `withdraw()` helper,
  which always emits `ask.withdrawn` — never close an ask without an event, or its card sticks on screen.
- **Live checks of `ask_user` need a real choice.** A yes/no question is auto-approved by the studio and never
  opens; ask "Alpha or Beta?" instead.
- **While an agent asks, what you type is the answer.** A run blocked in `ask_user` never reads a note
  (`runtime.tell`). Both the app (`Panel.tsx send`) and the server (`threads.say` → `answerByChat`) route a
  typed line to the open ask; never send it as a note.
- **A line keeps its own time.** Save a line at the moment it happened (a question at `ask.createdAt`, not at
  answer time) and put that time in the event payload (`thread.message` `at`); the app orders by it, not by
  when the event was sent.
- **The pager stays quiet while you're in the office** — a browser check of a pager path must start on
  Projects (`drive.mjs typed-member`).
- **Never start a check server without `AI_STUDIO_HOME`/`AI_STUDIO_SANDBOX` set to a throwaway folder** and
  `VITE_API_URL=http://127.0.0.1:3569` on vite; the server refuses a data dir another backend uses, but don't
  rely on it.
- **Browser check:** `reload-check/drive.mjs` (needs `playwright-core` installed in that folder, a fake-runner
  server on 3569 and vite on 3570; the project folder must exist in the sandbox or messages get a 409).
- **Replay tests:** `server/test/office/replies-kept.test.ts` (away / told note / restart),
  `server/test/crew/settles-always.test.ts` (merge throws), `app/src/api/query.test.tsx` (stale on return).
