# Workflows: critical UX review + team-creation step (Nov 2026, build 423073d)

User goal: "Decide who hands work to whom and who checks it, then trust the studio to follow it."
Trigger: the user couldn't find the diagram.

## Verdict: redesign the way in and the page around it; polish the editor

The editor works: a clean canvas, two arrow styles, a keyboard path, errors pinned where they belong.
What's broken is everything around it. The diagram sits behind a small link on a page that already
shows the same workflow a second way (chips). It's called five different things. On teams it shows up
only after the moment you'd want it. Polishing won't fix that. The entry and the "How we work" page
need rebuilding around the drawing. The canvas stays.

## Problems, worst first

1. **Can't find it.** Office → Whiteboard → small grey "How we work →" at the bottom of the Quest Board →
   a text link "Draw it" / "Open drawing" under a chip summary. Three hops, the last two styled as
   minor links. Nothing in the office scene points there.
2. **Two pictures of one thing.** The How we work card shows chips (`WorkDesign`). The drawing shows
   arrows. Same data, two looks, and the chips come first. When gates exist the link still says "Draw it",
   which makes it sound like nothing has been set up yet.
3. **Teams get it too late.** `TeamPanels.tsx:340` shows "How this team works" only once the team is
   saved *and* has a member. It's at the bottom, under the coding rules. While you create a team (the moment
   you're thinking about how the crew works together) it isn't there at all.
4. **Five names.** How we work · workflow · way · drawing · gates/sign-offs/reviews. Users can't tell
   that "the Builders way", "How this team works" and the drawing are the same idea.
5. **The three types look identical.** Office, team and one-goal all open the same sheet. Only the title
   differs. Nothing says what it's for, when it applies, or why one is read-only.
   The goal card's workflow chip (`WorkflowChip.tsx`) can't be clicked, so you can't get from a goal to the
   way it's running on.
6. **Connecting takes four steps.** Select a card → "Connect to…" → pick a card → fill the arrow form
   ("Why" required, sign-off kind dropdown). Nothing is drawn by dragging. A new user has to read the hint
   line to start.
7. **Empty start is a dropdown.** "Start with who picks the work up first" plus a `<select>`. For a team we
   already know who's on it, so we could draw it for them.
8. **Heavy bottom.** The arrow list repeats the canvas at full size under it. Good for keyboard and screen
   readers, noisy for everyone else.

## Proposal A: office entry point

Delete: the chip summary on How we work, the "Draw it / Open drawing" links, the Back-to-Whiteboard hop.

- **The drawing is the page.** "How we work" opens straight onto the office way's canvas (read view,
  zoomed to fit), with Edit as its one action. The "Ask Pixel to change it" field stays underneath as
  the second way to change it.
- **Easy to find.** The office scene's whiteboard gets a second, labelled spot: "How we work". The Quest
  Board header gets a small live thumbnail of the drawing (faces + arrows, no text) that opens it. A
  picture of arrows tells people what's behind it better than a text link does.
- **Other ways underneath.** Other stable ways and "Just for one goal" ones sit as a row of small
  thumbnails under the main canvas. Click one to swap the canvas.
- **Goal chip opens its way.** The workflow chip on a goal card becomes a button that opens that drawing.
- **One kicker says the type**, top of the sheet, same spot every time:
  `OFFICE WAY · every goal unless Pixel picks another`
  `TEAM WAY · Builders`
  `JUST FOR THIS GOAL · ends when it ships · ask Pixel to change it` (dashed frame, like its chip)
- **One name:** "way" in the UI ("How we work" stays the office title). Drop "drawing", "workflow",
  "gates" from the labels people see.

```
┌ How we work ─────────────────────────────────────────── [ Edit ] ┐
│ OFFICE WAY · every goal unless Pixel picks another                │
│                                                                   │
│      (Pixel) ──→ [Builders ▣] ──→ (Ada)                           │
│                       ╲            ┊✓ review                      │
│                        ╲──────→ (Elon) ✓ signs last               │
│                                                                   │
│ Other ways   [▫ Hotfix]  [▫ Research]   Just for one goal [◌ Q4]  │
│ ───────────────────────────────────────────────────────────────── │
│ Ask Pixel to change how we work…                          [Send]  │
└───────────────────────────────────────────────────────────────────┘

Quest Board header:   Quest Board   to v1.0   ( 62% )   [ ▫⟶▫ How we work ]
```

