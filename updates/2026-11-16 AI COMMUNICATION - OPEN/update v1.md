# AI COMMUNICATION — v1

**Goal:** when the user asks Pixel (or any agent) for something it can do, it does it; when it can't, it says so
honestly and offers the nearest real step. Every reply tells the truth about what actually happened.

**Trigger (2026-11-16):** the user asked Pixel to add a feature to the features list, and Pixel couldn't.

## How it works today

**Pixel (the director), in the office chat** (`server/src/office/threads.ts`, `director-reply.ts`):
- Every message carries a fresh summary: whiteboard, **features (read-only)**, people, health, who is running,
  unread reports, open questions from agents.
- Pixel acts through **two different channels**:
  - **Answer fields**, in the JSON it ends its turn with: `work` (new goal), `staff`, `rebuild`, `ask`, `resume`,
    `stop`. The studio carries these out *after* the reply has been written.
  - **MCP tools:** the whiteboard tools only (`whiteboard`, `add_goal`, `add_task`, `edit_*`, `remove_from_board`,
    `clean_board`, `board_history`, `undo_board`). These run during the turn and return a result.
- The prompt lists what Pixel can do by hand-written text. It has no features tools, and it tells Pixel to "offer
  to put it on the whiteboard **as a feature**", which mixes up the whiteboard and the features folder.

**Agents at work** (studio tools, `app.ts` → `setStudioTools`): `ask_user`, `file_report` (reporters only),
`call_agent` / `room` / `comms_log`, `my_runs` / `cancel_run`, `my_history`, mail, `propose_agent` (HQ only).
They can't read or update the features folder, so nothing ticks a feature off when its work ships.

**Replying in an agent's past chat** (`runtime/chat-reply.ts`): one call with no tools. The agent can only talk.
It tells the user to "start a new task" by hand.

**Agents' questions to the user** (`ask_user`): they block the run until the user answers in the studio. Pixel sees
them as `openQuestions`, but it can't answer or pass on an answer for the user.

## Root causes
1. **Gaps in what Pixel can do:** no features tools, and no way to answer an agent's question.
2. **The capability text is written by hand:** the prompt can promise things Pixel can't do, or leave out things it
   can, and nothing checks it.
3. **Pixel acts after it speaks:** answer-field actions happen after the reply is written. Pixel says "Done", and
   if the action then fails, the user is never told.
4. **Agents can't act from a chat reply**, so talking to an agent directly is a dead end for new work.

## Features, in build order

Each feature is small and ships on its own with tests. Tick the status line as each piece lands.
Each one is also in the studio's features list (Planned, same order), under the id on its **Feature** line;
open it at `GET /projects/ai-studio/features/<id>`. Update that feature too when its status changes.

### 1. Features tools for Pixel
Pixel can see, add, edit, move and remove features in the features folder from the chat.
- **Done when:** `features`, `add_feature`, `edit_feature` (name, description, vision, status now/planned/shipped,
  order, pct, owner) and `remove_feature` are part of Pixel's chat tools. They reuse `office/features.ts`, so every
  change sends `feature.changed` and the office updates live. A test runs "add dark mode to the features list"
  through the director's chat and finds it under Planned. A real Pixel turn in a throwaway studio does the same.
  The prompt's "as a feature" wording is fixed.
- **Feature:** `f-features-tools-for-pixel`
- **Status:** ✅ shipped (2026-11-16). `server/src/office/feature-tools.ts` (thin adapter over `office/features.ts`,
  owner by name or id), attached in `app.ts` next to the whiteboard tools as one `directorTools` list. The prompt
  now has a "Features tools" block that says the features list is not the whiteboard, and the fallback offer is
  "add it to the features list as Planned, or put the work on the whiteboard as a goal". Tests:
  `server/test/office/feature-tools.test.ts` (the "add dark mode to the features list" chat → Planned, one
  `feature.changed`, no goal; plus view, move, pct, owner, bad input and remove). Live check: a real Pixel turn in a
  throwaway studio (own `AI_STUDIO_HOME` and sandbox, port 3569) given "add dark mode to the features list" made
  `f-dark-mode` under Planned, no goal, and replied "I've added dark mode to the features list as Planned… Do you
  want me to put it on the whiteboard so a team can start?"

