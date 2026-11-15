# Running now — see what's running, stop one or all

## User goal
"What are my agents doing right now in this project, and how do I stop them?" A user asks this when work looks
stuck, is going the wrong way, or they just want to stop. They need an answer at a glance and a stop that works
right away. Stopping must never cost them work (user model goal 3): the chat and history stay, so the agent can
carry on later.

## Removed (and why)
- **A separate page or tab.** Running work belongs to the office you're in. It's a sheet over the office.
- **An always-on "0 running" control.** When nothing runs there's nothing to do, so the control is hidden.
- **A Stop button on each command.** People stop *agents*, not processes. An agent's commands (servers, tests,
  builds) are listed under it as quiet lines so you can see what it's doing, and they stop with it.
- **A confirm on single Stop.** One agent, chat kept: it's cheap to undo, so it takes one click.
- **Process ids, run ids, kinds.** Implementation detail (project rule: show programs, not terminals).

## Flow
1. Something is running → a live pill sits in the office's stage controls: `● 3 running`.
2. Click it → the **Running now** sheet.
3. **Stop** on an agent → the row says "Stopping…", then disappears. One click.
4. **Stop all agents** → the footer asks, in place: "Stop all 3 agents now? Their chats are kept."
   [Keep working] [Stop all]. Two clicks. Then the list empties: "Nothing is running."
5. Nothing left → the pill disappears.

## Layout (sheet)
```
Running now                                              ✕
Stopping keeps their chat, so they can carry on later.

[face] Captain Semicolon                           [Stop]
       Build the login form · started 4 min ago
         npm test
         vite --port 3570

[face] Pixel                                       [Stop]
       Pixel: plan · started 1 min ago

[▶]    The app                                     [Stop]
       npm run dev · started 20 min ago

──────────────────────────────────────────────────────────
                                       [Stop all agents]
```
- Agents first, oldest first; one row per agent, however many sessions it has. "What it's doing" is its
  newest session's task. "Started" is its oldest.
- Studio work with no agent shows as "The studio".
- The project's app is last, with its own Stop. **Stop all agents leaves the app alone**: the app is the
  user's, not an agent's, and the button's name says so.
- One primary action: **Stop all agents** (the hero button), shown only when an agent is running.

## States
- **Loading** (first read): "Looking…"
- **Empty**: "Nothing is running." (Stop all is hidden.)
- **Read error**: "Couldn't read what's running." + Try again.
- **Stopping**: the row's button says "Stopping…" and is disabled. If it's still there after the stop, it stays
  on the list (it's honest about it).
- **Stop error**: a line under the list (`role="alert"`): "Couldn't stop Pixel. Try again."

## Live
- Read on open, then every 2 s while the sheet is open and every 5 s otherwise. Read again at once on
  `run.started`, `run.finished`, `app.status` and `goal.changed`, and right after every Stop.
- A stopped row leaves the list straight away (optimistic), so the view reacts to the click.

## Accessibility
- Stage pill: a real button, `aria-label="3 running now — see and stop"`.
- Each Stop: `aria-label="Stop Captain Semicolon"`. Tap targets ≥ 32 px (`btn-sm`).
- The confirm moves focus to "Stop all" and announces with `role="alert"`; Escape closes the sheet.
- The list is `aria-live="polite"`, so screen readers hear things leave.

## API (built on `server/src/running`)
- `GET /projects/:id/running` → items (session · app · code).
- `POST /projects/:id/running/:itemId/cancel` → stop one item.
- Stop an agent = cancel all its items at once. Stop all = the same for every agent item. A 404 means it already
  ended, which counts as stopped.

## Assumptions (guesses — check)
- People want the app out of "Stop all". Check: watch whether users stop the app right after Stop all.
- 5 s is fast enough for the pill to show up when the orchestrator starts planning (crew calls send no events).
