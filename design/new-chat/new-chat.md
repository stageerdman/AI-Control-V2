# New chat with Pixel — the button, its states, and when it shines

## User goal
"Start fresh with Pixel." Pixel's chat is one long thread. After a goal is done, old talk gets in the way:
Pixel drifts back to old ideas, and the user scrolls past a finished conversation to say something new.
They want a clean page, and they want to keep the old one.

It must never cut work short (user model goal 1). So the button only works when nothing is running, and it
**shines** at exactly that moment: "everything's done — good time for a fresh start."

## What I removed (and why)
- **A confirm dialog.** Nothing is lost: the old chat is one tap away in History. A confirm would only slow
  down a safe action.
- **An Undo toast.** Same reason. History *is* the undo.
- **Naming or tagging the old chat.** Its first line already names it. Cut until someone asks.
- **A "new chat" button for every agent.** The brief is Pixel. Other agents' chats are already split by run.
- **Continuing an old Pixel chat.** Pixel works from the live board, not from old talk. An old chat is for
  reading. To pick something up again, you say it in the new chat. (One live conversation, no forks.)
- **A pulsing, always-moving shine.** Motion that never stops pulls the eye while you read. The light sweeps
  three times when the button lights up, then rests as a steady glow.
- **Opening "Running now" from the dimmed button.** Tempting, but it's a second job for one button. The
  `● 3 running` pill already does that, in the stage controls.

## Where it sits
Top-right of Pixel's chat header (`.op-head` → `.op-tools`), **above History**, in the same stacked column the
`← Pixel` pill uses for other agents. Only in Pixel's (the director's) panel, only in the LIVE view (the
history views have their own nav bar).

```
┌─────────────────────────────────────────┐
│ [bot]  Pixel               [✦ New chat] │  ← the new pill (the one that can shine)
│        Orchestrator          [🕘 History]│  ← unchanged
│        Your director · big picture only │
├─────────────────────────────────────────┤
```

When the pill is dimmed, a short reason sits right under it, in place of the gap above History:

```
┌─────────────────────────────────────────┐
│ [bot]  Pixel               [✦ New chat] │  ← dimmed
│        Orchestrator     2 agents working │  ← the reason, 11.5px, right-aligned
│        Your director · …     [🕘 History]│
├─────────────────────────────────────────┤
```

## The four states

```
 IDLE                 SHINING                 DISABLED                 AFTER TAP
 (chat already new)   (good time to start)    (work is running)        (fresh chat)

 ╭──────────╮         ╭──────────╮ ~glow~     ╭──────────╮             ╭──────────╮
 │✦ New chat│ quiet   │✦ New chat│ sun pill   │✦ New chat│ faded       │✦ New chat│ quiet (= IDLE)
 ╰──────────╯         ╰──────────╯ + sweep    ╰──────────╯             ╰──────────╯
                                               2 agents working         log: empty note
```

### 1. IDLE — the chat is already new
- **When:** nothing is running, but Pixel's live chat has no messages yet (a brand-new project, or right after
  a new chat).
- **Looks:** exactly like the History pill: cream text on 10% white (`.op-pill-v`). No glow.
- **Tap:** nothing. `aria-disabled="true"`, name: **"New chat — this chat is already new"**.
- No reason line: the empty chat already says it.