### 2. Honest capability list
The "what you can do from here" lines in Pixel's prompt are built from the tools and answer fields Pixel really
has, not written by hand.
- **Done when:** each tool and answer field has one plain capability line next to its definition. The prompt puts
  them together from what is actually attached, so a project without `stops` doesn't promise stopping. A test
  checks that every attached tool shows up in the prompt and nothing missing is promised. For a request that is
  truly outside what Pixel can do, it offers a real next step it *can* take (a feature in Planned, or a goal on the
  whiteboard).
- **Feature:** `f-honest-capability-list`
- **Status:** ✅ shipped (2026-11-16). Every director tool is a `CapableTool` (`room/bridge.ts`: a `BridgeTool` plus
  one `can` line, written next to each tool in `whiteboard/tools.ts` and `office/feature-tools.ts`). Every answer
  field has its `can` line and its rule in `ANSWER_FIELDS` (`office/director-reply.ts`), keyed by the schema's
  fields, so a new field without a line doesn't compile. `office/capabilities.ts` builds the prompt's list from
  what is attached: `threads.ts` passes the tools it really gives the run and the fields whose service is wired
  (`startWork`, `staffing`, `rebuilds`, `ask`, `resumeGoal`, `stops`). `DIRECTOR_ANSWER` became
  `directorAnswer(fields)`, so the answer rules only cover wired fields too. The "outside the list" line offers only
  steps that are attached (features list as Planned, whiteboard goal); with nothing attached (report-in) Pixel is
  told it can only talk. The old hand-written whiteboard/features guidance moved into the tools' `can` lines (and
  the `force` hint into the tool's `force` description). Tests: `server/test/office/capabilities.test.ts` (every
  field and tool has a line; the prompt shows exactly those lines; no stop without `stop`; real fallbacks; the real
  studio's chat prompt lists every attached tool and field).

### 3. Act first, then speak: `ask`, `resume`, `stop` as tools
The three simplest answer fields become tools, so Pixel sees the result before it writes its reply.
- **Done when:** `ask_person`, `resume_goal` and `stop_work` are tools that wrap the services `threads.ts` uses
  today (`room.call`, `dispatch.resume`, `DirectorStopper`), and their answer fields are removed. A failure, such
  as "Jony couldn't be reached", comes back to Pixel during the turn and appears in its reply. The tests in
  `director-ask.test.ts` and the stop and resume tests pass through the tools.
