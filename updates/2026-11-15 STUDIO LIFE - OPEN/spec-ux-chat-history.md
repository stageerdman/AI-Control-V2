# Chat history in the side panel — layout & build notes

**Goal.** Open a chat with an agent in the right-side panel exactly as today. A **History** button on
top shows every earlier chat with that agent. Tap one to read it (and keep writing). One tap gets you
back to the chat you were in.

**Feeling:** cozy and sure-footed — "my old conversations are right here, and I can't get lost."

**What exists (reuse, don't rebuild).**
- `Panel.tsx` — the live thread (header `.op-head`, log `.op-log`, composer `.op-composer`).
- `ChatHistorySheet.tsx` — already has `ChatList` (runs from `officeApi.listAgentChats`) and `ChatView`
  (read a run + keep writing). Today they live in a modal Sheet. **Move them into the panel**, no new
  data, no new endpoints. `ChatSummary` already carries `task`, `startedAt/endedAt`, `status`,
  `lastText` — everything a row needs.

---

## 1. Three views, one panel

The panel keeps its header (portrait, name, role, status) in every view so you always know *who*.
Only the body under the header swaps. A thin **nav bar** appears under the header in the two history
views; it is the only new piece of chrome.

```
 LIVE (today, + one button)        HISTORY (list)                    PAST CHAT (one run)
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│ [bot] Mira    [🕘 History]│   │ [bot] Mira               │   │ [bot] Mira               │
│ Builder · Core  [← Pixel]│   │ Builder · Core           │   │ Builder · Core           │
│ 🔨 Fixing the login      │   │ 🔨 Fixing the login      │   │ 🔨 Fixing the login      │
├──────────────────────────┤   ├──────────────────────────┤   ├──────────────────────────┤
│                          │   │ ‹ Back to chat   History │   │ ‹ History  [Back to chat]│
│   them ▢▢▢▢▢             │   ├──────────────────────────┤   ├──────────────────────────┤
│            ▢▢▢▢ me       │   │ ● NOW  Current chat      │   │ Fix the signup form      │
│   them ▢▢▢               │   │   "Sure, on it — the…"   │   │ Yesterday · Stopped      │
│                          │   │ ──────────────────────── │   │ ─── past chat ───        │
│                          │   │ TODAY                    │   │   them ▢▢▢▢▢             │
│                          │   │  Fix the signup form     │   │            ▢▢▢ me        │
│                          │   │  "I moved the check to…" │   │   › Used tools  4        │
│                          │   │  2:14 pm                 │   │   them ▢▢▢               │
│                          │   │ YESTERDAY                │   │                          │
│                          │   │  Add dark mode    Stopped│   │                          │
│                          │   │  "Paused before the…"    │   │                          │
├──────────────────────────┤   │                          │   ├──────────────────────────┤
│ [Message Mira…]   [Send] │   │   (no composer here)     │   │ [Continue this chat…][Send]│
└──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

### LIVE — exactly today, plus History
- Add one pill, **History** (small clock glyph + the word; the word is required, the glyph is
  decoration `aria-hidden`). Same style as `.op-backpix` (cream on 10% white, 999px radius).
- Placement: top-right of `.op-head`. For non-directors the existing `← Pixel` pill moves to sit
  **under** it (stacked, right-aligned, 6px gap) so the name never gets squeezed. Director: History only.
- Shown for every agent, director included. Never hidden when there's no history (empty state is
  honest and cheap; a vanishing button is confusing).
- Tap target ≥ 44px (pad the hit area; the visible pill can stay ~28px tall).

### HISTORY — the list
- **Nav bar** (new, `.op-nav`): left `‹ Back to chat` (quiet text button, `.ch-back` style), right a
  small uppercase label `History` (`.ch-sub` style). Cream background, 1px `--line` bottom border, 48px tall.
- **First row, pinned: "Current chat"** — sun-tint card (`rgba(255,196,0,.14)`, `--sun-deep` 2px ring),
  a `Now` tag, and the last line of the live thread as preview. Tapping it = Back to chat. A second,
  bigger way home, right where your eye already is.
- Then the past runs, **newest first**, grouped under small day labels: `Today`, `Yesterday`, weekday
  for this week (`Tuesday`), then `Nov 3` / `Nov 3, 2025` for older. Day label style = `.ch-sub`.
- **Row** (reuse `.ch-row`, white card, 14px radius, min 56px):
  1. **Task** — bold, 1 line, ellipsis (`ch-row-t`, clamp 1 here, not 2; the panel is narrow).
  2. **Preview** — `lastText`, quotes off, ink-soft, 2-line clamp, 13.5px. Strip markdown to plain text.
     If `lastText` is null: show nothing (don't invent a line).
  3. **Meta** — time (`2:14 pm` within today/yesterday, otherwise relWhen) + status tag from
     `STATUS_TAG` (`Still working`, `Didn’t finish`, `Stopped`; nothing for succeeded).
- No composer in this view. No search, no filters, no delete. (Cut until someone asks.)
- Loading: the existing `Placeholder` lines, label `Finding their chats…`. Error: existing `ErrorRow`.

### PAST CHAT — reading one run
- **Nav bar:** left `‹ History` (back one step), right a **`Back to chat`** sun pill (`variant="hero"`,
  small). Two exits, both visible, no guessing.
- Under it: task (bold) + `when · status` meta — reuse `ChatView`'s `.ch-head` minus its own back
  button and `h2` (the panel header already says who).
- A soft divider label `past chat` at the top of the log so it can never be mistaken for the live
  thread. Bubbles reuse `.ch-msg` (same look as the live log — me right/sun, them left/white).
- Composer: as `ChatView` today (keep writing into that run), placeholder **`Continue this chat…`**
  (not `Message Mira…`, so it reads differently from the live composer). Running run → the existing
  `Still working` note instead of a composer.

---

## 2. Empty history

Shown in the HISTORY view when `listAgentChats` returns `[]`. The pinned *Current chat* row still
shows on top (if the live thread has any messages), then:

```
│ ● NOW  Current chat              │
│                                  │
│          (  🕘  )                │   ← 48px cream circle, ink-soft clock, flat, no outline
│   No past chats with Mira yet    │   ← 15px bold, ink
│   When they finish a task, it’ll │   ← 13px, ink-soft, max 2 lines
│   show up here.                  │
│                                  │
│        [ Back to chat ]          │   ← hero button
```

Copy (add to `CHAT_COPY`):
- `historyTitle: 'History'`
- `backToChat: 'Back to chat'`
- `current: 'Current chat'`, `now: 'Now'`
- `emptyTitle: (short) => 'No past chats with ${short} yet'`
- `emptyBody: 'When they finish a task, it’ll show up here.'`
- `continuePh: 'Continue this chat…'`
- `pastDivider: 'past chat'`

---

## 3. Behaviour

- **State lives in the panel:** `view: 'live' | 'history' | { run: ChatSummary }`. Reset to `'live'`
  whenever the panel switches agent (click another robot). The live thread keeps polling/receiving
  `thread.message` events while you browse — nothing pauses.
- **New message in the live thread while you're in history:** the *Current chat* row's preview
  updates, and the `Back to chat` control gets a small coral dot (`aria-label` adds
  ", new message"). Never auto-jump you back.
- **Esc** steps back one level: past chat → history → live. In live, Esc keeps today's behaviour
  (non-director → director).
- **Focus:** opening History focuses the first row; opening a run focuses the composer (as `ChatView`
  does); going back restores focus to the control you came from (History pill, or the row you opened).
- **Mobile drawer** (`max-width` layout): tapping History raises the drawer (`drawer-up`) first.
  The nav bar stays visible when the drawer is down (it replaces the composer line in history views).
- **Asks** (`!` cards) only live in the live thread. If one is pending, the *Current chat* row shows
  the coral `❗ Needs you` tag instead of `Now`.
- **The modal `ChatHistorySheet`** (opened from the recap's *Open chat*): keep the component, but
  point *Open chat* at the panel's PAST CHAT view instead, so there is one history, in one place.
  The Sheet can be deleted once nothing opens it.

## 4. Voice path
- "Show my history with Mira" / "Mira's old chats" → open Mira's panel in HISTORY.
- "Back to the chat" / "go back" → one step back (same as Esc).
- "Open the signup chat" while in HISTORY → best title match; if two match, ask which.

## 5. Accessibility checklist
- History pill: a plain `<button>` named by its visible word (no `aria-expanded`/`aria-pressed` —
  it's navigation; moving focus to the list is the feedback).
- List: `<ul>` with day groups as `<li role="presentation"><h3>`; each row a `<button>` whose name is
  task + preview + when + status (the natural text order already reads this way).
- Contrast: ink on white, ink-soft on cream, brown `#4a2600` on sun — all already AA in this codebase.
- Live region: on entering HISTORY announce nothing extra (focus move speaks); the coral dot change
  is announced politely: "New message from Mira".
- `prefers-reduced-motion`: view swaps are instant; otherwise a 160ms slide (list slides in from the
  right, back slides out to the right — direction = depth, so the motion explains itself).

## 6. What it should feel like at a glance
One quiet pill on top, one bar when you're away, and a sun-yellow way home that's always on screen.
The live chat is the warm center; history is the cozy drawer next to it — never a different place.
