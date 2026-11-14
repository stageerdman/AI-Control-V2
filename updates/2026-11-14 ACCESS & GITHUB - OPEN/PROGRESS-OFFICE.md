# PROGRESS — OFFICE: one Send + the work clock

Commits prefixed `OFFICE:`. User's ask (2026-11-14): "Start work and send. What's the difference? Can we reduce to a
simple send button? … remove second progress bar above safe, instead … how long the agents are working on this
project in clock, so when I press it I can see total time spent coding thinking etc".

## 1. One Send ✅
- **Server.** Each director chat turn now ends with ONE JSON object `{reply, work: {goal} | null}`
  (`server/src/office/director-reply.ts`, read with the crew's `extractJson` + zod). `work` is only for a clear ask.
  A question or a maybe ("maybe we could add dark mode?") gets a reply that asks. Anything that isn't a valid answer
  is a plain reply and never starts work. For work, `threads.ts` calls `dispatch.start(…, {fromChat: true})`, the
  same goal `POST /work` makes. The user's line and the reply get its `goalId`, then the plan reply follows (or
  "I couldn’t plan that: …"). G1's snapshot and session rotation are kept (a chat-made goal after a finished one
  rotates too). The fake brain decides the same way (`fakeDirector`).
- **App.** "Start work" and the client-side goal guess (`looksLikeGoal`) are gone. There is one Send. The whiteboard
  follows the goal events as before. No suggested replies.
- Tests: `server/test/office/director-work.test.ts` covers work → goal (thread lines carry the goalId), a question
  or maybe → no goal, plain or broken answers → no goal, a report follow-up keeps `reportId`, an unplannable goal →
  error line, and the fake brain.

## 2. The work clock ✅
- **Which bar.** The second bar was the director's gold "0%" plaque above the safe (`_otPlaque2`). The whiteboard
  ring is the main one and stays. Shots: `office-before-wall.png` → `office-after-wall.png` (full: `office-before-office`,
  `office-after-office`).
- **Clock.** A brass counter in the same spot: an hourglass and the agent time ("12h 40m"). It has no face and no
  hands, so it can't be confused with the decor clock by the door. Sand runs while agents work; with reduced motion
  it stays still. Hotspot label: "Agent time — 12h 40m on Habit Hatch, 2 agents working now". It opens with the
  mouse, Enter or Space. UX spec by a UX agent.
- **Sheet** (`TimeSheet.tsx`). Shows the total; kinds of work as rows with a thin share bar (fixed order, zero kinds
  hidden); "Who put it in" with each hero's time and runs; and "N runs · N turns". There are no dollar amounts. A
  project with no time shows "0m" and "No agent time yet. The clock starts when the crew does." Time format:
  `0m · <1m · 45m · 3h · 12h 40m · 128h`, never days (agent time adds parallel runs up).
- **Data.** `GET /projects/:id/time` returns `{totalMs, byKind, byAgent, runs, turns, since, live}`
  (`server/src/office/work-time.ts`). Migration 25:
  - `runs.kind` is set when a run starts: dispatch → building / reviewing / research; chat → thinking (the director)
    or building / research. Older rows are read from who ran them and what the task says.
  - `crew_time` holds the crew calls that never become runs. Goal planning, captain splits, team design and the
    setup chat count as thinking. Health checks count as reviewing. The Agent Creator and Rivet's setup count as
    setup, and move from the draft to the project on finish.
  - Running work counts up to now. The app reads again on run, goal, split and health events, and every 30–60 s
    while anything is live.
- Tests: `server/test/office/work-time.test.ts` (empty project, sums by kind and agent, live counting, old rows,
  Rivet moved on finish, planning/building/chat kinds live, restart recovery) and `app/.../timeclock.test.tsx`
  (format, plaque gone and clock synced, label, sheet, empty state).

## Verified
- Fake runner on :4811 with its own `AI_STUDIO_HOME` (scratchpad), Vite :1811, headless shell. Results:
  - One button "Send". A maybe gets "want me to put … on the whiteboard?" and no goal. "Add a dark mode toggle in
    Settings" makes a goal and the whiteboard fills. All 3 lines carry the goalId (`office-chat-maybe`, `office-chat-work`).
  - The clock shows `<1m` with sand running while 2 runs are live. Enter on the focused clock opens the sheet
    (`office-clock-sheet-live`); after the work, 11 runs and 16 turns (`office-clock-sheet-done`).
  - A project with history (synthetic rows in the scratch db only) reads `11h 45m` on the wall
    (`office-clock-sheet`, narrow 560 px `office-clock-sheet-narrow`, no sideways scroll).
  - An adopted project reads `0m` with the empty line (`office-clock-empty`). No console or HTTP errors.
- Checks: app 233 tests, server 384, cargo 13. Typecheck and biome are clean in both. `vite build` is ok.
- **Shipped.**
  - The DB was backed up with `sqlite3 .backup` (WAL captured; raw -wal/-shm copies beside it) to
    `~/.ai-studio/backups/studio-before-office-20261114-225414.db` (integrity ok, v24, 5 projects).
  - Release `tauri build`, then `osascript … quit`. Port 4319 and the lock were free in 1 s. The app was replaced
    with `ditto` and opened from /Applications.
  - The backend came up in 5 s, the lock is `{port: 4319}`, `user_version` is 25, and
    `GET /projects/habit-hatch/time` answers (0m: the real projects have no runs yet). All 5 projects are listed
    (Habit Hatch, Bookmark Box, Recipe Scaler, Todo CLI, Tip Splitter 2). `/health` still returned 200 after 20 s.
  - **Left running.** No chat was sent to the real director.
