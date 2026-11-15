# HQ email review: verdicts

**The email.** HQ has one mail: HR's "Office communication review" (sent 08:35 on 2026-11-15, mail id `20471535…`). It is also committed at `updates/2026-11-15 HR - OPEN/comms-review.md`.

**Summary.** HR found no misconduct. Their main point is that agents waste round trips and lose information: work asked for in calls goes nowhere, finished steps get cancelled, reviews start too early, migration numbers clash, and known gaps never reach the user.
They also ask for safety and tooling fixes: a real block on reading secrets, a flaky test fixed, and letting any agent file reports, page the user and call the orchestrator.

**How I judged.** Each idea was checked against the 21 features on the board and against the code. Where the user has already said what they want (mostly in *Revision of AI Communication*), the user's view wins over HR's proposed fix.

**Facts checked in the code**
- Calls really can't reach the orchestrator. `server/src/room/room.ts:44` only allows kinds `agent` and `creator`, yet `room` lists the orchestrator as being in the room.
- Reading has no path limit. `server/src/runtime/permissions.ts:1` says "Reading is always allowed", and `server/src/git/worktrees.ts:98` copies the project `.env` into every checkout. So any agent can read secrets.
- `file_report` is only given to reporter runs: `server/src/runtime/service.ts:95` and `server/src/mcp/ask-server.ts:5`.
- Migrations are numbered by hand, in order, in one shared file (`server/src/db/migrations.ts`, now up to 33). Two branches picking the same number is bound to happen again.
- Split steps can't wait for each other. Nothing in `server/src/` has an ordering field like "start after" or "depends on".
- Past chats can still be written to. Jony found that `ChatHistorySheet.tsx` still shows a reply box on finished chats, but the user has decided past chats open read-only.

## Verdict table

| # | Suggestion | Verdict | Matching feature | Reason |
|---|---|---|---|---|
| 1 | Add a prompt rule for the orchestrator: "Calls are for questions only; put work on the whiteboard first" | Drop | — | The user wants the opposite: agents talk face to face and the whiteboard is only for tracking. A prompt rule would keep the wasted round trip and just make it official. |
| 2 | When work is asked for in a call, the studio should actually start it, not just answer that the call is read-only | Covered | Revision of AI Communication | This is a real problem and the user has hit it often (Pixel → Jony twice, Pixel → Elon for this very email). The user already asked for it there, so the fix is to make it work, not to forbid it. |
| 3 | Before reassigning or cancelling a step, check its status; if it's done, hand the work over instead of cancelling | Covered | Smoother Studio Teamwork | Real and cheap: Blair's finished spec was cancelled two seconds after it was delivered. The feature already lists "safe cancel and handover". |
| 4 | Give a call the agent's recent delivery or memory as context, so they recognise their own work | Covered | Revision of AI Communication | Blair denied making a file they had just made. That feature's vision (agents log progress and keep their own page or roadmap) is where this memory should live. |
| 5 | Decide whether past chats are read-only or writable, and make the build match | Covered | Fix: Chat History UX | The user has decided read-only, but the code still shows a reply box on past chats. This is a small follow-up fix to a shipped feature. *Agent Chat History* ("open their chat and keep talking") needs its wording updated to match. |
| 6 | Let a split step "start after" another step, so reviews and accessibility checks wait for the build | Covered | Smoother Studio Teamwork | Real: Health Analyst reviewed team rebuilding before it was built. There's no ordering field in the server today, and the feature already names "steps that wait for each other". |
| 7 | Members failing and leaving the captain to finish alone ("All three members failed, so finish myself") | Covered | Fix "Stopped" Bug | Probably the same cause as the turn-cap stops, plus reviewers starting too early (row 6). **Not sure.** Quick check: read the end reasons of those three runs in the `runs` table. If they say "turn cap", it belongs here. |
| 8 | Name migrations by timestamp, or reserve the number when work is split | Covered | Smoother Studio Teamwork | Real and repeating: two of three merge conflicts came from both branches choosing migration 31. Timestamp names are the smaller fix because they need no coordination. |
| 9 | Fewer collisions in shared files (`server/src/app.ts`, `migrations.ts`) generally | Drop | — | Once row 8 fixes migrations, what's left is ordinary merge work that the captain already handles. Restructuring `app.ts` to avoid it costs more than the conflicts do. |
| 10 | Every delivery ends with a "Not done / known gaps" line, and the orchestrator always passes it on in the page | Covered | Smoother Studio Teamwork | Real: Pixel paged "team-rebuild goal is fully done" while gaps were still open. The feature already names "honest done reports that include known gaps". |
| 11 | Team Rebuilding's own known gaps: canvas animations not wired up, drag only works inside the overlay, overlay never checked visually | Covered | Team Rebuilding | The feature is marked shipped, but these gaps never reached the user. List them on the feature so they're visible, then the user decides whether to finish them. |
| 12 | Show an agent's tools (what they can edit and reach) in their Cast panel | Covered | Agent Description | A project rule says "what can this agent reach" must be visible, and the panel doesn't show it. It fits the user's ask that everyone can see who an agent is and what they do "without guessing". |
| 13 | A real deny rule that blocks agents from reading secrets (`.env`), not just a prompt telling them not to | Covered | AI Safety | Real: reading is allowed everywhere and `.env` is copied into each checkout, so today the prompt is the only safeguard. This is exactly the "hardcore rules in code" the user asked for. |
| 14 | Fix the flaky server test `server/test/office/guests.test.ts` (a run saves after the DB is closed) | New feature | Fix: Flaky Guests Test | A flaky test makes every "all tests pass" claim less trustworthy, and nobody owns it. **Not sure how often it fails.** Quick check: run it 20 times and count the failures. |
| 15 | Let any agent file to the Reports tray, including HR-type roles and agents inside a call | Covered | Revision of AI Communication | The user asked HR for this directly and it failed; that feature quotes the failure and says "that must not happen again". Simplest fix: give `file_report` to every run and call, not only reporter roles. |
| 16 | Let agents page the user, or at least reach the orchestrator to do it | Covered | Revision of AI Communication | Same HR failure. The user wants "notify me when done" to work from whoever they asked. Paging through the orchestrator is enough once row 17 is fixed. |
| 17 | `room` lists the orchestrator, but `call_agent` refuses them ("Nobody called 'Pixel' can be called") | Covered | Revision of AI Communication | A confirmed bug (`CALLABLE` leaves out the orchestrator kind). Either allow the call or stop listing the orchestrator as callable. Allowing it is what the user wants ("chat with any agent"). |

