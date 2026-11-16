# Quest Board: design notes (Blair → Jony)

The whiteboard grows into a **Quest Board**: the main storyline big and up top, quick side jobs pinned
underneath as small cards. It stays as easy to read as today's board: **who is on what, who finished
what, and what stopped and why**. Same card, same palette, same font, same status marks. Only the
layout and three new parts change.

- Mock, 1:1 at the card's 860 px width: `quest-board-mock.svg` (open it in a browser)
- Parts: `parts/quest-ribbon.svg`, `parts/quest-pin.svg`, `parts/quest-glyphs.svg` (`#fix`, `#look`, `#main`)
- Builds on `design/whiteboard-task-card.md`. Every rule there still holds for each row and card.

**Story.** The studio keeps one road everyone walks (the Main Quest) and a pinboard of errands
anyone can grab on the way (Side Quests). The banner says which road is the main one. The pins say
who took which errand.
**Feeling.** Brave on top (one big quest, one bold banner). Playful underneath (small tilted cards
with bright pins). Calm everywhere else: the frame stays quiet, so the status always shows first.

---

## 1. Layout, top to bottom

```
← Office
⚑ Quest Board                                        to v1.0  (42%)   ← compact project ring
MAIN QUESTS
┌──[ Main Quests & Side Quests ]═══════════════════════  Ships when done › ┐  ← ribbon overhangs left edge
│  60%  3 of 5 steps  ████████████░░░░░░░░                                 │
│  ●─ Design the quest board look                               (◉ Blair)  │  ← the trail
│  ●─ Server: tag each goal…                                (◉ Uncle Bob)  │
│  ◎┊ Build the quest board                          (◉ Jony) reviewing    │
│  !┊ Agents put main quests first               [Continue] [Drop]         │
│  ┊    Stuck: no new work after fresh starts.  Details ▸                  │
│  ○  Check it live                                                        │
└──────────────────────────────────────────────────────────────────────────┘
 ⚑ Agent performance                                   ████░░░░  40%  ›     ← other main quests, folded
 ⚑ Invite another                                      ████████  80%  ›
SIDE QUESTS                                                2 open · 1 stuck
 ┌─•──────────┐ ┌─•──────────┐ ┌─•──────────┐ ┌─•──────────┐                 ← pinned cards, slight tilt
 │🔍RESEARCH ◎│ │🔧FIX      ✓│ │🔧FIX      !│ │🔧FIX      ○│
 │Why do builds│ │Fix the pager│ │Free port   │ │Tidy the     │
 │stop at cap? │ │dot colour   │ │Couldn’t…   │ │issues list  │
 │◉ Elon       │ │◉ Pete       │ │Details ▸   │ │Waiting      │
 └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
 (✓ 4 side quests done today   ◉◉◉ Pete, Ava, Scarlett +1                Show ▾)
How we work →
```

### Header
- `⚑` = `#main` glyph (22 px) + **"Quest Board"** (h2, 22 px / 900, as today).
- The project **% ring moves to the header's right** and shrinks to 48 px (stroke 7, coral arc as today,
  the number at 14 px / 900). "to v1.0" sits left of it, with the ghost "Change target" link under that.
  Reason: the big ring was the board's hero. Now the Main Quest is. Two heroes compete.
- The old "In progress" features list is gone as its own block: those features **are** the main quests (§2).

