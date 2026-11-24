# Home screen: My Workplace · Today · All other projects (design, Jony)

## User goal
"Get back to the project I'm working on in one click." Ranked:
1. Open a project I always come back to (pinned): every visit.
2. Open a project I was working on today: most visits.
3. Find any other project: now and then, usually by search.

Today's home misses goal 2. "On set today" holds every live or needs-input project, plus any idle one edited
this week. Agents keep projects "live" and "edited", so the shelf fills with projects the user didn't touch.
The user's rule: **Today = I sent a message or gave work today. Just opening a project doesn't count.**

## What's deleted, and why
- **"On set today" and "The back lot"** go. Two status-based shelves are replaced by three shelves built on what
  the user did.
- **The 7-day "edited recently" rule** (`isOnSet`) goes. Agent edits say nothing about the user's attention.
- **No "Today" for pinned projects.** A pinned project shows once, in My Workplace. It gets no extra "today" badge,
  because the user already put it there.
- **No settings.** There's no "how long is today", no choice of sort order and no way to hide a shelf. Today is
  the local calendar day. The sort orders below are fixed.
- **No pin menu and no confirm step.** Pinning is one tap and so is unpinning. Both are instant and undone by
  tapping again.
- **No empty "Today" placeholder.** An empty Today hides. A "Nothing today yet" line would sit there every
  morning and say nothing useful.

## Kept as they are
- Head ("＋ New project"), search (press `/`), **In setup** (drafts, only when there are any) and **Not adopted**
  (folded, at the bottom). They serve other goals and already behave well.

## Page order
1. Head + search
2. **My Workplace**: pinned projects, in the user's order
3. **Today**: unpinned projects the user worked in today, newest first
4. **In setup**: drafts (only when there are any)
5. **All other projects**: everything else
6. **Not adopted** (folded)

## Rules (pure; `app/src/features/projects/model.ts`)
- `pinned(p)` = `p.pinRank !== null`.
- `workedToday(p, now)` = `p.lastUserAt` is on or after local midnight of `now`. Use the client's clock and time
  zone, not a 24-hour window. At midnight Today empties into All other on the next 10-second refresh.
- `homeShelves(projects, drafts, q, now)` returns `{ workplace, today, drafts, rest }`:
  - `workplace`: pinned, sorted by `pinRank` ascending.
  - `today`: not pinned and `workedToday`, sorted by `lastUserAt` descending.
  - `rest`: neither. Sorted with **needs input** first, then **live**, then by `lastUserAt ?? updatedAt`
    descending, with **archived** last. A project waiting on the user stays near the top even when the user
    didn't touch it today. (The pager also flags it.)
  - Each project lands in exactly one shelf. Search filters all three the same way (`matchesProject`).

## What counts as "the user worked here" (server: `lastUserAt`)
`lastUserAt` = the newest of these, per project, or null:
- `thread_messages` with `sender = 'user'`. This covers a message to any agent in the office, a goal given to
  Pixel (recorded in `onPlanned`) and a design ask (recorded in `onDesigned`).
- `chat_messages` with `role = 'user'` and `json_extract(meta,'$.followUp') = 1`. This is a follow-up typed into a
  past chat. Other `role='user'` rows are briefs agents send each other, so they don't count.
- `asks` answered by the user (`answered_by IS NOT 'auto'`, `answered_at`). Answering an agent's question is
  sending it a message.

**Doesn't count:** opening the office, reading chats, visiting from the pager (`asks.seen_at`), an auto-answer, an
agent's own runs or briefs, status or progress changes, a goal Pixel files without a user message, editing the
project's name or picture.

## Pin data (server)
- `projects.pin_rank INTEGER NULL` (a migration), exposed as `Project.pinRank: number | null`. Null means not
  pinned. A deleted project takes its pin with it.
- **One route** does pin, unpin and reorder: `PUT /projects/pins { ids: string[] }`. It sets the whole ordered
  list. Ids that aren't in the list are unpinned and unknown ids are refused (404). It returns the updated
  projects.
  - Pin = the current list plus the id at the end. Unpin = the list without it. Reorder = the list in its new order.
- The app updates on the spot (optimistic) and rolls back with a toast ("Couldn't pin Sea GPS. Try again.") if the
  call fails.
- **Voice path:** Pixel gets a small `home_pins` tool later (read, pin, unpin) so "pin Sea GPS" works by voice.
  It's in phase 4, not needed for v1 to be useful.

## Layout

