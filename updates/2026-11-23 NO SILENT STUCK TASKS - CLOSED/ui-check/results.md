# Task buttons: live check (2026-11-23)

Running app: studio server on 3569 with the fake runner (`AI_STUDIO_FAKE_PACE_MS=30000`, so a note stays waiting long
enough to see), app on 3570, driven by headless Chromium (`drive.mjs`). Data lives in `node_modules/.data` (not committed).

## Notes waiting for an agent: works
1. Started a goal on Aurora. While Captain Semicolon's task ran, sent them a message (`POST …/threads/a-semic/messages`).
   The server holds it as a waiting note (`GET /projects/aurora/notes` → 1).
2. Quest Board, under the running task: **"1 note waiting for Captain Semicolon · See · Clear"**.
3. **See** opens the note (aria-expanded true, label becomes Hide). **Clear** drops it: the line goes away and the
   server reports 0 notes.
4. Fixed during the check: the open note showed the studio's wrapper for the agent ("AI Studio — a note from the user
   while you work: … Take it into account …"). It now reads **"You  Please keep the toggle in the top-right corner."**
   (`saidIn`, tested).

## Start fresh: works
1. Stopped the goal. Fixed during the check: every stopped step offered Start fresh, but in an ordered goal a step
   behind a stopped one is skipped again at once (server `domain/task-order.ts`), so the click looked like it did
   nothing. Now only steps that can really run offer it: the first stopped step (and steps running alongside it).
   On the old goal, whose first step was a team split (can't restart), no step offers it, which is correct.
2. New goal, stopped before the team split: exactly one **Start fresh**, on step 1.
3. Clicked it while the stopped run was still winding down: toast "Couldn't start fresh — That task is running — stop
   it first, then restart it fresh". Clear and true.
4. Clicked again once it had ended: toast "Starting fresh from main". Step 1 runs again on a new checkout, and the
   board updates by itself. Step 2 now offers Start fresh (it would queue behind step 1).

## For the server (not changed here)
- After `POST /projects/:id/tasks/:itemId/restart-fresh` on a cancelled goal, the goal stays `cancelled` while its
  task runs. The whiteboard tool (`edit_task fresh: true`) wakes the goal; the HTTP route doesn't.
