# Task tools: waiting notes and Start fresh

**User goal:** a task is stuck or going the wrong way, and you want it unstuck without reading agent
output (user model goal 1: get work done without it getting blocked).

## Waiting notes (running tasks only)
```
[◉]  Build the board                                        (◉ Pete)
     2 notes waiting for Pete   See   Clear
       ┌ Uncle Bob  AI Studio — a note from Uncle Bob…  ┐   (only after See)
```
- Shown only when notes are waiting for whoever is on the task now (builder, reviewer or members).
  No notes → nothing at all. Same voice as the stopped-task line: one plain sentence, quiet text buttons.
- **See** (`aria-expanded`) shows each note as the agent will get it, in the light mono box.
- **Clear** drops them before they arrive (no confirm: notes are cheap to say again). Toast: "Cleared 2 notes",
  or "Already delivered" if the agent picked them up first.
- Read once per project (`GET /projects/:id/notes`) and only while something runs; refreshed with every
  board change.

## Start fresh (stopped tasks)
```
[!]  Add the login screen                          Continue  Drop  Start fresh
     Ran out of steps. The work is saved and can continue.  Details ▸
```
- On failed or cancelled top-level tasks (not a team's split task: the server refuses those).
- Secondary beside Continue (the primary, which keeps the work). Hover: "Start over from main. Work so far
  is kept on a branch."
- No confirm: nothing is lost. Toast: "Starting fresh from main. Earlier work kept on <branch>".
- A refusal (e.g. it started running meanwhile) is said in the server's own words.
- Voice path: ask Pixel; it already has `edit_task` with `fresh: true`.

## Removed, and why
- A notes count on every card: shown only when there are notes.
- A confirm dialog for Start fresh: the earlier work is kept, so there's nothing to protect.
- "Restart fresh from main" as the label: "Start fresh" says it; the hover says the rest.

Built in `app/src/features/office/TaskTools.tsx`, placed by `QuestBoard.tsx` (trail rows and side-quest cards).