All 17 rows cover the whole email. The summary paragraph ("nothing suspicious") and the source note make no suggestions, so they have no row.

## 1. What to add to each covered feature

- **Revision of AI Communication** (rows 2, 4, 15, 16, 17)
  - Work asked for in a call actually gets done: the callee gets a real working run, and a step is logged on the whiteboard only for tracking.
  - A call carries the agent's latest delivery or desk note, so they recognise their own work.
  - Every agent run and call can use `file_report`.
  - Agents can reach the orchestrator, so the orchestrator can be called and can page the user when asked.
  - Bug to fix: `room` lists the orchestrator, but `call_agent` refuses them (`server/src/room/room.ts:44`).
- **Smoother Studio Teamwork** (rows 3, 6, 8, 10)
  - Remove "questions-only calls" from its description. It goes against the user's view (row 1 was dropped; row 2 replaces it).
  - Keep the other four parts:
    - Check a step's status before cancelling it, and hand over finished work.
    - Split steps can "start after" another step.
    - Migrations are named by timestamp.
    - Every delivery ends with a "Not done / known gaps" line, and the orchestrator always passes it on.
- **Fix: Chat History UX** (row 5)
  - Follow-up: past chats are read-only, with no reply box. This is the user's decision from 2026-11-15.
- **Agent Chat History** (row 5)
  - Change "open their chat and keep talking" to "keep talking in the current chat; past chats are read-only".
- **Fix "Stopped" Bug** (row 7)
  - Also cover runs that end as "failed" and leave the captain working alone. First check whether those were turn-cap stops.
- **Team Rebuilding** (row 11)
  - Known gaps: canvas animations aren't wired up, drag only works inside the overlay, and the overlay hasn't been checked visually.
- **Agent Description** (row 12)
  - Next to the description, the agent's Cast panel shows their tools: what they can edit, run and reach.
- **AI Safety** (row 13)
  - Add a real deny rule for reading `.env` and other secret files. Today reading has no path limit and `.env` is copied into every checkout.

## 2. New features to create

- **Fix: Flaky Guests Test**: done when `server/test/office/guests.test.ts` passes 20 runs in a row and no run saves after the DB has closed.

## Applied to the board (2026-11-15)

Done through the features API. No status was changed.
- Added to descriptions: Revision of AI Communication, Fix "Stopped" Bug, Agent Description, AI Safety, Team Rebuilding (known gaps), Fix: Chat History UX (read-only follow-up).
- Rewritten: Smoother Studio Teamwork (dropped "questions-only calls", now lists the four kept parts) and Agent Chat History (past chats are read-only).
- New Planned feature: Fix: Flaky Guests Test.

## 3. Dropped

- **Calls are for questions only (prompt rule)** (row 1): goes against the user's wish for face-to-face work between agents, and leaves the wasted round trip in place. Row 2 replaces it.
- **Restructure shared files to avoid merge conflicts** (row 9): costs more than it saves once migrations are named by timestamp (row 8).
