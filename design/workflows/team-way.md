# "How this team works" while you build the team (final, locked)

User goal: *while putting a crew together, see how they'll work together, and keep it or change it,
without a separate trip.*

## The honest default
Today a team already works like this at run time (`server/src/crew/dispatch.ts`): the captain splits the
work, each member builds a part, the captain pulls it together and may send a part back. The default drawing
shows **exactly that**, so it adds no new sign-off runs and costs nothing extra. It's a picture of what
already happens.

**Captain checks all** (default shape):
- Starts here: the captain. Signs last: the captain.
- Hand-offs: captain → each other member ("their part"); each member → captain ("brings it back").
- No sign-off arrows (no gates). The captain pulling it together *is* the check, as today.
- Layout: captain left-middle, members stacked on the right in crew order.

**Pass it along**:
- Captain → 1st member → 2nd → … → captain, in crew order. Starts and signs last: the captain.
- At run time the parts run one after another in that order (server need S3).

The server derives the default (S2), so the drawing and the run can't disagree. It redraws on its own when
people join, leave or the captain changes. That stops once you adjust it: then it's **your own way**.

## Where
In the team panel (`TeamPanels.tsx`), **directly under Crew** (where `TeamWay` sits now, but shown much
earlier). Deleted: the foot line "The director briefs this team through its captain." The drawing now
shows it.

```
Crew 3/6
  ★ Ada · Captain        Lead dev           ›
    Elon                 Reviewer           ›
    Jony                 UI design          ›
  + Add to crew

How this team works                                            Adjust
( Captain checks all | Pass it along )
┌──────────────────────────────────────────────────────────────┐
│            ┌──→ (Elon) ──┐                                   │
│   ★(Ada) ──┤             ├──→ ★(Ada)                         │   ← WayThumb lg (one Ada node; the
│            └──→ (Jony) ──┘                                   │     two-way arrows bend apart)
└──────────────────────────────────────────────────────────────┘
Ada starts. Ada hands to Elon and Jony. They hand back to Ada. Ada signs last.
```

- **Heading row:** "How this team works" (zp-label) + **Adjust** (btn-glass, right). Adjust is the only
  button. The panel has no primary action (it auto-saves), and this one stays quiet.
- **Shape:** a two-option segmented control (the existing `Radios`), visible, not a menu: two choices
  don't need hiding. Picking one saves at once (team auto-save), and the thumb redraws.
- **Thumb:** `WayThumb lg`. Clicking it = Adjust.
- **Words line:** `inWords` from the server; it's also the thumb button's aria-label.

## States
| state | shows |
|---|---|
| 0 members | nothing (Crew's own empty line covers it) |
| 1 member | heading + line "Add one more and we'll sketch how they work together." No box, no Adjust. |
| 2+ members, not saved yet (no name) | heading + line "Name the crew and we'll sketch how they work together." |
| loading | heading + thumb skeleton (same height) |
| **default** | heading + Adjust + shape control + thumb + words |
| **own way** | heading + Adjust + thumb + "Your own way. " + words + **Back to the default** (zp-link). No shape control. |
| own way, a member not on it | an extra line under the words: "Ana isn't connected yet. **Connect**". Connect opens the editor with Ana's card selected |
| own way, a member removed | the server drops their arrows (S4). One line for this visit: "Removed Elon's 2 arrows." |
| own way emptied by removals | it returns to the default (S4); line: "Back to the default: nobody was left on your way." |
| save refused | the words line turns `--danger` with the server's message; Adjust opens with it pinned |
| load error | "Couldn't load this team's way." + Try again (zp-link) |

Back to the default → `PUT {workflow:null}`. No confirm: the default is one click away from being
re-adjusted, and the old own way is a single undo toast ("Back to the default. **Undo**", 6 s) which
re-PUTs it.

## Adjust
Opens the existing `FlowSheet` with this team's way. When it's the default, the canvas is pre-drawn with it
(nothing starts empty). People = the team's members. Members not on the drawing show as faint dashed cards
in their default spots, ready to connect (client only; they aren't saved until they have an arrow).
Saving → own way (`PUT /teams/:id/workflow {workflow}`), the sheet closes, the line says "Your own way."
Kicker in the sheet: `TEAM WAY · <team name>`.

## Voice path
"Make Builders pass work along" / "Builders: Elon checks everything Jony builds" → the director's existing
team tools edit it. No new screen.

## Removed (and why)
- The "▾ starting-shape" menu from the review → a visible two-option control. Two choices don't need a menu.
- "Draw it" / "Open drawing" on the team: the default is already drawn.
- Saving a way on a team that isn't saved yet: the default is derived, so nothing needs saving. A draft
  just says "Name the crew…".
- The foot line about the captain: the drawing says it.

## Tests
States table row by row (0, 1, unsaved draft, loading, default, own, unconnected, removed, emptied,
refused, error); the shape control saves and the thumb redraws; adding a member redraws the default but not
an own way; Back to the default PUTs null and Undo restores; Adjust opens pre-drawn; thumb aria-label is the
words line.