### 2. SHINING — nothing is running, there's something to clear
- **When:** the shine rule below is true.
- **Looks:**
  - Pill background `--sun` `#ffc24b`, text `#4a2600` (same pair as the user's bubbles, AA).
  - Glow: `box-shadow: 0 0 0 2px rgba(255,194,75,.35), 0 0 14px 2px rgba(255,194,75,.45)`.
  - **Sweep:** a soft white band (`linear-gradient(105deg, transparent 35%, rgba(255,255,255,.65) 50%,
    transparent 65%)`, `background-size: 250%`) slides across the pill left → right in **1.2s**, ease-in-out.
    It plays **3 times, 2.5s apart, when the pill lights up**, then stops. The glow stays. (One keyframe
    `op-sweep`: 3.7s cycle, the sweep in the first 32%, `animation-iteration-count: 3`. See `states.html`.)
  - "Lights up" = whenever the pill *enters* SHINING: the panel opens on Pixel while it's true, or work finishes
    while you're on Pixel's chat. Not again on re-renders.
  - Hover: glow grows to 18px. Press: `scale(.97)`, 80ms.
  - `prefers-reduced-motion`: no sweep, no scale. Sun pill + steady glow only.
- **Tap:** starts a new chat (see *After tap*). Name: **"New chat with Pixel"**.

### 3. DISABLED — work is running
- **When:** anything in the *blocks* list below is true.
- **Looks:** the IDLE pill at 45% opacity, `cursor: not-allowed`. One reason line under it:
  11.5px, weight 700, `rgba(255,246,233,.8)` (the `.op-status` colour), right-aligned, one line, ellipsis.
- **The reason line** — the first that's true wins:

  | What's going on | Line |
  |---|---|
  | Pixel is replying (thread busy) | `Pixel is replying` |
  | An agent waits on the user (open ask) | `Mira needs you` · 2+: `2 agents need you` |
  | Agents are working | `1 agent working` · `3 agents working` |
  | Studio work with no agent in this project | `The studio is working` |
  | A rebuild card in Pixel's chat waits for yes/no | `Answer the card first` |

  Use the agent's short name (`shortOf`) for one; a count for more. Pixel's own run counts as "Pixel is replying".
- **Tap:** nothing. Keep it focusable (`aria-disabled="true"`, not `disabled`) so keyboard and screen-reader users
  can hear why. Name: **"New chat — available when work finishes. 2 agents working"**. The reason line is
  `aria-hidden` (it's already in the name).
- **When the work ends**, the pill goes straight to SHINING and plays its 3 sweeps. That's the "it's ready" moment;
  no other signal needed.

### 4. AFTER TAP — the new chat opens
1. **Starting (≤ 1 frame to ~300ms):** pill text → `Starting…`, IDLE look, `aria-disabled`. No spinner.
2. **Done:**
   - The live log empties and shows the empty note (`.op-note`), one change of copy:
     **"New chat. Pixel still sees the board — say what you want built. Your last chat is in History."**
   - Focus moves to the composer (you came here to say something new).
   - Polite live region: **"New chat started. Your last chat is in History."**
   - The pill is now IDLE (chat is new). It shines again once there is a message and nothing is running.
   - The composer keeps any draft you had typed. (Typing then tapping shouldn't eat your words.)
3. **Refused (409, work started in between):** pill → DISABLED with the server's reason line. Nothing else changes.
4. **Error (network etc.):** pill returns to SHINING (no replay of sweeps); one line in the log:
   `Couldn’t start a new chat. Try again.` (`kind: 'error'` local note, like a failed send).

## Exactly when it shines (the rule)

`canStartNew(project) = !blocked && hasMessages`

**blocks** (any one → DISABLED):
1. **Pixel's thread is busy** (`Thread.busy`) — a turn is running.
2. **Any live session in this project:** a `RunningItem` with `projectId === pid` and `kind === 'session'`.
   That covers every agent (Pixel included), agents waiting on an ask (their run is still live), and studio work
   with no agent (`agentId: null`).
   - **Not counted:** `kind === 'app'` (the user's app — same rule as "Stop all agents" leaves it alone) and
     `kind === 'code'` on its own (code always hangs under a session, which already counts).
3. **An unanswered rebuild card in Pixel's live chat** (a message with `rebuild` offer still pending). Clearing the
   chat would hide a question the user hasn't answered.

**hasMessages:** Pixel's live chat has at least one message (user or Pixel) since the current chat started.
False → IDLE.

Not blocks (on purpose): goals sitting on the whiteboard but not running (queued, paused, stopped), filed reports,
unread mail. None of them is "an agent working"; a fresh chat doesn't touch them, and Pixel still sees the
board in every message.

The client decides the look from data it already has: `useRunning(pid, 5000)` in `OfficePage` (pass the items to
`Panel`), `t.data.busy`, the live `messages`, and `p.asks`. No new polling. **The server checks the same rule again**
on the tap and refuses with 409 if it's false, so a race can't cut work short.

## What happens to the old chat

- The old messages are **not deleted or moved**. A new chat just starts a new window over the same thread.
- **History** (Pixel's) lists past chats, newest first, one row per chat — not one row per turn:
  - **Title:** the chat's first user line, 1 line, ellipsis (fallback: `Chat with Pixel`).
  - **Preview:** its last line, 2-line clamp (the `.ch-row` look, unchanged).
  - **Meta:** when it ended (`2:14 pm` / relWhen) and `· 14 messages`.
  - The pinned **Current chat** row stays on top (spec-ux-chat-history §1).
- **Opening a past chat:** the existing PAST CHAT view (nav bar `‹ History` + `Back to chat`, `past chat` divider,
  same bubbles), **read-only**: where the composer would be, one quiet line —
  `Past chat. To pick it up, say it in your new chat.` Goal / report links in its bubbles still work.
- Pixel's per-turn runs no longer show as separate rows in **Pixel's** History (they're slices of one
  conversation). Other agents' History is unchanged.
- Before the first new chat ever, Pixel's History shows only the empty state — all earlier talk is still in the
  live chat, so nothing disappears on upgrade.

## Build notes (for Uncle Bob)

**Server**
- Table `thread_chats (id, project_id, agent_id, started_at, ended_at)` — one row per *closed* chat.
  The current chat's start = the newest `ended_at` for that (project, agent), or the beginning of time.
- `GET /projects/:id/threads/:agentId` returns only messages with `created_at >= current chat start`.
  `lastRunWithSession` uses the same window, so the first turn of a new chat starts a **fresh** model session
  with no recap (Pixel still gets the board summary on every turn). Also reset `thread_sessions`
  (`startedAt: now, rotate: false`).
- `POST /projects/:id/threads/:agentId/new` — director only (404 for others), runs `canStartNew`:
  - blocked → `409 { code: 'work_running', reason: '2 agents working' }` (the same reason line as the table)
  - no messages → `409 { code: 'chat_empty' }`
  - else insert the `thread_chats` row (`ended_at = now`), emit `thread.reset { projectId, agentId }`, return 201.
- `GET /projects/:id/threads/:agentId/chats` → `{ id, title, lastText, endedAt, messageCount }[]`, newest first;
  `GET …/chats/:chatId/messages` → that window's `ThreadMessage[]`.
- Put `canStartNew` + the reason table in one small module (e.g. `office/new-chat.ts`) used by the route and by
  the voice path, and test it on its own: each block alone, the app-only case, code-only case, empty chat.

**App**
- `NewChatPill` — its own component next to the History pill in `Panel.tsx`, props
  `{ state: 'idle' | 'shining' | 'disabled' | 'starting', reason?: string, onStart }`. State comes from one pure
  function `newChatState({ busy, running, asks, messages, pid })` → `{ state, reason }`, unit-tested per row of the
  table above. CSS in `chat-history.css` beside `.op-pill` (`.op-pill-new`, `.is-shining`, `.is-dim`, keyframes
  `op-sweep`, a reduced-motion override).
- On `thread.reset` for Pixel: drop the thread query and its `local` notes, reset the "lit up" memory so the next
  SHINING plays its sweeps.
- Panel's History for the director reads `…/chats` instead of `listAgentChats`; the PAST CHAT view gets a
  `readOnly` path (the quiet line instead of the composer).

## Voice path
- "New chat with Pixel", "start fresh", "clear the chat", "new session" → the same action, the same rule.
- Blocked → Pixel answers with the reason in words: "Two agents are still working — I can start fresh when they're
  done." Nothing is cleared.
- "Show my last chat with Pixel" → Pixel's History, first past chat open.

## Accessibility
- A real `<button>`; 44px hit area (`.op-pill`), ~28px visible pill.
- Names per state (above); `aria-disabled` keeps it in the tab order with its reason.
- Contrast: `#4a2600` on `#ffc24b` and cream on ink are AA here already. The dimmed pill is a disabled control
  (exempt), and its reason line is the readable `.op-status` colour.
- Focus ring: the existing `.op-pill:focus-visible` (3px sun outline, 2px offset) — on the sun pill use a cream
  outline so it shows.
- Motion: sweep only 3×, never looping; none under `prefers-reduced-motion`.

## Assumptions (guesses — check)
- People want a fresh chat mostly *after* a goal finishes, which is exactly when nothing runs. Check: count taps
  in SHINING vs. how often people tap the dimmed pill.
- Read-only old chats are enough. Check: do people try to type into a past Pixel chat?
- Three sweeps are noticed but not annoying. Check: ask the first few users if they saw it light up.
