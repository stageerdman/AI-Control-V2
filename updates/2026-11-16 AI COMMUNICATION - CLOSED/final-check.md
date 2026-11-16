# Final check: every gap really fixed? (Elon, 2026-11-16, master b74bf4d)

Sources re-checked: audit 1 (`audit-2026-11-16.md`), audit 2 (`audit-2-full-text.md`, 48 items), turn-cap live check
(`../2026-11-16 ELON - turn cap/live-check-results.md`). Fix map: `fixes-2.md`.

## Tests
- Server: 708/708 pass. App: 453/453 pass. Both typechecks clean.
- **Lint FAILS** in both packages (server 9 errors / 13 warnings; app 18 errors / 3 warnings, mostly biome
  formatting + import order). CI (`.github/workflows/test.yml`) runs `npm run lint`, so CI is red on master.

## Live (real Pixel, throwaway studio on 3570, fresh home, Aurora seed)
1. "Check HQ email, page me when Baron is done" → read_mail used ("mailbox is empty"); declined the page honestly
   because Baron had no work. FIXED.
2. "Give Baron a task, page me when done, page me now 'ping'" → page "ping" sent; page_when_done saved a notify
   to-do tied to the goal; it fired when Baron delivered. FIXED. Side note: the user got 2 pages for the same finish
   (the to-do page + the report-in page).
3. "Is checkout built? Find out." → Pixel called Semicolon (ask_person) and answered with facts, no "He says". FIXED.
4. Baron (agent chat) used call_agent to ask Pixel → answered, no refusal. FIXED (#33, #34).
5. Baron call_agent work:true to Querious → on the whiteboard, Querious really committed NOTES.md. FIXED (#21/30).
   **GAP:** the to-do queued on Querious's list (fromId a-baron, goalId null) stays "open" after the work was
   delivered: work-call to-dos aren't linked to their goal, so nothing closes them (app.ts addWork: todos.add has
   no goalId), and the agent didn't call done_todo.
6. Message to Baron mid-run → 202 note (no "already running"); Baron's result: "Per your note, number 7 will be
   about a red phone by the safe." FIXED (#35).
7. "Stop Baron and tell him …" → stop_work cancelled the run; desk note next = "Stop the haiku. The checkout
   endpoint matters more." FIXED (#10). That cancelled run has costUsd null (cost gap, see below).
8. tool-use endpoint counts every tool; how-to HTML page renders with counts. FIXED (#18, #42, #43).
9. Live studio (4319): Revision of AI Communication = Now 80%; "Fix: Agent Asks User a Question" = Shipped. FIXED.

## Turn cap
- Research carry-on and "progress = commit/report/desk note": fixed in code + tests (limits/carry-on tests).
  Live rerun (`live-check.mts stall 14 research`): session 1 hit the cap at 14 ("Stopped: reached the turn cap",
  cost=undefined), then session 2 started on its own (new session id) — research runs now carry on. FIXED.
  (Session 2 was killed by my own context reset, so its end wasn't seen; the stuck-vs-progress rule is covered by tests.)
- **Cost of sessions cut at the cap (or stopped) is lost: NOT FIXED** (shipped.md "Not done" admits it; no estimate
  code; live: stopped run costUsd null).
- Step count mixes model messages and CLI turns: NOT FIXED (minor, was a note).

## Code/test-only confirmations
Captains stop/tell own team (captain-tools.test), leaders' rule + contact (rule.test), roadmap rule
(capabilities.test), any agent files reports (reports.test), rebuild keeps just-delivered step (rebuild.test),
one call at a time + desk note in calls (room-calls.test), Communication drawer (reports components.test),
propose_agent (director-reach.test), stop four times and "said it stopped but didn't" (conversation-checks.test
lines 141, 160). Not tried live.
