# Stuck answers — update v1

**Feature:** Fix: Agent Answers Getting Stuck (`f-agent-answers-getting-stuck`)

## The report

> When I leave the office mid-answer, the agent never answers me. Agents look stuck: Elon was working, now
> he's done, but there's no report, no reply, and his task on the board is still open — as if they don't
> work when I'm out of the office.

## Root causes (found by reading the flow end to end)

1. **The app never re-reads a chat after you leave the office (client).** The thread cache (`app/src/api/query.ts`)
   has no GC and no refetch-on-mount for fresh entries. Sending a message writes `busy: true` into the cache.
   Leave the office (or switch project) → that project's event stream closes. The reply lands on the server and
   is stored, but the `thread.message` event is never seen. Come back → the office stream resumes from *now*
   (`office.lastEventId`), the cached thread is still "fresh", so it is not fetched: the chat shows "typing…"
   forever and the reply never appears. The same staleness hits the whiteboard, features and every other
   office panel — the "task still open" the user saw can be a stale board.
2. **A message to an agent already at work never gets a reply (server).** `threads.say` hands it to the
   running work as a note (`runtime.tell`), stores the user's line with that run's id — but no turn is
   registered, so when the run ends nothing is written back to the thread. "Elon finished… no reply."
3. **A restart loses every in-flight chat turn (server).** Which thread a reply belongs to lived only in an
   in-memory map (`turns`). After a restart the run is marked interrupted and no `run.finished` fires, so the
   user's line waits forever with no answer.
4. **Finished work can stay "running" forever (server).** After a run ends, dispatch merges its branch (or puts
   its checkout away) in an async continuation. If that throws (git missing a ref, a checkout gone, a store
   write), the error was swallowed (`serial(...).catch(() => {})`, `void stop(...)`, `void launch(...)`): the
   item never settles, its goal never settles, nothing is said.

## Phases

### Phase 1 — every chat turn gets its reply (server) ✅
- A reply's thread is found from the stored user line (`thread_messages.run_id`), not from memory. The memory
  map keeps only the director's extras (goals before the turn, the rebuild card).
- A message told to a running run gets that run's final words as its reply when it ends.
- At start-up, user lines whose runs were just interrupted get an honest reply ("the studio restarted…").
- One reply per run (idempotent).
- **Tests** (`server/test/office/replies-kept.test.ts`): reply lands with nobody listening and is in GET;
  a note to an agent at work gets the work's result as its reply; a restart answers the interrupted turn.

### Phase 2 — a finished run always settles its task (server) ✅
- Item continuations after a run (merge back, put away, launch) never swallow errors: a throw settles the
  item `failed` with the reason (logged with project / item / run), so its goal settles and the office hears.
- The runtime's `onFinished` / `onAnswered` listeners no longer fail silently: a throw is logged with its run.
- **Tests** (`server/test/crew/settles-always.test.ts`): a merge that throws fails the item with the reason
  and the goal settles.

### Phase 3 — coming back to the office shows what happened while away (app) ✅
- Entering a project's office marks every cached panel of that project stale (`office:<pid>:`), so the chat,
  board, features… are read fresh. Events from then on keep them live as before.
- **Tests** (`app/src/api/query.test.tsx`): an invalidated key nobody shows refetches on the next mount
  (old data kept meanwhile), another project's keys untouched. The one-line call in `OfficePage`'s entry
  effect has no page-level test (there is no OfficePage harness yet).

### Phase 4 — open questions survive a reload and a restart (server) ✅
Report: "an agent asked me to reload the app and say if the fix worked; after reloading the question was gone."
- **Root cause 1 — the studio answered it.** Auto-approve (on by default) took "Reload the app — did the fix
  work? [Yes/No]" for a permission check and answered "Yes" itself. `runtime/confirm.ts` now never auto-answers
  a question about what the user sees or tries (did it work / does it look right / reload / let me know).
- **Root cause 2 — a restart cancelled it.** Shutdown and boot cancelled every open question. Now a run with a
  session keeps its question open (parked). The session's resume (dispatch already resumes items on boot)
  takes the question over under the same id, starts no process until it is answered, then carries on with
  the answer in its brief (`runtime/parked.ts`). An answer given before the resume is carried in too. A chat
  turn cut off mid-question carries on the same way instead of replying "the studio restarted".
- **Tests:** `server/test/runtime/parked-asks.test.ts` (reload, restart, answer-before-resume, chat turn,
  stop withdraws), `confirm.test.ts` (observation questions are asked).

### Phase 5 — the screen after a reload and a restart, checked in a browser (Jony) ✅
Headless Chromium against a fake-runner server (`reload-check/drive.mjs`, phases `away`, `ask`, `ask-away`,
`after-restart`, `after-restart-pager`, `reload-in-office`).
- A reply that lands while you're out of the office shows on return; no stuck typing dots. ✅
- An open question shows in chat with its Yes/No after a reload; the pager keeps one that arrived while you
  were away (one you already saw in the office is quiet by design). ✅
- After a full restart: both questions (director + another agent) still show; answering from the chat or the
  pager makes the agent carry on and reply. ✅ — after two fixes:
  - **Server, director after a restart:** `threads.recover` ran before `mail`/`creatorChats` existed in
    `app.ts`, so the director's tools threw ("Cannot access 'mail' before initialization") and the turn was
    never continued. Moved after them; test in `parked-asks.test.ts`.
  - **Server, dead question:** a turn that could not be continued got "the studio restarted" but its question
    stayed open on the pager with nothing behind it. It is now withdrawn (`runtime.withdrawAsks`).
  - **App:** no typing dots under an open question (`Panel.tsx`); the New chat line says "X needs you" while
    the agent asks (`new-chat.ts`).

### Phase 6 — the question first, then the answer, however you answer (Jony, server fix agreed with Uncle Bob) ✅
Report: "the chat sometimes shows my answer before the agent's question, or without the question at all."
- **Cause 1 — a typed answer never reached the agent.** Clicking the card answered the question. Typing the
  answer in the message box instead sent it as an ordinary note to a run that was blocked waiting for the
  answer, so the agent never read it and the question stayed open. The chat showed your line above the
  still-open card (answer before question), and in the director's chat the server refused it (409).
  Fix: while an agent has an open question, what you type *is* the answer — in the app (`Panel.tsx send()`
  answers the open ask like the card) and on the server too (`threads.say` → `answerByChat` answers the
  oldest open ask of that agent), so any client gets it right.
- **Cause 2 — the question got the answer's time.** The question line was written to the thread only when it
  was answered, stamped with that moment, and the app placed lines by the event's time, not the line's own.
  Anything said in between could land above the question. Fix: the question line is saved at the time it was
  asked (`ask.createdAt`), the answer at the time it was given, and the `thread.message` event carries the
  line's own time (`at`), which the app uses (`state.ts threadMessageOf`).
- **Tests:** `server/test/office/threads.test.ts` ("the question first, then the answer — however the user
  answers": typed answer for an agent at work, director no 409, question keeps its asked time with a line in
  between, card + chat race), `app/src/features/office/state.test.ts` (line keeps its own time),
  `Panel.asks.test.tsx` (typing in the message box answers the open question, no note sent).
- **Browser check** (`drive.mjs typed` and `typed-member`): director and a team member, both answered by
  typing. Chat shows "You: ask me… / Agent: question / You: answer / Agent: reply" right away and after a
  reload; the server thread has the question at its asked time (70 s before the answer); both asks closed
  `answered by user`; both agents carried on and replied.

## Status
All phases done. Server 134 files / 868 tests green, app 65 files / 670 tests green, both typecheck.
See `wiki.md` for the lessons.