```
The Studio Lot
Every production, at a glance                               [＋ New project]
[🔍 Search projects…  (press /)]

My Workplace  3                                                       ──────
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│ ▣ Sea GPS        Live 📌│ │ ▣ HQ            Idle 📌│ │ ▣ Ledger   ❗Needs  📌│
│ Pixel · 5 agents        │ │ …                      │ │ …                      │
│ ☺☺☺☺ +1                │ │                        │ │                        │
│ ████████░░ 64% to v1.0  │ │                        │ │                        │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘

Today  2                                                              ──────
┌───────────────────────┐ ┌───────────────────────┐
│ ▣ Recipe box     Live ⌖ │ │ ▣ Sketchpad     Idle ⌖ │      (⌖ = pin, faint until hover/focus)
└───────────────────────┘ └───────────────────────┘

In setup  1 draft                                                     ──────
[draft card]

All other projects  14                                                ──────
▭ Health Analyst   edited 3d ago                 Needs input  ⌖
▭ Garden planner   edited 1w ago                        Idle  ⌖
▭ …

▸ Not adopted  4
```

- **My Workplace and Today** use the full card (`ActiveCard`): cast, progress, note. These are the projects the
  user is working in.
- **All other projects** uses the compact row (`BackLotCard`). It's a list for scanning and search.
- Shelf heads keep the existing pattern (`.shelf-head` with h2, count, hairline). Each shelf has one tone, so the
  page reads as one system:
  - My Workplace takes the existing `.active-shelf` look, as the top shelf.
  - Today uses the plain `.shelf` with the same full cards.
  - All other takes `.db-shelf`.
  - There's no new colour and no new type size.

## The pin control (one component: `PinButton`)
- **Where:** the top-right corner of every project card and row. It's a sibling of the card's button, not inside
  it (a button inside a button is invalid). Wrap each card in `.pcard-slot { position: relative }` and set the pin
  `position: absolute`. The status pill moves left by one pin width so the two never overlap.
- **Look:** a 16 px pin glyph (inline SVG, `currentColor`) in a 32×32 hit area. Phase 4 adds the drag behaviour
  and grows the hit area to 44 px while dragging.
  - Unpinned: 35 % opacity, full on card hover or focus. It's always findable and never noisy.
  - Pinned: full opacity, filled glyph, in the shelf's accent colour.
- **Act:** a click pins or unpins on the spot. The card animates to its new shelf with a 180 ms ease-out height
  and opacity change. With `prefers-reduced-motion` it moves instantly. Focus stays on the same pin button,
  which is now in its new shelf, so a keyboard user doesn't lose their place.
- **Accessibility:**
  - `aria-label="Pin Sea GPS"` or `"Unpin Sea GPS"`, plus `aria-pressed`.
  - A polite live region says "Sea GPS pinned to My Workplace" or "Sea GPS unpinned".
  - The hover title is the same as the label.
  - Contrast: the unpinned glyph at 35 % is decoration. The control is named and reaches full contrast on hover or
    focus, and the focus ring uses the existing `:focus-visible` style.
  - Tab order is card, then pin.

## Reorder (nice-to-have, phase 4)
- **Drag** a card inside My Workplace. The pointer has to move 6 px before a drag starts, so a click still opens
  the project. The drop gap is a 2 px accent line. Dragging out of My Workplace does nothing (unpin is the pin
  button's job).
- **Keyboard:** with a pinned card's pin button focused, `Alt+←/→` (and `Alt+↑/↓`) moves it one place. The live
  region says "Sea GPS moved to 2 of 3".
- Both send the full list to `PUT /projects/pins`.

## States
| State | What shows |
|---|---|
| Loading | The existing `Loading` ("Opening the studio lot…"). No skeleton shelves. |
| Error | The existing `ErrorState`. A failed pin call reverts the card and shows a toast. |
| No pins yet (no search) | A one-line hint where My Workplace would be: "📌 Pin the projects you keep coming back to. They'll stay up here." (`.hint`, no box). It goes away after the first pin and never comes back once pins exist. |
| Nothing today | Today is hidden: no header, no hint. |
| No other projects | All other projects is hidden. |
| All projects pinned or today | Only those shelves show. |
| Search, some shelves match | Only the shelves with matches show. The no-pins hint is hidden while searching. |
| Search, nothing matches | The existing "No production by that name" empty state. |
| No projects at all | The existing "No productions yet" empty state. |
| Midnight passes | On the next refresh, Today's projects move to All other projects. Pinned ones stay in My Workplace. |
| Project deleted while pinned | It leaves the list, and the others keep their order. |

## Checked against the user model
- Goal 1 (get work done without blocks): needs-input projects sort first in All other projects, and the pager
  still flags them.
- New observed behaviour, recorded: "Today" shows only real work (messages, goals, answers), and pins are the
  user's own shortlist.
- Assumptions (logged in `design/user-model.md`):
  - People pin 2–6 projects.
  - "Today" as a calendar day matches what the user means. Working past midnight is the case to watch.
  - Needs-input projects aren't missed in All other projects.