### Main Quests
- Section heading `MAIN QUESTS` (the existing h3 style: 11.5 px / 900 / caps / ink-soft).
- **The open main quest** = the feature the running goal serves (today's `goal.featureId`; if none is
  running, the most recent goal's feature). Shown as one big white card (`#fff`, 14 px radius, 1 px `--line`):
  1. **Ribbon** with the feature's name (15 px / 900, ink on sun). It overhangs the card's left edge by
     14 px. That's the one thing pushed on this board. Clamp the name to 1 line with an ellipsis; full name in `title`.
     Clicking it opens the feature (as `ob-ships` does today).
  2. Right of the ribbon: the ghost chip **"Ships when done ›"** or **"Part of this quest ›"** (today's `ob-ships` text, shorter).
  3. **Quest progress**: big % (28 px / 900) + "3 of 5 steps" (13 px / 700, ink-soft) + a 10 px teal track.
     The % is the feature's `pct` (same number the old In progress row showed).
  4. **The trail**: today's task rows (same `TaskCard` anatomy: mark · title · person), but the marks
     sit on one vertical line drawn through their centres. It's 3 px wide: **solid teal** up to the
     last done step, then **dotted ink at 25 %** (`1 7` dash, round caps). Team sub-tasks stay indented
     under their step and do not sit on the trail.
  5. A stalled step carries the **Continue / Drop** buttons on its own row (right side, where the person
     would be). This replaces the stand-alone "Work stopped partway" bar for main quest steps. One stuck
     thing, one place.
- **Other main quests** (other `now` features): one folded 40 px strip each, under the big card.
  `#main` glyph · name (15 px / 800) · 200 px mini track · % · `›`. Click → the feature page.
  They don't open in place. One big quest at a time keeps the "main" in Main Quest.
- Empty: the big card shows only the ribbon in its empty form (sun at 35 %, dashed outline) with the text
  **"No main quest yet. Tell {dir} what to build."**

### Side Quests
- Heading `SIDE QUESTS` with a quiet count on the right: **"2 open · 1 stuck"** (open = to do + in progress; leave out zero parts;
  "All done" when nothing is open).
- **What's a side quest** (this is my guess from the feature brief; Jony/Bob own the real rule): a goal
  that serves no feature. That covers quick fixes, short research jobs (report items), and work handed
  over with `work: true`.
- A responsive grid: `repeat(auto-fill, minmax(180px, 1fr))`, 16 px gap. One column under 600 px.
- **One card** (≈190 × 124, white, 10 px radius, 1 px `--line`):
  - **Pin** (`parts/quest-pin.svg`), centred on the top edge, half off the card.
    Colour: sun-deep = open · teal = done · coral = stuck · ink-soft at 40 % = dropped.
    This repeats the mark's status on purpose: you can read the pin from across the room.
  - Top row: **kind glyph** (`#fix` for building, `#look` for research; 14 px) + kind word in caps
    (10.5 px / 900, ink-soft): `FIX` / `RESEARCH`. Then the **status mark**, top right, same marks as the
    task card but 16 px.
  - **Title**: 14 px / 700, 2 lines max. Done = ink-soft.
  - Bottom: **person** (22 px face + first name). Running = who has it now (+ `reviewing` / `sent back 2×`
    words as on the task card). Done = who finished it. To do = the word **"Waiting"** (ink-soft).
    Stuck = no person.
  - **Stuck** cards: border goes coral at 55 %, the plain `problem.message` replaces the person line
    (12.5 px / 600, `#a3242c`, 2 lines max), and **Details ▸** opens the raw note in a popover under
    the card (same mono box as today, max 160 px). The section's own **Continue / Drop** bar
    (today's `StoppedBar`) stays above the grid, but only counts stuck side quests.
  - **Tilt**: cards alternate −1.2°, 0.8°, −0.6°, 1.2° (by index, mod 4). They straighten to 0° on
    hover and focus. That tiny wobble is all the "game" the cards need; text stays crisp at this angle.
    No tilt with `prefers-reduced-motion` or under 600 px.
- **Finished side quests fold away.** Done cards stay pinned for the rest of the hour they finished in,
  so you see "Pete just did that". Older ones fold into one teal strip (teal at 14 %, full radius):
  **"✓ 4 side quests done today · ◉◉◉ Pete, Ava, Scarlett +1 · Show ▾"**. *Show* unfolds them as
  the same cards, done style. Who finished what stays one click away and never disappears.
- Empty: **"No side quests. All quiet."** (ink-soft, 14 px).

### Footer
"How we work →" unchanged.

---

## 2. Status: nothing new to learn

| State | Mark (row & card) | Pin (side card) | Trail segment after it | Words |
|---|---|---|---|---|
| To do | empty ring | sun-deep | dotted | "Waiting" (cards only) |
| In progress | sky ring + dot, soft sky halo | sun-deep | dotted | person (+ reviewing / merging / sent back N×) |
| Done | teal tick | teal | solid teal | person who finished |
| Stuck / failed | coral `!` | coral | dotted | `problem.message` in `#a3242c` + Details |
| Dropped | grey dash | ink-soft 40 % | dotted | soft-ink message |

The marks, colours, words and screen-reader phrases are exactly those in `design/whiteboard-task-card.md`.
The quest look is a frame around them. It never replaces them.

## 3. Parts (each its own file, no dependencies)

| Part | File | Story | Feeling | Size / anchor |
|---|---|---|---|---|
| Quest ribbon | `parts/quest-ribbon.svg` | The banner the studio hangs over the one thing everyone is building. | proud | 44 px tall. Tails are fixed 28 px end caps, only the band stretches (draw the tails as `::before/::after`, or 9-slice). Anchored top-left, x −14 px past the card edge. |
| Quest pin | `parts/quest-pin.svg` | Whoever takes a quick job pins it up. It turns teal when it's done, coral when it's stuck. | playful | 20 × 22, colour via `--pin`. Centre on the card's top edge, at y −6 px. |
| Kind glyphs | `parts/quest-glyphs.svg` | `#fix` the fixer's pocket wrench · `#look` someone went to look it up · `#main` the flag on the main road. | handy · curious · brave | 16 px grid, drawn at 14–22 px. Ink-soft (`#main` ink + sun-deep). Same family as the Cast's wrench and magnifier tools. |

Colours used (all existing tokens): sun `#ffc24b` + sun-deep `#ff9b3d` (warm, the quest), coral (stuck),
teal (done), **sky as the one cool accent** (now / you are here), ink / ink-soft, cream stitch, paper
`#fdfcf7`. **No new colours, no new font, no textures.** Parchment, wood and scroll clichés stay out. The
fantasy comes from shape (banner, pins, trail), not from borrowed game art.

## 4. Motion (all off with `prefers-reduced-motion`)
- **Ribbon unfurls** as the card fades in: `scaleX .92 → 1`, origin left, 260 ms, `--spring`.
- **You-are-here halo**: the in-progress waypoint's sky halo breathes (`scale 1 → 1.15`, opacity
  .18 → .08, 1.8 s, ease-in-out, infinite). It's the only looping motion on the board.
- **Step done**: the mark squashes and pops (`scale 1.25/.8 → .9 → 1`, 220 ms), and the solid teal
  trail grows down to it (stroke-dashoffset, 300 ms).
- **New side quest pinned**: card drops 8 px with a small overshoot. The pin squashes (`scaleY .8`)
  on landing, 180 ms.
- **Side quest done**: the pin flips sun-deep → teal with a quick bounce. When it later folds into the done
  strip, it fades without sliding (nothing jumps under the reader's eye).

## 5. Readability checks
- **Contrast**: ink on sun ≈ 10:1 · ink-soft on paper ≈ 7:1 · `#a3242c` on white ≥ 4.5:1 · cream
  stitch is decoration only. Status is never shown by colour alone: the mark shape and the words carry it.
- **Smallest size** (one column, 320 px wide): the ribbon clamps to one line; the trail stays; side cards go
  full width with no tilt; the pin and mark still read at 16 px. The project ring stays 48 px.
- **Hardest cases checked in the mock and on paper**: a 120-character quest name (ellipsis on the ribbon,
  full name in `title`) · a main quest with 0 steps ("No steps yet. {dir} writes them here as the plan
  takes shape.") · 12 steps (the trail just grows; no inner scroll) · 3 stuck items at once · team
  step with 3+ faces · a person who left the studio (default face, "Someone who left") · a side quest
  with no kind (no glyph, no kind word) · 0 main + 5 side quests · an old server without main/side tags
  (everything shows as today's Tasks list under the main card, no side section).
- **Screen readers**: `MAIN QUESTS` and `SIDE QUESTS` are real `h3`s with ids (`aria-labelledby`, as
  today). The ribbon is the quest's name as a real heading-level button: "Main quest: Main Quests & Side Quests,
  60 %, 3 of 5 steps". Trail, pins, glyphs and tilt are `aria-hidden`. The kind word is text. Each card
  starts with the task card's phrase, plus its kind: "Side quest, fix. Stuck: Couldn’t start…".
- **Keyboard**: tab order goes ribbon → steps' Details / Continue / Drop → folded main quests →
  side cards (each card is one focus stop, Details inside it) → done strip's Show → How we work.
  Focus ring = 3 px grape, as everywhere on the board.

## 6. What changed vs. today, and why
- **Big ring → compact header ring.** The project's % still shows, but it stops competing with the quest.
- **"In progress" list → Main Quests** (one open + folded strips). It's the same data, now with a story.
- **"Tasks" list → the trail** for main quest steps **and** pinned cards for side quests.
  It's the same row anatomy, so who/what/why reads exactly as before.
- **"Work stopped partway" bar** → Continue / Drop on the stuck step itself (main), or above the grid (side).
- **Added**: ribbon, pins, kind glyphs, done-today strip. **Not added**: XP, levels, loot, scores, quest
  icons per feature. They're fun once, then noise. Clear beats clever.

## 7. For HQ (idea only, not part of this build)
Later, a pin could take the colour of the agent who took the quest (their Cast hue), so the board
would match the people in the room. It needs no new slot, but the pin would no longer show status, so the mark alone
would carry it. I'm leaving it out for now on purpose.
