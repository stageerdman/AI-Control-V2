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

### 1. Features tools for Pixel
Pixel can see, add, edit, move and remove features in the features folder from the chat.
- **Done when:** `features`, `add_feature`, `edit_feature` (name, description, vision, status now/planned/shipped,
  order, pct, owner) and `remove_feature` are part of Pixel's chat tools. They reuse `office/features.ts`, so every
  change sends `feature.changed` and the office updates live. A test runs "add dark mode to the features list"
  through the director's chat and finds it under Planned. A real Pixel turn in a throwaway studio does the same.
  The prompt's "as a feature" wording is fixed.
- **Status:** ⬜ not started

### 2. Honest capability list
The "what you can do from here" lines in Pixel's prompt are built from the tools and answer fields Pixel really
has, not written by hand.
- **Done when:** each tool and answer field has one plain capability line next to its definition. The prompt puts
  them together from what is actually attached, so a project without `stops` doesn't promise stopping. A test
  checks that every attached tool shows up in the prompt and nothing missing is promised. For a request that is
  truly outside what Pixel can do, it offers a real next step it *can* take (a feature in Planned, or a goal on the
  whiteboard).
- **Status:** ⬜ not started

### 3. Act first, then speak: `ask`, `resume`, `stop` as tools
The three simplest answer fields become tools, so Pixel sees the result before it writes its reply.
- **Done when:** `ask_person`, `resume_goal` and `stop_work` are tools that wrap the services `threads.ts` uses
  today (`room.call`, `dispatch.resume`, `DirectorStopper`), and their answer fields are removed. A failure, such
  as "Jony couldn't be reached", comes back to Pixel during the turn and appears in its reply. The tests in
  `director-ask.test.ts` and the stop and resume tests pass through the tools.
- **Status:** ⬜ not started

### 4. Act first, then speak: `work`, `staff`, `rebuild` as tools
The remaining answer fields move to tools. Pixel's answer becomes plain text.
- **Done when:** `staff_project` and `rebuild_teams` are tools. A rebuild that needs a confirm still returns the
  card, and the reply says "confirm below". `work` is covered by `add_goal`. `DirectorReplySchema` shrinks to
  `{reply}` and `DIRECTOR_ANSWER` loses its action rules. The existing staffing, rebuild and work-from-chat tests
  pass through the tools.
- **Status:** ⬜ not started

### 5. Pixel answers agents' questions for the user
"Tell Uncle Bob to use option 2" answers that agent's open `ask_user` question.
- **Done when:** `open_questions` lists open asks with their ids and options, and `answer_question` answers one,
  using the same path as the user's own answer. The waiting run then continues. Pixel only answers what the user
  actually said, never on its own. A test covers it end to end: an agent asks, the user tells Pixel, the run gets
  the answer.
- **Status:** ⬜ not started

### 6. Agents keep features up to date
The agent carrying a feature can tick it off as its work ships, and the feature can link to its whiteboard goal.
- **Done when:** working agents get a small `feature` tool (read one feature, set pct and status, add a line to
  its description). A goal can name the feature it serves. When that goal finishes, the feature moves to Shipped
  with pct 100, unless an agent has already set it. Tests cover the link and the automatic shipping.
- **Status:** ⬜ not started

### 7. A reply in an agent's chat can start work
Talking to an agent directly is no longer a dead end.
- **Done when:** when the user's message in an agent's past chat asks for work, the agent's reply offers "Start it"
  in one tap. That continues the same agent's session on that project with the message as its brief, through the
  normal run path, so the agent remembers the chat. A question still gets a plain answer. A test covers both cases.
- **Status:** ⬜ not started

### 8. Conversation checks
The chats that went wrong before become a regression suite, so they never come back.
- **Done when:** one test file plays back the real failures through the fake brain and the director's chat:
  "add to features list", "have you asked Twinkle?", "stop everything", "carry on", "tell Uncle Bob option 2". Each
  one checks what actually changed (features, board, runs, asks), not just the wording of the reply. It runs in
  `npm test`.
- **Status:** ⬜ not started

## Status
- Roadmap written (2026-11-16). Next: feature 1.

## Decisions
- **Tools rather than answer fields** for everything new. Answer fields run after the reply, so the reply can't
  honestly say what happened. Features 3 and 4 move the existing fields over, in two small steps.
- **Reuse the services, not the routes.** Every new tool is a thin adapter over the service the UI already uses,
  like `whiteboard/tools.ts`, so changes made from the chat and from the UI behave the same way.
- **Out of scope:** voice recognition itself, the UI look of chat bubbles, and mail between projects. Those already
  have their own updates.