Editor polish (same component, used everywhere):
- Drag from a card's edge handle to another card = new arrow. Keep "Connect to…" for keyboard.
- New arrow defaults to "hands work to". "Why" becomes optional, and the sign-off kind is a short pill
  row (Review · Test · Design · Security), not a dropdown.
- The arrow list folds behind "Show as a list" (open by default for keyboard users who reach it
  with Tab, and always in the accessibility tree).

## Proposal B: the team's way during team creation

Where: a "How this team works" section right **under Crew** (it's about the crew), visible as soon as
the crew has two people. With one person there's nobody to hand to, so it says: "Add one more and
we'll sketch how they work together."

It's live from the moment the second person joins. It doesn't wait for the team to be saved.

**Smart default, drawn for you:** the captain starts → hands work to each member → each member's work
comes back to the captain with a ✓ review → captain signs last. That's what "briefs this team through its
captain" already means. Now you can see it. The default updates by itself as people join, leave or the
captain changes, until you edit it. After that it's yours, and new members are added as unconnected
cards with a quiet "Connect Ana?" nudge.

```
Crew 3/6
  ★ Ada · Captain        Lead dev           ›
    Elon                 Reviewer           ›
    Jony                 UI design          ›
  + Add to crew

How this team works                                         Adjust
┌──────────────────────────────────────────────────────────┐
│            ┌──→ (Elon) ─┐                                │
│   ★(Ada) ──┤            ├─✓→ ★(Ada) signs last           │
│            └──→ (Jony) ─┘                                │
└──────────────────────────────────────────────────────────┘
Ada splits the work, Elon and Jony each build a part, Ada checks it.
                                     [Captain checks all ▾]
```

- One line in words under the thumbnail (also the screen-reader text).
- "Adjust" opens the same editor sheet with this drawing. Saving makes it "Your own way"
  and the line says so, with "Back to the default" as a quiet link.
- One optional starting-shape menu (the ▾), two items only: **Captain checks all** (default) and
  **Pass it along** (members in crew order, each hands to the next, captain signs last). That covers
  "team of peers" and "pipeline". Nothing more until someone asks.
- Nothing extra to save: the team panel already auto-saves, and the way saves with it.

States: 0–1 member (nudge line, no box) · default (thumbnail + line) · edited ("Your own way",
Back to the default) · a member removed who was on an edited way (their arrows go, one line says so:
"Removed Elon's 2 arrows") · server refused (the line turns red with the reason, Adjust opens with
the problem pinned) · loading (thumbnail skeleton, same size).

## What I removed and why
- Chip summary on How we work: a second picture of the drawing. The drawing is enough.
- "Draw it / Open drawing" links: the drawing is the page, so there's nothing to link to.
- "Draw it" on a team: the default is already drawn.
- Words "workflow / drawing / gates" in labels: one word, "way".
- Required "Why" and the sign-off dropdown: friction on every arrow. The default covers most of them.

## Size
- A, entry + page rebuild + clickable goal chip + type kicker: **~2–3 days** front-end. No server change
  (reuses `toGraph`, `FlowSheet`, `WorkflowEditor` readOnly as the thumbnail).
- Editor polish (drag-to-connect, optional Why, pills, folded list): **~2 days**, mostly the drag handle
  and its tests.
- B, team step + default shape + live re-derive + "Pass it along": **~3 days**. Needs the
  default built on the client (or a server `defaultTeamWay`) and saving a way on a team that isn't
  saved yet (save it with the team's first save). **~1 day** server for that.
- Total **about 1.5–2 weeks** for one front-end dev plus a day of server work. A is the most urgent
  and can ship alone.

## Assumptions (check)
- People will spot a thumbnail picture faster than a text link. Check: first-time users, "show me how
  this office works", time to open it.
- "Captain checks all" fits most teams. Check: how many teams keep the default after a week.
- Two starting shapes are enough. Check: what people draw when they press Adjust.