- **Feature:** `f-act-first-then-speak-ask-resume-stop-as`
- **Status:** ✅ shipped (2026-11-16). `server/src/office/action-tools.ts`: `ask_person` (room.call, waits for the
  answer and returns "Pete answered: “…”"; nobody on the project or a failed call throws, so Pixel reads the
  refusal in the same turn), `resume_goal` (dispatch.resume by the summary's `stopped` n, one line per goal) and
  `stop_work` (the director's stopper). Each has its `can` line; `app.ts` adds them to `directorTools`. The `ask`,
  `resume` and `stop` answer fields, and threads.ts's after-the-reply `askFor` / `resumeFor` / stop lines, are gone:
  Pixel's own reply now says what happened. threads.ts keeps only `runningNow` for the summary. `agentByName` and
  the project seat lookup moved to `office/people.ts` (threads, feature tools, stop and ask share them). **Fix found
  on the way:** a stop now runs inside Pixel's turn, so "stop everything" would have cancelled Pixel's own run —
  `running.stop` / `stopper.project` take a `spare` agent, and naming Pixel itself is refused. Tests:
  `director-ask.test.ts` (answer read in the turn, the office sees the call, not-on-project refusal, a failed call
  comes back, resume with a missing n) and `director-stop.test.ts` (stop one, stop everyone, Pixel's turn
  survives); `capabilities.test.ts` covers the three new tools. All 658 server tests and the typecheck pass. No
  live real-Pixel check this time (the tools ride the same bridge as the whiteboard tools, live-checked in step 1).

### 4. Act first, then speak: `work`, `staff`, `rebuild` as tools
The remaining answer fields move to tools. Pixel's answer becomes plain text.
- **Done when:** `staff_project` and `rebuild_teams` are tools. A rebuild that needs a confirm still returns the
  card, and the reply says "confirm below". `work` is covered by `add_goal`. `DirectorReplySchema` shrinks to
  `{reply}` and `DIRECTOR_ANSWER` loses its action rules. The existing staffing, rebuild and work-from-chat tests
  pass through the tools.
- **Feature:** `f-act-first-then-speak-work-staff-rebuild`
- **Status:** ✅ shipped (2026-11-16). `server/src/office/team-tools.ts`: `staff_project` (the staffing service,
  returns who joined or why not) and `rebuild_teams` (the rebuild service; a plain change is done at once with an
  Undo, a change with open work hands its confirm card to the turn through `TurnHooks.card` and tells Pixel to end
  with "confirm below", never "done"). `work` is covered by `add_goal`: threads.ts snapshots the board's goals
  before the turn (`goalsBefore`) and links a goal added during it to the user's message and the reply, then calls
  `noteNewGoal`. Pixel's answer is plain text: `DirectorReplySchema` and `ANSWER_FIELDS` are gone,
  `director-reply.ts` keeps only `directorAnswer(can)` and `replyText` (which still unwraps an old `{"reply": …}`).
  `Capabilities` is tools only. threads.ts no longer takes `startWork` or `staffing`; `directorTools(projectId,
  directorId, turn)` builds the tools per turn. With the `work` field gone, the chat's second planning turn
  (`dispatch.start` from chat) is gone too; mail still uses `dispatch.start`. Tests: `capabilities`,
  `director-work`, `staffing` and `rebuild` run through the tools (card under the reply, refusals read in the
  turn). All 658 server tests and the typecheck pass.

### 5. Pixel answers agents' questions for the user
"Tell Uncle Bob to use option 2" answers that agent's open `ask_user` question.
- **Done when:** `open_questions` lists open asks with their ids and options, and `answer_question` answers one,
  using the same path as the user's own answer. The waiting run then continues. Pixel only answers what the user
  actually said, never on its own. A test covers it end to end: an agent asks, the user tells Pixel, the run gets
  the answer.
- **Feature:** `f-pixel-answers-agents-questions-for-the-u`
- **Status:** ⬜ not started

### 6. Agents keep features up to date
The agent carrying a feature can tick it off as its work ships, and the feature can link to its whiteboard goal.
- **Done when:** working agents get a small `feature` tool (read one feature, set pct and status, add a line to
  its description). A goal can name the feature it serves. When that goal finishes, the feature moves to Shipped
  with pct 100, unless an agent has already set it. Tests cover the link and the automatic shipping.
- **Feature:** `f-agents-keep-features-up-to-date`
- **Status:** ⬜ not started

### 7. A reply in an agent's chat can start work
Talking to an agent directly is no longer a dead end.
- **Done when:** when the user's message in an agent's past chat asks for work, the agent's reply offers "Start it"
  in one tap. That continues the same agent's session on that project with the message as its brief, through the
  normal run path, so the agent remembers the chat. A question still gets a plain answer. A test covers both cases.
- **Feature:** `f-a-reply-in-an-agent-s-chat-can-start-wor`
- **Status:** ⬜ not started

### 8. Conversation checks
The chats that went wrong before become a regression suite, so they never come back.
- **Done when:** one test file plays back the real failures through the fake brain and the director's chat:
  "add to features list", "have you asked Twinkle?", "stop everything", "carry on", "tell Uncle Bob option 2". Each
  one checks what actually changed (features, board, runs, asks), not just the wording of the reply. It runs in
  `npm test`.
- **Feature:** `f-conversation-checks`
- **Status:** ⬜ not started

## Status
- Roadmap written (2026-11-16).
- All 8 features added to the features list as Planned, in roadmap order (orders 19–26, after the user's existing
  planned items), each saying it is part of Revision of AI Communication. None are on the whiteboard.
- Feature 1 shipped (2026-11-16): Pixel can see, add, edit, move and remove features from the chat.
- Fix shipped (2026-11-16): an answered `ask_user` question stays in the agent's office chat as two lines, the
  agent's question then the user's answer (it used to show only a local "Go with X." that vanished on reload).
- Feature 2 shipped (2026-11-16): Pixel's "what you can do from here" list is built from what is attached.
- Feature 3 shipped (2026-11-16): ask, resume and stop are tools (`ask_person`, `resume_goal`, `stop_work`); Pixel
  sees the result before it replies.
- Feature 4 shipped (2026-11-16): work, staff and rebuild are tools (`add_goal`, `staff_project`,
  `rebuild_teams`); every answer field is gone and Pixel's answer is plain text. Next: feature 5.

## Learned (changes later steps)
- **One list of director tools.** `threads.ts` takes `directorTools` (whiteboard + features), typed
  `CapableTool[]`: a new director tool must carry a `can` line or it doesn't compile.
- **No answer fields any more (from feature 4).** Every action Pixel takes is a `CapableTool`; a new one (feature
  5's `answer_question`) is added to `directorTools` in `app.ts` with its `can` line, and the capability list
  follows by itself. `capabilities.ts` checks `add_goal` / `add_feature` by name for the fallback offer; keep those
  names (or update `canStartWork`).
- **A tool can hand something to the reply (from feature 4)** through the turn's `TurnHooks` (the rebuild card
  rides on it). Use the same hook if a later tool needs a card or button under Pixel's reply.
- **Tools run inside Pixel's turn (from feature 3).** Anything that stops runs must spare the director's own run
  (`spare` on `running.stop`); feature 4's tools should check the same for anything that cancels work. A tool
  answers by returning text or throwing (Pixel sees "<tool> refused: …"), never by adding thread lines itself.
  Feature 5's `answer_question` and feature 7 can reuse `office/people.ts` for names and seats.
- **Feature 6 can reuse `CapableTool`/`capabilityLines`** for the agents' `feature` tool if their prompt lists
  capabilities too.
- **Names, not ids, from voice.** Feature owners are agent/team ids, but Pixel hears names; the tool resolves names
  with `agentByName` (director-stop.ts) plus team names. Features 3 and 5 (`ask_person`, `answer_question`) need the
  same lookup — reuse it, and move it out of `director-stop.ts` into a small shared module when the second caller lands.
- **`remove_feature` can't be undone** (the features repo deletes the row). The whiteboard has `undo_board`; if the
  user ever loses a feature by mistake, add the same undo there rather than a soft-delete flag.
- **Feature 6 can reuse `feature-tools.ts`:** an agent's `feature` tool is `edit_feature` limited to pct, status and
  one appended description line.
- **Answered questions go through `runtime.onAnswered`.** `runtime.answer` calls it (never for auto answers), and
  `threads.ts` saves the question and answer in the asking agent's thread with no runId (so they never decide which
  session resumes). Feature 4's `answer_question` should call `runtime.answer` too, so it gets these lines for free.
  If Pixel's answer should read "Pixel answered for you", add a `by` to the listener rather than a second path.
- The server's `npm run lint` already fails on older files (formatting, comma operators); new files follow the
  existing style. Worth a cleanup pass, separate from this update.

## Decisions
- **Tools rather than answer fields** for everything new. Answer fields run after the reply, so the reply can't
  honestly say what happened. Features 3 and 4 move the existing fields over, in two small steps.
- **Reuse the services, not the routes.** Every new tool is a thin adapter over the service the UI already uses,
  like `whiteboard/tools.ts`, so changes made from the chat and from the UI behave the same way.
- **Out of scope:** voice recognition itself, the UI look of chat bubbles, and mail between projects. Those already
  have their own updates.
