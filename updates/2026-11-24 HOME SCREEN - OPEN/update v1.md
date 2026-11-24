# Home Screen: Pinned & Today — v1

## Goal
Rework the Projects home into three shelves the user controls:
1. **My Workplace** holds the projects the user pins by hand. It sits at the top and keeps the user's order.
2. **Today** holds only projects where the user sent a message or gave work today. Just opening one doesn't count.
3. **All other projects** holds the rest.

A pinned project shows only in My Workplace, never twice. Empty shelves stay tidy.

Feature: `f-home-screen-pinned-today`. The full design is in [design.md](design.md).

## Where we start (master, 2026-11-24)
- `app/src/features/projects/ProjectsPage.tsx` shows four shelves: In setup, **On set today**, **The back lot** and
  Not adopted. `model.ts › shelves()` splits them with `isOnSet`, which puts a project in On set if it's live,
  needs input, or is idle and was edited in the last 7 days. That rule has nothing to do with what the user did.
- `Project` has no pin and no "user last worked here" field.
- The user's own words are already stored, so nothing new needs recording:
  - `thread_messages.sender='user'`: office chat, goals and design asks.
  - `chat_messages` with `role='user'` and `meta.followUp`: follow-ups in past chats.
  - `asks` that weren't answered automatically.

## Design notes (summary; details in design.md)
- **Deleted:**
  - The "On set today" and "The back lot" shelves, and the 7-day edited rule.
  - Any "today" badge on pinned cards.
  - Settings, sort options and the confirm step on pin.
  - An empty "Today" placeholder.
- **One control**, a pin in the top-right of every card and row. It's faint until hover or focus, and solid when
  pinned. One tap pins or unpins on the spot, and focus follows the card to its new shelf.
- **One route**, `PUT /projects/pins { ids }`. It sets the whole ordered list, so pin, unpin and reorder are the
  same call.
- **Today** = the user's last message, goal or answer falls on the local calendar day. It's sorted newest first.
- **All other projects** sorts needs input first, then live, then most recent. Archived projects go last. A
  project waiting on the user is never buried.
- **Empty shelves:**
  - Today and All other hide when they're empty.
  - With no pins, My Workplace shows one quiet hint line instead: "📌 Pin the projects you keep coming back
    to. They'll stay up here."
- In setup and Not adopted stay as they are.

## Roadmap

### Phase 1: Server: pins and `lastUserAt`
- Migration: `projects.pin_rank INTEGER NULL`.
- `Project.pinRank: number | null` and `Project.lastUserAt: string | null` (newest of the three sources above),
  computed in the projects list query. One SQL subquery per source; the existing indexes cover it.
- `PUT /projects/pins { ids }` sets the order: unlisted projects are unpinned, an unknown id gives a 404, and it
  returns the projects. Emits the usual project-changed event so other views refresh.
- **Tests** (`server/test/projects/home-pins.test.ts`):
  - pin, unpin, reorder and empty list
  - an unknown id is refused
  - a deleted project drops out of the order
  - `lastUserAt` moves on a user thread message, a goal, a chat follow-up and a user-answered ask
  - `lastUserAt` does **not** move on: opening the office or a pager visit (`seen_at`), an auto-answer, an agent
    brief (`chat_messages` role user without followUp), an agent reply, a status or progress change, or a goal
    Pixel files without a user message

### Phase 2: App model: three shelves, pure
- `app/src/api/types.ts`: `pinRank`, `lastUserAt`. `studio.projects.setPins(ids)`.
- `model.ts`:
  - `workedToday(p, now)`, using local midnight
  - `homeShelves(projects, drafts, q, now)` → `{ workplace, today, drafts, rest }`, with the sort rules in
    design.md
  - Remove `isOnSet` and `shelves`.
- **Tests** (`model.test.ts`):
  - each project lands in exactly one shelf, and a pinned project that was worked on today stays in workplace only
  - midnight edge: 23:59 yesterday goes to rest, 00:00 today goes to today
  - the rest sort: needs, then live, then recent, with archived last
  - search filters every shelf
  - pin order is kept

### Phase 3: App UI: shelves and the pin
- `ProjectsPage.tsx`:
  - My Workplace, Today, In setup, All other projects, Not adopted
  - full cards for the first two and compact rows for the rest
  - the empty-state rules from design.md
- `PinButton.tsx`, one reusable component:
  - a sibling of the card button inside `.pcard-slot`
  - `aria-pressed`, a named label, a live-region message, focus follows the card
  - an optimistic update that rolls back with a toast on failure
  - 180 ms move, none under reduced motion
- **Tests** (`ProjectsPage.home.test.tsx`):
  - shelves render from data
  - pin moves a card to My Workplace and unpin moves it back to Today or All other
  - a failed pin reverts the card and shows the toast
  - the no-pins hint shows, then hides after the first pin
  - an empty Today and an empty All other hide
  - keyboard: Tab reaches the pin, Enter or Space toggles it, focus is kept
- **Live check:** run the app against a scratch server. Send a message in one office, then check it lands in
  Today. Opening another office must leave that one in All other. Pin one, reload, and check it's still pinned.

### Phase 4: Reorder and voice (nice-to-have)
- Drag inside My Workplace, starting after 6 px of movement so a click still opens the project. `Alt+Arrow` on a
  focused pin. Both send `PUT /projects/pins`, and the live region says "moved to 2 of 3".
- Pixel tool `home_pins` (list, pin, unpin) so "pin Sea GPS" works by voice.
- **Tests:**
  - reorder by keyboard and by pointer (a simulated drag), and a short move still counts as a click
  - the tool's pin and unpin go through the same route

## Status
- [x] Roadmap and design (this file, [design.md](design.md)); user model updated.
- [x] Phase 1: server pins + `lastUserAt` (migration 56, `src/home/user-activity.ts`, `PUT /projects/pins`;
  tests in `server/test/home/`). Decided: `last_user_at` is a stored column stamped by an allowlist of the user's
  HTTP actions, backfilled once from the user's words on record. See wiki.
- [ ] Phase 2: app model
- [ ] Phase 3: app UI + pin
- [ ] Phase 4: reorder + voice (nice-to-have)
