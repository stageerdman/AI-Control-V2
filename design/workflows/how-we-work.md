# How we work: the drawing is the page (final, locked)

User goal: *see how this office hands work on and who checks it; change it when it's wrong.*
Ranked: see it (often) > change it (sometimes) > switch between ways (rarely).

## Ways in (three, all visible, no text links)
1. **Quest Board header.** At the right end of the header, after the % ring:
   `[ WayThumb sm ]  How we work`. One button (thumb + label), 44px tall hit area.
   aria-label: `How we work: <inWords of the first way>`. Opens `#office/<pid>/how`.
   Narrow widths (< 560px): it wraps to its own row under the header, left-aligned.
2. **A goal's workflow chip.** On a main card or side card, the chip (shown only when the goal isn't on the
   usual way) becomes a button. It opens `#office/<pid>/how/<wayId>` for a stable way, or
   `#office/<pid>/how/goal-<goalId>` for a temporary one. aria-label: `Open the way: <name>`.
3. **Voice:** "show me how we work" → the director's answer links the same route (no new tool).

Deleted: the grey "How we work →" link at the bottom of the board; the office scene's second hotspot from the
review (one object, one spot: the thumb in the board header is the signpost, and it's one hop from the
whiteboard).

## The page
```
┌ ← Quest Board ───────────────────────────────────────────────────────┐
│ How we work                                                  [ Edit ] │
│ OFFICE WAY · every goal unless Pixel picks another                    │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │      (Uncle Bob) ──→ [Builders ▣] ──→ (Ada)                        │ │
│ │                          ╲              ┊✓ review                  │ │
│ │                           ╲────────→ (Elon) ✓ signs last           │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ Uncle Bob starts. He hands to Builders, … Elon signs last.            │
│ Show as a list                                                        │
│                                                                       │
│ Other ways    [▫ Hotfix]  [▫ Research]     Just for one goal  [◌ Q4]  │
│ ───────────────────────────────────────────────────────────────────── │
│ Ask Pixel to change how we work…                              [Send]  │
└───────────────────────────────────────────────────────────────────────┘
```

**Order, top to bottom:** Back · title row (h2 "How we work" + the one action, right) · kicker · canvas ·
words line · "Show as a list" · Other ways row · ask field + its reply bubble.

- **Back:** "← Quest Board" (it's where every way in starts). Esc does the same.
- **Kicker** (one line, small caps style, `--ink-3`, same spot every time):
  - first office way: `OFFICE WAY · every goal unless <Director> picks another`
  - another office way: `OFFICE WAY · <name> · for <when>`
  - temporary: `JUST FOR THIS GOAL · <goal text, 60 chars> · ends when it ships` and the canvas frame is
    dashed.
- **Canvas (view mode):** the existing `WorkflowEditor` with a new `mode="view"`. Zoomed to fit, same
  faces/arrows/labels/badges, no toolbar, no node dragging, no selection. Nodes are not tab stops in view
  mode (the list is the keyboard path). Height: 360px desktop, 260px under 560px.
- **Words line:** `inWords` (server). It is also the canvas's `aria-describedby`.
- **Show as a list:** a quiet toggle. Folded by default for pointer users. Open by default when the page
  was reached by keyboard (the last input was a key press). The list is always in the accessibility tree
  (folded = visually hidden, not `display:none`).
- **Other ways row:** hidden when there is only one way and no running temporary one. Each way: WayThumb md
  + its name under it (one line, ellipsis). The shown way has a 2px `--ink` ring and `aria-current="true"`.
  Clicking swaps the canvas and replaces the URL id (no new history entry). Temporary ones sit in their own
  group, labelled "Just for one goal", dashed. Arrow keys move along the row (one tab stop).
- **Ask field:** unchanged (the second way to change it, and the only way to add or remove a whole way).

**The one action:**
- office way, view → **Edit** (hero button).
- temporary way → no button. The kicker's line ends "· ask <Director> to change it", and the ask field is
  right there.
- nothing drawn → no Edit in the title row. The canvas shows its empty state with one centred hero button
  **Draw how we work** (goes straight into edit mode).

## Edit mode (in place, not a sheet)
- The same canvas becomes editable (`mode="edit"`): toolbar, dragging, connecting, as today.
- Title row: **Save** (hero) + **Cancel** (ghost) replace Edit.
- The Other ways row and the ask field fold away (one task at a time); the list opens.
- Save ok → back to view, "Saved ✓" fades next to the title for 1.5 s, the board thumb updates (event).
- Save refused → stay in edit, problems pinned to their arrow / node (as today), focus to the first one.
- Leaving with unsaved changes (Back, Esc, Cancel, another way in the row, route change) → the existing
  inline ask: "This way isn't saved. **Keep editing** · Discard".
- `FlowSheet` stays only where a sheet is right (the team panel's Adjust).

## States
| state | what shows |
|---|---|
| loading | title, kicker skeleton, canvas skeleton at full height |
| error | "Couldn't load how this office works." + **Try again** (in place of the canvas) |
| never designed | kicker for the first way; empty canvas: "Nothing drawn yet. <Director> briefs each team's captain and nobody signs off." + **Draw how we work** |
| unknown id in the URL | show the first way, no error (the way was removed) |
| temporary goal ended while open | canvas stays; kicker ends "· this goal has ended"; the row drops it on the next visit |
| someone else saved while you view | canvas redraws (crossfade). While you edit: a quiet line "Changed by <Director> meanwhile. Your save replaces it." (no merge) |

## Removed (and why)
- `WorkDesign` chips on this page: a second picture of the same way. (`WorkDesign` stays in setup's team step.)
- "Draw it / Open drawing / View drawing" links: the drawing is the page.
- The `FlowSheet` for office ways: editing happens where you were already looking.
- "Usually / Right now" sub-titles: the kicker says it.
- Words "workflow / drawing / gates" in labels. The UI says "way". (Code names stay.)

## Tests
Board header button opens `how` and its aria-label carries the words; the bottom link is gone; the chip is a
button and opens `how/<id>` (and `how/goal-<id>` for temporary); `how/<unknown>` shows the first way;
view mode has no toolbar and no node tab stops; Edit → edit mode, Cancel with changes asks; Save ok → view
+ Saved; a 409 stays in edit with the problem pinned; temporary has no Edit; empty state's button enters
edit; the row swaps the canvas and sets `aria-current`; the list folds and is still in the a11y tree.
